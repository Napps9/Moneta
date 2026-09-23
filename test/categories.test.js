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
  normalizeCategoriesConfig,
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
