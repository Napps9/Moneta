import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeGroupsConfig } from '../src/groups.js';
import {
  MAX_SETTINGS_BYTES,
  createFileStore,
  createMemoryStore,
  createRedisStore,
  createSettingsStore,
  normalizeSettings,
  parseSettingsJson,
} from '../src/settings.js';

const config = normalizeGroupsConfig({});

test('normalizeSettings keeps valid entries and drops the rest', () => {
  const settings = normalizeSettings(
    {
      accounts: {
        1: { group: 'Credit', balance: 'credit-limit', limit: '5000' },
        2: { group: 'nope' },
        3: { balance: 'negate', extra: true },
        4: { balance: 'credit-limit' },
        5: { balance: 'sideways' },
        6: 'not an object',
        ' ': { group: 'savings' },
      },
    },
    config,
  );
  assert.deepEqual(settings, {
    version: 1,
    accounts: {
      1: { group: 'credit', balance: 'credit-limit', limit: 5000 },
      3: { balance: 'negate' },
    },
    rules: {},
    transactions: {},
    splits: {},
  });
  assert.deepEqual(normalizeSettings(null, config).accounts, {});
  assert.deepEqual(normalizeSettings({ accounts: [] }, config).accounts, {});
});

test('normalizeSettings keeps pins, merchant rules and per-transaction choices', async () => {
  const { normalizeCategoriesConfig } = await import('../src/categories.js');
  const { default: categoriesFile } = await import('../categories.config.js');
  const categories = normalizeCategoriesConfig(categoriesFile);
  const settings = normalizeSettings(
    {
      accounts: { 1: { pinned: 1700000000000.7 }, 2: { pinned: true }, 3: { pinned: -5 }, 4: { pinned: 'yes' } },
      rules: { tesco: 'Groceries', puregym: 'gym', shop: 'not-a-category', health: 'health', '': 'gym', pot: 'transfer' },
      transactions: { 'id:1': 'weekend', 'id:2': 42 },
      splits: {
        'id:9': [{ category: 'Rent', amount: '1100' }, { category: 'energy', amount: 100.123456 }, { category: 'nope', amount: 5 }, { amount: 50 }, { category: 'gym', amount: 0 }, 'junk'],
        'id:10': [],
        'id:11': 'not a list',
        'id:12': [{ category: 'health', amount: 10 }],
      },
    },
    config,
    categories,
  );
  assert.deepEqual(settings.accounts, { 1: { pinned: 1700000000000 }, 2: { pinned: 1 } });
  assert.deepEqual(settings.rules, { tesco: 'groceries', puregym: 'gym', pot: 'transfer' }, 'unknown categories and parents are dropped');
  assert.deepEqual(settings.transactions, { 'id:1': 'weekend' });
  assert.deepEqual(
    settings.splits,
    { 'id:9': [{ category: 'rent', amount: 1100 }, { category: 'energy', amount: 100.1235 }, { category: null, amount: 50 }] },
    'parts need a positive amount and a known category or none; empty splits go',
  );

  const loose = normalizeSettings({ rules: { x: 'anything' } }, config);
  assert.deepEqual(loose.rules, { x: 'anything' }, 'without a categories config any short id is kept');
});

test('parseSettingsJson rejects junk and oversized payloads', () => {
  assert.deepEqual(parseSettingsJson('{"accounts":{}}'), { accounts: {} });
  assert.equal(parseSettingsJson(''), null);
  assert.throws(() => parseSettingsJson('{nope'), /not valid JSON/);
  assert.throws(() => parseSettingsJson('x'.repeat(MAX_SETTINGS_BYTES + 1)), /too large/);
});

test('the file store round-trips and starts empty', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'moneta-settings-'));
  const store = createFileStore(path.join(dir, 'nested', 'settings.json'));
  assert.equal(store.persistent, true);
  assert.deepEqual(await store.read(), { version: 1, accounts: {}, rules: {}, transactions: {}, splits: {} });
  await store.write({ version: 1, accounts: { 7: { group: 'savings' } } });
  assert.deepEqual(await store.read(), { version: 1, accounts: { 7: { group: 'savings' } } });
});

test('the redis store talks Upstash REST', async () => {
  const calls = [];
  let stored = null;
  const fetchImpl = async (url, init) => {
    const command = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.authorization, command });
    if (command[0] === 'GET') return new Response(JSON.stringify({ result: stored }), { status: 200 });
    if (command[0] === 'SET') {
      stored = command[2];
      return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'unknown command' }), { status: 400 });
  };
  const store = createRedisStore({ url: 'https://example.upstash.io/', token: 'tok', fetchImpl });

  assert.equal(store.persistent, true);
  assert.deepEqual(await store.read(), { version: 1, accounts: {}, rules: {}, transactions: {}, splits: {} });
  await store.write({ version: 1, accounts: { 1: { balance: 'negate' } } });
  assert.deepEqual(await store.read(), { version: 1, accounts: { 1: { balance: 'negate' } } });

  assert.equal(calls[0].url, 'https://example.upstash.io');
  assert.equal(calls[0].auth, 'Bearer tok');
  assert.deepEqual(calls[1].command.slice(0, 2), ['SET', 'moneta:settings']);

  const failing = createRedisStore({ url: 'https://x', token: 't', fetchImpl: async () => new Response('{"error":"WRONGPASS"}', { status: 401 }) });
  await assert.rejects(failing.read(), /WRONGPASS/);
});

test('createSettingsStore picks redis, then file, then memory', () => {
  assert.equal(createSettingsStore({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' }).kind, 'redis');
  assert.equal(createSettingsStore({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 't' }).kind, 'redis');
  assert.equal(createSettingsStore({}, { dataDir: '/tmp/x' }).kind, 'file');
  const memory = createSettingsStore({});
  assert.equal(memory.kind, 'memory');
  assert.equal(memory.persistent, false);
  assert.equal(createMemoryStore().persistent, false);
});
