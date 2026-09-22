#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './src/env.js';
import { DEFAULT_BASE_URL, createLunchFlowClient } from './src/lunchflow.js';
import { createMockClient } from './src/mock.js';
import { createBalanceService } from './src/balances.js';
import { createRequestHandler } from './src/app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(here, '.env'));

const args = new Set(process.argv.slice(2));
const truthy = (value) => /^(1|true|yes)$/i.test(value ?? '');

const mock = args.has('--mock') || truthy(process.env.LUNCHFLOW_MOCK);
const host = process.env.HOST || '127.0.0.1';
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const ttlSeconds = Number(process.env.CACHE_TTL_SECONDS ?? '300');

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`PORT must be an integer between 0 and 65535 (got "${process.env.PORT}")`);
  process.exit(1);
}
if (!Number.isFinite(ttlSeconds) || ttlSeconds < 0) {
  console.error(`CACHE_TTL_SECONDS must be a non-negative number (got "${process.env.CACHE_TTL_SECONDS}")`);
  process.exit(1);
}

let client;
if (mock) {
  client = createMockClient();
  console.log('Mock mode: serving sample data, no Lunch Flow API calls are made.');
} else {
  const apiKey = process.env.LUNCHFLOW_API_KEY;
  if (!apiKey) {
    console.error(
      [
        'LUNCHFLOW_API_KEY is not set.',
        '',
        '  1. In Lunch Flow, open Destinations and create an API destination to get an API key.',
        '  2. Copy .env.example to .env and paste the key into LUNCHFLOW_API_KEY.',
        '',
        'Or run `npm run mock` to try the app with sample data.',
      ].join('\n'),
    );
    process.exit(1);
  }
  client = createLunchFlowClient({ apiKey, baseUrl: process.env.LUNCHFLOW_BASE_URL || DEFAULT_BASE_URL });
}

const service = createBalanceService({ client, ttlMs: ttlSeconds * 1000 });
const server = http.createServer(createRequestHandler({ service, publicDir: path.join(here, 'public') }));

server.listen(port, host, () => {
  const { port: boundPort } = server.address();
  console.log(`Moneta is running at http://${host}:${boundPort}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
