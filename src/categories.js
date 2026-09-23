/**
 * Categories for transactions: a tree of outgoings (parents with sub-categories,
 * or plain categories), a flat list of income categories, and the rules that
 * file a transaction under one of them.
 *
 * Precedence when classifying:
 *   1. a choice made in the app for that exact transaction
 *   2. a choice made in the app for that merchant ("always for Tesco")
 *   3. transfer detection (keywords, or another connected account's name)
 *   4. keywords from categories.config.js
 *   5. the category Lunch Flow itself reports, when it matches a label here
 *   6. uncategorised
 */
import { matchesAny } from './groups.js';

export const TRANSFER = 'transfer';

const norm = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const splitJoins = (value) => String(value ?? '').replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2');
const toList = (value) => (Array.isArray(value) ? value.map(norm).filter(Boolean) : []);
const cleanId = (value) => norm(value).replace(/[^a-z0-9_-]/g, '');

const DEFAULT_CONFIG = {
  income: [{ id: 'income', label: 'Income' }],
  outgoings: [{ id: 'spending', label: 'Spending' }],
};

function makeLeaf(raw, kind, parent) {
  const source = typeof raw === 'string' ? { id: raw, label: raw } : raw;
  if (!source || typeof source !== 'object' || source.id == null) return null;
  const id = cleanId(source.id);
  if (!id || id === TRANSFER) return null;
  const label = typeof source.label === 'string' && source.label.trim() ? source.label.trim() : String(source.id);
  return { id, label, kind, parent, keywords: toList(source.keywords) };
}

/** Turn the raw config into a validated tree with a flat map of assignable leaves. */
export function normalizeCategoriesConfig(raw = {}) {
  let source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const hasAny = (Array.isArray(source.income) && source.income.length) || (Array.isArray(source.outgoings) && source.outgoings.length);
  if (!hasAny) source = { ...DEFAULT_CONFIG, transfers: source.transfers };

  const leaves = new Map();
  const parents = new Map();
  const take = (leaf) => {
    if (!leaf || leaves.has(leaf.id) || parents.has(leaf.id)) return null;
    leaves.set(leaf.id, leaf);
    return leaf;
  };

  const income = (Array.isArray(source.income) ? source.income : []).map((entry) => take(makeLeaf(entry, 'in', null))).filter(Boolean);

  const outgoings = [];
  for (const entry of Array.isArray(source.outgoings) ? source.outgoings : []) {
    if (entry && typeof entry === 'object' && Array.isArray(entry.subs) && entry.subs.length > 0) {
      const id = cleanId(entry.id);
      if (!id || id === TRANSFER || leaves.has(id) || parents.has(id)) continue;
      const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : String(entry.id);
      const parent = { id, label, subs: [] };
      parents.set(id, parent);
      parent.subs = entry.subs.map((sub) => take(makeLeaf(sub, 'out', id))).filter(Boolean);
      if (parent.subs.length > 0) outgoings.push(parent);
      else parents.delete(id);
    } else {
      const leaf = take(makeLeaf(entry, 'out', null));
      if (leaf) outgoings.push({ id: leaf.id, label: leaf.label, subs: null });
    }
  }

  const transferKeywords = toList(source.transfers && source.transfers.keywords);
  return { income, outgoings, leaves, parents, transferKeywords };
}

/** Build the config from a file's export, then let MONETA_CATEGORIES (JSON) replace it entirely if set. */
export function loadCategoriesConfig({ env = process.env, file = null, logger = console } = {}) {
  let raw = file;
  if (env.MONETA_CATEGORIES) {
    try {
      raw = JSON.parse(env.MONETA_CATEGORIES);
    } catch (err) {
      logger.warn?.(`MONETA_CATEGORIES is not valid JSON, ignoring it: ${err.message}`);
    }
  }
  return normalizeCategoriesConfig(raw ?? {});
}

const MAX_CUSTOM = 200;

/**
 * Categories added in the app, kept as a flat list in the settings:
 *   { id, label, kind: 'in' | 'out', parent: null | <parent id>, group: boolean }
 * A group is a new parent for sub-categories; a sub names its parent; anything else is its own category.
 */
export function normalizeCustomCategories(raw) {
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(raw) ? raw.slice(0, MAX_CUSTOM) : []) {
    if (!entry || typeof entry !== 'object') continue;
    const id = cleanId(entry.id);
    const label = typeof entry.label === 'string' ? entry.label.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
    if (!id || id.length > 40 || id === TRANSFER || !label || seen.has(id)) continue;
    seen.add(id);
    const kind = entry.kind === 'in' ? 'in' : 'out';
    const group = kind === 'out' && entry.group === true;
    const parent = kind === 'out' && !group ? cleanId(entry.parent) || null : null;
    out.push({ id, label, kind, parent, group });
  }
  return out;
}

/** The file's tree plus the categories added in the app. The file wins any clash of ids. */
export function mergeCustomCategories(config, custom) {
  const list = Array.isArray(custom) ? custom : [];
  if (list.length === 0) return config;
  const rawLeaf = (leaf) => ({ id: leaf.id, label: leaf.label, keywords: leaf.keywords });
  const income = config.income.map(rawLeaf);
  const outgoings = config.outgoings.map((entry) => (entry.subs ? { id: entry.id, label: entry.label, subs: entry.subs.map(rawLeaf) } : rawLeaf(config.leaves.get(entry.id))));
  const groups = new Map(outgoings.filter((entry) => entry.subs).map((entry) => [entry.id, entry]));
  for (const item of list) {
    if (item.kind === 'in') income.push({ id: item.id, label: item.label });
    else if (item.group) {
      const group = { id: item.id, label: item.label, subs: [] };
      outgoings.push(group);
      groups.set(item.id, group);
    }
  }
  for (const item of list) {
    if (item.kind !== 'out' || item.group) continue;
    const group = item.parent ? groups.get(item.parent) : null;
    // A sub whose group has gone stays as its own category, so nothing filed under it is lost.
    if (group) group.subs.push({ id: item.id, label: item.label });
    else outgoings.push({ id: item.id, label: item.label });
  }
  const merged = normalizeCategoriesConfig({ income, outgoings, transfers: { keywords: config.transferKeywords } });
  // Flag what the app added; an id the file already has stays the file's.
  merged.custom = new Set(list.map((item) => item.id).filter((id) => !config.leaves.has(id) && !config.parents.has(id)));
  return merged;
}

/** The tree as the page needs it: ids and labels, and which ones were added in the app. */
export function describeCategories(config) {
  const custom = config.custom || new Set();
  const flag = (item) => (custom.has(item.id) ? { ...item, custom: true } : item);
  return {
    income: config.income.map((leaf) => flag({ id: leaf.id, label: leaf.label })),
    outgoings: config.outgoings.map((entry) =>
      flag({
        id: entry.id,
        label: entry.label,
        subs: entry.subs ? entry.subs.map((leaf) => flag({ id: leaf.id, label: leaf.label })) : null,
      }),
    ),
  };
}

export function isAssignable(config, id, sign) {
  if (id === TRANSFER) return true;
  const leaf = config.leaves.get(id);
  return Boolean(leaf) && (!sign || leaf.kind === sign);
}

export function labelOf(config, id) {
  if (id === TRANSFER) return 'Transfer';
  if (!id) return 'Uncategorised';
  const leaf = config.leaves.get(id);
  return leaf ? leaf.label : id;
}

/** The key a merchant rule is stored under. */
export const merchantKey = (txn) => norm(txn.merchant || txn.description || '');

/** The key a per-transaction choice is stored under. Lunch Flow ids when it has them, else the transaction's own facts. */
export function transactionKey(accountId, txn) {
  if (txn.id) return `id:${txn.id}`;
  return `k:${accountId}|${txn.date}|${txn.amount}|${norm(txn.description)}`;
}

export function classifyTransaction(txn, { config, settings = null, accountId = null, otherAccountNames = [] } = {}) {
  const sign = txn.amount >= 0 ? 'in' : 'out';
  const allowed = (id) => isAssignable(config, id, sign);

  const byTransaction = settings && settings.transactions ? settings.transactions[transactionKey(accountId, txn)] : null;
  if (byTransaction && allowed(byTransaction)) return { category: byTransaction, source: 'transaction' };

  const key = merchantKey(txn);
  const byMerchant = settings && settings.rules && key ? settings.rules[key] : null;
  if (byMerchant && allowed(byMerchant)) return { category: byMerchant, source: 'merchant' };

  // Banks often glue the payee and the reference together ("Interactive BrokerNicholas Apps"), so the text is
  // searched both as it came and with a space at every lower-to-upper-case join.
  const haystack = ` ${norm(txn.merchant)} ${norm(txn.description)} ${norm(splitJoins(txn.merchant))} ${norm(splitJoins(txn.description))} `;
  if (matchesAny(haystack, config.transferKeywords)) return { category: TRANSFER, source: 'keyword' };
  for (const name of otherAccountNames) {
    const wanted = norm(name);
    if (wanted.length >= 4 && haystack.includes(` ${wanted} `)) return { category: TRANSFER, source: 'account' };
  }

  for (const leaf of config.leaves.values()) {
    if (leaf.kind === sign && leaf.keywords.length && matchesAny(haystack, leaf.keywords)) return { category: leaf.id, source: 'keyword' };
  }

  if (txn.category) {
    const wanted = norm(txn.category);
    for (const leaf of config.leaves.values()) {
      if (leaf.kind === sign && norm(leaf.label) === wanted) return { category: leaf.id, source: 'provider' };
    }
  }

  return { category: null, source: null };
}
