import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLedger, reconcileLedger } from '../src/ledger.js';
import { normalizeCategoriesConfig } from '../src/categories.js';
import configFile from '../categories.config.js';

const config = normalizeCategoriesConfig(configFile);
const txn = (key, month, amount, category, merchantKey) => ({ key, month, amount, category, merchantKey });

test('normalizeLedger keeps usable lines and budgets, drops the rest', () => {
  const ledger = normalizeLedger({
    entries: [
      { month: '2026-09-01', kind: 'out', category: 'Groceries', amount: '12.5', label: 'Groceries' },
      { month: '2026-09', kind: 'in', category: 'salary', amount: 4180 },
      { month: '2026-09', kind: 'out', category: null, amount: 82.4, label: 'Health' },
      { month: 'nope', kind: 'out', category: 'groceries', amount: 1 },
      { month: '2026-09', kind: 'out', category: 'groceries', amount: 0 },
      'junk',
    ],
    budgets: {
      'out:rent': '800',
      'in:salary': 4180,
      'bad key': 1,
      'out:x': -5,
      'in:loanrepay': { each: 0, months: { '2026-10': 500, '2026-11': '250', nope: 3 } },
      'out:water': { months: { '2027-01': 55 } },
      'out:energy': { each: null, months: {} },
    },
  });
  assert.deepEqual(ledger.entries, [
    { month: '2026-09', kind: 'out', category: 'groceries', amount: 12.5, label: 'Groceries' },
    { month: '2026-09', kind: 'in', category: 'salary', amount: 4180, label: '' },
    { month: '2026-09', kind: 'out', category: null, amount: 82.4, label: 'Health' },
  ]);
  assert.deepEqual(
    ledger.budgets,
    { 'out:rent': 800, 'in:salary': 4180, 'in:loanrepay': { each: 0, months: { '2026-10': 500, '2026-11': 250 } }, 'out:water': { months: { '2027-01': 55 } } },
    'budgets are flat amounts or { each, months }, as the settings keep them',
  );
  assert.deepEqual(normalizeLedger(null), { entries: [], budgets: {} });
});

test('reconcileLedger matches lines to transactions by month, side and amount, and learns merchants', () => {
  const transactions = [
    txn('t1', '2026-09', -12.5, 'groceries', 'tesco'),
    txn('t2', '2026-09', -12.5, null, 'corner shop'),
    txn('t3', '2026-09', -40, 'travel', 'tfl'),
    txn('t4', '2026-09', -40, 'travel', 'tfl'),
    txn('t5', '2026-09', -9.99, null, 'mystery'),
    txn('t6', '2026-09', 4180, null, 'acme'),
    txn('t7', '2026-08', -40, 'travel', 'tfl'),
    txn('t8', '2026-08', 25.4, null, 'tfl'),
  ];
  const entries = normalizeLedger({
    entries: [
      { month: '2026-09', kind: 'out', category: 'groceries', amount: 12.5 },
      { month: '2026-09', kind: 'out', category: 'foodout', amount: 12.5 },
      { month: '2026-09', kind: 'out', category: 'weekend', amount: 40 },
      { month: '2026-09', kind: 'out', category: 'weekend', amount: 40 },
      { month: '2026-09', kind: 'out', category: 'weekend', amount: 40, label: 'one too many' },
      { month: '2026-09', kind: 'in', category: 'salary', amount: 4180 },
      { month: '2026-08', kind: 'out', category: 'weekend', amount: 40 },
      { month: '2026-08', kind: 'out', category: 'travel', amount: -25.4, label: 'a refund' },
      { month: '2026-09', kind: 'out', category: null, amount: 82.4, label: 'Health' },
      { month: '2026-09', kind: 'out', category: 'health', amount: 5 },
      { month: '2025-01', kind: 'out', category: 'groceries', amount: 3 },
    ],
  }).entries;
  const result = reconcileLedger({ entries, transactions, config });

  assert.equal(result.months.count, 2);
  assert.deepEqual(result.months, { from: '2026-08', to: '2026-09', count: 2 });
  assert.equal(result.transactionsTotal, 8);
  // The grocery line takes the transaction already filed as groceries; the food-out line takes the other.
  assert.equal(result.choices.t1, 'groceries');
  assert.equal(result.choices.t2, 'foodout');
  assert.deepEqual([result.choices.t3, result.choices.t4, result.choices.t7], ['weekend', 'weekend', 'weekend']);
  assert.equal(result.choices.t6, 'salary');
  assert.equal(result.choices.t5, undefined, 'nothing in the ledger for it');
  assert.equal(result.unmatched.length, 1, 'the third £40 has no transaction left');
  assert.equal(result.unmatched[0].label, 'one too many');
  assert.equal(result.outside.length, 1, 'January 2025 is outside what Lunch Flow has');
  assert.equal(result.unassignable.length, 3, 'a refund, a line with no category, and a group name');
  assert.deepEqual(result.rules, { tfl: 'weekend' }, 'matched three times, always the same way');
  assert.equal(result.changed, 5, 'everything but t1 changes');
  assert.equal(result.matches.length, 6);
  assert.deepEqual(result.combined, [], 'nothing left over adds up to a transaction');
  assert.deepEqual(result.splits, {});
});

test('reconcileLedger splits one payment that the ledger has as several lines', () => {
  const transactions = [
    txn('h1', '2026-09', -1250, null, 'heather'),
    txn('w1', '2026-09', -50, 'water', 'thames water'),
    txn('x1', '2026-09', -300, null, 'other'),
    txn('h2', '2026-08', -1100, null, 'heather'),
    txn('big', '2026-08', -5000, null, 'nothing adds up to it'),
  ];
  const entries = normalizeLedger({
    entries: [
      { month: '2026-09', kind: 'out', category: 'rent', amount: 800 },
      { month: '2026-09', kind: 'out', category: 'water', amount: 50, label: 'the real bill' },
      { month: '2026-09', kind: 'out', category: 'water', amount: 50, label: 'her share' },
      { month: '2026-09', kind: 'out', category: 'energy', amount: 50 },
      { month: '2026-09', kind: 'out', category: 'counciltax', amount: 50 },
      { month: '2026-09', kind: 'out', category: 'groceries', amount: 100 },
      { month: '2026-09', kind: 'out', category: 'groceries', amount: 50 },
      { month: '2026-09', kind: 'out', category: 'foodout', amount: 150 },
      { month: '2026-08', kind: 'out', category: 'rent', amount: 800 },
      { month: '2026-08', kind: 'out', category: 'groceries', amount: 300 },
      { month: '2026-08', kind: 'out', category: 'weekend', amount: 33, label: 'fits nothing' },
    ],
  }).entries;
  const result = reconcileLedger({ entries, transactions, config });

  assert.equal(result.choices.w1, 'water', 'a line with a transaction of its own still matches it');
  assert.deepEqual(
    result.splits,
    {
      h1: [
        { category: 'rent', amount: 800 },
        { category: 'groceries', amount: 150 },
        { category: 'foodout', amount: 150 },
        { category: 'water', amount: 50 },
        { category: 'energy', amount: 50 },
        { category: 'counciltax', amount: 50 },
      ],
      h2: [{ category: 'rent', amount: 800 }, { category: 'groceries', amount: 300 }],
    },
    'the leftover lines that add up to a payment become its parts, merged by category',
  );
  assert.equal(result.combined.length, 2);
  assert.equal(result.combined[0].key, 'h1', 'largest payment first');
  assert.equal(result.combined[0].lines, 7);
  assert.equal(result.combined[0].parts[0].label, 'Rent');
  assert.deepEqual(result.unmatched.map((entry) => entry.label), ['fits nothing']);
  assert.equal(result.changed, 2, 'the two splits; the water line confirms what was there');
  assert.deepEqual(result.rules, {}, 'splits make no rules');
});
