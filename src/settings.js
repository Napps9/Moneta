/**
 * Settings made in the app:
 *   accounts:     per account, which group it belongs to, how to read its balance, whether it is pinned
 *   rules:        merchant -> category ("always file Tesco under Groceries")
 *   transactions: one transaction -> category ("just this one")
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
import { isAssignable } from './categories.js';

export const TREATMENTS = ['reported', 'negate', 'credit-limit'];
const MAX_ACCOUNTS = 500;
const MAX_RULES = 2000;
const MAX_TRANSACTIONS = 5000;
export const MAX_SETTINGS_BYTES = 1024 * 1024;

export const emptySettings = () => ({ version: 1, accounts: {}, rules: {}, transactions: {} });

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

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

    if (Object.keys(entry).length > 0) {
      out.accounts[id] = entry;
      count += 1;
    }
  }

  const validCategory = (value) => {
    if (typeof value !== 'string') return null;
    const id = value.trim().toLowerCase();
    if (!id || id.length > 64) return null;
    if (categoriesConfig && !isAssignable(categoriesConfig, id)) return null;
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
