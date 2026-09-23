import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSheet, monthRange, monthWindow, shiftMonth } from '../src/sheet.js';
import { normalizeCategoriesConfig } from '../src/categories.js';
import { createBalanceService } from '../src/balances.js';
import { createActivityService } from '../src/activity.js';
import configFile from '../categories.config.js';

const config = normalizeCategoriesConfig(configFile);
const silent = { warn() {}, error() {} };
let n = 0;
const tx = (date, amount, description, extra = {}) => ({ id: `t${(n += 1)}`, date, amount, currency: 'GBP', description, merchant: null, category: null, pending: false, ...extra });

test('month helpers', () => {
  assert.deepEqual(monthRange('2026-02'), { key: '2026-02', from: '2026-02-01', to: '2026-02-28' });
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-11', 2), '2027-01');
  assert.deepEqual(monthWindow('2026-09', 3).map((m) => m.key), ['2026-07', '2026-08', '2026-09']);
});

test('buildSheet sums into categories and months, rolls subs up into parents, and chains balances', () => {
  const transactions = [
    tx('2026-08-01', 2650, 'ACME LTD SALARY'),
    tx('2026-08-03', -40, 'TESCO STORES', { merchant: 'Tesco' }),
    tx('2026-08-10', -30, 'PUREGYM', { merchant: 'PureGym' }),
    tx('2026-08-15', -300, 'POT TRANSFER TO SAVINGS POT'),
    tx('2026-08-20', -20, 'MYSTERY SHOP', { merchant: 'Mystery Shop' }),
    tx('2026-09-02', 2650, 'ACME LTD SALARY'),
    tx('2026-09-05', -60, 'TESCO STORES', { merchant: 'Tesco' }),
    tx('2026-09-06', 15, 'FPS CREDIT'),
    tx('2026-10-01', -100, 'AFTER THE WINDOW', { merchant: 'Later' }),
  ];
  const sheet = buildSheet({
    accountId: 101,
    transactions,
    months: monthWindow('2026-09', 2),
    categories: config,
    currentBalance: 1000,
    today: '2026-09-22',
  });

  assert.deepEqual(sheet.months.map((m) => [m.key, m.current]), [['2026-08', false], ['2026-09', true]]);
  const row = (rows, id) => rows.find((r) => r.id === id);
  assert.deepEqual(row(sheet.income.rows, 'salary').values, [2650, 2650]);
  assert.deepEqual(sheet.income.uncategorised, [0, 15]);
  assert.deepEqual(sheet.income.total, [2650, 2665]);
  assert.deepEqual(row(sheet.outgoings.rows, 'groceries').values, [40, 60]);
  const health = row(sheet.outgoings.rows, 'health');
  assert.deepEqual(health.values, [30, 0], 'parent is the sum of its subs');
  assert.deepEqual(row(health.subs, 'gym').values, [30, 0]);
  assert.deepEqual(sheet.outgoings.uncategorised, [20, 0]);
  assert.deepEqual(sheet.outgoings.total, [90, 60]);
  assert.deepEqual(sheet.net, [2560, 2605]);
  assert.deepEqual(sheet.transfers.out, [300, 0], 'transfers are shown but not in the totals');

  // Balance: current 1000 minus the October payment gives September's closing; the chain runs back from there.
  assert.deepEqual(sheet.balance.closing, [1000 + 100 - 2605, 1100]);
  assert.deepEqual(sheet.balance.opening, [1000 + 100 - 2605 - (2650 - 40 - 30 - 300 - 20), 1000 + 100 - 2605]);
  assert.equal(sheet.balance.opening[1], sheet.balance.closing[0], 'one month closes where the next opens');

  assert.equal(sheet.transactions.length, 8, 'the October payment is outside the window');
  assert.equal(sheet.transactions[0].date, '2026-09-06', 'newest first');
  assert.equal(sheet.uncategorisedCount, 2);
  const gym = sheet.transactions.find((t) => t.merchant === 'PureGym');
  assert.equal(gym.category, 'gym');
  assert.equal(gym.categoryLabel, 'Gym');
  assert.equal(gym.parent, 'health');
  assert.equal(gym.merchantKey, 'puregym');
  assert.match(gym.key, /^id:/);
});

test('buildSheet honours settings and leaves balances empty without a current balance', () => {
  const transactions = [tx('2026-09-05', -60, 'TESCO STORES', { merchant: 'Tesco' })];
  const sheet = buildSheet({
    accountId: 1,
    transactions,
    months: monthWindow('2026-09', 1),
    categories: config,
    settings: { rules: { tesco: 'foodout' }, transactions: {} },
    currentBalance: null,
    today: '2026-09-22',
  });
  assert.deepEqual(sheet.outgoings.rows.find((r) => r.id === 'luxuries').values, [60]);
  assert.deepEqual(sheet.balance, { opening: [null], closing: [null] });
});

test('the activity service serves a sheet for an account, clamped to the current month', async () => {
  const now = () => Date.parse('2026-09-22T12:00:00Z');
  const client = {
    async listAccounts() {
      return [
        { id: 7, name: 'Current', institutionName: 'Bank', institutionLogo: null, provider: 'x', currency: 'GBP', status: 'ACTIVE' },
        { id: 8, name: 'Savings Pot', institutionName: 'Bank', institutionLogo: null, provider: 'x', currency: 'GBP', status: 'ACTIVE' },
      ];
    },
    async getBalance() {
      return { current: 500, available: null, currency: 'GBP' };
    },
    async listTransactions() {
      return [tx('2026-09-01', -50, 'TESCO', { merchant: 'Tesco' }), tx('2026-09-02', -200, 'TO SAVINGS POT')];
    },
  };
  const balances = createBalanceService({ client, categoriesConfig: config, now, logger: silent });
  const service = createActivityService({ client, balances, categories: config, now, logger: silent });

  const sheet = await service.getSheet({ accountId: 7, to: '2027-01', months: 3 });
  assert.deepEqual(sheet.months.map((m) => m.key), ['2026-07', '2026-08', '2026-09'], 'a future month is clamped to now');
  assert.equal(sheet.account.name, 'Current');
  assert.equal(sheet.currency, 'GBP');
  assert.deepEqual(sheet.transfers.out, [0, 0, 200], 'the other account name marks a transfer');
  assert.deepEqual(sheet.outgoings.rows.find((r) => r.id === 'groceries').values, [0, 0, 50]);
  assert.deepEqual(sheet.balance.closing, [750, 750, 500]);
  assert.equal(sheet.categories.outgoings.length, 7);
  assert.equal(sheet.settings.persistent, false);

  await assert.rejects(service.getSheet({ accountId: 7, to: 'nope' }), /YYYY-MM/);
  await assert.rejects(service.getSheet({ accountId: 99 }), /not found/i);
});
