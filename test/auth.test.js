import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../src/auth.js';

const request = (authorization) => ({ headers: authorization ? { authorization } : {} });

test('auth is off when no password is configured and none is required', () => {
  const auth = createAuth();
  assert.equal(auth.enabled, false);
  assert.equal(auth.check(request()), null);
});

test('a configured password is enforced', () => {
  const auth = createAuth({ password: 'hunter2' });
  assert.equal(auth.enabled, true);
  assert.equal(auth.configured, true);

  const missing = auth.check(request());
  assert.equal(missing.status, 401);
  assert.equal(missing.attempted, false);
  assert.equal(missing.body.message, 'Password required.');

  const wrong = auth.check(request('Bearer nope'));
  assert.equal(wrong.status, 401);
  assert.equal(wrong.attempted, true);
  assert.equal(wrong.body.message, 'Wrong password.');

  assert.equal(auth.check(request('Bearer hunter2')), null);
  assert.equal(auth.check(request('bearer hunter2')), null, 'scheme is case-insensitive');
  assert.equal(auth.check(request('Basic hunter2')).status, 401, 'only Bearer is accepted');
});

test('required protection without a password refuses with a setup message', () => {
  const auth = createAuth({ required: true });
  assert.equal(auth.enabled, true);
  assert.equal(auth.configured, false);
  const denied = auth.check(request('Bearer anything'));
  assert.equal(denied.status, 503);
  assert.equal(denied.body.error, 'Password not configured');
  assert.match(denied.body.message, /MONETA_PASSWORD/);
});
