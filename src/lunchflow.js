/**
 * Minimal client for the Lunch Flow personal API.
 *
 *   GET /accounts                      -> { accounts: [...] }
 *   GET /accounts/:id/balance          -> { balance: { ... } }
 *
 * Authentication is an `x-api-key` header. API keys are created from an
 * "API destination" in the Lunch Flow dashboard (https://lunchflow.app/destinations).
 */

export const DEFAULT_BASE_URL = 'https://www.lunchflow.app/api/v1';

export class LunchFlowError extends Error {
  constructor(message, { status = null, code = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'LunchFlowError';
    this.status = status;
    this.code = code;
  }
}

const str = (value) => (typeof value === 'string' ? value.trim() : '');

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Normalize a raw account object from `GET /accounts`. */
export function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new LunchFlowError('Unexpected account shape in response', { code: 'bad_response' });
  }
  const id = raw.id;
  if (typeof id !== 'number' && typeof id !== 'string') {
    throw new LunchFlowError('Account without an id in response', { code: 'bad_response' });
  }
  return {
    id,
    name: str(raw.name) || `Account ${id}`,
    institutionName: str(raw.institution_name) || 'Unknown institution',
    institutionLogo: str(raw.institution_logo) || null,
    provider: str(raw.provider) || null,
    currency: str(raw.currency).toUpperCase() || null,
    status: str(raw.status).toUpperCase() || 'UNKNOWN',
  };
}

/**
 * Normalize a raw balance object. Lunch Flow clients in the wild describe the
 * balance either as `{ available, current, currency }` or as `{ amount, currency }`,
 * so both are accepted.
 */
export function normalizeBalance(raw, fallbackCurrency = null) {
  if (!raw || typeof raw !== 'object') {
    throw new LunchFlowError('Unexpected balance shape in response', { code: 'bad_response' });
  }
  const available = num(raw.available);
  const current = num(raw.current) ?? num(raw.amount) ?? num(raw.balance) ?? available;
  if (current === null) {
    throw new LunchFlowError('Balance response did not contain an amount', { code: 'bad_response' });
  }
  return {
    current,
    available,
    currency: str(raw.currency).toUpperCase() || fallbackCurrency,
  };
}

export function createLunchFlowClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  if (!apiKey) throw new Error('A Lunch Flow API key is required');
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation available');
  const root = String(baseUrl).replace(/\/+$/, '');

  async function request(path) {
    const url = `${root}/${path.replace(/^\/+/, '')}`;
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        headers: { 'x-api-key': apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const reason = cause && cause.name === 'TimeoutError' ? 'timed out' : (cause && cause.message) || 'network error';
      throw new LunchFlowError(`Could not reach Lunch Flow (${reason})`, { code: 'network', cause });
    }

    const text = await res.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (!res.ok) {
      const detail =
        body && typeof body === 'object'
          ? [body.error, body.message].filter((part) => typeof part === 'string' && part).join(': ')
          : text.slice(0, 200);
      throw new LunchFlowError(detail || `Lunch Flow responded with HTTP ${res.status}`, {
        status: res.status,
        code: body && typeof body.error === 'string' ? body.error : null,
      });
    }
    if (!body || typeof body !== 'object') {
      throw new LunchFlowError('Lunch Flow returned a non-JSON response', { status: res.status, code: 'bad_response' });
    }
    return body;
  }

  return {
    async listAccounts() {
      const body = await request('accounts');
      if (!Array.isArray(body.accounts)) {
        throw new LunchFlowError('Unexpected accounts response shape', { code: 'bad_response' });
      }
      return body.accounts.map(normalizeAccount);
    },

    async getBalance(accountId) {
      const body = await request(`accounts/${encodeURIComponent(String(accountId))}/balance`);
      return normalizeBalance(body.balance ?? body);
    },
  };
}
