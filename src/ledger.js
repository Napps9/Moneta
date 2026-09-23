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
 *
 * Lines and transactions are grouped by month, side and amount. Within a group each line, in ledger
 * order, takes the transaction it fits best. Lines a group has over its transactions are left over,
 * and a transaction nothing matched whose amount is exactly the sum of some leftover amounts on its
 * side is split into them. Which line of an amount goes into the split, when several share it, is
 * decided by the payment's other months: a category present in every month of that payment beats
 * one that is not, and a line whose category a transaction in the group is already filed under stays
 * with that transaction.
 */
export function reconcileLedger({ entries, transactions, config = null }) {
  const months = [...new Set(transactions.map((t) => t.month))].sort();
  const covered = new Set(months);
  const outside = [];
  const unassignable = [];
  const order = new Map(); // line -> its place in the ledger
  const groups = new Map(); // month|side|pence -> { month, side, pence, lines, txns }
  const groupFor = (month, side, pence) => {
    const key = `${month}|${side}|${pence}`;
    if (!groups.has(key)) groups.set(key, { key, month, side, pence, lines: [], txns: [] });
    return groups.get(key);
  };
  const sideOf = (txn) => (txn.amount >= 0 ? 'in' : 'out');
  const penceOf = (amount) => Math.round(Math.abs(amount) * 100);
  for (const txn of transactions) groupFor(txn.month, sideOf(txn), penceOf(txn.amount)).txns.push(txn);
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
    order.set(entry, order.size);
    groupFor(entry.month, entry.kind, penceOf(entry.amount)).lines.push(entry);
  }

  // Single matches within a group: each line, in ledger order, takes the transaction it fits best.
  const taken = new Set(); // lines a split takes
  const splitTxns = new Set(); // transactions split into lines
  const single = (group) => {
    const free = new Set(group.txns.filter((txn) => !splitTxns.has(txn)));
    const matched = [];
    const left = [];
    for (const entry of group.lines) {
      if (taken.has(entry)) continue;
      let best = null;
      for (const txn of free) if (!best || preference(txn, entry) > preference(best, entry)) best = txn;
      if (!best) {
        left.push(entry);
        continue;
      }
      free.delete(best);
      matched.push({ txn: best, entry });
    }
    return { matched, left, free: [...free] };
  };

  // Lines a group has over its transactions are left over, and may together be one payment: rent
  // and bills paid to one person, say, which the ledger has line by line. A transaction nothing
  // matched, whose amount is exactly the sum of some leftover amounts on its side, is split into
  // them, taking as many lines as add up. Largest transactions first.
  const leftoverBy = new Map(); // month|side -> [{ group, count }]
  const spare = [];
  for (const group of groups.values()) {
    const count = group.lines.length - group.txns.length;
    if (count > 0) {
      const key = `${group.month}|${group.side}`;
      if (!leftoverBy.has(key)) leftoverBy.set(key, []);
      leftoverBy.get(key).push({ group, count });
    }
    spare.push(...single(group).free);
  }
  spare.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const plans = []; // { txn, needs: Map<group, how many of its lines> }
  for (const txn of spare) {
    const items = [];
    for (const pool of leftoverBy.get(`${txn.month}|${sideOf(txn)}`) || []) {
      for (let i = 0; i < pool.count && items.length < MAX_COMBINED_LINES; i += 1) items.push(pool);
    }
    if (items.length < 2) continue;
    const target = penceOf(txn.amount);
    if (items.reduce((total, pool) => total + pool.group.pence, 0) < target) continue;
    const chosen = combination(items.map((pool) => pool.group.pence), target);
    if (!chosen) continue;
    const needs = new Map();
    for (const i of chosen) {
      items[i].count -= 1;
      needs.set(items[i].group, (needs.get(items[i].group) || 0) + 1);
    }
    plans.push({ txn, needs });
    splitTxns.add(txn);
  }

  // Which line of an amount goes into a split, when several share it: a category the same payment
  // has in every one of its months beats one it has in few, and a line whose category a transaction
  // in the group is already filed under stays with that transaction. Lines in the same category
  // merge into one part.
  const monthsOf = new Map(); // merchant -> the months it is split in
  for (const { txn } of plans) {
    const merchant = txn.merchantKey || txn.key;
    if (!monthsOf.has(merchant)) monthsOf.set(merchant, new Set());
    monthsOf.get(merchant).add(txn.month);
  }
  const presence = (txn, group, category) => {
    let n = 0;
    for (const month of monthsOf.get(txn.merchantKey || txn.key)) {
      const other = groups.get(`${month}|${group.side}|${group.pence}`);
      if (other && other.lines.some((entry) => entry.category === category)) n += 1;
    }
    return n;
  };
  const combined = [];
  const splits = {};
  for (const { txn, needs } of plans) {
    const byCategory = new Map();
    let lines = 0;
    for (const [group, k] of needs) {
      const filed = new Map();
      for (const other of group.txns) if (!splitTxns.has(other) && other.category) filed.set(other.category, (filed.get(other.category) || 0) + 1);
      const ranked = group.lines
        .filter((entry) => !taken.has(entry))
        .map((entry) => {
          const reserved = (filed.get(entry.category) || 0) > 0;
          if (reserved) filed.set(entry.category, filed.get(entry.category) - 1);
          return { entry, reserved, presence: presence(txn, group, entry.category) };
        })
        .sort((a, b) => Number(a.reserved) - Number(b.reserved) || b.presence - a.presence || order.get(a.entry) - order.get(b.entry));
      for (const { entry } of ranked.slice(0, k)) {
        taken.add(entry);
        lines += 1;
        byCategory.set(entry.category, round2((byCategory.get(entry.category) || 0) + entry.amount));
      }
    }
    const parts = [...byCategory].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
    splits[txn.key] = parts;
    combined.push({
      key: txn.key,
      merchantKey: txn.merchantKey || '',
      merchant: txn.merchant || txn.description || '',
      month: txn.month,
      amount: txn.amount,
      lines,
      parts: parts.map((part) => ({ ...part, label: config ? labelOf(config, part.category) : part.category })),
      was: txn.split ? 'split' : (txn.category ?? null),
      alike: sameParts(txn.parts, parts),
    });
  }
  combined.sort((a, b) => (a.month === b.month ? Math.abs(b.amount) - Math.abs(a.amount) : a.month < b.month ? 1 : -1));

  // The single matches, now that the splits have taken their lines.
  const pairs = [];
  const unmatched = [];
  for (const group of groups.values()) {
    const { matched, left } = single(group);
    pairs.push(...matched);
    unmatched.push(...left);
  }
  pairs.sort((a, b) => order.get(a.entry) - order.get(b.entry));
  unmatched.sort((a, b) => order.get(a) - order.get(b));
  const matches = pairs.map(({ txn, entry }) => ({ key: txn.key, merchantKey: txn.merchantKey || '', month: entry.month, amount: txn.amount, category: entry.category, was: txn.category ?? null }));

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
    unmatched,
    outside,
    unassignable,
    months: { from: months[0] || null, to: months[months.length - 1] || null, count: months.length },
    transactionsTotal: transactions.length,
    changed: matches.filter((match) => match.was !== match.category).length + combined.filter((item) => !item.alike).length,
  };
}
