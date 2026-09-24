/**
 * Builds a "snapshot" of every account with its balance.
 *
 * The expensive part (listing accounts and fetching each balance from Lunch
 * Flow) is cached. Grouping, balance treatment and totals are applied on top
 * of the cached data for every request, so changing settings never refetches.
 */
import { classifyAccount, normalizeGroupsConfig } from './groups.js';
import { dedupePending } from './pending.js';
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
  // A balance the viewer set themselves stands in for Lunch Flow's, plus what has happened since
  // (account.sinceAnchor, worked out by the service from the transactions after that day).
  const anchored = setting.anchor && account.sinceAnchor && account.sinceAnchor.date === setting.anchor.date ? account.sinceAnchor : null;
  if (!account.balance && !anchored) return account;
  const reported = account.balance ? account.balance.current : null;
  const currency = (account.balance && account.balance.currency) || account.currency || null;
  const { asOf = null, details = null } = account.balance || {};
  // Pending payments. By default Lunch Flow sends the balance with them already taken off
  // ('include'). Most bank apps show it before them: either the viewer asks for that here
  // ('exclude', the pending ones go back on), or Lunch Flow itself is set to send the booked
  // balance ('booked', nothing to add). Either way the balance then moves only as payments post.
  const recent = account.recent || null;
  const pendingMode = setting.pending === 'exclude' || setting.pending === 'booked' ? setting.pending : 'include';
  const beforePending = pendingMode !== 'include';
  const pendingBack = pendingMode === 'exclude' && recent && !anchored ? -recent.pendingNet : 0;
  const round2 = (n) => Math.round(n * 100) / 100;
  const current = round2(anchored ? setting.anchor.amount + anchored.net : reported + pendingBack);
  const available = anchored || pendingBack ? null : account.balance.available;
  // The other way of looking at it: before the pending payments, or once they have cleared.
  const alt =
    recent && recent.pendingCount && !anchored
      ? pendingMode === 'include'
        ? { amount: round2(reported - recent.pendingNet), cleared: false }
        : { amount: round2(pendingMode === 'exclude' ? reported : reported + recent.pendingNet), cleared: true }
      : null;
  const mode = setting.balance ?? 'reported';
  const limited = mode === 'credit-limit' && Number.isFinite(setting.limit);
  const treat = (value) => (mode === 'negate' ? -value : limited ? -(setting.limit - value) : value);
  const extra = {
    ...(asOf ? { asOf } : {}),
    ...(details ? { details } : {}),
    ...(recent ? { pending: { net: recent.pendingNet, count: recent.pendingCount }, latest: recent.latest } : {}),
    ...(beforePending ? { basis: 'before-pending' } : {}),
    ...(alt ? { alt: { amount: treat(alt.amount), cleared: alt.cleared } } : {}),
    ...(anchored ? { anchor: { amount: setting.anchor.amount, date: setting.anchor.date, since: anchored.net, count: anchored.count, error: anchored.error || null } } : {}),
  };

  if (mode === 'negate') {
    return { ...account, balance: { current: treat(current), available, currency, treatment: mode, reported, ...extra } };
  }
  if (limited) {
    return {
      ...account,
      balance: { current: treat(current), available: current, currency, treatment: mode, limit: setting.limit, reported, ...extra },
    };
  }
  return { ...account, balance: { current, available, currency, treatment: 'reported', reported, ...extra } };
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
      settings: { group: setting.group ?? null, balance: setting.balance ?? 'reported', limit: setting.limit ?? null, pinned: setting.pinned ?? null, anchor: setting.anchor ?? null, pending: setting.pending ?? 'include' },
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

// How far back to look for pending transactions and the newest one Lunch Flow has.
const RECENT_DAYS = 31;

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
        // When Lunch Flow says when it last synced the balance or the account, keep that with the balance.
        const asOf = balance.asOf || account.syncedAt || null;
        return {
          ...account,
          balance: { ...balance, currency: balance.currency ?? account.currency, ...(asOf ? { asOf } : {}) },
          error: null,
        };
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        logger.warn?.(`Balance unavailable for account ${account.id} (${account.name}): ${message}`);
        return { ...account, balance: null, error: message };
      }
    });
    // The last month's transactions per account: the pending ones, which most bank apps leave
    // out of the balance they show while Lunch Flow takes them off, and the newest date, which
    // says how fresh Lunch Flow's data is.
    // Up to tomorrow, so today's transactions come back whatever the API makes of a bare date.
    const to = new Date(now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const from = new Date(now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const withRecent = await mapWithConcurrency(withBalances, concurrency, async (account) => {
      if (typeof client.listTransactions !== 'function') return account;
      try {
        const transactions = dedupePending(await client.listTransactions(account.id, { from, to, includePending: true }));
        let pendingNet = 0;
        let pendingCount = 0;
        let latest = null;
        for (const txn of transactions) {
          const amount = Number(txn.amount);
          if (txn.pending && Number.isFinite(amount)) {
            pendingNet += amount;
            pendingCount += 1;
          }
          if (typeof txn.date === 'string' && (!latest || txn.date > latest)) latest = txn.date;
        }
        return { ...account, recent: { pendingNet: Math.round(pendingNet * 100) / 100, pendingCount, latest } };
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        logger.warn?.(`Recent transactions unavailable for account ${account.id} (${account.name}): ${message}`);
        return { ...account, recent: null };
      }
    });
    return { fetchedAt: new Date(now()).toISOString(), accounts: withRecent };
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
    budgets: resolved.settings.budgets,
    forecast: resolved.settings.forecast,
  });

  // What has happened since a balance the viewer set: the net of the transactions dated after that
  // day, cached per account and day for as long as balances are.
  const sinceCache = new Map();
  const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
  const dayAfter = (date) => isoDate(Date.parse(`${date}T12:00:00Z`) + 24 * 60 * 60 * 1000);
  async function sinceAnchor(account, anchor, refresh, excludePending = false) {
    const key = `${account.id}|${anchor.date}|${excludePending ? 'booked' : 'all'}`;
    const hit = sinceCache.get(key);
    if (!refresh && hit && hit.expiresAt > now()) return hit.value;
    const from = dayAfter(anchor.date);
    const to = isoDate(now() + 24 * 60 * 60 * 1000); // up to tomorrow, so today's transactions come back
    let value;
    if (from > to || typeof client.listTransactions !== 'function') value = { date: anchor.date, net: 0, count: 0 };
    else {
      try {
        const transactions = dedupePending(await client.listTransactions(account.id, { from, to, includePending: true }));
        const amounts = transactions
          .filter((t) => !(excludePending && t.pending))
          .map((t) => Number(t.amount))
          .filter((n) => Number.isFinite(n));
        value = { date: anchor.date, net: Math.round(amounts.reduce((sum, n) => sum + n, 0) * 100) / 100, count: amounts.length };
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        logger.warn?.(`Could not fetch transactions since ${anchor.date} for account ${account.id}: ${message}`);
        value = { date: anchor.date, net: 0, count: 0, error: message };
      }
    }
    sinceCache.set(key, { value, expiresAt: now() + ttlMs });
    return value;
  }

  async function getSnapshot({ refresh = false, settings: sent = null } = {}) {
    const [{ raw, cached, stale, error }, resolved] = await Promise.all([getRaw({ refresh }), resolveSettings(sent)]);
    const anchored = await Promise.all(
      raw.accounts.map(async (account) => {
        const setting = resolved.settings.accounts[String(account.id)];
        return setting && setting.anchor ? { ...account, sinceAnchor: await sinceAnchor(account, setting.anchor, refresh, setting.pending === 'exclude') } : account;
      }),
    );
    return {
      ...assembleSnapshot({ ...raw, accounts: anchored }, groupsConfig, resolved.settings),
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
      budgets: settings.budgets,
      forecast: settings.forecast,
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
