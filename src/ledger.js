/**
 * Reconcile a ledger kept elsewhere (a spreadsheet with one cell per category and month, each cell
 * the sum of its transactions) with the transactions Lunch Flow has.
 *
 * Each ledger line is one transaction as the spreadsheet recorded it: month, category, amount. It
 * is matched to a Lunch Flow transaction of the same month, sign and amount that no other line has
 * claimed. The matches become per-transaction choices, and a merchant matched the same way every
 * time becomes a rule, so future months file themselves. Lines that together add up to one
 * transaction nothing else matched (rent and bills paid to one person, say) become a split of it.
 */
import { isAssignable, labelOf } from './categories.js';
import { normalizeBudget } from './settings.js';

const MAX_ENTRIES = 20000;
const MAX_BUDGETS = 300;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const BUDGET_KEY_RE = /^(in|out|tr):[a-z0-9_-]{1,64}$/;

/**
 * Validate a ledger file: { entries: [{ month, kind, category, amount, label? }], budgets? }.
 * A budget is keyed like a forecast row and is a flat amount for every month ('out:rent': 800) or
 * { each, months: { 'YYYY-MM': amount } } when some months have an amount of their own.
 */
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
  for (const [key, value] of Object.entries(rawBudgets).slice(0, MAX_BUDGETS)) {
    if (!BUDGET_KEY_RE.test(key)) continue;
    const budget = normalizeBudget(value);
    if (budget != null) budgets[key] = budget;
  }
  return { entries, budgets };
}

const slot = (month, kind, amount) => `${month}|${kind}|${Math.round(Math.abs(amount) * 100)}`;
const round2 = (n) => Math.round(n * 100) / 100;

// Which transaction to take when several share a month and amount: one the app already files the same
// way first (nothing changes), then one still unfiled, then any.
const preference = (txn, entry) => (txn.category === entry.category ? 2 : 0) + (txn.category == null ? 1 : 0);

const MAX_COMBINED_LINES = 60; // leftover lines in one month and side that a split is looked for among
const MAX_STATES = 250000; // distinct running totals kept while looking; past this the search gives up

/**
 * The indices of the most lines among `pence` that add up exactly to `target`, or null when no two or
 * more do. Each line is used at most once. The running totals reached so far are kept per total, so
 * the work grows with the target, not with 2^n.
 */
function combination(pence, target) {
  let states = new Map([[0, { count: 0, index: -1, prev: null }]]);
  for (let i = 0; i < pence.length; i += 1) {
    const amount = pence[i];
    if (amount <= 0 || amount > target) continue;
    const next = new Map(states);
    for (const [sum, state] of states) {
      const total = sum + amount;
      if (total > target) continue;
      const current = next.get(total);
      if (!current || current.count < state.count + 1) next.set(total, { count: state.count + 1, index: i, prev: state });
    }
    if (next.size > MAX_STATES) return null;
    states = next;
  }
  const hit = states.get(target);
  if (!hit || hit.count < 2) return null;
  const chosen = [];
  for (let state = hit; state.index >= 0; state = state.prev) chosen.push(state.index);
  return chosen.sort((a, b) => a - b);
}

/** Whether two lists of parts share out the same amounts to the same categories. */
function sameParts(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const norm = (list) => list.map((part) => `${part.category ?? ''}|${Math.round(part.amount * 100)}`).sort();
  const x = norm(a);
  const y = norm(b);
  return x.every((value, i) => value === y[i]);
}

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

  // Lines left over in a month may together be one payment: rent and bills paid to one person, say,
  // which the ledger has line by line. A transaction nothing matched, whose amount is exactly the sum
  // of some leftover lines on its side, is split into them, taking as many lines as add up. Lines in
  // the same category merge into one part.
  const combined = [];
  const splits = {};
  const absorbed = new Set();
  const leftovers = new Map();
  unmatched.forEach((entry, i) => {
    const key = `${entry.month}|${entry.kind}`;
    if (!leftovers.has(key)) leftovers.set(key, []);
    leftovers.get(key).push(i);
  });
  const spare = transactions.filter((txn) => !used.has(txn.key)).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  for (const txn of spare) {
    const indexes = (leftovers.get(`${txn.month}|${txn.amount >= 0 ? 'in' : 'out'}`) || []).filter((i) => !absorbed.has(i)).slice(0, MAX_COMBINED_LINES);
    if (indexes.length < 2) continue;
    const target = Math.round(Math.abs(txn.amount) * 100);
    const pence = indexes.map((i) => Math.round(unmatched[i].amount * 100));
    if (pence.reduce((total, p) => total + p, 0) < target) continue;
    const chosen = combination(pence, target);
    if (!chosen) continue;
    const byCategory = new Map();
    for (const c of chosen) {
      const entry = unmatched[indexes[c]];
      absorbed.add(indexes[c]);
      byCategory.set(entry.category, round2((byCategory.get(entry.category) || 0) + entry.amount));
    }
    const parts = [...byCategory].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
    used.add(txn.key);
    splits[txn.key] = parts;
    combined.push({
      key: txn.key,
      merchantKey: txn.merchantKey || '',
      merchant: txn.merchant || txn.description || '',
      month: txn.month,
      amount: txn.amount,
      lines: chosen.length,
      parts: parts.map((part) => ({ ...part, label: config ? labelOf(config, part.category) : part.category })),
      was: txn.split ? 'split' : (txn.category ?? null),
      alike: sameParts(txn.parts, parts),
    });
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
    combined,
    splits,
    unmatched: unmatched.filter((_, i) => !absorbed.has(i)),
    outside,
    unassignable,
    months: { from: months[0] || null, to: months[months.length - 1] || null, count: months.length },
    transactionsTotal: transactions.length,
    changed: matches.filter((match) => match.was !== match.category).length + combined.filter((item) => !item.alike).length,
  };
}
