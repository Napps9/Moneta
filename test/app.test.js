import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequestHandler } from '../src/app.js';
import { createBalanceService } from '../src/balances.js';
import { createActivityService } from '../src/activity.js';
import { createMockClient } from '../src/mock.js';
import { LunchFlowError } from '../src/lunchflow.js';
import { createAuth } from '../src/auth.js';
import { createFileStore } from '../src/settings.js';
import { normalizeCategoriesConfig } from '../src/categories.js';
import categoriesFile from '../categories.config.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');
const silent = { warn() {}, error() {} };

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

let mockServer;
let base;

before(async () => {
  const client = createMockClient({ delayMs: 0 });
  const categoriesConfig = normalizeCategoriesConfig(categoriesFile);
  const service = createBalanceService({ client, categoriesConfig, logger: silent });
  const activity = createActivityService({ client, balances: service, categories: categoriesConfig, logger: silent });
  ({ server: mockServer, base } = await listen(createRequestHandler({ service, activity, publicDir, logger: silent })));
});

test('GET /api/activity returns one account’s money in, money out and balances', async () => {
  const missing = await fetch(`${base}/api/activity`);
  assert.equal(missing.status, 400);

  const unknown = await fetch(`${base}/api/activity?account=999`);
  assert.equal(unknown.status, 404);

  const bad = await fetch(`${base}/api/activity?account=101&from=nope&to=2026-01-01`);
  assert.equal(bad.status, 400);

  const res = await fetch(`${base}/api/activity?account=101`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.account.id, 101);
  assert.equal(body.currency, 'GBP');
  assert.ok(body.income >= 0 && body.outgoings >= 0);
  assert.equal(body.net, Math.round((body.income - body.outgoings) * 10000) / 10000);
  assert.equal(body.closingBalance, 2510.43, 'the current month closes on the current balance');
  assert.equal(body.closingIsCurrent, true);
  assert.ok(Array.isArray(body.transactions));
  assert.equal(body.transactionCount, body.transactions.length);

  const broken = await fetch(`${base}/api/activity?account=501`);
  assert.equal(broken.status, 502, 'an upstream failure is reported, not hidden');
});

after(() => mockServer.close());

test('GET /api/balances returns the snapshot as JSON', async () => {
  const res = await fetch(`${base}/api/balances`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const body = await res.json();
  assert.equal(body.accounts.length, 7);
  assert.ok(body.totals.length >= 2);
  assert.equal(body.partial, true, 'the mock has one account whose balance fails');
  assert.equal(typeof body.fetchedAt, 'string');
});

test('refresh=1 bypasses the cache', async () => {
  const cached = await (await fetch(`${base}/api/balances`)).json();
  assert.equal(cached.cached, true);
  const fresh = await (await fetch(`${base}/api/balances?refresh=1`)).json();
  assert.equal(fresh.cached, false);
});

test('GET / serves the page and static assets with security headers', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await page.text(), /<title>Moneta<\/title>/);

  const script = await fetch(`${base}/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /text\/javascript/);

  const head = await fetch(`${base}/style.css`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.text()).length, 0);
});

test('paths outside the public directory are not served', async () => {
  for (const target of ['/../server.js', '/%2e%2e/server.js', '/..%2fserver.js', '/src/app.js', '/.env.example']) {
    const res = await fetch(`${base}${target}`);
    assert.equal(res.status, 404, target);
  }
});

test('unsupported methods and unknown API routes are rejected', async () => {
  const del = await fetch(`${base}/api/balances`, { method: 'DELETE' });
  assert.equal(del.status, 405);
  const missing = await fetch(`${base}/api/nope`);
  assert.equal(missing.status, 404);
  const health = await fetch(`${base}/api/health`);
  assert.deepEqual(await health.json(), { ok: true, passwordRequired: false });
});

test('settings sent in a header or a POST body shape the response when the server cannot store them', async () => {
  const res = await fetch(`${base}/api/balances`, {
    headers: { 'x-moneta-settings': JSON.stringify({ accounts: { 101: { group: 'credit' } } }) },
  });
  const body = await res.json();
  assert.equal(body.settings.persistent, false);
  assert.equal(body.accounts.find((a) => a.id === 101).group, 'credit');
  assert.deepEqual(body.settings.accounts, { 101: { group: 'credit' } });

  const junk = await fetch(`${base}/api/balances`, { headers: { 'x-moneta-settings': '{nope' } });
  assert.equal(junk.status, 200, 'an unreadable header is ignored');

  const posted = await fetch(`${base}/api/balances`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ settings: { accounts: { 101: { pinned: 1700000000000 } } } }),
  });
  assert.equal(posted.status, 200);
  const postedBody = await posted.json();
  assert.equal(postedBody.accounts.find((a) => a.id === 101).pinned, 1700000000000);

  const badBody = await fetch(`${base}/api/balances`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
  assert.equal(badBody.status, 400);
});

test('GET and POST /api/sheet return categories by month for an account', async () => {
  const missing = await fetch(`${base}/api/sheet`);
  assert.equal(missing.status, 400);
  const unknown = await fetch(`${base}/api/sheet?account=999`);
  assert.equal(unknown.status, 404);
  const badMonth = await fetch(`${base}/api/sheet?account=101&to=2026-13`);
  assert.equal(badMonth.status, 400);

  const res = await fetch(`${base}/api/sheet?account=101&months=3`);
  assert.equal(res.status, 200);
  const sheet = await res.json();
  assert.equal(sheet.account.id, 101);
  assert.equal(sheet.months.length, 3);
  assert.equal(sheet.months[2].current, true);
  assert.equal(sheet.outgoings.rows.length, 7);
  assert.ok(sheet.outgoings.rows.find((r) => r.id === 'groceries').values[2] > 0, 'Tesco and friends land in Groceries');
  assert.ok(sheet.transfers.out[2] > 0, 'the pot transfer is a transfer');
  assert.equal(sheet.balance.closing[2], 2510.43, 'the current month closes on the balance now');
  assert.equal(sheet.balance.opening[2], sheet.balance.closing[1]);
  assert.ok(Array.isArray(sheet.transactions) && sheet.transactions.length > 0);
  assert.equal(sheet.categories.income.length, 3);

  const merchant = sheet.transactions.find((t) => t.category === 'groceries');
  const posted = await fetch(`${base}/api/sheet?account=101&months=3`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ settings: { rules: { [merchant.merchantKey]: 'foodout' } } }),
  });
  const reclassified = await posted.json();
  assert.equal(reclassified.transactions.find((t) => t.key === merchant.key).category, 'foodout');
  assert.deepEqual(reclassified.settings.rules, { [merchant.merchantKey]: 'foodout' });
});

test('settings can be read and written when a store is configured', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'moneta-app-'));
  const settingsStore = createFileStore(path.join(dir, 'settings.json'));
  const service = createBalanceService({ client: createMockClient({ delayMs: 0 }), settingsStore, logger: silent });
  const { server, base: stored } = await listen(createRequestHandler({ service, publicDir, logger: silent }));
  try {
    const before = await (await fetch(`${stored}/api/settings`)).json();
    assert.deepEqual(before, { persistent: true, kind: 'file', error: null, accounts: {}, rules: {}, transactions: {}, groups: before.groups });
    assert.equal(before.groups.length, 3);

    const put = await fetch(`${stored}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accounts: { 101: { balance: 'credit-limit', limit: 5000 } } }),
    });
    assert.equal(put.status, 200);
    assert.deepEqual((await put.json()).accounts, { 101: { balance: 'credit-limit', limit: 5000 } });

    const balances = await (await fetch(`${stored}/api/balances`)).json();
    const account = balances.accounts.find((a) => a.id === 101);
    assert.equal(account.balance.treatment, 'credit-limit');
    assert.equal(account.balance.current, -(5000 - 2510.43));

    const bad = await fetch(`${stored}/api/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{nope' });
    assert.equal(bad.status, 400);
    const wrongMethod = await fetch(`${stored}/api/settings`, { method: 'POST' });
    assert.equal(wrongMethod.status, 405);
  } finally {
    server.close();
  }
});

test('a password protects the API but not the page shell', async () => {
  const service = createBalanceService({ client: createMockClient({ delayMs: 0 }), logger: silent });
  const auth = createAuth({ password: 'hunter2' });
  const { server, base: guarded } = await listen(createRequestHandler({ service, publicDir, auth, logger: silent }));
  try {
    assert.equal((await fetch(`${guarded}/api/balances`)).status, 401);
    assert.equal((await fetch(`${guarded}/api/balances`, { headers: { authorization: 'Bearer nope' } })).status, 401);

    const ok = await fetch(`${guarded}/api/balances`, { headers: { authorization: 'Bearer hunter2' } });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).accounts.length, 7);

    const health = await (await fetch(`${guarded}/api/health`)).json();
    assert.deepEqual(health, { ok: true, passwordRequired: true });

    assert.equal((await fetch(`${guarded}/`)).status, 200, 'the page itself loads and asks for the password');
  } finally {
    server.close();
  }
});

test('required protection without a configured password refuses to serve balances', async () => {
  const service = createBalanceService({ client: createMockClient({ delayMs: 0 }), logger: silent });
  const auth = createAuth({ password: '', required: true });
  const { server, base: unset } = await listen(createRequestHandler({ service, publicDir, auth, logger: silent }));
  try {
    const res = await fetch(`${unset}/api/balances`, { headers: { authorization: 'Bearer anything' } });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'Password not configured');
  } finally {
    server.close();
  }
});

test('a missing API key is reported instead of crashing', async () => {
  const { server, base: keyless } = await listen(createRequestHandler({ service: null, publicDir, logger: silent }));
  try {
    const res = await fetch(`${keyless}/api/balances`);
    assert.equal(res.status, 503);
    assert.match((await res.json()).message, /LUNCHFLOW_API_KEY/);
  } finally {
    server.close();
  }
});

test('upstream auth failures surface as 502 with a helpful message', async () => {
  const client = {
    async listAccounts() {
      throw new LunchFlowError('Forbidden: Invalid API key.', { status: 403, code: 'Forbidden' });
    },
    async getBalance() {},
  };
  const service = createBalanceService({ client, logger: silent });
  const { server, base: failingBase } = await listen(createRequestHandler({ service, publicDir, logger: silent }));
  try {
    const res = await fetch(`${failingBase}/api/balances`);
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'Lunch Flow rejected the API key');
    assert.match(body.message, /LUNCHFLOW_API_KEY/);
    assert.equal(body.upstreamStatus, 403);
  } finally {
    server.close();
  }
});
