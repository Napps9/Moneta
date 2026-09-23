import { test } from 'node:test';
import { normalizeTransaction } from '../src/lunchflow.js';

test('normalizeTransaction keeps the extra fields Lunch Flow sends as details', () => {
  const txn = normalizeTransaction({
    id: 9,
    account_id: 1,
    date: '2026-06-22T14:03:00Z',
    amount: '-13.70',
    currency: 'gbp',
    merchant_name: 'SQ *TRINDLE STORES',
    description: 'SQ *TRINDLE STORESRichmond',
    category: 'Shopping',
    is_pending: 'true',
    type: 'card_payment',
    location: { city: 'Richmond', country: 'GB', geo: { lat: 1, lng: 2 } },
    tags: ['a', 'b'],
    empty: '',
    nothing: null,
  });
  assert.equal(txn.date, '2026-06-22');
  assert.equal(txn.amount, -13.7);
  assert.equal(txn.currency, 'GBP');
  assert.equal(txn.merchant, 'SQ *TRINDLE STORES');
  assert.equal(txn.category, 'Shopping');
  assert.equal(txn.pending, true);
  assert.deepEqual(txn.details, {
    type: 'card_payment',
    'location.city': 'Richmond',
    'location.country': 'GB',
    tags: 'a, b',
    time: '2026-06-22T14:03:00Z',
  });
  assert.deepEqual(normalizeTransaction({ id: 1, date: '2026-06-22', amount: 5 }).details, {}, 'nothing extra, nothing kept');
  assert.equal(normalizeTransaction({ date: 'nope', amount: 5 }), null);
});
import assert from 'node:assert/strict';
import { LunchFlowError, createLunchFlowClient, normalizeAccount, normalizeBalance } from '../src/lunchflow.js';

function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const { pathname } = new URL(url);
    const route = routes[pathname];
    if (!route) return new Response('Not found', { status: 404 });
    const status = route.status ?? 200;
    const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body);
    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

test('listAccounts sends the API key header and normalizes accounts', async () => {
  const { fetchImpl, calls } = stubFetch({
    '/api/v1/accounts': {
      body: {
        accounts: [
          {
            id: 123,
            name: '  Checking ',
            institution_name: 'Demo Bank',
            institution_logo: 'https://example.com/logo.png',
            provider: 'gocardless',
            currency: 'eur',
            status: 'ACTIVE',
          },
          { id: 124, name: 'Savings', institution_name: 'Demo Bank', provider: 'gocardless' },
        ],
        total: 2,
      },
    },
  });
  const client = createLunchFlowClient({ apiKey: 'secret', baseUrl: 'https://api.test/api/v1/', fetchImpl });

  const accounts = await client.listAccounts();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.test/api/v1/accounts');
  assert.equal(calls[0].init.headers['x-api-key'], 'secret');
  assert.deepEqual(accounts[0], {
    id: 123,
    name: 'Checking',
    institutionName: 'Demo Bank',
    institutionLogo: 'https://example.com/logo.png',
    provider: 'gocardless',
    currency: 'EUR',
    status: 'ACTIVE',
  });
  assert.equal(accounts[1].currency, null);
  assert.equal(accounts[1].status, 'UNKNOWN');
  assert.equal(accounts[1].institutionLogo, null);
});

test('getBalance accepts both balance shapes', async () => {
  const { fetchImpl } = stubFetch({
    '/api/v1/accounts/1/balance': { body: { balance: { available: 90.5, current: 100, currency: 'GBP' } } },
    '/api/v1/accounts/2/balance': { body: { balance: { amount: 42, currency: 'usd' } } },
  });
  const client = createLunchFlowClient({ apiKey: 'k', baseUrl: 'https://api.test/api/v1', fetchImpl });

  assert.deepEqual(await client.getBalance(1), { current: 100, available: 90.5, currency: 'GBP' });
  assert.deepEqual(await client.getBalance(2), { current: 42, available: null, currency: 'USD' });
});

test('non-2xx responses become LunchFlowError with status and API message', async () => {
  const { fetchImpl } = stubFetch({
    '/api/v1/accounts': { status: 403, body: { error: 'Forbidden', message: 'Invalid API key.' } },
  });
  const client = createLunchFlowClient({ apiKey: 'bad', baseUrl: 'https://api.test/api/v1', fetchImpl });

  await assert.rejects(client.listAccounts(), (err) => {
    assert.ok(err instanceof LunchFlowError);
    assert.equal(err.status, 403);
    assert.equal(err.code, 'Forbidden');
    assert.equal(err.message, 'Forbidden: Invalid API key.');
    return true;
  });
});

test('network failures become LunchFlowError without a status', async () => {
  const fetchImpl = async () => {
    throw new TypeError('fetch failed');
  };
  const client = createLunchFlowClient({ apiKey: 'k', fetchImpl });

  await assert.rejects(client.listAccounts(), (err) => {
    assert.ok(err instanceof LunchFlowError);
    assert.equal(err.status, null);
    assert.equal(err.code, 'network');
    assert.match(err.message, /Could not reach Lunch Flow/);
    return true;
  });
});

test('unexpected response shapes are rejected', async () => {
  const { fetchImpl } = stubFetch({
    '/api/v1/accounts': { body: { nope: [] } },
    '/api/v1/accounts/9/balance': { body: { balance: { currency: 'EUR' } } },
  });
  const client = createLunchFlowClient({ apiKey: 'k', baseUrl: 'https://api.test/api/v1', fetchImpl });

  await assert.rejects(client.listAccounts(), /Unexpected accounts response shape/);
  await assert.rejects(client.getBalance(9), /did not contain an amount/);
});

test('normalizeBalance falls back to available and the given currency', () => {
  assert.deepEqual(normalizeBalance({ available: '12.50' }, 'CHF'), { current: 12.5, available: 12.5, currency: 'CHF' });
  assert.deepEqual(normalizeBalance({ current: 0, currency: 'jpy' }), { current: 0, available: null, currency: 'JPY' });
  assert.deepEqual(
    normalizeBalance({ current: 5, currency: 'GBP', last_synced: '2026-09-23T06:15:00Z' }),
    { current: 5, available: null, currency: 'GBP', asOf: '2026-09-23T06:15:00.000Z' },
    'when the payload says when it was synced, that is kept',
  );
  assert.equal(normalizeBalance({ current: 5, currency: 'GBP', updated_at: 1790144100 }).asOf, '2026-09-23T06:15:00.000Z', 'epoch seconds work too');
  assert.equal(normalizeBalance({ current: 5, currency: 'GBP', updated_at: 'yesterday-ish' }).asOf, undefined, 'an unreadable stamp is left out');
  assert.equal(normalizeAccount({ id: 1, syncedAt: '2026-09-23T06:15:00Z' }).syncedAt, '2026-09-23T06:15:00.000Z');
  assert.equal(normalizeAccount({ id: 1 }).syncedAt, undefined);
});

test('normalizeAccount requires an id', () => {
  assert.throws(() => normalizeAccount({ name: 'x' }), /without an id/);
});
