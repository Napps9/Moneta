/**
 * Per-account activity for a period: money in, money out, net, and the
 * opening and closing balance, plus the transactions themselves.
 *
 * Transactions are fetched from the period start up to today (not just to the
 * period end) so that the closing balance of a past period can be derived from
 * the current balance: closing = current - (everything after the period).
 */

import { describeCategories, mergeCustomCategories, normalizeCategoriesConfig } from './categories.js';
import { MONTH_RE, buildSheet, monthKey, monthWindow } from './sheet.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_RANGE_DAYS = 400;
export const MAX_SHEET_MONTHS = 12;

export class ActivityError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ActivityError';
    this.status = status;
  }
}

export const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const round = (value) => Math.round(value * 10000) / 10000;
const addDays = (iso, days) => isoDate(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000);

function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && isoDate(ms) === value;
}

export function validateRange(from, to, today) {
  if (!validDate(from) || !validDate(to)) throw new ActivityError('from and to must be dates in YYYY-MM-DD form');
  if (from > to) throw new ActivityError('from must not be after to');
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days > MAX_RANGE_DAYS) throw new ActivityError(`The period must be ${MAX_RANGE_DAYS} days or shorter`);
  // A period may end after today (the current calendar month does); anything beyond a year out is a mistake.
  if (to > addDays(today, 366)) throw new ActivityError('to is too far in the future');
}

/** Default period when the page sends none: the current calendar month (UTC). */
export function defaultRange(today) {
  const [year, month] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${today.slice(0, 8)}01`, to: `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}` };
}

export function summarize(transactions, { from, to, currentBalance = null }) {
  const inPeriod = [];
  let afterNet = 0;
  for (const t of transactions) {
    if (t.date < from) continue;
    if (t.date > to) {
      afterNet += t.amount;
      continue;
    }
    inPeriod.push(t);
  }

  let income = 0;
  let outgoings = 0;
  let pendingCount = 0;
  for (const t of inPeriod) {
    if (t.amount >= 0) income += t.amount;
    else outgoings -= t.amount;
    if (t.pending) pendingCount += 1;
  }
  const net = income - outgoings;
  const closingBalance = currentBalance == null ? null : round(currentBalance - afterNet);
  const openingBalance = closingBalance == null ? null : round(closingBalance - net);

  inPeriod.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || String(b.id).localeCompare(String(a.id)));

  return {
    income: round(income),
    outgoings: round(outgoings),
    net: round(net),
    transactionCount: inPeriod.length,
    pendingCount,
    openingBalance,
    closingBalance,
    transactions: inPeriod,
  };
}

export function createActivityService({
  client,
  balances,
  categories = normalizeCategoriesConfig({}),
  ttlMs = 5 * 60 * 1000,
  now = () => Date.now(),
  logger = console,
  maxEntries = 200,
} = {}) {
  if (!client) throw new Error('A Lunch Flow client is required');
  if (!balances) throw new Error('The balance service is required');
  const publicCategories = describeCategories(categories);

  const cache = new Map(); // key -> { transactions, fetchedAt, expiresAt }

  async function fetchTransactions(accountId, from, to, refresh) {
    const key = `${accountId}|${from}|${to}`;
    const hit = cache.get(key);
    if (!refresh && hit && hit.expiresAt > now()) {
      return { transactions: hit.transactions, fetchedAt: hit.fetchedAt, cached: true };
    }
    const transactions = await client.listTransactions(accountId, { from, to, includePending: true });
    const fetchedAt = new Date(now()).toISOString();
    cache.delete(key);
    cache.set(key, { transactions, fetchedAt, expiresAt: now() + ttlMs });
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    return { transactions, fetchedAt, cached: false };
  }

  async function getActivity({ accountId, from = null, to = null, refresh = false, settings = null } = {}) {
    const today = isoDate(now());
    if (!from && !to) ({ from, to } = defaultRange(today));
    validateRange(from, to, today);

    const snapshot = await balances.getSnapshot({ settings });
    const account = snapshot.accounts.find((a) => String(a.id) === String(accountId));
    if (!account) throw new ActivityError('Account not found', 404);

    const fetchTo = to > today ? to : today;
    const { transactions, fetchedAt, cached } = await fetchTransactions(account.id, from, fetchTo, refresh);
    const currentBalance = account.balance ? account.balance.current : null;
    const summary = summarize(transactions, { from, to, currentBalance });
    const currency =
      (account.balance && account.balance.currency) || account.currency || (summary.transactions[0] && summary.transactions[0].currency) || null;

    return {
      account: {
        id: account.id,
        name: account.name,
        institutionName: account.institutionName,
        institutionLogo: account.institutionLogo,
        group: account.group,
        status: account.status,
        currency: account.currency,
        balance: account.balance,
        error: account.error,
      },
      period: { from, to },
      currency,
      ...summary,
      closingIsCurrent: to >= today,
      fetchedAt,
      cached,
      ttlSeconds: Math.round(ttlMs / 1000),
    };
  }

  const pickAccount = (account) => ({
    id: account.id,
    name: account.name,
    institutionName: account.institutionName,
    institutionLogo: account.institutionLogo,
    group: account.group,
    status: account.status,
    currency: account.currency,
    balance: account.balance,
    error: account.error,
  });

  /** The Accounts sheet: categories by month for one account, ending at month `to` (YYYY-MM). */
  async function getSheet({ accountId, to = null, months = 6, ahead = 3, refresh = false, settings: sent = null } = {}) {
    const today = isoDate(now());
    const currentMonth = monthKey(today);
    if (to != null && to !== '' && !MONTH_RE.test(String(to))) throw new ActivityError('to must be a month in YYYY-MM form');
    const endKey = to && to < currentMonth ? to : currentMonth;
    const count = Math.min(Math.max(1, Number.parseInt(months, 10) || 6), MAX_SHEET_MONTHS);
    const window = monthWindow(endKey, count);

    const snapshot = await balances.getSnapshot({ settings: sent });
    const account = snapshot.accounts.find((a) => String(a.id) === String(accountId));
    if (!account) throw new ActivityError('Account not found', 404);
    const resolved = typeof balances.getResolvedSettings === 'function' ? await balances.getResolvedSettings(sent) : null;
    // Categories added in the app sit on top of the file's tree.
    const tree = mergeCustomCategories(categories, resolved ? resolved.categories : []);

    const from = window[0].from;
    const lastTo = window[window.length - 1].to;
    const fetchTo = lastTo > today ? lastTo : today;
    const { transactions, fetchedAt, cached } = await fetchTransactions(account.id, from, fetchTo, refresh);

    const sheet = buildSheet({
      accountId: account.id,
      transactions,
      months: window,
      categories: tree,
      settings: resolved,
      budgets: resolved && resolved.budgets ? resolved.budgets[String(account.id)] || {} : {},
      forecastMode: resolved && resolved.forecast && resolved.forecast[String(account.id)] === 'budget' ? 'budget' : 'auto',
      ahead: Number.parseInt(ahead, 10) || 3,
      currentBalance: account.balance ? account.balance.current : null,
      today,
      otherAccountNames: snapshot.accounts.filter((a) => String(a.id) !== String(account.id)).map((a) => a.name),
    });
    const currency =
      (account.balance && account.balance.currency) || account.currency || (sheet.transactions[0] && sheet.transactions[0].currency) || null;

    return {
      account: pickAccount(account),
      currency,
      ...sheet,
      categories: tree === categories ? publicCategories : describeCategories(tree),
      settings: snapshot.settings,
      fetchedAt,
      cached,
      ttlSeconds: Math.round(ttlMs / 1000),
    };
  }

  return {
    getActivity,
    getSheet,
    invalidate() {
      cache.clear();
    },
  };
}
