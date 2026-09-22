import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BASE_URL, createLunchFlowClient } from './lunchflow.js';
import { createMockClient } from './mock.js';
import { createBalanceService } from './balances.js';
import { createAuth } from './auth.js';
import { loadGroupsConfig } from './groups.js';
import { createSettingsStore } from './settings.js';
import groupsFile from '../groups.config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const truthy = (value) => /^(1|true|yes)$/i.test(String(value ?? ''));

/**
 * Build the pieces every entry point needs (the Node server and the serverless
 * functions) from environment variables.
 *
 *   LUNCHFLOW_API_KEY        Lunch Flow API key (required unless mock mode is on)
 *   LUNCHFLOW_BASE_URL       API base URL (optional)
 *   LUNCHFLOW_MOCK           1 to serve sample data
 *   CACHE_TTL_SECONDS        how long a fetched snapshot is reused (default 300)
 *   MONETA_PASSWORD          optional password the page must present
 *   MONETA_REQUIRE_PASSWORD  1 to refuse to serve balances until a password is set
 *   MONETA_GROUPS            JSON with the same shape as groups.config.js; replaces the file when set
 *   MONETA_DATA_DIR          where self-hosted settings are kept (default ./data)
 *   KV_REST_API_URL/TOKEN    Upstash Redis over REST, for settings shared across devices
 *   (or UPSTASH_REDIS_REST_URL/TOKEN)
 */
export function createRuntime(env = process.env, { mock = truthy(env.LUNCHFLOW_MOCK), logger = console } = {}) {
  const ttlRaw = Number(env.CACHE_TTL_SECONDS ?? '300');
  const ttlSeconds = Number.isFinite(ttlRaw) && ttlRaw >= 0 ? ttlRaw : 300;

  let client = null;
  if (mock) client = createMockClient();
  else if (env.LUNCHFLOW_API_KEY) {
    client = createLunchFlowClient({ apiKey: env.LUNCHFLOW_API_KEY, baseUrl: env.LUNCHFLOW_BASE_URL || DEFAULT_BASE_URL });
  }

  const groupsConfig = loadGroupsConfig({ env, file: groupsFile, logger });
  // Serverless hosts have no writable disk, so only self-hosted runs get the file store.
  const dataDir = truthy(env.VERCEL) ? null : path.resolve(root, env.MONETA_DATA_DIR || 'data');
  const settingsStore = createSettingsStore(env, { dataDir });
  const service = client ? createBalanceService({ client, groupsConfig, settingsStore, ttlMs: ttlSeconds * 1000, logger }) : null;
  const auth = createAuth({
    password: env.MONETA_PASSWORD || '',
    required: truthy(env.MONETA_REQUIRE_PASSWORD),
  });

  return { mock, client, service, auth, groupsConfig, settingsStore, ttlSeconds };
}
