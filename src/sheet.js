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

/**
 * Which way a row is heading across the complete months in the window. The current month is
 * left out because it is only partly there. A least-squares slope is compared with the typical
 * size of the values: moving more than 5% of that a month counts as rising or falling.
 */
export function trendOf(values, months) {
  const complete = values.filter((_, i) => months[i] && !months[i].current && !months[i].future).map((v) => Number(v) || 0);
  const n = complete.length;
  const latest = n ? complete[n - 1] : null;
  const previous = n > 1 ? complete[n - 2] : null;
  const change = previous == null ? null : round(latest - previous);
  const pct = previous ? round((latest - previous) / Math.abs(previous)) : null;
  const base = { months: n, latest, previous, change, pct, rate: null, direction: null };
  if (n < 2 || complete.every((v) => v === 0)) return base;
  const mean = complete.reduce((a, b) => a + b, 0) / n;
  const scale = complete.reduce((a, b) => a + Math.abs(b), 0) / n;
  const xMean = (n - 1) / 2;
  let num = 0;
  let den = 0;
  complete.forEach((v, i) => {
    num += (i - xMean) * (v - mean);
    den += (i - xMean) ** 2;
  });
  const rate = round(num / den / scale);
  return { ...base, rate, direction: rate > 0.05 ? 'up' : rate < -0.05 ? 'down' : 'flat' };
}

export const PROJECTION_MONTHS = 3;

/**
 * The coming months if things carry on as they are. Outgoings and transfers run at the average of the
 * complete months in view; income repeats its latest complete month (a salary repeats, it does not
 * average); any line can be replaced by an amount the viewer set (`budgets`, keyed 'out:rent',
 * 'in:salary', 'tr:out' and so on). Balances chain on from the balance now, first adding what is still
 * expected before the current month ends (the forecast less what has already happened, never below zero).
 */
export const MAX_AHEAD = 12;

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A budget entry as stored: a flat amount, or { each, months: { 'YYYY-MM': amount } } for figures that vary by month. */
function budgetEntry(value) {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const each = value.each == null || value.each === '' ? null : Number(value.each);
    const months = {};
    for (const [key, amount] of Object.entries(value.months && typeof value.months === 'object' ? value.months : {})) {
      if (MONTH_KEY.test(key) && Number.isFinite(Number(amount))) months[key] = Number(amount);
    }
    const hasEach = each != null && Number.isFinite(each);
    if (!hasEach && Object.keys(months).length === 0) return null;
    return { each: hasEach ? each : null, months };
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? { each: amount, months: {} } : null;
}

export function buildProjection({ months, income, outgoings, transfers, budgets = {}, mode = 'auto', currentBalance = null, pendingNet = 0, count = PROJECTION_MONTHS }) {
  const currentIdx = months.findIndex((m) => m.current);
  if (currentIdx < 0) return null;
  const budgetOnly = mode === 'budget'; // only amounts the viewer set count; nothing is guessed
  const ahead = Math.min(Math.max(1, Number.parseInt(count, 10) || PROJECTION_MONTHS), MAX_AHEAD);
  const currentKey = months[currentIdx].key;
  const futureMonths = [];
  for (let k = 1; k <= ahead; k += 1) futureMonths.push(monthRange(shiftMonth(currentKey, k)));
  const keys = futureMonths.map((m) => m.key);
  const complete = months.map((m, i) => (!m.current && !m.future ? i : -1)).filter((i) => i >= 0);
  const at = (values, i) => Number(values[i]) || 0;
  const avg = (values) => (complete.length ? round(complete.reduce((acc, i) => acc + at(values, i), 0) / complete.length) : 0);
  const latest = (values) => (complete.length ? round(at(values, complete[complete.length - 1])) : 0);
  const sum = (list) => round(list.reduce((acc, v) => acc + v, 0));

  // One forecast line: the figure for the current month, one per month ahead, and which of those the
  // viewer set. `fallback(monthKey)` applies where nothing is set: the automatic figure, or nothing at
  // all in budget mode. A month's own amount beats the amount set for every month.
  const forecast = (key, fallback) => {
    const entry = budgetEntry(budgets[key]);
    const pick = (monthKey) => {
      if (entry && entry.months[monthKey] != null) return entry.months[monthKey];
      if (entry && entry.each != null) return entry.each;
      return fallback(monthKey);
    };
    const setMonths = {};
    for (const monthKey of [currentKey, ...keys]) {
      if (entry && entry.months[monthKey] != null) setMonths[monthKey] = 'month';
      else if (entry && entry.each != null) setMonths[monthKey] = 'each';
    }
    return { key, set: Boolean(entry), each: entry ? entry.each : null, value: round(pick(currentKey)), values: keys.map((monthKey) => round(pick(monthKey))), setMonths };
  };
  // This month's forecast can never be less than what has already happened: a line that has passed
  // it runs at the actual so far instead. The planned figure is kept alongside, and nothing stored changes.
  const raise = (item, soFar) =>
    soFar > item.value ? { ...item, value: soFar, planned: item.value, raised: true, soFar } : { ...item, planned: item.value, raised: false, soFar };
  const line = (key, auto, values) => raise({ ...forecast(key, () => (budgetOnly ? 0 : auto)), auto }, round(at(values, currentIdx)));

  const incomeRows = income.rows.map((row) => ({ id: row.id, label: row.label, ...line(`in:${row.id}`, latest(row.values), row.values) }));
  const incomeUncategorised = { id: null, label: 'Uncategorised', ...line('in:none', latest(income.uncategorised), income.uncategorised) };
  const outgoingRows = outgoings.rows.map((row) => {
    if (!row.subs) return { id: row.id, label: row.label, ...line(`out:${row.id}`, avg(row.values), row.values), subs: null };
    const subs = row.subs.map((sub) => ({ id: sub.id, label: sub.label, ...line(`out:${sub.id}`, avg(sub.values), sub.values) }));
    // A group runs at the sum of its sub-categories unless it was set as a whole.
    const sumNow = sum(subs.map((sub) => sub.value));
    const sumMonths = keys.map((_, i) => sum(subs.map((sub) => sub.values[i])));
    const group = forecast(`out:${row.id}`, (monthKey) => (monthKey === currentKey ? sumNow : sumMonths[keys.indexOf(monthKey)]));
    const raised = raise({ ...group, auto: sumNow }, round(at(row.values, currentIdx)));
    // A group running at the sum of its subs is raised when any of them is; its plan is the sum of theirs.
    if (!group.set && subs.some((sub) => sub.raised)) Object.assign(raised, { raised: true, planned: sum(subs.map((sub) => sub.planned)) });
    return { id: row.id, label: row.label, ...raised, subs };
  });
  const outgoingUncategorised = { id: null, label: 'Uncategorised', ...line('out:none', avg(outgoings.uncategorised), outgoings.uncategorised) };
  const transfersIn = line('tr:in', avg(transfers.in), transfers.in);
  const transfersOut = line('tr:out', avg(transfers.out), transfers.out);

  const totals = (rows, uncategorised) => ({
    now: sum([...rows.map((row) => row.value), uncategorised.value]),
    planned: sum([...rows.map((row) => row.planned), uncategorised.planned]),
    months: keys.map((_, i) => sum([...rows.map((row) => row.values[i]), uncategorised.values[i]])),
  });
  const incomeTotal = totals(incomeRows, incomeUncategorised);
  const outgoingTotal = totals(outgoingRows, outgoingUncategorised);
  const net = { now: round(incomeTotal.now - outgoingTotal.now), months: keys.map((_, i) => round(incomeTotal.months[i] - outgoingTotal.months[i])) };
  const monthly = keys.map((_, i) => round(net.months[i] + transfersIn.values[i] - transfersOut.values[i]));

  // What is still expected before this month ends: the forecast less what has already happened, never below zero.
  const remaining = (lines) => lines.reduce((acc, item) => acc + Math.max(0, item.value - item.soFar), 0);
  const outgoingLines = outgoingRows.flatMap((row) => (row.subs && !row.set ? row.subs : [row]));
  const rest = {
    income: round(remaining([...incomeRows, incomeUncategorised])),
    outgoings: round(remaining([...outgoingLines, outgoingUncategorised])),
    transfersIn: round(remaining([transfersIn])),
    transfersOut: round(remaining([transfersOut])),
  };

  const closing = futureMonths.map(() => null);
  let currentMonthEnd = null;
  if (currentBalance != null) {
    // pendingNet is what pending payments will take off a balance shown before them (0 otherwise).
    currentMonthEnd = round(currentBalance + pendingNet + rest.income - rest.outgoings + rest.transfersIn - rest.transfersOut);
    let balance = currentMonthEnd;
    futureMonths.forEach((_, i) => {
      balance = round(balance + monthly[i]);
      closing[i] = balance;
    });
  }

  return {
    months: futureMonths,
    mode: budgetOnly ? 'budget' : 'auto',
    basis: { income: 'latest', outgoings: 'average', complete: complete.length },
    income: { rows: incomeRows, uncategorised: incomeUncategorised, total: incomeTotal },
    outgoings: { rows: outgoingRows, uncategorised: outgoingUncategorised, total: outgoingTotal },
    net,
    transfers: { in: transfersIn, out: transfersOut },
    monthly,
    rest,
    balance: { now: currentBalance, currentMonthEnd, closing },
  };
}

export function buildSheet({
  accountId,
  transactions,
  months,
  categories,
  settings = null,
  budgets = {},
  forecastMode = 'auto',
  ahead = PROJECTION_MONTHS,
  currentBalance = null,
  balanceExcludesPending = false,
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
      providerCategory: txn.category || null, // what Lunch Flow itself called it, kept for the details view
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
    // With the balance shown before pending payments, only booked transactions move it.
    const moves = !(balanceExcludesPending && txn.pending);
    if (txn.date > lastTo) {
      if (moves) afterWindow += txn.amount;
      continue;
    }
    const i = index.get(txn.month);
    if (i === undefined) continue;
    if (moves) flows[i] += txn.amount;
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
  const monthsOut = months.map((month) => ({ ...month, current: month.key === currentMonth, future: month.key > currentMonth }));

  // One trend per row, keyed the way the page names its rows.
  const trends = {};
  const trend = (id, vals) => {
    trends[id] = trendOf(vals, monthsOut);
  };
  for (const row of incomeRows) trend(`in:${row.id}`, row.values);
  trend('in:none', incomeUncategorised);
  trend('in:total', incomeTotal);
  for (const row of outgoingRows) {
    trend(`out:${row.id}`, row.values);
    if (row.subs) for (const sub of row.subs) trend(`out:${sub.id}`, sub.values);
  }
  trend('out:none', outgoingUncategorised);
  trend('out:total', outgoingTotal);
  trend('net', net);
  trend('tr:in', transfersIn);
  trend('tr:out', transfersOut);
  trend('bal:closing', closing);

  return {
    months: monthsOut,
    income: { rows: incomeRows, uncategorised: incomeUncategorised, total: incomeTotal },
    outgoings: { rows: outgoingRows, uncategorised: outgoingUncategorised, total: outgoingTotal },
    net,
    transfers: { in: transfersIn, out: transfersOut },
    balance: { opening, closing },
    trends,
    projection: buildProjection({
      months: monthsOut,
      income: { rows: incomeRows, uncategorised: incomeUncategorised },
      outgoings: { rows: outgoingRows, uncategorised: outgoingUncategorised },
      transfers: { in: transfersIn, out: transfersOut },
      budgets,
      mode: forecastMode,
      count: ahead,
      currentBalance,
      pendingNet: balanceExcludesPending ? round(classified.filter((txn) => txn.pending).reduce((sum, txn) => sum + txn.amount, 0)) : 0,
    }),
    transactions: inWindow,
    uncategorisedCount: inWindow.filter((txn) => txn.parts.some((part) => part.category === null)).length,
  };
}
