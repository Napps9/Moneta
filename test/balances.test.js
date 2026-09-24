import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyTreatment, computeTotals, createBalanceService, mapWithConcurrency } from '../src/balances.js';
import { createFileStore } from '../src/settings.js';

const silent = { warn() {}, error() {} };

function fakeClient({ accounts, balances, failures = {}, transactions = {} }) {
  const calls = { listAccounts: 0, getBalance: [], listTransactions: [] };
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
    async listTransactions(id, { from, to }) {
      calls.listTransactions.push({ id, from, to });
      if (failures[`transactions:${id}`]) throw new Error(failures[`transactions:${id}`]);
      return (transactions[id] || []).filter((t) => t.date >= from && t.date <= to);
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

test('applyTreatment reads the reported number three ways', () => {
  const account = { id: 1, balance: { current: 1380.42, available: null, currency: 'GBP' } };
  assert.deepEqual(applyTreatment(account).balance, { current: 1380.42, available: null, currency: 'GBP', treatment: 'reported', reported: 1380.42 });
  assert.equal(
    applyTreatment({ id: 1, balance: { ...account.balance, asOf: '2026-09-23T06:15:00.000Z' } }, { balance: 'negate' }).balance.asOf,
    '2026-09-23T06:15:00.000Z',
    'when the balance was synced travels with it through every treatment',
  );
  assert.deepEqual(applyTreatment(account, { balance: 'negate' }).balance, { current: -1380.42, available: null, currency: 'GBP', treatment: 'negate', reported: 1380.42 });
  assert.deepEqual(applyTreatment(account, { balance: 'credit-limit', limit: 5000 }).balance, {
    current: -3619.58,
    available: 1380.42,
    currency: 'GBP',
    treatment: 'credit-limit',
    limit: 5000,
    reported: 1380.42,
  });
  assert.equal(applyTreatment(account, { balance: 'credit-limit' }).balance.treatment, 'reported', 'no limit means no treatment');
  assert.equal(applyTreatment({ id: 2, balance: null, error: 'x' }, { balance: 'negate' }).balance, null);
});

test('a balance the viewer set stands in for Lunch Flow’s, plus the transactions dated after that day', async () => {
  const now = () => Date.parse('2026-09-25T12:00:00Z');
  const client = fakeClient({
    accounts: ACCOUNTS,
    balances: {
      1: { current: 100, available: 90, currency: 'EUR' },
      2: { current: 50, available: 50, currency: 'EUR' },
    },
    failures: { 3: 'no balance today', 'transactions:3': 'no transactions either' },
    transactions: {
      1: [
        { date: '2026-09-23', amount: -99 },
        { date: '2026-09-24', amount: -10.25 },
        { date: '2026-09-25', amount: 4 },
      ],
    },
  });
  const service = createBalanceService({ client, now, ttlMs: 1000, logger: silent });
  const settings = { accounts: { 1: { anchor: { amount: 612.31, date: '2026-09-23' } }, 3: { anchor: { amount: -20, date: '2026-09-01' }, balance: 'negate' } } };

  const snapshot = await service.getSnapshot({ settings });
  const current = snapshot.accounts.find((a) => a.id === 1);
  assert.equal(current.balance.current, 606.06, 'the set amount plus what happened after that day, not on it');
  assert.equal(current.balance.reported, 100, 'Lunch Flow’s own figure is kept alongside');
  assert.equal(current.balance.available, null);
  assert.deepEqual(current.balance.anchor, { amount: 612.31, date: '2026-09-23', since: -6.25, count: 2, error: null });
  assert.deepEqual(current.settings.anchor, { amount: 612.31, date: '2026-09-23' });
  // Besides the month of recent transactions fetched for every account, only the anchored ones are asked for what happened since.
  const anchorCalls = () => client.calls.listTransactions.filter((call) => call.from > '2026-09-01');
  assert.deepEqual(anchorCalls(), [
    { id: 1, from: '2026-09-24', to: '2026-09-26' },
    { id: 3, from: '2026-09-02', to: '2026-09-26' },
  ]);

  const card = snapshot.accounts.find((a) => a.id === 3);
  assert.equal(card.balance.current, 20, 'with no balance from Lunch Flow the set amount still gives one, and treatments still apply');
  assert.equal(card.balance.reported, null);
  assert.equal(card.balance.anchor.error, 'no transactions either');
  assert.equal(card.error, 'no balance today');

  await service.getSnapshot({ settings });
  assert.equal(anchorCalls().length, 2, 'what happened since is cached like the balances');
  await service.getSnapshot({ settings, refresh: true });
  assert.equal(anchorCalls().length, 4, 'and refetched on a refresh');
});

test('pending payments can go back on the balance, as most bank apps show it, and the newest transaction is noted', async () => {
  const now = () => Date.parse('2026-09-25T12:00:00Z');
  const client = fakeClient({
    accounts: ACCOUNTS,
    balances: {
      1: { current: 598.48, available: 598.48, currency: 'GBP' },
      2: { current: 50, available: 50, currency: 'EUR' },
      3: { current: -20, available: 200, currency: 'USD' },
    },
    failures: { 'transactions:3': 'no transactions today' },
    transactions: {
      1: [
        { date: '2026-09-24', amount: -80.5, pending: true },
        { date: '2026-09-23', amount: -24, pending: true },
        { date: '2026-09-20', amount: -10, pending: false },
        { date: '2026-08-01', amount: -999, pending: true }, // outside the month looked at
      ],
    },
  });
  const service = createBalanceService({ client, now, logger: silent });

  const plain = await service.getSnapshot();
  const current = plain.accounts.find((a) => a.id === 1);
  assert.equal(current.balance.current, 598.48, 'as reported by default');
  assert.deepEqual(current.balance.pending, { net: -104.5, count: 2 });
  assert.equal(current.balance.latest, '2026-09-24');
  assert.equal(current.balance.basis, undefined);
  assert.deepEqual(plain.accounts.find((a) => a.id === 2).balance.pending, { net: 0, count: 0 }, 'nothing pending is still known');
  assert.equal(plain.accounts.find((a) => a.id === 3).balance.pending, undefined, 'when the transactions cannot be fetched nothing is claimed');
  assert.deepEqual(
    client.calls.listTransactions.map((call) => [call.id, call.from, call.to]).sort((a, b) => a[0] - b[0]),
    [[1, '2026-08-25', '2026-09-26'], [2, '2026-08-25', '2026-09-26'], [3, '2026-08-25', '2026-09-26']],
    'a month back to tomorrow, for every account',
  );

  const before = await service.getSnapshot({ settings: { accounts: { 1: { pending: 'exclude' } } } });
  const shown = before.accounts.find((a) => a.id === 1);
  assert.equal(shown.balance.current, 702.98, 'the two pending payments go back on');
  assert.equal(shown.balance.reported, 598.48);
  assert.equal(shown.balance.available, null);
  assert.equal(shown.balance.basis, 'before-pending');
  assert.equal(shown.settings.pending, 'exclude');
  assert.equal(client.calls.listTransactions.length, 3, 'settings never refetch');
});

test('settings sent with the request are applied when the store is not persistent', async () => {
  const client = fakeClient({
    accounts: ACCOUNTS,
    balances: {
      1: { current: 100, available: 90, currency: 'EUR' },
      2: { current: 50, available: 50, currency: 'EUR' },
      3: { current: 1380.42, available: null, currency: 'USD' },
    },
  });
  const service = createBalanceService({ client, logger: silent });

  const plain = await service.getSnapshot();
  assert.equal(plain.settings.persistent, false);
  assert.equal(plain.settings.kind, 'memory');
  assert.deepEqual(plain.settings.accounts, {});
  assert.deepEqual(plain.groupOptions.map((g) => g.id), ['savings', 'spending', 'credit']);

  const tuned = await service.getSnapshot({
    settings: { accounts: { 1: { group: 'savings' }, 3: { balance: 'credit-limit', limit: 5000 } } },
  });
  const current = tuned.accounts.find((a) => a.id === 1);
  assert.equal(current.group, 'savings');
  assert.equal(current.autoGroup, 'spending');
  assert.deepEqual(current.settings, { group: 'savings', balance: 'reported', limit: null, pinned: null, anchor: null, pending: 'include' });
  assert.equal(current.pinned, null);
  const card = tuned.accounts.find((a) => a.id === 3);
  assert.equal(card.balance.current, -3619.58);
  assert.equal(card.balance.treatment, 'credit-limit');
  assert.deepEqual(tuned.groups.map((g) => [g.id, g.accountCount]), [['savings', 2], ['spending', 0], ['credit', 1]]);
  assert.equal(tuned.totals.find((t) => t.currency === 'USD').current, -3619.58);
  assert.equal(client.calls.listAccounts, 1, 'settings never refetch balances');
});

test('a persistent store is the source of truth and can be updated', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'moneta-balances-'));
  const settingsStore = createFileStore(path.join(dir, 'settings.json'));
  const client = fakeClient({
    accounts: ACCOUNTS,
    balances: {
      1: { current: 1, available: 1, currency: 'EUR' },
      2: { current: 1, available: 1, currency: 'EUR' },
      3: { current: 1, available: 1, currency: 'USD' },
    },
  });
  const service = createBalanceService({ client, settingsStore, logger: silent });

  const saved = await service.saveSettings({ accounts: { 2: { group: 'credit' }, 99: { group: 'bogus' } } });
  assert.equal(saved.persistent, true);
  assert.deepEqual(saved.accounts, { 2: { group: 'credit' } });

  const snapshot = await service.getSnapshot({ settings: { accounts: { 2: { group: 'savings' } } } });
  assert.equal(snapshot.settings.persistent, true);
  assert.equal(snapshot.accounts.find((a) => a.id === 2).group, 'credit', 'sent settings are ignored when the store persists');

  const fetched = await service.getSettings();
  assert.deepEqual(fetched.accounts, { 2: { group: 'credit' } });
  assert.deepEqual(fetched.groups.map((g) => g.id), ['savings', 'spending', 'credit']);
});

test('a failing settings store does not take the balances down', async () => {
  const settingsStore = {
    kind: 'redis',
    persistent: true,
    async read() {
      throw new Error('WRONGPASS');
    },
    async write() {},
  };
  const client = fakeClient({ accounts: ACCOUNTS.slice(0, 1), balances: { 2: { current: 1, available: 1, currency: 'EUR' } } });
  const service = createBalanceService({ client, settingsStore, logger: silent });
  const snapshot = await service.getSnapshot();
  assert.equal(snapshot.accounts.length, 1);
  assert.equal(snapshot.settings.persistent, true);
  assert.match(snapshot.settings.error, /WRONGPASS/);
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
