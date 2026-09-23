/**
 * Builds a "snapshot" of every account with its balance.
 *
 * The expensive part (listing accounts and fetching each balance from Lunch
 * Flow) is cached. Grouping, balance treatment and totals are applied on top
 * of the cached data for every request, so changing settings never refetches.
 */
import { classifyAccount, normalizeGroupsConfig } from './groups.js';
import { createMemoryStore, emptySettings, normalizeSettings } from './settings.js';

export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function sortAccounts(accounts) {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return [...accounts].sort(
    (a, b) => collator.compare(a.institutionName, b.institutionName) || collator.compare(a.name, b.name),
  );
}

/** Sum balances per currency. Accounts without a balance are left out but counted as excluded. */
export function computeTotals(accounts) {
  const byCurrency = new Map();
  const entry = (currency) => {
    let total = byCurrency.get(currency);
    if (!total) {
      total = { currency, current: 0, available: 0, availableComplete: true, accountCount: 0, excludedCount: 0 };
      byCurrency.set(currency, total);
    }
    return total;
  };

  for (const account of accounts) {
    if (!account.balance) continue;
    const total = entry(account.balance.currency || null);
    total.current += account.balance.current;
    total.accountCount += 1;
    if (account.balance.available == null) total.availableComplete = false;
    else total.available += account.balance.available;
  }
  for (const account of accounts) {
    if (account.balance || !account.currency) continue;
    const total = byCurrency.get(account.currency);
    if (total) total.excludedCount += 1;
  }

  return [...byCurrency.values()]
    .map((t) => ({
      currency: t.currency,
      current: t.current,
      available: t.availableComplete && t.accountCount > 0 ? t.available : null,
      accountCount: t.accountCount,
      excludedCount: t.excludedCount,
    }))
    .sort((a, b) => Math.abs(b.current) - Math.abs(a.current) || String(a.currency).localeCompare(String(b.currency)));
}

/**
 * Read the reported balance the way the account's setting says:
 *   reported      use the number as Lunch Flow gives it (default)
 *   negate        the number is an amount owed; show it as negative
 *   credit-limit  the number is what is left to spend on a card; owed = limit - reported
 */
export function applyTreatment(account, setting = {}) {
  if (!account.balance) return account;
  const { current, available, currency } = account.balance;
  const mode = setting.balance ?? 'reported';

  if (mode === 'negate') {
    return { ...account, balance: { current: -current, available, currency, treatment: mode, reported: current } };
  }
  if (mode === 'credit-limit' && Number.isFinite(setting.limit)) {
    return {
      ...account,
      balance: { current: -(setting.limit - current), available: current, currency, treatment: mode, limit: setting.limit, reported: current },
    };
  }
  return { ...account, balance: { current, available, currency, treatment: 'reported', reported: current } };
}

/** Apply grouping, treatments and totals to raw fetched accounts. */
export function assembleSnapshot(raw, groupsConfig, settings = emptySettings()) {
  const groupIds = new Set(groupsConfig.groups.map((group) => group.id));
  const accounts = sortAccounts(raw.accounts).map((account) => {
    const setting = settings.accounts[String(account.id)] || {};
    const autoGroup = classifyAccount(account, groupsConfig);
    const group = setting.group && groupIds.has(setting.group) ? setting.group : autoGroup;
    return {
      ...applyTreatment(account, setting),
      group,
      autoGroup,
      pinned: setting.pinned ?? null,
      settings: { group: setting.group ?? null, balance: setting.balance ?? 'reported', limit: setting.limit ?? null, pinned: setting.pinned ?? null },
    };
  });
  const groups = groupsConfig.groups.map((group) => {
    const members = accounts.filter((account) => account.group === group.id);
    return { id: group.id, label: group.label, accountCount: members.length, totals: computeTotals(members) };
  });
  return {
    fetchedAt: raw.fetchedAt,
    accounts,
    totals: computeTotals(accounts),
    groups,
    partial: accounts.some((account) => account.error !== null),
  };
}

export function createBalanceService({
  client,
  groupsConfig = normalizeGroupsConfig({}),
  categoriesConfig = null,
  settingsStore = createMemoryStore(),
  ttlMs = 5 * 60 * 1000,
  concurrency = 4,
  now = () => Date.now(),
  logger = console,
} = {}) {
  if (!client) throw new Error('A Lunch Flow client is required');
  const normalize = (raw) => normalizeSettings(raw, groupsConfig, categoriesConfig);

  let cache = null; // { raw, expiresAt }
  let inflight = null;

  async function fetchRaw() {
    const accounts = await client.listAccounts();
    const withBalances = await mapWithConcurrency(accounts, concurrency, async (account) => {
      try {
        const balance = await client.getBalance(account.id);
        return {
          ...account,
          balance: { ...balance, currency: balance.currency ?? account.currency },
          error: null,
        };
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        logger.warn?.(`Balance unavailable for account ${account.id} (${account.name}): ${message}`);
        return { ...account, balance: null, error: message };
      }
    });
    return { fetchedAt: new Date(now()).toISOString(), accounts: withBalances };
  }

  /** Cached raw accounts, refreshed when expired or asked to. */
  async function getRaw({ refresh = false } = {}) {
    if (!refresh && cache && cache.expiresAt > now()) {
      return { raw: cache.raw, cached: true, stale: false, error: null };
    }
    if (!inflight) {
      inflight = fetchRaw()
        .then((raw) => {
          cache = { raw, expiresAt: now() + ttlMs };
          return raw;
        })
        .finally(() => {
          inflight = null;
        });
    }
    try {
      const raw = await inflight;
      return { raw, cached: false, stale: false, error: null };
    } catch (err) {
      if (cache) {
        // Serve what we have rather than nothing, and say so.
        const message = err && err.message ? err.message : String(err);
        return { raw: cache.raw, cached: true, stale: true, error: message };
      }
      throw err;
    }
  }

  /** Settings in effect: the store's when it persists, otherwise what the page sent. */
  async function resolveSettings(sent) {
    if (settingsStore.persistent) {
      try {
        return { settings: normalize(await settingsStore.read()), persistent: true, error: null };
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        logger.warn?.(`Could not read settings: ${message}`);
        return { settings: normalize(sent), persistent: true, error: message };
      }
    }
    return { settings: normalize(sent), persistent: false, error: null };
  }

  const describeSettings = (resolved) => ({
    persistent: resolved.persistent,
    kind: settingsStore.kind,
    error: resolved.error,
    accounts: resolved.settings.accounts,
    rules: resolved.settings.rules,
    transactions: resolved.settings.transactions,
    splits: resolved.settings.splits,
    categories: resolved.settings.categories,
  });

  async function getSnapshot({ refresh = false, settings: sent = null } = {}) {
    const [{ raw, cached, stale, error }, resolved] = await Promise.all([getRaw({ refresh }), resolveSettings(sent)]);
    return {
      ...assembleSnapshot(raw, groupsConfig, resolved.settings),
      cached,
      stale,
      error,
      ttlSeconds: Math.round(ttlMs / 1000),
      settings: describeSettings(resolved),
      groupOptions: groupsConfig.groups,
    };
  }

  async function getSettings() {
    const resolved = await resolveSettings(null);
    return { ...describeSettings(resolved), groups: groupsConfig.groups };
  }

  async function saveSettings(raw) {
    const settings = normalize(raw);
    await settingsStore.write(settings);
    return {
      persistent: settingsStore.persistent,
      kind: settingsStore.kind,
      error: null,
      accounts: settings.accounts,
      rules: settings.rules,
      transactions: settings.transactions,
      splits: settings.splits,
      categories: settings.categories,
      groups: groupsConfig.groups,
    };
  }

  /** The full normalized settings in effect for a request (used by the sheet). */
  async function getResolvedSettings(sent) {
    return (await resolveSettings(sent)).settings;
  }

  return {
    getSnapshot,
    getSettings,
    saveSettings,
    getResolvedSettings,
    invalidate() {
      cache = null;
    },
  };
}
