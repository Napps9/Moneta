/**
 * Settings made in the app:
 *   accounts:     per account, which group it belongs to, how to read its balance, whether it is pinned
 *   rules:        merchant -> category ("always file Tesco under Groceries")
 *   transactions: one transaction -> category ("just this one")
 *   splits:       one transaction -> parts [{ category, amount }] when it is shared between categories
 *   categories:   categories and sub-categories added in the app, on top of categories.config.js
 *   budgets:      per account, forecast amounts the viewer set per row, instead of the automatic ones
 *   forecast:     per account, 'budget' when only those set amounts should count (no automatic guesses)
 *
 * Storage, in order of preference:
 *   - Redis over REST (Upstash): KV_REST_API_URL + KV_REST_API_TOKEN, or
 *     UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN. Shared across devices.
 *   - A JSON file in the data directory (self-hosted). Shared across devices.
 *   - Memory only (Vercel without Redis). The page then keeps settings in the
 *     browser and sends them with each request.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isAssignable, mergeCustomCategories, normalizeCustomCategories } from './categories.js';

export const TREATMENTS = ['reported', 'negate', 'credit-limit'];
const MAX_ACCOUNTS = 500;
const MAX_RULES = 2000;
const MAX_TRANSACTIONS = 5000;
const MAX_SPLITS = 2000;
const MAX_PARTS = 20;
const MAX_BUDGET_ROWS = 300;
const MAX_BUDGET_MONTHS = 36;
const BUDGET_KEY_RE = /^(in|out|tr):[a-z0-9_-]{1,64}$/;
const BUDGET_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const MAX_SETTINGS_BYTES = 1024 * 1024;

export const emptySettings = () => ({ version: 1, accounts: {}, rules: {}, transactions: {}, splits: {}, categories: [], budgets: {}, forecast: {} });

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const money = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
};

/**
 * One forecast amount as the viewer set it: a flat amount for every month, or
 * { each, months: { 'YYYY-MM': amount } } when some months have an amount of their own.
 * Returns the clean value, or null when nothing usable is in it.
 */
export function normalizeBudget(value) {
  if (!isPlainObject(value)) return money(value);
  const each = value.each == null || value.each === '' ? null : money(value.each);
  const months = {};
  let n = 0;
  for (const [monthKey, amount] of Object.entries(isPlainObject(value.months) ? value.months : {})) {
    if (n >= MAX_BUDGET_MONTHS) break;
    const clean = money(amount);
    if (!BUDGET_MONTH_RE.test(monthKey) || clean == null) continue;
    months[monthKey] = clean;
    n += 1;
  }
  if (n === 0) return each;
  return each == null ? { months } : { each, months };
}

/** Validate raw settings against the groups and categories config. Anything unusable is dropped. */
export function normalizeSettings(raw, groupsConfig, categoriesConfig = null) {
  const out = emptySettings();
  const source = isPlainObject(raw) ? raw : {};
  const groupIds = new Set(groupsConfig && Array.isArray(groupsConfig.groups) ? groupsConfig.groups.map((g) => g.id) : []);

  let count = 0;
  for (const [key, value] of Object.entries(isPlainObject(source.accounts) ? source.accounts : {})) {
    if (count >= MAX_ACCOUNTS) break;
    const id = String(key).trim();
    if (!id || !isPlainObject(value)) continue;

    const entry = {};
    const group = typeof value.group === 'string' ? value.group.trim().toLowerCase() : '';
    if (group && groupIds.has(group)) entry.group = group;

    const balance = typeof value.balance === 'string' ? value.balance.trim() : 'reported';
    if (balance === 'negate') entry.balance = 'negate';
    if (balance === 'credit-limit') {
      const limit = Number(value.limit);
      if (Number.isFinite(limit) && limit >= 0) {
        entry.balance = 'credit-limit';
        entry.limit = limit;
      }
    }

    if (value.pinned === true) entry.pinned = 1;
    else if (typeof value.pinned === 'number' && Number.isFinite(value.pinned) && value.pinned > 0) entry.pinned = Math.floor(value.pinned);

    // The balance as the viewer's bank showed it on a day, for when Lunch Flow's is behind.
    if (isPlainObject(value.anchor)) {
      const amount = Number(value.anchor.amount);
      const date = typeof value.anchor.date === 'string' ? value.anchor.date.trim().slice(0, 10) : '';
      if (Number.isFinite(amount) && DATE_RE.test(date)) entry.anchor = { amount: Math.round(amount * 100) / 100, date };
    }

    if (Object.keys(entry).length > 0) {
      out.accounts[id] = entry;
      count += 1;
    }
  }

  // Rules and choices may point at categories added in the app, so validate against the merged tree.
  out.categories = normalizeCustomCategories(source.categories);
  const effectiveConfig = categoriesConfig ? mergeCustomCategories(categoriesConfig, out.categories) : null;
  const validCategory = (value) => {
    if (typeof value !== 'string') return null;
    const id = value.trim().toLowerCase();
    if (!id || id.length > 64) return null;
    if (effectiveConfig && !isAssignable(effectiveConfig, id)) return null;
    return id;
  };
  const takeMap = (map, max, keyMax) => {
    const result = {};
    let n = 0;
    for (const [key, value] of Object.entries(isPlainObject(map) ? map : {})) {
      if (n >= max) break;
      const cleanKey = String(key).trim();
      const category = validCategory(value);
      if (!cleanKey || cleanKey.length > keyMax || !category) continue;
      result[cleanKey] = category;
      n += 1;
    }
    return result;
  };
  out.rules = takeMap(source.rules, MAX_RULES, 200);
  out.transactions = takeMap(source.transactions, MAX_TRANSACTIONS, 300);

  // A split is a list of parts; a part with no category is "uncategorised". Parts with an unknown
  // category or no positive amount are dropped, and a split left with no parts is dropped too.
  let splitCount = 0;
  for (const [key, value] of Object.entries(isPlainObject(source.splits) ? source.splits : {})) {
    if (splitCount >= MAX_SPLITS) break;
    const cleanKey = String(key).trim();
    if (!cleanKey || cleanKey.length > 300 || !Array.isArray(value)) continue;
    const parts = [];
    for (const part of value.slice(0, MAX_PARTS)) {
      if (!isPlainObject(part)) continue;
      const amount = Number(part.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const wantsCategory = part.category != null && part.category !== '';
      const category = wantsCategory ? validCategory(part.category) : null;
      if (wantsCategory && !category) continue;
      parts.push({ category, amount: Math.round(amount * 10000) / 10000 });
    }
    if (parts.length === 0) continue;
    out.splits[cleanKey] = parts;
    splitCount += 1;
  }

  // Forecast amounts the viewer set, per account and row ('out:rent', 'in:salary', 'tr:out', ...): a flat
  // amount for every month, or { each, months: { 'YYYY-MM': amount } } when some months differ.
  let budgetAccounts = 0;
  for (const [account, rows] of Object.entries(isPlainObject(source.budgets) ? source.budgets : {})) {
    if (budgetAccounts >= MAX_ACCOUNTS) break;
    const id = String(account).trim();
    if (!id || !isPlainObject(rows)) continue;
    const clean = {};
    let n = 0;
    for (const [key, value] of Object.entries(rows)) {
      if (n >= MAX_BUDGET_ROWS) break;
      if (!BUDGET_KEY_RE.test(key)) continue;
      const budget = normalizeBudget(value);
      if (budget == null) continue;
      clean[key] = budget;
      n += 1;
    }
    if (n === 0) continue;
    out.budgets[id] = clean;
    budgetAccounts += 1;
  }

  // Per account, 'budget' when only the amounts the viewer set should count in the forecasts.
  for (const [account, mode] of Object.entries(isPlainObject(source.forecast) ? source.forecast : {})) {
    const id = String(account).trim();
    if (id && mode === 'budget' && Object.keys(out.forecast).length < MAX_ACCOUNTS) out.forecast[id] = 'budget';
  }

  return out;
}

export function parseSettingsJson(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  if (Buffer.byteLength(text) > MAX_SETTINGS_BYTES) throw new Error('Settings are too large');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Settings are not valid JSON');
  }
}

export function createMemoryStore() {
  let data = emptySettings();
  return {
    kind: 'memory',
    persistent: false,
    async read() {
      return data;
    },
    async write(settings) {
      data = settings;
    },
  };
}

export function createFileStore(file) {
  return {
    kind: 'file',
    persistent: true,
    async read() {
      try {
        return JSON.parse(await readFile(file, 'utf8'));
      } catch (err) {
        if (err && err.code === 'ENOENT') return emptySettings();
        throw err;
      }
    },
    async write(settings) {
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(settings, null, 2));
      await rename(tmp, file);
    },
  };
}

export function createRedisStore({ url, token, key = 'moneta:settings', fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  const endpoint = String(url).replace(/\/+$/, '');

  async function command(...args) {
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw new Error(`Settings storage is unreachable (${cause && cause.message ? cause.message : cause})`);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) {
      throw new Error(`Settings storage error: ${(body && body.error) || `HTTP ${res.status}`}`);
    }
    return body.result;
  }

  return {
    kind: 'redis',
    persistent: true,
    async read() {
      const value = await command('GET', key);
      if (!value) return emptySettings();
      try {
        return JSON.parse(value);
      } catch {
        return emptySettings();
      }
    },
    async write(settings) {
      await command('SET', key, JSON.stringify(settings));
    },
  };
}

export function createSettingsStore(env = process.env, { dataDir = null, fetchImpl } = {}) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return createRedisStore({ url, token, fetchImpl });
  if (dataDir) return createFileStore(path.join(dataDir, 'settings.json'));
  return createMemoryStore();
}
