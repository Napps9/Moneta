import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GROUPS, classifyAccount, loadGroupsConfig, normalizeGroupsConfig } from '../src/groups.js';

const account = (name, institutionName = 'Some Bank', id = 1) => ({ id, name, institutionName });
const defaults = normalizeGroupsConfig({});

test('accounts are recognised from their names', () => {
  const cases = [
    ['Chase Saver', 'savings'],
    ['FLEX SAVER', 'savings'],
    ['Savings Pot', 'savings'],
    ['Cash ISA', 'savings'],
    ['Livret A', 'savings'],
    ['Monzo Flex', 'credit'],
    ['Platinum Card', 'credit'],
    ['Car Loan', 'credit'],
    ['BANK A/C', 'spending'],
    ['Personal Account', 'spending'],
    ['Account 1', 'spending'],
    ['070976 XXXX8976', 'spending'],
    ['Lisa', 'spending'],
    ['Cardiff Office', 'spending'],
  ];
  for (const [name, expected] of cases) {
    assert.equal(classifyAccount(account(name), defaults), expected, name);
  }
});

test('card issuers put their accounts under credit', () => {
  assert.equal(classifyAccount(account('Everyday', 'American Express'), defaults), 'credit');
  assert.equal(classifyAccount(account('Everyday', 'Barclaycard'), defaults), 'credit');
  assert.equal(classifyAccount(account('Everyday', 'Barclays'), defaults), 'spending');
});

test('overrides win over keywords and match by id, institution + name, or name', () => {
  const config = normalizeGroupsConfig({
    accounts: {
      '42': 'savings',
      'Monzo · Personal Account': 'credit',
      'chase saver': 'spending',
      'Nope': 'not-a-group',
    },
  });
  assert.equal(classifyAccount({ id: 42, name: 'Card', institutionName: 'X' }, config), 'savings');
  assert.equal(classifyAccount(account('Personal Account', 'Monzo'), config), 'credit');
  assert.equal(classifyAccount(account('Personal Account', 'Starling'), config), 'spending');
  assert.equal(classifyAccount(account('Chase Saver', 'Chase Bank'), config), 'spending', 'names match case-insensitively');
  assert.equal(config.accounts.nope, undefined, 'an override to an unknown group is dropped');
});

test('custom groups, keywords and default group are honoured', () => {
  const config = normalizeGroupsConfig({
    groups: ['everyday', { id: 'business', label: 'Business' }, { id: 'credit' }],
    keywords: { business: ['ltd', 'limited'] },
    defaultGroup: 'everyday',
  });
  assert.deepEqual(
    config.groups.map((g) => [g.id, g.label]),
    [['everyday', 'Everyday'], ['business', 'Business'], ['credit', 'Credit']],
  );
  assert.equal(classifyAccount(account('Private Limited Company'), config), 'business');
  assert.equal(classifyAccount(account('Platinum Card'), config), 'credit', 'built-in keywords still apply to a built-in id');
  assert.equal(classifyAccount(account('Main'), config), 'everyday');
});

test('an unusable config falls back to the defaults', () => {
  assert.deepEqual(normalizeGroupsConfig(null).groups, DEFAULT_GROUPS);
  assert.deepEqual(normalizeGroupsConfig({ groups: [], defaultGroup: 'ghost' }).defaultGroup, 'spending');
  assert.deepEqual(normalizeGroupsConfig({ groups: [{ label: 'no id' }] }).groups, DEFAULT_GROUPS);
});

test('MONETA_GROUPS replaces the file config when it is valid JSON', () => {
  const file = { accounts: { 'Account 1': 'savings' } };
  const warnings = [];
  const logger = { warn: (message) => warnings.push(message) };

  const fromFile = loadGroupsConfig({ env: {}, file, logger });
  assert.equal(classifyAccount(account('Account 1'), fromFile), 'savings');

  const fromEnv = loadGroupsConfig({ env: { MONETA_GROUPS: JSON.stringify({ accounts: { 'Account 1': 'credit' } }) }, file, logger });
  assert.equal(classifyAccount(account('Account 1'), fromEnv), 'credit');

  const broken = loadGroupsConfig({ env: { MONETA_GROUPS: '{not json' }, file, logger });
  assert.equal(classifyAccount(account('Account 1'), broken), 'savings', 'invalid JSON is ignored');
  assert.equal(warnings.length, 1);
});
