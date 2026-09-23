import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSFER,
  classifyTransaction,
  describeCategories,
  isAssignable,
  labelOf,
  loadCategoriesConfig,
  merchantKey,
  mergeCustomCategories,
  normalizeCategoriesConfig,
  normalizeCustomCategories,
  transactionKey,
} from '../src/categories.js';
import configFile from '../categories.config.js';

const config = normalizeCategoriesConfig(configFile);
const txn = (overrides) => ({ id: 't1', date: '2026-09-10', amount: -12.5, currency: 'GBP', description: 'TESCO STORES 2041', merchant: 'Tesco', category: null, pending: false, ...overrides });

test('the config file builds a tree with parents, subs and plain categories', () => {
  const tree = describeCategories(config);
  assert.deepEqual(tree.income.map((c) => c.label), ['Salary', 'Loan Repayments', 'Misc Income']);
  assert.deepEqual(tree.outgoings.map((c) => c.label), ['Groceries', 'Luxuries', 'Living', 'Health', 'Transport', 'Money', 'Misc']);
  assert.equal(tree.outgoings[0].subs, null, 'Groceries is a plain category');
  assert.deepEqual(tree.outgoings[3].subs.map((c) => c.label), ['Dentist', 'Gym', 'Doctors', 'Pharmacy', 'Optician', 'Haircut']);
  assert.equal(config.leaves.get('haircut').parent, 'health');
  assert.equal(config.leaves.get('gym').parent, 'health');
  assert.equal(config.leaves.get('groceries').parent, null);
  assert.equal(isAssignable(config, 'health'), false, 'a parent is not assignable');
  assert.equal(isAssignable(config, 'gym', 'out'), true);
  assert.equal(isAssignable(config, 'gym', 'in'), false);
  assert.equal(isAssignable(config, TRANSFER), true);
  assert.equal(labelOf(config, null), 'Uncategorised');
  assert.equal(labelOf(config, 'miscincome'), 'Misc Income');
});

test('keywords file merchants automatically, only on the matching side', () => {
  assert.equal(classifyTransaction(txn(), { config }).category, 'groceries');
  assert.equal(classifyTransaction(txn({ merchant: 'PureGym', description: 'PUREGYM LTD' }), { config }).category, 'gym');
  assert.equal(classifyTransaction(txn({ merchant: 'TfL', description: 'TFL TRAVEL CHARGE' }), { config }).category, 'travel');
  assert.equal(classifyTransaction(txn({ merchant: null, description: 'ACME LTD SALARY', amount: 2650 }), { config }).category, 'salary');
  assert.equal(classifyTransaction(txn({ merchant: 'Tesco', amount: 30 }), { config }).category, null, 'a refund from Tesco is not groceries income');
  assert.equal(classifyTransaction(txn({ merchant: null, description: 'PARENTAL LEAVE' }), { config }).category, null, 'whole words only: "rent" does not match "parental"');
  assert.equal(classifyTransaction(txn({ merchant: 'Unknown Shop', description: 'UNKNOWN SHOP 42' }), { config }).category, null);
  assert.equal(
    classifyTransaction(txn({ merchant: null, description: 'Interactive BrokerNicholas Apps', amount: -75 }), { config }).category,
    'investments',
    'a payee glued to the reference still matches',
  );
  assert.equal(classifyTransaction(txn({ merchant: null, description: 'Interactive BrokerNicholas Apps', amount: 75 }), { config }).category, null, 'money in from a broker is not an outgoing');
});

test('transfers are spotted by keyword or by another account name, and never counted as spending', () => {
  assert.equal(classifyTransaction(txn({ merchant: null, description: 'POT TRANSFER TO SAVINGS POT', amount: -300 }), { config }).category, TRANSFER);
  const result = classifyTransaction(txn({ merchant: null, description: 'TO CHASE SAVER', amount: -500 }), { config, otherAccountNames: ['Chase Saver', 'Ab'] });
  assert.deepEqual(result, { category: TRANSFER, source: 'account' });
});

test('choices made in the app win, per transaction over per merchant, and only for the matching side', () => {
  const settings = {
    rules: { tesco: 'foodout' },
    transactions: { 'id:t9': 'weekend' },
  };
  assert.deepEqual(classifyTransaction(txn(), { config, settings, accountId: 1 }), { category: 'foodout', source: 'merchant' });
  assert.deepEqual(classifyTransaction(txn({ id: 't9' }), { config, settings, accountId: 1 }), { category: 'weekend', source: 'transaction' });
  assert.equal(classifyTransaction(txn({ amount: 20 }), { config, settings, accountId: 1 }).category, null, 'an outgoing rule does not apply to money in');
  assert.equal(merchantKey(txn()), 'tesco');
  assert.equal(merchantKey(txn({ merchant: null, description: '  ACME   Ltd ' })), 'acme ltd');
  assert.equal(transactionKey(7, txn()), 'id:t1');
  assert.equal(transactionKey(7, txn({ id: null })), 'k:7|2026-09-10|-12.5|tesco stores 2041');
});

test("Lunch Flow's own category is used when it matches a label here", () => {
  assert.equal(classifyTransaction(txn({ merchant: 'Corner Shop', description: 'CORNER SHOP', category: 'Groceries' }), { config }).category, 'groceries');
  assert.equal(classifyTransaction(txn({ merchant: 'Corner Shop', description: 'CORNER SHOP', category: 'Entertainment' }), { config }).category, null);
});

test('categories added in the app merge into the tree and are flagged', () => {
  const custom = normalizeCustomCategories([
    { id: 'u-kids', label: 'Kids', kind: 'out', group: true },
    { id: 'u-nursery', label: ' Nursery  fees ', kind: 'out', parent: 'u-kids' },
    { id: 'u-alcohol', label: 'Alcohol', kind: 'out', parent: 'luxuries' },
    { id: 'u-charity', label: 'Charity', kind: 'out' },
    { id: 'u-bonus', label: 'Bonus', kind: 'in', parent: 'luxuries', group: true },
    { id: 'u-orphan', label: 'Orphan', kind: 'out', parent: 'gone' },
    { id: 'groceries', label: 'Clash with the file', kind: 'out' },
    { id: 'U-Kids', label: 'Duplicate id' },
    { id: '', label: 'No id' },
    { label: 'No id either' },
    { id: 'u-blank', label: '   ' },
    { id: 'transfer', label: 'Reserved' },
    'junk',
  ]);
  assert.deepEqual(custom.map((c) => c.id), ['u-kids', 'u-nursery', 'u-alcohol', 'u-charity', 'u-bonus', 'u-orphan', 'groceries']);
  assert.equal(custom[1].label, 'Nursery fees');
  assert.deepEqual(custom[4], { id: 'u-bonus', label: 'Bonus', kind: 'in', parent: null, group: false }, 'income has no parent or group');

  const merged = mergeCustomCategories(config, custom);
  const tree = describeCategories(merged);
  assert.deepEqual(tree.income.map((c) => c.label), ['Salary', 'Loan Repayments', 'Misc Income', 'Bonus']);
  assert.equal(tree.income[3].custom, true);
  assert.deepEqual(tree.outgoings.map((c) => c.label), ['Groceries', 'Luxuries', 'Living', 'Health', 'Transport', 'Money', 'Misc', 'Kids', 'Charity', 'Orphan']);
  assert.equal(tree.outgoings[0].custom, undefined, 'the file wins an id clash');
  assert.deepEqual(tree.outgoings[7].subs.map((c) => c.label), ['Nursery fees']);
  assert.equal(tree.outgoings[7].custom, true);
  assert.equal(tree.outgoings[7].subs[0].custom, true);
  assert.ok(tree.outgoings[1].subs.some((c) => c.id === 'u-alcohol' && c.custom === true), 'a sub can join a group from the file');
  assert.equal(merged.leaves.get('u-orphan').parent, null, 'a sub whose group has gone is its own category');
  assert.equal(isAssignable(merged, 'u-nursery', 'out'), true);
  assert.equal(isAssignable(merged, 'u-kids'), false, 'a group is not assignable');
  assert.equal(labelOf(merged, 'u-nursery'), 'Nursery fees');
  assert.equal(classifyTransaction(txn(), { config: merged, settings: { rules: { tesco: 'u-alcohol' } } }).category, 'u-alcohol');
  assert.equal(mergeCustomCategories(config, []), config, 'nothing to merge gives the same config back');
  assert.equal(describeCategories(config).outgoings[0].custom, undefined);
});

test('an empty or broken config falls back to something usable, and env JSON replaces the file', () => {
  const fallback = normalizeCategoriesConfig({});
  assert.deepEqual(describeCategories(fallback).income.map((c) => c.id), ['income']);
  const dupes = normalizeCategoriesConfig({ income: ['A', 'A'], outgoings: [{ id: 'x', subs: [] }, { id: 'transfer' }, { id: 'p', subs: [{ id: 'p' }] }] });
  assert.deepEqual([...dupes.leaves.keys()], ['a', 'x'], 'a parent with no subs is just a plain category');
  assert.deepEqual(dupes.outgoings.map((c) => c.id), ['x']);
  assert.equal(dupes.outgoings[0].subs, null);

  const warnings = [];
  const fromEnv = loadCategoriesConfig({ env: { MONETA_CATEGORIES: JSON.stringify({ income: [{ id: 'pay', label: 'Pay' }], outgoings: [{ id: 'stuff', label: 'Stuff' }] }) }, file: configFile, logger: { warn: (m) => warnings.push(m) } });
  assert.deepEqual([...fromEnv.leaves.keys()], ['pay', 'stuff']);
  const broken = loadCategoriesConfig({ env: { MONETA_CATEGORIES: '{oops' }, file: configFile, logger: { warn: (m) => warnings.push(m) } });
  assert.ok(broken.leaves.has('groceries'));
  assert.equal(warnings.length, 1);
});
