import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSheet, monthRange, monthWindow, shiftMonth, trendOf } from '../src/sheet.js';
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
    tx('2026-08-20', -20, 'MYSTERY SHOP', { merchant: 'Mystery Shop', category: 'Shopping' }),
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

  assert.equal(sheet.trends['out:groceries'].months, 1, 'only August is complete');
  assert.equal(sheet.trends['out:groceries'].direction, null, 'one complete month is not a trend');
  assert.equal(sheet.trends['out:groceries'].latest, 40);
  for (const id of ['in:salary', 'in:none', 'in:total', 'out:health', 'out:gym', 'out:none', 'out:total', 'net', 'tr:in', 'tr:out', 'bal:closing']) {
    assert.ok(id in sheet.trends, `${id} has a trend`);
  }

  assert.equal(sheet.transactions.length, 8, 'the October payment is outside the window');
  assert.equal(sheet.transactions[0].date, '2026-09-06', 'newest first');
  assert.equal(sheet.uncategorisedCount, 2);
  const mystery = sheet.transactions.find((t) => t.merchant === 'Mystery Shop');
  assert.equal(mystery.category, null, '"Shopping" is not a category here');
  assert.equal(mystery.providerCategory, 'Shopping', 'but what Lunch Flow called it is kept');
  const gym = sheet.transactions.find((t) => t.merchant === 'PureGym');
  assert.equal(gym.category, 'gym');
  assert.equal(gym.categoryLabel, 'Gym');
  assert.equal(gym.parent, 'health');
  assert.equal(gym.merchantKey, 'puregym');
  assert.match(gym.key, /^id:/);
});

test('with the balance shown before pending payments, only booked transactions move it and the forecast lets the pending ones through', () => {
  const transactions = [
    tx('2026-08-03', -40, 'TESCO STORES', { merchant: 'Tesco' }),
    tx('2026-09-05', -60, 'TESCO STORES', { merchant: 'Tesco' }),
    tx('2026-09-20', -104.5, 'PRET A MANGER', { merchant: 'Pret', pending: true }),
  ];
  const base = { accountId: 1, transactions, months: monthWindow('2026-09', 2), categories: config, settings: { rules: {}, transactions: {}, splits: {} }, today: '2026-09-22' };
  // Lunch Flow reports 598.48 with the pending 104.50 taken off; the bank shows 702.98 before it.
  const reported = buildSheet({ ...base, currentBalance: 598.48 });
  const before = buildSheet({ ...base, currentBalance: 702.98, balanceExcludesPending: true });

  assert.deepEqual(reported.balance.closing, [762.98, 598.48]);
  assert.deepEqual(before.balance.closing, [762.98, 702.98], 'the past is the same either way; only the figure now differs');
  assert.deepEqual(before.outgoings.total, reported.outgoings.total, 'the pending payment counts as spending either way');
  assert.equal(before.outgoings.total[1], 164.5);
  assert.equal(before.projection.balance.currentMonthEnd, reported.projection.balance.currentMonthEnd, 'and the month ends up in the same place');
  assert.equal(before.projection.balance.now, 702.98);
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

test('the projection runs outgoings at their average, income at its latest month, and chains balances', () => {
  const months = monthWindow('2026-09', 4); // June, July, August complete; September current
  const transactions = [
    tx('2026-06-05', -100, 'TESCO', { merchant: 'Tesco' }),
    tx('2026-07-05', -200, 'TESCO', { merchant: 'Tesco' }),
    tx('2026-08-05', -300, 'TESCO', { merchant: 'Tesco' }),
    tx('2026-09-05', -50, 'TESCO', { merchant: 'Tesco' }),
    tx('2026-06-25', 2000, 'ACME LTD SALARY'),
    tx('2026-07-25', 2000, 'ACME LTD SALARY'),
    tx('2026-08-25', 2600, 'ACME LTD SALARY'),
    tx('2026-08-15', -300, 'POT TRANSFER TO SAVINGS POT'),
    tx('2026-07-10', -60, 'PUREGYM', { merchant: 'PureGym' }),
  ];
  const build = (budgets, extra = {}) =>
    buildSheet({ accountId: 1, transactions, months, categories: config, settings: { rules: {}, transactions: {}, splits: {} }, budgets, currentBalance: 1000, today: '2026-09-22', ...extra });
  const p = build({}).projection;
  assert.deepEqual(p.months.map((m) => m.key), ['2026-10', '2026-11', '2026-12']);
  assert.equal(p.mode, 'auto');
  assert.equal(p.basis.complete, 3);
  const row = (rows, id) => rows.find((r) => r.id === id);
  assert.deepEqual([row(p.outgoings.rows, 'groceries').value, row(p.outgoings.rows, 'groceries').set, row(p.outgoings.rows, 'groceries').soFar], [200, false, 50], 'average of the complete months');
  assert.equal(row(row(p.outgoings.rows, 'health').subs, 'gym').value, 20);
  assert.equal(row(p.outgoings.rows, 'health').value, 20, 'a group is the sum of its subs');
  assert.equal(row(p.income.rows, 'salary').value, 2600, 'income repeats its latest complete month');
  assert.equal(p.transfers.out.value, 100);
  assert.deepEqual([p.income.total.now, p.outgoings.total.now, p.net.now, p.monthly], [2600, 220, 2380, [2280, 2280, 2280]]);
  assert.deepEqual(row(p.outgoings.rows, 'groceries').values, [200, 200, 200], 'one figure per month ahead');
  assert.deepEqual(p.income.total.months, [2600, 2600, 2600]);
  assert.equal(p.balance.now, 1000);
  assert.equal(p.balance.currentMonthEnd, 1000 + 2600 - 150 - 20 - 100, 'what is still expected this month: the salary, the rest of the groceries, the gym, the transfer');
  assert.deepEqual(p.balance.closing, [3330 + 2280, 3330 + 2280 * 2, 3330 + 2280 * 3]);

  const q = build({ 'out:groceries': 180, 'in:salary': 3000, 'out:health': 0 }).projection;
  assert.deepEqual([row(q.outgoings.rows, 'groceries').value, row(q.outgoings.rows, 'groceries').set, row(q.outgoings.rows, 'groceries').auto], [180, true, 200]);
  assert.equal(row(q.income.rows, 'salary').value, 3000);
  assert.equal(row(q.outgoings.rows, 'health').value, 0, 'a group can be set as a whole');
  assert.equal(q.outgoings.total.now, 180);
  assert.equal(q.balance.currentMonthEnd, 1000 + 3000 - 130 - 100);

  // Figures that vary by month: a repayment that tails off, a one-off next month.
  const v = build({ 'in:salary': { each: 2600, months: { '2026-11': 0 } }, 'out:groceries': { months: { '2026-10': 500 } } }).projection;
  const salary = row(v.income.rows, 'salary');
  assert.deepEqual([salary.value, salary.values], [2600, [2600, 0, 2600]], 'a month of its own beats the amount for every month');
  assert.deepEqual(salary.setMonths, { '2026-09': 'each', '2026-10': 'each', '2026-11': 'month', '2026-12': 'each' });
  const groc = row(v.outgoings.rows, 'groceries');
  assert.deepEqual([groc.value, groc.values, groc.set], [200, [500, 200, 200], true], 'only October is set; the rest stay automatic');
  assert.deepEqual(groc.setMonths, { '2026-10': 'month' });
  assert.deepEqual(v.monthly, [2600 - 520 - 100, 0 - 220 - 100, 2280]);
  assert.deepEqual(v.balance.closing, [3330 + 1980, 3330 + 1980 - 320, 3330 + 1980 - 320 + 2280]);

  const b = build({ 'out:groceries': 180 }, { forecastMode: 'budget', ahead: 5 }).projection;
  assert.equal(b.mode, 'budget');
  assert.equal(b.months.length, 5, 'ahead sets how far the projection runs');
  assert.deepEqual([row(b.outgoings.rows, 'groceries').value, row(b.outgoings.rows, 'groceries').set], [180, true]);
  assert.deepEqual([row(b.income.rows, 'salary').value, row(b.income.rows, 'salary').auto], [0, 2600], 'nothing is guessed in budget mode, but the automatic figure is kept for reference');
  assert.deepEqual([b.income.total.now, b.outgoings.total.now, b.transfers.out.value], [0, 180, 0]);
  assert.equal(b.balance.currentMonthEnd, 1000 - 130, 'only the rest of the groceries budget is still to come');
  assert.equal(build({}, { ahead: 99 }).projection.months.length, 12, 'capped at a year');

  const past = buildSheet({ accountId: 1, transactions, months: monthWindow('2026-08', 3), categories: config, currentBalance: 1000, today: '2026-09-22' });
  assert.equal(past.projection, null, 'nothing to project from a window that ended in the past');
});

test('a line that has already passed its forecast this month runs at the actual so far', () => {
  const months = monthWindow('2026-09', 4);
  const transactions = [
    tx('2026-06-05', -100, 'TESCO', { merchant: 'Tesco' }),
    tx('2026-07-05', -200, 'TESCO', { merchant: 'Tesco' }),
    tx('2026-08-05', -300, 'TESCO', { merchant: 'Tesco' }),
    tx('2026-09-05', -250, 'TESCO', { merchant: 'Tesco' }),
    tx('2026-06-25', 2000, 'ACME LTD SALARY'),
    tx('2026-07-25', 2000, 'ACME LTD SALARY'),
    tx('2026-08-25', 2600, 'ACME LTD SALARY'),
    tx('2026-09-20', 3000, 'ACME LTD SALARY'),
    tx('2026-07-10', -60, 'PUREGYM', { merchant: 'PureGym' }),
    tx('2026-09-10', -50, 'PUREGYM', { merchant: 'PureGym' }),
    tx('2026-08-15', -300, 'POT TRANSFER TO SAVINGS POT'),
  ];
  const build = (budgets, extra = {}) =>
    buildSheet({ accountId: 1, transactions, months, categories: config, settings: { rules: {}, transactions: {}, splits: {} }, budgets, currentBalance: 1000, today: '2026-09-22', ...extra }).projection;
  const row = (rows, id) => rows.find((r) => r.id === id);

  const p = build({});
  const groceries = row(p.outgoings.rows, 'groceries');
  assert.deepEqual([groceries.value, groceries.planned, groceries.raised, groceries.soFar], [250, 200, true, 250], 'raised from the 200 average to the 250 already spent');
  assert.deepEqual(groceries.values, [200, 200, 200], 'the months ahead keep their forecast');
  const salary = row(p.income.rows, 'salary');
  assert.deepEqual([salary.value, salary.planned, salary.raised], [3000, 2600, true], 'income that has come in above its forecast raises it too');
  const health = row(p.outgoings.rows, 'health');
  assert.deepEqual([row(health.subs, 'gym').value, row(health.subs, 'gym').raised], [50, true]);
  assert.deepEqual([health.value, health.planned, health.raised], [50, 20, true], 'a group running at the sum of its subs is raised when one of them is');
  assert.deepEqual([p.transfers.out.value, p.transfers.out.raised], [100, false], 'a line still under its forecast is left alone');
  assert.deepEqual([p.income.total.now, p.income.total.planned, p.outgoings.total.now, p.outgoings.total.planned], [3000, 2600, 300, 220], 'totals follow');
  assert.equal(p.net.now, 2700);
  assert.equal(p.balance.currentMonthEnd, 1000 - 100, 'the balance already holds what has happened; only the transfer is still to come');

  const set = row(build({ 'out:groceries': 180 }).outgoings.rows, 'groceries');
  assert.deepEqual([set.value, set.planned, set.raised, set.set, set.values], [250, 180, true, true, [180, 180, 180]], 'an amount you set is passed too, but stays set for the months ahead');

  const budget = build({}, { forecastMode: 'budget' });
  assert.deepEqual([row(budget.income.rows, 'salary').value, row(budget.income.rows, 'salary').planned], [3000, 0], 'in budget mode an unset line still counts what has already happened');
});

test('forecasts learn from the year behind the sheet, not just the months in view', () => {
  // Groceries stepped up from 100 to 300 a month in March; only August and September are in view.
  const transactions = [];
  for (let m = 0; m < 12; m += 1) {
    const key = shiftMonth('2025-09', m);
    transactions.push(tx(`${key}-05`, key < '2026-03' ? -100 : -300, 'TESCO', { merchant: 'Tesco' }));
  }
  transactions.push(tx('2026-09-05', -120, 'TESCO', { merchant: 'Tesco' }));
  const build = (historyFrom, list = transactions) =>
    buildSheet({ accountId: 1, transactions: list, months: monthWindow('2026-09', 2), categories: config, settings: { rules: {}, transactions: {}, splits: {} }, currentBalance: 1000, today: '2026-09-22', historyFrom }).projection;
  const row = (rows, id) => rows.find((r) => r.id === id);

  const p = build('2025-09-01');
  assert.equal(p.basis.complete, 12, 'twelve complete months of history');
  const groceries = row(p.outgoings.rows, 'groceries');
  assert.deepEqual([groceries.value, groceries.learn.method, groceries.learn.tested], [300, 'latest', 6], 'the step up is learned: last month beats the average');
  assert.deepEqual([groceries.learn.error, groceries.learn.baselineError], [33.33, 116.67], 'only March, the month of the step, is missed; the average lags for months');
  assert.ok(p.accuracy.outgoings && p.accuracy.outgoings.tested === 6);
  assert.equal(p.accuracy.income, null, 'no income history to judge');

  // A provider that kept only from April although a year was asked for: April may be partial, so history starts in May.
  const short = build('2025-09-01', transactions.filter((t) => t.date >= '2026-04-01'));
  assert.equal(short.basis.complete, 4, 'May to August');

  // An amount set by hand is checked against the same history.
  const setLine = row(buildSheet({ accountId: 1, transactions, months: monthWindow('2026-09', 2), categories: config, settings: { rules: {}, transactions: {}, splits: {} }, budgets: { 'out:groceries': 250 }, currentBalance: 1000, today: '2026-09-22', historyFrom: '2025-09-01' }).projection.outgoings.rows, 'groceries');
  assert.deepEqual(setLine.setCheck, { tested: 6, error: 50 }, '250 against 300 a month');
});

test('trendOf says whether a row is rising, falling or steady over the complete months', () => {
  const months = monthWindow('2026-09', 6).map((m) => ({ ...m, current: m.key === '2026-09', future: false }));
  const up = trendOf([100, 120, 140, 160, 180, 5], months);
  assert.equal(up.direction, 'up');
  assert.equal(up.months, 5, 'the current month is left out');
  assert.equal(up.latest, 180);
  assert.equal(up.previous, 160);
  assert.equal(up.change, 20);
  assert.equal(up.pct, 0.125);
  assert.equal(trendOf([180, 160, 140, 120, 100, 999], months).direction, 'down');
  assert.equal(trendOf([100, 102, 99, 101, 100, 0], months).direction, 'flat');
  assert.equal(trendOf([0, 0, 0, 0, 0, 50], months).direction, null, 'nothing to say about an empty row');
  assert.equal(trendOf([0, 0, 0, 0, 100, 0], months).direction, 'up');
  assert.equal(trendOf([-50, -20, 10, 40, 70, 0], months).direction, 'up', 'works either side of zero');
  assert.equal(trendOf([null, null, null, null, null, null], months).direction, null, 'no balances, no trend');
  const short = monthWindow('2026-09', 2).map((m) => ({ ...m, current: m.key === '2026-09', future: false }));
  assert.equal(trendOf([100, 50], short).direction, null, 'one complete month is not a trend');
});

test('a split transaction is summed into each of its parts', () => {
  const rent = tx('2026-09-01', -1250, 'LANDLORD RENT AND BILLS');
  const build = (splits) =>
    buildSheet({
      accountId: 1,
      transactions: [rent],
      months: monthWindow('2026-09', 1),
      categories: config,
      settings: { rules: {}, transactions: {}, splits },
      currentBalance: 0,
      today: '2026-09-22',
    });
  const key = `id:${rent.id}`;
  const living = (sheet) => sheet.outgoings.rows.find((r) => r.id === 'living');
  const sub = (sheet, id) => living(sheet).subs.find((s) => s.id === id).values;

  const sheet = build({ [key]: [{ category: 'rent', amount: 1100 }, { category: 'energy', amount: 100 }, { category: null, amount: 50 }] });
  assert.deepEqual(sub(sheet, 'rent'), [1100]);
  assert.deepEqual(sub(sheet, 'energy'), [100]);
  assert.deepEqual(living(sheet).values, [1200]);
  assert.deepEqual(sheet.outgoings.uncategorised, [50]);
  assert.deepEqual(sheet.outgoings.total, [1250], 'the total is unchanged by splitting');
  assert.deepEqual(sheet.balance.closing, [0]);
  const t = sheet.transactions[0];
  assert.equal(t.split, true);
  assert.equal(t.category, 'rent', 'the transaction itself still has the category it would have had');
  assert.deepEqual(
    t.parts.map((p) => [p.category, p.amount, p.categoryLabel, p.parent]),
    [['rent', 1100, 'Rent', 'living'], ['energy', 100, 'Energy', 'living'], [null, 50, 'Uncategorised', null]],
  );
  assert.equal(sheet.uncategorisedCount, 1);

  const partial = build({ [key]: [{ category: 'energy', amount: 100 }] });
  assert.deepEqual(sub(partial, 'energy'), [100]);
  assert.deepEqual(sub(partial, 'rent'), [1150], 'whatever is not allocated stays where the transaction would have gone');
  assert.equal(partial.transactions[0].parts.length, 2);

  const over = build({ [key]: [{ category: 'energy', amount: 2000 }, { category: 'water', amount: 10 }] });
  assert.deepEqual(sub(over, 'energy'), [1250], 'a part is capped at the amount');
  assert.deepEqual(sub(over, 'water'), [0]);
  assert.deepEqual(over.transactions[0].parts.map((p) => p.category), ['energy']);

  const plain = build({});
  assert.equal(plain.transactions[0].split, false);
  assert.deepEqual(plain.transactions[0].parts, [{ category: 'rent', amount: 1250, categoryLabel: 'Rent', parent: 'living' }]);
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
