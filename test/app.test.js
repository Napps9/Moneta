import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequestHandler } from '../src/app.js';
import { createBalanceService } from '../src/balances.js';
import { createMockClient } from '../src/mock.js';
import { LunchFlowError } from '../src/lunchflow.js';

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
  const service = createBalanceService({ client: createMockClient({ delayMs: 0 }), logger: silent });
  ({ server: mockServer, base } = await listen(createRequestHandler({ service, publicDir, logger: silent })));
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
  const post = await fetch(`${base}/api/balances`, { method: 'POST' });
  assert.equal(post.status, 405);
  const missing = await fetch(`${base}/api/nope`);
  assert.equal(missing.status, 404);
  const health = await fetch(`${base}/api/health`);
  assert.deepEqual(await health.json(), { ok: true });
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
