/**
 * The Accounts sheet: one account, a run of calendar months, categories down
 * the side. Sums every transaction into its category and month, totals income
 * and outgoings, and chains month-end balances back from the current balance.
 */
import { TRANSFER, classifyTransaction, labelOf, merchantKey, transactionKey } from './categories.js';

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const round = (value) => Math.round(value * 10000) / 10000;

export const monthKey = (isoDate) => isoDate.slice(0, 7);

export function monthRange(key) {
  const [year, month] = key.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { key, from: `${key}-01`, to: `${key}-${String(lastDay).padStart(2, '0')}` };
}

export function shiftMonth(key, delta) {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** `count` consecutive months ending at `endKey`, oldest first. */
export function monthWindow(endKey, count) {
  const months = [];
  for (let back = count - 1; back >= 0; back -= 1) months.push(monthRange(shiftMonth(endKey, -back)));
  return months;
}

/**
 * The parts a transaction's amount is shared out into. Without a split that is one part in the
 * transaction's own category. With one, each part is capped at what is still unallocated, and
 * whatever the parts leave over stays in the transaction's own category, so nothing is lost.
 */
function partsOf(total, base, split) {
  if (!Array.isArray(split) || split.length === 0) return [{ category: base, amount: round(total) }];
  const parts = [];
  let remaining = total;
  for (const part of split) {
    const amount = Math.min(Number(part && part.amount) || 0, remaining);
    if (amount <= 0) continue;
    parts.push({ category: part.category ?? null, amount: round(amount) });
    remaining = round(remaining - amount);
  }
  if (remaining > 0) parts.push({ category: base, amount: round(remaining) });
  return parts;
}

export function buildSheet({
  accountId,
  transactions,
  months,
  categories,
  settings = null,
  currentBalance = null,
  today,
  otherAccountNames = [],
}) {
  const splits = settings && settings.splits && typeof settings.splits === 'object' ? settings.splits : {};
  const describe = (category) => {
    const leaf = category ? categories.leaves.get(category) : null;
    return { categoryLabel: labelOf(categories, category), parent: leaf ? leaf.parent : null };
  };
  const classified = transactions.map((txn) => {
    const { category, source } = classifyTransaction(txn, { config: categories, settings, accountId, otherAccountNames });
    const key = transactionKey(accountId, txn);
    const split = Array.isArray(splits[key]) && splits[key].length > 0 ? splits[key] : null;
    return {
      ...txn,
      key,
      merchantKey: merchantKey(txn),
      month: monthKey(txn.date),
      category,
      ...describe(category),
      source,
      split: Boolean(split),
      parts: partsOf(Math.abs(txn.amount), category, split).map((part) => ({ ...part, ...describe(part.category) })),
    };
  });

  const index = new Map(months.map((month, i) => [month.key, i]));
  const zeros = () => months.map(() => 0);
  const sums = new Map(); // "category|sign" -> values per month
  const flows = zeros();
  const lastTo = months[months.length - 1].to;
  let afterWindow = 0;

  for (const txn of classified) {
    if (txn.date > lastTo) {
      afterWindow += txn.amount;
      continue;
    }
    const i = index.get(txn.month);
    if (i === undefined) continue;
    flows[i] += txn.amount;
    const sign = txn.amount >= 0 ? 'in' : 'out';
    for (const part of txn.parts) {
      const bucket = `${part.category ?? ''}|${sign}`;
      if (!sums.has(bucket)) sums.set(bucket, zeros());
      sums.get(bucket)[i] += part.amount;
    }
  }

  const values = (category, sign) => (sums.get(`${category ?? ''}|${sign}`) || zeros()).map(round);
  const add = (a, b) => a.map((v, i) => round(v + b[i]));

  const incomeRows = categories.income.map((leaf) => ({ id: leaf.id, label: leaf.label, values: values(leaf.id, 'in') }));
  const incomeUncategorised = values(null, 'in');
  const incomeTotal = incomeRows.reduce((acc, row) => add(acc, row.values), incomeUncategorised);

  const outgoingRows = categories.outgoings.map((entry) => {
    if (!entry.subs) return { id: entry.id, label: entry.label, values: values(entry.id, 'out'), subs: null };
    const subs = entry.subs.map((leaf) => ({ id: leaf.id, label: leaf.label, values: values(leaf.id, 'out') }));
    return { id: entry.id, label: entry.label, values: subs.reduce((acc, sub) => add(acc, sub.values), zeros()), subs };
  });
  const outgoingUncategorised = values(null, 'out');
  const outgoingTotal = outgoingRows.reduce((acc, row) => add(acc, row.values), outgoingUncategorised);

  const net = incomeTotal.map((v, i) => round(v - outgoingTotal[i]));
  const transfersIn = values(TRANSFER, 'in');
  const transfersOut = values(TRANSFER, 'out');

  const closing = months.map(() => null);
  const opening = months.map(() => null);
  if (currentBalance != null) {
    let balance = round(currentBalance - afterWindow);
    for (let i = months.length - 1; i >= 0; i -= 1) {
      closing[i] = balance;
      opening[i] = round(balance - flows[i]);
      balance = opening[i];
    }
  }

  const inWindow = classified
    .filter((txn) => index.has(txn.month))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || String(b.key).localeCompare(String(a.key)));

  const currentMonth = monthKey(today);
  return {
    months: months.map((month) => ({ ...month, current: month.key === currentMonth, future: month.key > currentMonth })),
    income: { rows: incomeRows, uncategorised: incomeUncategorised, total: incomeTotal },
    outgoings: { rows: outgoingRows, uncategorised: outgoingUncategorised, total: outgoingTotal },
    net,
    transfers: { in: transfersIn, out: transfersOut },
    balance: { opening, closing },
    transactions: inWindow,
    uncategorisedCount: inWindow.filter((txn) => txn.parts.some((part) => part.category === null)).length,
  };
}
