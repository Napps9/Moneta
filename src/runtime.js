import { DEFAULT_BASE_URL, createLunchFlowClient } from './lunchflow.js';
import { createMockClient } from './mock.js';
import { createBalanceService } from './balances.js';
import { createAuth } from './auth.js';

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
 */
export function createRuntime(env = process.env, { mock = truthy(env.LUNCHFLOW_MOCK), logger = console } = {}) {
  const ttlRaw = Number(env.CACHE_TTL_SECONDS ?? '300');
  const ttlSeconds = Number.isFinite(ttlRaw) && ttlRaw >= 0 ? ttlRaw : 300;

  let client = null;
  if (mock) client = createMockClient();
  else if (env.LUNCHFLOW_API_KEY) {
    client = createLunchFlowClient({ apiKey: env.LUNCHFLOW_API_KEY, baseUrl: env.LUNCHFLOW_BASE_URL || DEFAULT_BASE_URL });
  }

  const service = client ? createBalanceService({ client, ttlMs: ttlSeconds * 1000, logger }) : null;
  const auth = createAuth({
    password: env.MONETA_PASSWORD || '',
    required: truthy(env.MONETA_REQUIRE_PASSWORD),
  });

  return { mock, client, service, auth, ttlSeconds };
}
