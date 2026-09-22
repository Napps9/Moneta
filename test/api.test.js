import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// The serverless entry points read the environment when imported, so set it first.
// Each test file runs in its own process, so this does not leak into other tests.
process.env.LUNCHFLOW_MOCK = '1';
process.env.VERCEL = '1';
process.env.MONETA_PASSWORD = 'secret';

test('serverless functions serve mock balances behind the password on Vercel', async () => {
  const { default: balances } = await import('../api/balances.js');
  const { default: health } = await import('../api/health.js');

  const server = http.createServer((req, res) => (req.url.startsWith('/api/health') ? health(req, res) : balances(req, res)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const locked = await fetch(`${base}/api/balances`);
    assert.equal(locked.status, 401);
    assert.equal(locked.headers.get('cache-control'), 'no-store');

    const open = await fetch(`${base}/api/balances`, { headers: { authorization: 'Bearer secret' } });
    assert.equal(open.status, 200);
    const body = await open.json();
    assert.equal(body.accounts.length, 7);
    assert.ok(body.totals.length >= 2);

    const cached = await (await fetch(`${base}/api/balances`, { headers: { authorization: 'Bearer secret' } })).json();
    assert.equal(cached.cached, true, 'the cache is shared across invocations of the same instance');

    const status = await (await fetch(`${base}/api/health`)).json();
    assert.deepEqual(status, { ok: true, passwordRequired: true });
  } finally {
    server.close();
  }
});
