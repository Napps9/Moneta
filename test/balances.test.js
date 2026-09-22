import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, createBalanceService, mapWithConcurrency } from '../src/balances.js';

const silent = { warn() {}, error() {} };

function fakeClient({ accounts, balances, failures = {} }) {
  const calls = { listAccounts: 0, getBalance: [] };
  return {
    calls,
    async listAccounts() {
      calls.listAccounts += 1;
      return accounts;
    },
    async getBalance(id) {
      calls.getBalance.push(id);
      if (failures[id]) throw new Error(failures[id]);
      return balances[id];
    },
  };
}

const ACCOUNTS = [
  { id: 2, name: 'Savings', institutionName: 'Bank B', institutionLogo: null, provider: 'x', currency: 'EUR', status: 'ACTIVE' },
  { id: 1, name: 'Current', institutionName: 'Bank A', institutionLogo: null, provider: 'x', currency: 'EUR', status: 'ACTIVE' },
  { id: 3, name: 'USD Card', institutionName: 'Bank A', institutionLogo: null, provider: 'x', currency: 'USD', status: 'ACTIVE' },
];

test('snapshot joins balances, sorts accounts and computes totals per currency', async () => {
  const client = fakeClient({
    accounts: ACCOUNTS,
    balances: {
      1: { current: 100, available: 90, currency: 'EUR' },
      2: { current: 50.5, available: null, currency: null },
      3: { current: -20, available: 200, currency: 'USD' },
    },
  });
  const service = createBalanceService({ client, ttlMs: 1000, now: () => 1_000_000, logger: silent });

  const snapshot = await service.getSnapshot();

  assert.equal(snapshot.cached, false);
  assert.equal(snapshot.stale, false);
  assert.equal(snapshot.partial, false);
  assert.equal(snapshot.fetchedAt, new Date(1_000_000).toISOString());
  assert.deepEqual(
    snapshot.accounts.map((a) => a.id),
    [1, 3, 2],
    'sorted by institution then name',
  );
  assert.equal(snapshot.accounts[2].balance.currency, 'EUR', 'currency falls back to the account currency');
  assert.deepEqual(snapshot.totals, [
    { currency: 'EUR', current: 150.5, available: null, accountCount: 2, excludedCount: 0 },
    { currency: 'USD', current: -20, available: 200, accountCount: 1, excludedCount: 0 },
  ]);

  assert.deepEqual(
    snapshot.accounts.map((a) => [a.name, a.group]),
    [['Current', 'spending'], ['USD Card', 'credit'], ['Savings', 'savings']],
  );
  assert.deepEqual(snapshot.groups, [
    { id: 'savings', label: 'Savings', accountCount: 1, totals: [{ currency: 'EUR', current: 50.5, available: null, accountCount: 1, excludedCount: 0 }] },
    { id: 'spending', label: 'Spending', accountCount: 1, totals: [{ currency: 'EUR', current: 100, available: 90, accountCount: 1, excludedCount: 0 }] },
    { id: 'credit', label: 'Credit', accountCount: 1, totals: [{ currency: 'USD', current: -20, available: 200, accountCount: 1, excludedCount: 0 }] },
  ]);
});

test('a custom groups config changes the snapshot grouping', async () => {
  const { normalizeGroupsConfig } = await import('../src/groups.js');
  const client = fakeClient({
    accounts: ACCOUNTS,
    balances: {
      1: { current: 1, available: 1, currency: 'EUR' },
      2: { current: 1, available: 1, currency: 'EUR' },
      3: { current: 1, available: 1, currency: 'USD' },
    },
  });
  const groupsConfig = normalizeGroupsConfig({ groups: ['mine'], accounts: { 'USD Card': 'mine' } });
  const service = createBalanceService({ client, groupsConfig, logger: silent });

  const snapshot = await service.getSnapshot();

  assert.ok(snapshot.accounts.every((a) => a.group === 'mine'), 'the only group is also the default');
  assert.deepEqual(snapshot.groups.map((g) => [g.id, g.label, g.accountCount]), [['mine', 'Mine', 3]]);
});

test('a failing balance marks the account and the snapshot as partial', async () => {
  const client = fakeClient({
    accounts: ACCOUNTS,
    balances: { 1: { current: 10, available: 10, currency: 'EUR' }, 2: { current: 5, available: 5, currency: 'EUR' } },
    failures: { 3: 'Account not found.' },
  });
  const service = createBalanceService({ client, logger: silent });

  const snapshot = await service.getSnapshot();

  assert.equal(snapshot.partial, true);
  const failed = snapshot.accounts.find((a) => a.id === 3);
  assert.equal(failed.balance, null);
  assert.equal(failed.error, 'Account not found.');
  assert.deepEqual(snapshot.totals, [{ currency: 'EUR', current: 15, available: 15, accountCount: 2, excludedCount: 0 }]);
});

test('results are cached until the TTL passes and refresh bypasses the cache', async () => {
  let clock = 0;
  const client = fakeClient({ accounts: ACCOUNTS.slice(0, 1), balances: { 2: { current: 1, available: 1, currency: 'EUR' } } });
  const service = createBalanceService({ client, ttlMs: 60_000, now: () => clock, logger: silent });

  await service.getSnapshot();
  const second = await service.getSnapshot();
  assert.equal(second.cached, true);
  assert.equal(client.calls.listAccounts, 1);

  clock = 61_000;
  const third = await service.getSnapshot();
  assert.equal(third.cached, false);
  assert.equal(client.calls.listAccounts, 2);

  const forced = await service.getSnapshot({ refresh: true });
  assert.equal(forced.cached, false);
  assert.equal(client.calls.listAccounts, 3);
});

test('concurrent requests share one upstream fetch', async () => {
  const client = fakeClient({ accounts: ACCOUNTS.slice(0, 1), balances: { 2: { current: 1, available: 1, currency: 'EUR' } } });
  const service = createBalanceService({ client, logger: silent });

  await Promise.all([service.getSnapshot(), service.getSnapshot(), service.getSnapshot()]);

  assert.equal(client.calls.listAccounts, 1);
});

test('a failed refresh serves the previous snapshot flagged as stale', async () => {
  let fail = false;
  const client = {
    async listAccounts() {
      if (fail) throw new Error('Forbidden: Invalid API key.');
      return ACCOUNTS.slice(0, 1);
    },
    async getBalance() {
      return { current: 7, available: 7, currency: 'EUR' };
    },
  };
  const service = createBalanceService({ client, logger: silent });

  await service.getSnapshot();
  fail = true;
  const stale = await service.getSnapshot({ refresh: true });

  assert.equal(stale.stale, true);
  assert.equal(stale.cached, true);
  assert.equal(stale.error, 'Forbidden: Invalid API key.');
  assert.equal(stale.accounts[0].balance.current, 7);
});

test('the first failure propagates when nothing is cached', async () => {
  const client = {
    async listAccounts() {
      throw new Error('boom');
    },
    async getBalance() {},
  };
  const service = createBalanceService({ client, logger: silent });
  await assert.rejects(service.getSnapshot(), /boom/);
});

test('computeTotals counts accounts whose balance is missing as excluded', () => {
  const totals = computeTotals([
    { currency: 'EUR', balance: { current: 1, available: 1, currency: 'EUR' }, error: null },
    { currency: 'EUR', balance: null, error: 'nope' },
    { currency: 'GBP', balance: null, error: 'nope' },
  ]);
  assert.deepEqual(totals, [{ currency: 'EUR', current: 1, available: 1, accountCount: 1, excludedCount: 1 }]);
});

test('mapWithConcurrency preserves order and bounds parallelism', async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return n * 10;
  });
  assert.deepEqual(results, [10, 20, 30, 40, 50]);
  assert.equal(peak, 2);
  assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
});
