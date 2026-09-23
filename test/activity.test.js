import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActivityError, createActivityService, defaultRange, summarize, validateRange } from '../src/activity.js';
import { createBalanceService } from '../src/balances.js';
import { createMockClient, generateTransactions } from '../src/mock.js';
import { createLunchFlowClient } from '../src/lunchflow.js';

const silent = { warn() {}, error() {} };
const tx = (date, amount, extra = {}) => ({ id: `${date}-${amount}`, date, amount, currency: 'GBP', description: 'x', merchant: null, category: null, pending: false, ...extra });

test('summarize splits the period, sums in and out, and derives opening and closing balances', () => {
  const transactions = [
    tx('2026-08-31', -10), // before the period: ignored
    tx('2026-09-01', 2000, { pending: false }),
    tx('2026-09-10', -300),
    tx('2026-09-20', -50.25, { pending: true }),
    tx('2026-10-02', -100), // after the period: only moves the closing balance
    tx('2026-10-05', 40),
  ];
  const result = summarize(transactions, { from: '2026-09-01', to: '2026-09-30', currentBalance: 1000 });
  assert.equal(result.income, 2000);
  assert.equal(result.outgoings, 350.25);
  assert.equal(result.net, 1649.75);
  assert.equal(result.transactionCount, 3);
  assert.equal(result.pendingCount, 1);
  assert.equal(result.closingBalance, 1060, 'current balance minus what happened after the period');
  assert.equal(result.openingBalance, 1060 - 1649.75);
  assert.deepEqual(
    result.transactions.map((t) => t.date),
    ['2026-09-20', '2026-09-10', '2026-09-01'],
    'newest first',
  );

  const noBalance = summarize(transactions, { from: '2026-09-01', to: '2026-09-30', currentBalance: null });
  assert.equal(noBalance.closingBalance, null);
  assert.equal(noBalance.openingBalance, null);
});

test('validateRange rejects bad input', () => {
  const today = '2026-09-22';
  assert.doesNotThrow(() => validateRange('2026-09-01', '2026-09-22', today));
  assert.throws(() => validateRange('2026-9-1', '2026-09-22', today), ActivityError);
  assert.throws(() => validateRange('2026-02-30', '2026-09-22', today), /YYYY-MM-DD/);
  assert.throws(() => validateRange('2026-09-23', '2026-09-22', today), /after/);
  assert.throws(() => validateRange('2024-01-01', '2026-09-22', today), /400 days/);
  assert.doesNotThrow(() => validateRange('2026-09-01', '2026-09-30', today), 'the current month ends after today');
  assert.throws(() => validateRange('2027-09-01', '2027-09-30', today), /future/);
  assert.deepEqual(defaultRange(today), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(defaultRange('2026-02-10'), { from: '2026-02-01', to: '2026-02-28' });
});

test('the service fetches once per period, derives closing balances and honours settings', async () => {
  const now = () => Date.parse('2026-09-22T12:00:00Z');
  const calls = [];
  let balanceCalls = 0;
  const client = {
    async listAccounts() {
      return [{ id: 7, name: 'Card', institutionName: 'Bank', institutionLogo: null, provider: 'x', currency: 'GBP', status: 'ACTIVE' }];
    },
    async getBalance() {
      balanceCalls += 1;
      return { current: 1380.42, available: null, currency: 'GBP' };
    },
    async listTransactions(id, opts) {
      calls.push({ id, ...opts });
      return [tx('2026-08-05', -20), tx('2026-08-25', 100), tx('2026-09-03', -60), tx('2026-09-15', -15)];
    },
  };
  const balances = createBalanceService({ client, now, logger: silent });
  const service = createActivityService({ client, balances, now, logger: silent });

  const august = await service.getActivity({ accountId: '7', from: '2026-08-01', to: '2026-08-31' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { id: 7, from: '2026-08-01', to: '2026-09-22', includePending: true }, 'fetches up to today to derive the closing balance');
  assert.equal(august.account.name, 'Card');
  assert.equal(august.currency, 'GBP');
  assert.equal(august.income, 100);
  assert.equal(august.outgoings, 20);
  assert.equal(august.closingBalance, 1380.42 + 75, 'September activity is rolled back out of the current balance');
  assert.equal(august.closingIsCurrent, false);
  assert.equal(august.cached, false);

  const again = await service.getActivity({ accountId: 7, from: '2026-08-01', to: '2026-08-31' });
  assert.equal(again.cached, true);
  assert.equal(calls.length, 1);
  assert.equal(balanceCalls, 1, 'the balance is cached alongside');

  const refreshed = await service.getSheet({ accountId: 7, refresh: true });
  assert.equal(refreshed.cached, false);
  assert.equal(calls.length, 2, 'a refresh fetches the transactions again');
  assert.equal(balanceCalls, 2, 'and asks Lunch Flow for the balance again too');

  const treated = await service.getActivity({
    accountId: 7,
    from: '2026-09-01',
    to: '2026-09-22',
    settings: { accounts: { 7: { balance: 'credit-limit', limit: 5000 } } },
  });
  assert.equal(treated.closingBalance, -(5000 - 1380.42));
  assert.equal(treated.closingIsCurrent, true);
  assert.equal(treated.account.balance.treatment, 'credit-limit');

  await assert.rejects(service.getActivity({ accountId: 'nope', from: '2026-09-01', to: '2026-09-22' }), (err) => err instanceof ActivityError && err.status === 404);
  await assert.rejects(service.getActivity({ accountId: 7, from: 'x', to: 'y' }), (err) => err instanceof ActivityError && err.status === 400);

  const defaulted = await service.getActivity({ accountId: 7 });
  assert.deepEqual(defaulted.period, { from: '2026-09-01', to: '2026-09-30' });
  assert.equal(defaulted.closingIsCurrent, true);
});

test('mock transactions are deterministic, filtered by date, and fail for the broken account', async () => {
  const now = () => Date.parse('2026-09-22T12:00:00Z');
  const account = { id: 101, currency: 'GBP' };
  const a = generateTransactions(account, { now: now() });
  const b = generateTransactions(account, { now: now() });
  assert.deepEqual(a, b);
  assert.ok(a.length > 50);
  assert.ok(a.some((t) => t.amount > 0), 'has income');
  assert.ok(a.some((t) => t.amount < 0), 'has spending');

  const client = createMockClient({ delayMs: 0, now });
  const september = await client.listTransactions(101, { from: '2026-09-01', to: '2026-09-22' });
  assert.ok(september.length > 0);
  assert.ok(september.every((t) => t.date >= '2026-09-01' && t.date <= '2026-09-22'));
  assert.ok(september.every((t) => typeof t.pending === 'boolean'));
  await assert.rejects(client.listTransactions(501, {}), /Internal Server Error/);
  await assert.rejects(client.listTransactions(999, {}), /Not Found/);
});

test('the API client requests transactions with filters and accepts both field styles', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new Response(
      JSON.stringify({
        transactions: [
          { id: 'txn_1', accountId: 123, amount: -12.5, currency: 'EUR', date: '2026-06-26', merchant: 'Cafe', description: 'Lunch', isPending: false },
          { id: 2, account_id: 123, amount: '1500', currency: 'eur', date: '2026-06-25T09:00:00Z', merchant_name: null, description: 'Salary', category: 'Income', pending: true },
          { id: 'bad', amount: 'x', date: '2026-06-01' },
        ],
        total: 3,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const client = createLunchFlowClient({ apiKey: 'k', baseUrl: 'https://api.test/api/v1', fetchImpl });
  const list = await client.listTransactions(123, { from: '2026-06-01', to: '2026-06-30' });
  assert.equal(calls[0], 'https://api.test/api/v1/accounts/123/transactions?from=2026-06-01&to=2026-06-30&include_pending=true');
  assert.deepEqual(list, [
    { id: 'txn_1', date: '2026-06-26', amount: -12.5, currency: 'EUR', description: 'Lunch', merchant: 'Cafe', category: null, pending: false, details: {} },
    { id: '2', date: '2026-06-25', amount: 1500, currency: 'EUR', description: 'Salary', merchant: null, category: 'Income', pending: true, details: { time: '2026-06-25T09:00:00Z' } },
  ]);
});
