/**
 * Minimal client for the Lunch Flow personal API.
 *
 *   GET /accounts                      -> { accounts: [...] }
 *   GET /accounts/:id/balance          -> { balance: { ... } }
 *   GET /accounts/:id/transactions     -> { transactions: [...] }  (?from=&to=&include_pending=true)
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

// Field names under which a payload may say when it was last synced with the bank.
const STAMP_KEYS = [
  'as_of', 'asOf', 'last_synced', 'lastSynced', 'last_synced_at', 'lastSyncedAt', 'synced_at', 'syncedAt', 'last_sync', 'lastSync',
  'last_updated', 'lastUpdated', 'last_updated_at', 'lastUpdatedAt', 'updated_at', 'updatedAt',
  'last_refreshed', 'lastRefreshed', 'last_refreshed_at', 'lastRefreshedAt', 'balance_updated_at', 'balanceUpdatedAt', 'timestamp',
];

/** When a payload says it was last synced, as an ISO string, whichever of the usual field names it uses; else null. */
export function syncStamp(raw) {
  if (!raw || typeof raw !== 'object') return null;
  for (const key of STAMP_KEYS) {
    const value = raw[key];
    if (value == null || value === '') continue;
    const ms = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(String(value));
    if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
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
  const syncedAt = syncStamp(raw);
  return {
    id,
    name: str(raw.name) || `Account ${id}`,
    institutionName: str(raw.institution_name) || 'Unknown institution',
    institutionLogo: str(raw.institution_logo) || null,
    provider: str(raw.provider) || null,
    currency: str(raw.currency).toUpperCase() || null,
    status: str(raw.status).toUpperCase() || 'UNKNOWN',
    ...(syncedAt ? { syncedAt } : {}),
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
  const asOf = syncStamp(raw);
  return {
    current,
    available,
    currency: str(raw.currency).toUpperCase() || fallbackCurrency,
    ...(asOf ? { asOf } : {}),
  };
}

/**
 * Normalize a raw transaction. Field names differ between Lunch Flow clients
 * (`accountId`/`account_id`, `merchant`/`merchant_name`, `isPending`/`pending`),
 * so all of them are accepted. Positive amounts are money in, negative money out.
 */
const MAPPED_FIELDS = new Set(['id', 'date', 'amount', 'currency', 'description', 'merchant', 'merchant_name', 'merchantName', 'category', 'pending', 'isPending', 'is_pending', 'accountId', 'account_id']);
const MAX_DETAILS = 30;

/**
 * Everything else Lunch Flow sent about a transaction, kept as strings so the page can show it
 * when the merchant text alone does not say what something was. One level of nesting is
 * flattened ("merchant.logo"), and a time of day is kept as `time` when the date carries one.
 */
function extractDetails(raw) {
  const details = {};
  let count = 0;
  const add = (key, value) => {
    if (count >= MAX_DETAILS || value == null || value === '') return;
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        if (value.length && value.every((v) => v == null || typeof v !== 'object')) add(key, value.filter((v) => v != null).join(', '));
        return;
      }
      for (const [k, v] of Object.entries(value)) if (v == null || typeof v !== 'object' || Array.isArray(v)) add(`${key}.${k}`, v);
      return;
    }
    details[key] = String(value).slice(0, 200);
    count += 1;
  };
  for (const [key, value] of Object.entries(raw)) if (!MAPPED_FIELDS.has(key)) add(key, value);
  const stamp = str(raw.date);
  if (stamp.length > 10) details.time = stamp;
  return details;
}

export function normalizeTransaction(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const amount = num(raw.amount);
  const date = str(raw.date).slice(0, 10);
  if (amount === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const merchant = str(raw.merchant) || str(raw.merchant_name) || str(raw.merchantName) || null;
  const description = str(raw.description) || merchant || '';
  const pending = raw.pending ?? raw.isPending ?? raw.is_pending ?? false;
  return {
    id: raw.id == null ? null : String(raw.id),
    date,
    amount,
    currency: str(raw.currency).toUpperCase() || null,
    description,
    merchant,
    category: str(raw.category) || null,
    pending: pending === true || pending === 'true',
    details: extractDetails(raw),
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

    async listTransactions(accountId, { from = null, to = null, includePending = true } = {}) {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (includePending) params.set('include_pending', 'true');
      const query = params.toString();
      const body = await request(`accounts/${encodeURIComponent(String(accountId))}/transactions${query ? `?${query}` : ''}`);
      const list = Array.isArray(body.transactions) ? body.transactions : Array.isArray(body) ? body : null;
      if (!list) throw new LunchFlowError('Unexpected transactions response shape', { code: 'bad_response' });
      return list.map(normalizeTransaction).filter(Boolean);
    },
  };
}
