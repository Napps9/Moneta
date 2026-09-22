import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadEnv, parseEnv } from '../src/env.js';

test('parseEnv handles comments, quotes and export prefixes', () => {
  const parsed = parseEnv(`
# comment
LUNCHFLOW_API_KEY=abc123
export PORT=4000
QUOTED="hello world" # trailing
SINGLE='x=y'
TRAILING=value # comment
EMPTY=
NOEQUALS
`);
  assert.deepEqual(parsed, {
    LUNCHFLOW_API_KEY: 'abc123',
    PORT: '4000',
    QUOTED: 'hello world',
    SINGLE: 'x=y',
    TRAILING: 'value',
    EMPTY: '',
  });
});

test('loadEnv fills missing variables only and tolerates a missing file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'moneta-env-'));
  const file = path.join(dir, '.env');
  await writeFile(file, 'A=from-file\nB=from-file\n');

  const env = { A: 'preset' };
  loadEnv(file, env);
  assert.deepEqual(env, { A: 'preset', B: 'from-file' });

  const untouched = {};
  assert.deepEqual(loadEnv(path.join(dir, 'missing.env'), untouched), {});
  assert.deepEqual(untouched, {});
});
