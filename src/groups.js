/**
 * Puts each account into a group (Savings, Spending, Credit by default).
 *
 * Lunch Flow does not say what kind of account something is, so the group is
 * worked out from the account name (and, for card issuers, the institution),
 * with explicit per-account overrides from `groups.config.js` or the
 * MONETA_GROUPS environment variable taking precedence.
 */

export const DEFAULT_GROUPS = [
  { id: 'savings', label: 'Savings' },
  { id: 'spending', label: 'Spending' },
  { id: 'credit', label: 'Credit' },
];

// Matched against the account name as whole words, case-insensitively.
export const DEFAULT_KEYWORDS = {
  savings: ['saver', 'saving', 'savings', 'isa', 'deposit', 'pot', 'vault', 'reserve', 'livret', 'sparkonto', 'epargne', 'épargne'],
  credit: ['credit', 'card', 'flex', 'amex', 'american express', 'loan', 'mortgage', 'borrow', 'borrowing'],
};

// Matched against the institution name: issuers whose accounts are cards.
export const DEFAULT_INSTITUTION_KEYWORDS = {
  credit: ['american express', 'amex', 'barclaycard', 'capital one', 'mbna', 'vanquis', 'aqua', 'newday'],
};

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const norm = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const toList = (value) => (Array.isArray(value) ? value.map(norm).filter(Boolean) : []);

/** Turn a raw config object into a validated one. Anything unusable falls back to the defaults. */
export function normalizeGroupsConfig(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  let groups = (Array.isArray(source.groups) ? source.groups : [])
    .map((entry) => {
      if (typeof entry === 'string' && entry.trim()) return { id: norm(entry), label: capitalize(entry.trim()) };
      if (entry && typeof entry === 'object' && entry.id != null && norm(entry.id)) {
        const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : capitalize(String(entry.id));
        return { id: norm(entry.id), label };
      }
      return null;
    })
    .filter(Boolean);
  if (groups.length === 0) groups = DEFAULT_GROUPS.map((group) => ({ ...group }));
  const ids = new Set(groups.map((group) => group.id));

  const keywords = {};
  const institutionKeywords = {};
  for (const id of ids) {
    keywords[id] = [...(DEFAULT_KEYWORDS[id] ?? []), ...toList(source.keywords && source.keywords[id])];
    institutionKeywords[id] = [
      ...(DEFAULT_INSTITUTION_KEYWORDS[id] ?? []),
      ...toList(source.institutionKeywords && source.institutionKeywords[id]),
    ];
  }

  const accounts = {};
  for (const [key, value] of Object.entries(source.accounts ?? {})) {
    const groupId = norm(value);
    if (norm(key) && ids.has(groupId)) accounts[norm(key)] = groupId;
  }

  const requested = norm(source.defaultGroup);
  const defaultGroup = ids.has(requested) ? requested : ids.has('spending') ? 'spending' : groups[0].id;

  return { groups, keywords, institutionKeywords, accounts, defaultGroup };
}

/** Build the config from a file's export, then let MONETA_GROUPS (JSON) replace it entirely if set. */
export function loadGroupsConfig({ env = process.env, file = null, logger = console } = {}) {
  let raw = file;
  if (env.MONETA_GROUPS) {
    try {
      raw = JSON.parse(env.MONETA_GROUPS);
    } catch (err) {
      logger.warn?.(`MONETA_GROUPS is not valid JSON, ignoring it: ${err.message}`);
    }
  }
  return normalizeGroupsConfig(raw ?? {});
}

const patterns = new Map();
function pattern(keyword) {
  let re = patterns.get(keyword);
  if (!re) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
    patterns.set(keyword, re);
  }
  return re;
}
const matchesAny = (text, keywords) => keywords.some((keyword) => pattern(keyword).test(text));

/**
 * Returns the group id for an account. Order of precedence:
 *   1. an override keyed by account id, "Institution · Account name", "Institution / Account name", or account name
 *   2. name keywords, checked in the order the groups are listed
 *   3. institution keywords, same order
 *   4. the default group
 */
export function classifyAccount(account, config) {
  const cfg = config && config.groups && config.keywords ? config : normalizeGroupsConfig(config);
  const name = norm(account.name);
  const institution = norm(account.institutionName);

  const candidates = [String(account.id ?? ''), `${institution} · ${name}`, `${institution} / ${name}`, name].map(norm);
  for (const key of candidates) {
    if (key && cfg.accounts[key]) return cfg.accounts[key];
  }
  for (const group of cfg.groups) {
    if (matchesAny(name, cfg.keywords[group.id] ?? [])) return group.id;
  }
  for (const group of cfg.groups) {
    if (matchesAny(institution, cfg.institutionKeywords[group.id] ?? [])) return group.id;
  }
  return cfg.defaultGroup;
}
