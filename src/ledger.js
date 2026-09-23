/**
 * Reconcile a ledger kept elsewhere (a spreadsheet with one cell per category and month, each cell
 * the sum of its transactions) with the transactions Lunch Flow has.
 *
 * Each ledger line is one transaction as the spreadsheet recorded it: month, category, amount. It
 * is matched to a Lunch Flow transaction of the same month, sign and amount that no other line has
 * claimed. The matches become per-transaction choices, and a merchant matched the same way every
 * time becomes a rule, so future months file themselves.
 */
import { isAssignable } from './categories.js';

const MAX_ENTRIES = 20000;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const BUDGET_KEY_RE = /^(in|out|tr):[a-z0-9_-]{1,64}$/;

/** Validate a ledger file: { entries: [{ month, kind, category, amount, label? }], budgets?: { 'out:rent': 800 } }. */
export function normalizeLedger(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const entries = [];
  for (const entry of Array.isArray(source.entries) ? source.entries.slice(0, MAX_ENTRIES) : []) {
    if (!entry || typeof entry !== 'object') continue;
    const month = String(entry.month || '').slice(0, 7);
    const amount = Number(entry.amount);
    if (!MONTH_RE.test(month) || !Number.isFinite(amount) || amount === 0) continue;
    const category = typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim().toLowerCase() : null;
    entries.push({
      month,
      kind: entry.kind === 'in' ? 'in' : 'out',
      category,
      amount: Math.round(amount * 100) / 100,
      label: typeof entry.label === 'string' ? entry.label.trim().slice(0, 60) : '',
    });
  }
  const budgets = {};
  const rawBudgets = source.budgets && typeof source.budgets === 'object' && !Array.isArray(source.budgets) ? source.budgets : {};
  for (const [key, value] of Object.entries(rawBudgets)) {
    const amount = Number(value);
    if (BUDGET_KEY_RE.test(key) && Number.isFinite(amount) && amount >= 0) budgets[key] = Math.round(amount * 100) / 100;
  }
  return { entries, budgets };
}

const slot = (month, kind, amount) => `${month}|${kind}|${Math.round(Math.abs(amount) * 100)}`;

// Which transaction to take when several share a month and amount: one the app already files the same
// way first (nothing changes), then one still unfiled, then any.
const preference = (txn, entry) => (txn.category === entry.category ? 2 : 0) + (txn.category == null ? 1 : 0);

/**
 * Match ledger lines to transactions. `transactions` are sheet transactions (key, month, amount,
 * category, merchantKey); `config` is the category tree, used to refuse lines that name a category
 * the app does not have or that cannot take money on that side.
 */
export function reconcileLedger({ entries, transactions, config = null }) {
  const pool = new Map();
  for (const txn of transactions) {
    const key = slot(txn.month, txn.amount >= 0 ? 'in' : 'out', txn.amount);
    if (!pool.has(key)) pool.set(key, []);
    pool.get(key).push(txn);
  }
  const months = [...new Set(transactions.map((t) => t.month))].sort();
  const covered = new Set(months);
  const used = new Set();
  const matches = [];
  const unmatched = [];
  const outside = [];
  const unassignable = [];

  for (const entry of entries) {
    if (!covered.has(entry.month)) {
      outside.push(entry);
      continue;
    }
    // A negative amount inside an outgoing line is a refund; the app files refunds as money in.
    const assignable = entry.category && entry.amount > 0 && (!config || isAssignable(config, entry.category, entry.kind));
    if (!assignable) {
      unassignable.push(entry);
      continue;
    }
    const candidates = (pool.get(slot(entry.month, entry.kind, entry.amount)) || []).filter((txn) => !used.has(txn.key));
    if (candidates.length === 0) {
      unmatched.push(entry);
      continue;
    }
    candidates.sort((a, b) => preference(b, entry) - preference(a, entry));
    const txn = candidates[0];
    used.add(txn.key);
    matches.push({ key: txn.key, merchantKey: txn.merchantKey || '', month: entry.month, amount: txn.amount, category: entry.category, was: txn.category ?? null });
  }

  // A merchant matched at least twice, always to the same category, becomes a rule.
  const byMerchant = new Map();
  for (const match of matches) {
    if (!match.merchantKey) continue;
    if (!byMerchant.has(match.merchantKey)) byMerchant.set(match.merchantKey, []);
    byMerchant.get(match.merchantKey).push(match.category);
  }
  const rules = {};
  for (const [merchant, categories] of byMerchant) {
    if (categories.length >= 2 && categories.every((c) => c === categories[0])) rules[merchant] = categories[0];
  }
  const choices = {};
  for (const match of matches) choices[match.key] = match.category;

  return {
    matches,
    choices,
    rules,
    unmatched,
    outside,
    unassignable,
    months: { from: months[0] || null, to: months[months.length - 1] || null, count: months.length },
    transactionsTotal: transactions.length,
    changed: matches.filter((match) => match.was !== match.category).length,
  };
}
