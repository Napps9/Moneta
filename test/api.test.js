import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// The serverless entry points read the environment when imported, so set it first.
// Each test file runs in its own process, so this does not leak into other tests.
process.env.LUNCHFLOW_MOCK = '1';
process.env.VERCEL = '1';
delete process.env.MONETA_PASSWORD;
delete process.env.MONETA_REQUIRE_PASSWORD;

test('serverless functions serve balances openly when no password is configured', async () => {
  const { default: balances } = await import('../api/balances.js');
  const { default: health } = await import('../api/health.js');

  const server = http.createServer((req, res) => (req.url.startsWith('/api/health') ? health(req, res) : balances(req, res)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const res = await fetch(`${base}/api/balances`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.equal(body.accounts.length, 7);
    assert.ok(body.totals.length >= 2);
    assert.equal(body.settings.persistent, false, 'no Redis configured: settings stay in the browser');
    assert.equal(body.settings.kind, 'memory');

    const cached = await (await fetch(`${base}/api/balances`)).json();
    assert.equal(cached.cached, true, 'the cache is shared across invocations of the same instance');

    const status = await (await fetch(`${base}/api/health`)).json();
    assert.deepEqual(status, { ok: true, passwordRequired: false });
  } finally {
    server.close();
  }
});
