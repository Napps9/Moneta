/**
 * Builds a "snapshot" of every account with its balance, fanning out the
 * per-account balance calls with bounded concurrency and caching the result
 * so the page can be reloaded freely without hammering the Lunch Flow API.
 */

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

export function createBalanceService({
  client,
  ttlMs = 5 * 60 * 1000,
  concurrency = 4,
  now = () => Date.now(),
  logger = console,
} = {}) {
  if (!client) throw new Error('A Lunch Flow client is required');

  let cache = null; // { data, expiresAt }
  let inflight = null;

  async function buildSnapshot() {
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
    const sorted = sortAccounts(withBalances);
    return {
      fetchedAt: new Date(now()).toISOString(),
      accounts: sorted,
      totals: computeTotals(sorted),
      partial: sorted.some((account) => account.error !== null),
    };
  }

  function decorate(data, extra) {
    return { ...data, ttlSeconds: Math.round(ttlMs / 1000), ...extra };
  }

  async function getSnapshot({ refresh = false } = {}) {
    if (!refresh && cache && cache.expiresAt > now()) {
      return decorate(cache.data, { cached: true, stale: false, error: null });
    }

    if (!inflight) {
      inflight = buildSnapshot()
        .then((data) => {
          cache = { data, expiresAt: now() + ttlMs };
          return data;
        })
        .finally(() => {
          inflight = null;
        });
    }

    try {
      const data = await inflight;
      return decorate(data, { cached: false, stale: false, error: null });
    } catch (err) {
      if (cache) {
        // Serve what we have rather than nothing, and say so.
        const message = err && err.message ? err.message : String(err);
        return decorate(cache.data, { cached: true, stale: true, error: message });
      }
      throw err;
    }
  }

  return {
    getSnapshot,
    invalidate() {
      cache = null;
    },
  };
}
