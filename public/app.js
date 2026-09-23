const $ = (id) => document.getElementById(id);

const totalsEl = $('totals');
const accountsEl = $('accounts');
const noticeEl = $('notice');
const gateEl = $('gate');
const updatedEl = $('updated');
const refreshBtn = $('refresh');
const lockBtn = $('lock');
const cacheHintEl = $('cache-hint');
const viewToggleEl = $('view-toggle');
const screenBalancesEl = $('screen-balances');
const screenAccountsEl = $('screen-accounts');
const navLinks = [...document.querySelectorAll('.nav-link')];
const pickerEl = $('account-picker');
const periodPickerEl = $('period-picker');
const sheetModeEl = $('sheet-mode');
const forecastModeEl = $('forecast-mode');
const activityHeadEl = $('activity-head');
const sheetWrapEl = $('sheet-wrap');
const sheetEl = $('sheet');
const sheetNoteEl = $('sheet-note');
const sheetToolsEl = $('sheet-tools');
const emptyToggle = $('empty-toggle');
const sheetToolsSep = $('sheet-tools-sep');
const newcatOpenSheet = $('newcat-open-sheet');
const newcatOpen = $('newcat-open');
const newcatEl = $('newcat');
const newcatForm = $('newcat-form');
const newcatName = $('newcat-name');
const newcatOut = $('newcat-out');
const newcatIn = $('newcat-in');
const newcatUnderField = $('newcat-under-field');
const newcatUnder = $('newcat-under');
const newcatGroupField = $('newcat-group-field');
const newcatGroup = $('newcat-group');
const newcatMine = $('newcat-mine');
const newcatError = $('newcat-error');
const newcatHint = $('newcat-hint');
const newcatCancel = $('newcat-cancel');
const newcatSave = $('newcat-save');
const projNoteEl = $('proj-note');
const budgetEl = $('budget');
const budgetForm = $('budget-form');
const budgetTitle = $('budget-title');
const budgetSub = $('budget-sub');
const budgetAuto = $('budget-auto');
const budgetAmount = $('budget-amount');
const budgetEach = $('budget-each');
const budgetMonth = $('budget-month');
const budgetMonthLabel = $('budget-month-label');
const budgetError = $('budget-error');
const budgetHint = $('budget-hint');
const budgetCancel = $('budget-cancel');
const budgetClear = $('budget-clear');
const budgetSave = $('budget-save');
const ledgerOpen = $('ledger-open');
const ledgerEl = $('ledger');
const ledgerForm = $('ledger-form');
const ledgerSub = $('ledger-sub');
const ledgerFile = $('ledger-file');
const ledgerPreview = $('ledger-preview');
const ledgerBudgetsField = $('ledger-budgets-field');
const ledgerBudgets = $('ledger-budgets');
const ledgerError = $('ledger-error');
const ledgerHint = $('ledger-hint');
const ledgerCancel = $('ledger-cancel');
const ledgerApply = $('ledger-apply');
const drillEl = $('drill');
const editorEl = $('editor');
const editorForm = $('editor-form');
const editorTitle = $('editor-title');
const editorSub = $('editor-sub');
const editorGroup = $('editor-group');
const editorBalance = $('editor-balance');
const editorLimitField = $('editor-limit-field');
const editorLimit = $('editor-limit');
const editorExplain = $('editor-explain');
const editorError = $('editor-error');
const editorHint = $('editor-hint');
const editorCancel = $('editor-cancel');
const editorSave = $('editor-save');
const catpickerEl = $('catpicker');
const catpickerForm = $('catpicker-form');
const catpickerTitle = $('catpicker-title');
const catpickerSub = $('catpicker-sub');
const catpickerDetails = $('catpicker-details');
const catpickerDl = $('catpicker-dl');
const catpickerKnow = $('catpicker-know');
const catpickerLookup = $('catpicker-lookup');
const catpickerGroups = $('catpicker-groups');
const scopeMerchant = $('scope-merchant');
const scopeMerchantLabel = $('scope-merchant-label');
const scopeOne = $('scope-one');
const scopeOneLabel = $('scope-one-label');
const catpickerError = $('catpicker-error');
const catpickerHint = $('catpicker-hint');
const catpickerCancel = $('catpicker-cancel');
const catpickerSave = $('catpicker-save');
const catpickerScope = $('catpicker-scope');
const splitEditor = $('split-editor');
const splitRows = $('split-rows');
const splitAdd = $('split-add');
const splitLeft = $('split-left');
const splitToggle = $('split-toggle');

const AUTO_RELOAD_MS = 60_000;
const PASSWORD_KEY = 'moneta.password';
const VIEW_KEY = 'moneta.view';
const SETTINGS_KEY = 'moneta.settings';
const COLLAPSED_KEY = 'moneta.collapsed';
const SHEET_MODE_KEY = 'moneta.sheetMode';
const HIDE_EMPTY_KEY = 'moneta.hideEmpty';
const SHEET_MONTHS = 7; // fetched: six complete months for the trends and the forecasts, plus the current one
const VIEW_COLS = 6; // months in view at once; the window slides back into history and forward into forecasts
const DEFAULT_AHEAD = 3; // the view opens ending three months from now: three actuals, then the forecasts
const MAX_AHEAD = 12;
const MONTHS_BACK = 24;
const TRANSFER = 'transfer';

const TREATMENT_HELP = {
  reported: 'Uses the number exactly as Lunch Flow reports it.',
  negate: 'Lunch Flow reports what you owe as a positive number. It will be shown as negative and subtracted from the totals.',
  'credit-limit': 'Lunch Flow reports what is left to spend. What you owe is the credit limit minus that, shown as negative.',
};

const STATUS = {
  ACTIVE: { label: 'Active', kind: 'good' },
  DISCONNECTED: { label: 'Disconnected', kind: 'warning' },
  ERROR: { label: 'Error', kind: 'critical' },
};

// ---------- calendar months (in the viewer's local time) ----------

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const currentMonth = () => monthKey(new Date());
const splitMonth = (key) => key.split('-').map(Number);

function shiftMonth(key, n) {
  const [year, month] = splitMonth(key);
  return monthKey(new Date(year, month - 1 + n, 1));
}

function formatMonth(key, { short = false } = {}) {
  const [year, month] = splitMonth(key);
  const date = new Date(year, month - 1, 1);
  if (short) return `${date.toLocaleDateString(undefined, { month: 'short' })} ${String(year).slice(2)}`;
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Whole months from one YYYY-MM to another; negative when `to` is earlier. */
function monthDiff(from, to) {
  const [fy, fm] = splitMonth(from);
  const [ty, tm] = splitMonth(to);
  return (ty - fy) * 12 + (tm - fm);
}

function formatWindow(endKey, count) {
  const startKey = shiftMonth(endKey, -(count - 1));
  const [sy, sm] = splitMonth(startKey);
  const [ey, em] = splitMonth(endKey);
  const start = new Date(sy, sm - 1, 1).toLocaleDateString(undefined, sy === ey ? { month: 'short' } : { month: 'short', year: 'numeric' });
  const end = new Date(ey, em - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
}

const parseIso = (iso) => new Date(`${iso}T00:00:00`);

function formatDay(iso, { weekday = true } = {}) {
  const date = parseIso(iso);
  const options = { day: 'numeric', month: 'short' };
  if (weekday) options.weekday = 'short';
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString(undefined, options);
}

// ---------- routing ----------

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const now = currentMonth();
  if (parts[0] === 'accounts') {
    let accountId = null;
    try {
      accountId = parts[1] ? decodeURIComponent(parts[1]) : null;
    } catch {
      accountId = null;
    }
    // The month the view ends on. It may run past now, into the forecasts, up to a year ahead.
    const period = MONTH_RE.test(parts[2] || '') && parts[2] <= shiftMonth(now, MAX_AHEAD) ? parts[2] : shiftMonth(now, DEFAULT_AHEAD);
    return { screen: 'accounts', accountId, period };
  }
  return { screen: 'balances', accountId: null, period: now };
}

const accountHash = (id, period) => `#/accounts/${encodeURIComponent(String(id))}/${period}`;

// ---------- per-browser conveniences ----------

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'bank' ? 'bank' : 'type';
  } catch {
    return 'type';
  }
}
function writeView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* per-browser convenience only */
  }
}

function readSheetMode() {
  try {
    return localStorage.getItem(SHEET_MODE_KEY) === 'change' ? 'change' : 'amounts';
  } catch {
    return 'amounts';
  }
}

function writeSheetMode(mode) {
  try {
    localStorage.setItem(SHEET_MODE_KEY, mode);
  } catch {
    /* per-browser convenience only */
  }
}

function readHideEmpty() {
  try {
    return localStorage.getItem(HIDE_EMPTY_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeHideEmpty(hide) {
  try {
    localStorage.setItem(HIDE_EMPTY_KEY, hide ? '1' : '0');
  } catch {
    /* per-browser convenience only */
  }
}
function readPassword() {
  try {
    return localStorage.getItem(PASSWORD_KEY) || '';
  } catch {
    return '';
  }
}
function writePassword(password) {
  try {
    if (password) localStorage.setItem(PASSWORD_KEY, password);
    else localStorage.removeItem(PASSWORD_KEY);
  } catch {
    /* storage unavailable: the password lives for this page load only */
  }
}
let sessionPassword = '';

function readCollapsed() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
function writeCollapsed(collapsed) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
  } catch {
    /* per-browser convenience only */
  }
}

// Settings kept in this browser, used when the server has nowhere to store them.
const emptySettings = () => ({ accounts: {}, rules: {}, transactions: {}, splits: {}, categories: [], budgets: {}, forecast: {} });
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function readLocalSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!isObject(parsed)) return emptySettings();
    return {
      accounts: isObject(parsed.accounts) ? parsed.accounts : {},
      rules: isObject(parsed.rules) ? parsed.rules : {},
      transactions: isObject(parsed.transactions) ? parsed.transactions : {},
      splits: isObject(parsed.splits) ? parsed.splits : {},
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      budgets: isObject(parsed.budgets) ? parsed.budgets : {},
      forecast: isObject(parsed.forecast) ? parsed.forecast : {},
    };
  } catch {
    return emptySettings();
  }
}
const settingsEmpty = (s) =>
  !s ||
  Object.keys(s.accounts || {}).length +
    Object.keys(s.rules || {}).length +
    Object.keys(s.transactions || {}).length +
    Object.keys(s.splits || {}).length +
    (s.categories || []).length +
    Object.keys(s.budgets || {}).length +
    Object.keys(s.forecast || {}).length ===
    0;
function writeLocalSettings(settings) {
  try {
    if (settings && !settingsEmpty(settings)) {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          accounts: settings.accounts,
          rules: settings.rules,
          transactions: settings.transactions,
          splits: settings.splits || {},
          categories: settings.categories || [],
          budgets: settings.budgets || {},
          forecast: settings.forecast || {},
        }),
      );
    } else localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* storage unavailable: settings last for this page load only */
  }
}

// ---------- state ----------

const state = {
  data: null,
  loading: false,
  error: null,
  gate: null, // null | { kind: 'password' | 'unconfigured', message }
  view: readView(),
  sheetMode: readSheetMode(),
  hideEmpty: readHideEmpty(), // 'type' (savings / spending / credit) or 'bank' (by institution)
  settings: { persistent: null, kind: null, error: null, ...readLocalSettings() },
  editing: null, // the account open in the account editor
  migrated: false,
  route: parseHash(),
  sheet: { key: null, data: null, loading: false, error: null },
  cell: null, // { id, label, cats, sign, monthIndex }
  collapsed: readCollapsed(),
  catPicker: null, // { txn, choice }
};

// ---------- helpers ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

const formatters = new Map();

function moneyFormatter(currency) {
  const key = currency || '';
  let formatter = formatters.get(key);
  if (formatter) return formatter;
  try {
    formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' });
  } catch {
    const plain = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatter = { format: (value) => (currency ? `${plain.format(value)} ${currency}` : plain.format(value)) };
  }
  formatters.set(key, formatter);
  return formatter;
}

function formatMoney(amount, currency) {
  if (amount == null || Number.isNaN(amount)) return '—';
  return moneyFormatter(currency).format(amount);
}

function formatSigned(amount, currency) {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `${amount > 0 ? '+' : ''}${formatMoney(amount, currency)}`;
}

const plainNumber = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatCell(value) {
  if (value == null || Number.isNaN(value)) return '—';
  if (value === 0) return '–';
  return `${value < 0 ? '-' : ''}${plainNumber.format(Math.abs(value))}`;
}

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 45) return `${minutes} min ago`;
  if (minutes < 90) return 'an hour ago';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function settingsPayload() {
  return {
    accounts: state.settings.accounts,
    rules: state.settings.rules,
    transactions: state.settings.transactions,
    splits: state.settings.splits || {},
    categories: state.settings.categories || [],
    budgets: state.settings.budgets || {},
    forecast: state.settings.forecast || {},
  };
}

function cloneSettings() {
  return {
    accounts: Object.fromEntries(Object.entries(state.settings.accounts).map(([k, v]) => [k, { ...v }])),
    rules: { ...state.settings.rules },
    transactions: { ...state.settings.transactions },
    splits: Object.fromEntries(Object.entries(state.settings.splits || {}).map(([k, parts]) => [k, parts.map((part) => ({ ...part }))])),
    categories: (state.settings.categories || []).map((c) => ({ ...c })),
    budgets: Object.fromEntries(Object.entries(state.settings.budgets || {}).map(([k, rows]) => [k, { ...rows }])),
    forecast: { ...(state.settings.forecast || {}) },
  };
}

/** Fetch an API route, carrying the password and, when the server has no store, the browser's settings. */
function apiFetch(path, { method = 'GET', body = null } = {}) {
  const headers = { accept: 'application/json' };
  const password = sessionPassword || readPassword();
  if (password) headers.authorization = `Bearer ${password}`;
  if (body) {
    return fetch(path, { method, headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }
  if (state.settings.persistent !== true && !settingsEmpty(state.settings)) {
    return fetch(path, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ settings: settingsPayload() }) });
  }
  return fetch(path, { method, headers });
}

function groupByInstitution(accounts) {
  const groups = new Map();
  for (const account of accounts) {
    const name = account.institutionName || 'Other';
    if (!groups.has(name)) groups.set(name, { name, logo: account.institutionLogo, accounts: [] });
    const group = groups.get(name);
    if (!group.logo && account.institutionLogo) group.logo = account.institutionLogo;
    group.accounts.push(account);
  }
  return [...groups.values()];
}

function pinnedAt(account) {
  const setting = state.settings.accounts[String(account.id)];
  return setting && setting.pinned ? setting.pinned : null;
}

/** Pinned accounts first, in the order they were pinned, then the rest as the server lists them. */
function orderedAccounts() {
  if (!state.data) return [];
  const pinned = state.data.accounts.filter((a) => pinnedAt(a)).sort((a, b) => pinnedAt(a) - pinnedAt(b));
  const rest = state.data.accounts.filter((a) => !pinnedAt(a));
  return pinned.concat(rest);
}

function selectedAccount() {
  const ordered = orderedAccounts();
  if (ordered.length === 0) return null;
  const wanted = state.route.accountId;
  return ordered.find((account) => String(account.id) === String(wanted)) || ordered[0];
}

// ---------- shared rendering ----------

function renderLogo(group, size = '') {
  const suffix = size ? `--${size}` : '';
  const fallback = el('div', {
    class: `logo-fallback${suffix ? ` logo-fallback${suffix}` : ''}`,
    'aria-hidden': 'true',
    text: group.name.trim().charAt(0) || '?',
  });
  if (!group.logo || !/^https?:\/\//i.test(group.logo)) return fallback;
  const img = el('img', { class: `logo${suffix ? ` logo${suffix}` : ''}`, src: group.logo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(fallback));
  return img;
}

function renderTotals(totals) {
  const items = totals && totals.length > 0 ? totals.map((total) => formatMoney(total.current, total.currency)) : ['—'];
  return el('div', { class: 'group-totals' }, items.map((text) => el('span', { text })));
}

function renderBadge(status) {
  const info = STATUS[status] || { label: status ? status.toLowerCase() : 'Unknown', kind: 'neutral' };
  return el('span', { class: `badge badge--${info.kind}`, text: info.label });
}

function pencilIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z']) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function skeletonTile() {
  return el(
    'div',
    { class: 'tile', 'aria-hidden': 'true' },
    el('div', { class: 'tile-label skeleton', text: 'Total' }),
    el('div', { class: 'tile-value skeleton', text: '0,000.00' }),
    el('div', { class: 'tile-meta skeleton', text: 'accounts' }),
  );
}

function fitTileValues(container) {
  for (const node of container.querySelectorAll('.tile-value:not(.skeleton)')) {
    node.style.fontSize = '';
    let size = Number.parseFloat(getComputedStyle(node).fontSize);
    while (size > 18 && node.scrollWidth > node.clientWidth) {
      size -= 2;
      node.style.fontSize = `${size}px`;
    }
  }
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => fitTileValues(totalsEl), 100);
});

// ---------- balances screen ----------

function renderAccountRow(account, { showInstitution = false } = {}) {
  const inactive = account.status !== 'ACTIVE';
  const meta = [];
  if (showInstitution) meta.push(el('span', { text: account.institutionName }));
  if (inactive) meta.push(renderBadge(account.status));
  if (account.balance && account.balance.treatment === 'credit-limit') {
    meta.push(el('span', { text: `${formatMoney(account.balance.available, account.balance.currency)} left of ${formatMoney(account.balance.limit, account.balance.currency)}` }));
  } else if (account.balance && account.balance.available != null && account.balance.available !== account.balance.current) {
    meta.push(el('span', { text: `Available ${formatMoney(account.balance.available, account.balance.currency)}` }));
  }
  if (account.balance && account.balance.asOf) meta.push(el('span', { text: `Synced ${relativeTime(account.balance.asOf)}`, title: new Date(account.balance.asOf).toLocaleString() }));
  if (account.error) meta.push(el('span', { class: 'row-error', text: `Balance unavailable: ${account.error}` }));

  const amount = account.balance
    ? el('div', { class: 'row-amount', text: formatMoney(account.balance.current, account.balance.currency) })
    : el('div', { class: 'row-amount row-amount--missing', text: '—' });

  return el(
    'li',
    { class: `row${inactive ? ' row--inactive' : ''}${showInstitution ? ' row--with-logo' : ''}` },
    showInstitution ? renderLogo({ name: account.institutionName, logo: account.institutionLogo }, 'small') : null,
    el(
      'div',
      { class: 'row-main' },
      el('a', { class: 'row-name', href: accountHash(account.id, state.route.period), text: account.name, title: 'See this account by month' }),
      el('div', { class: 'row-meta' }, meta),
    ),
    amount,
    el('button', { class: 'row-edit', type: 'button', 'aria-label': `Edit ${account.name}`, title: 'Edit', onclick: () => openEditor(account) }, pencilIcon()),
  );
}

function renderInstitution(group) {
  return el(
    'section',
    { class: 'institution', 'aria-label': group.name },
    el('div', { class: 'institution-head' }, renderLogo(group), el('h2', { text: group.name }), el('span', { class: 'institution-count', text: plural(group.accounts.length, 'account') })),
    el('ul', { class: 'rows' }, group.accounts.map((account) => renderAccountRow(account))),
  );
}

function renderGroup(group, accounts) {
  const members = accounts.filter((account) => account.group === group.id);
  if (members.length === 0) return null;
  return el(
    'section',
    { class: 'group', 'aria-label': group.label },
    el('div', { class: 'group-head' }, el('div', { class: 'group-title' }, el('h2', { text: group.label }), el('span', { class: 'group-count', text: plural(members.length, 'account') })), renderTotals(group.totals)),
    el('ul', { class: 'rows' }, members.map((account) => renderAccountRow(account, { showInstitution: true }))),
  );
}

function renderTile(total, hero) {
  const label = total.currency ? `Total in ${total.currency}` : 'Total (unknown currency)';
  const metaParts = [plural(total.accountCount, 'account')];
  if (total.available != null && total.available !== total.current) metaParts.push(`${formatMoney(total.available, total.currency)} available`);
  if (total.excludedCount > 0) metaParts.push(`${plural(total.excludedCount, 'account')} not counted`);
  return el(
    'div',
    { class: `tile${hero ? ' tile--hero' : ''}` },
    el('div', { class: 'tile-label', text: label }),
    el('div', { class: 'tile-value', text: formatMoney(total.current, total.currency) }),
    el('div', { class: 'tile-meta', text: metaParts.join(' · ') }),
  );
}

function renderViewToggle() {
  const hasGroups = Boolean(state.data && Array.isArray(state.data.groups) && state.data.groups.length > 0);
  viewToggleEl.hidden = !hasGroups;
  for (const button of viewToggleEl.querySelectorAll('.seg-btn')) {
    button.setAttribute('aria-pressed', button.dataset.view === state.view ? 'true' : 'false');
  }
}

function renderBalancesSkeleton() {
  viewToggleEl.hidden = true;
  totalsEl.replaceChildren(skeletonTile(), skeletonTile());
  accountsEl.replaceChildren(
    ...[0, 1].map(() =>
      el(
        'section',
        { class: 'institution', 'aria-hidden': 'true' },
        el('div', { class: 'institution-head' }, el('div', { class: 'logo-fallback skeleton' }), el('h2', { class: 'skeleton', text: 'Institution' })),
        el('ul', { class: 'rows' }, [0, 1].map(() => el('li', { class: 'row' }, el('div', { class: 'row-main' }, el('div', { class: 'row-name skeleton', text: 'Account name' })), el('div', { class: 'row-amount skeleton', text: '0,000.00' })))),
      ),
    ),
  );
}

function renderBalancesData() {
  const { data } = state;
  if (data.totals.length === 0) {
    totalsEl.replaceChildren(
      el(
        'div',
        { class: 'tile tile--empty' },
        el('div', { class: 'tile-value', text: data.accounts.length === 0 ? 'No accounts connected yet.' : 'No balances available.' }),
        el('div', { class: 'tile-meta', text: data.accounts.length === 0 ? 'Connect a bank in Lunch Flow and refresh this page.' : 'Lunch Flow returned accounts but no balances. Try refreshing in a moment.' }),
      ),
    );
  } else {
    const hero = data.totals.length === 1;
    totalsEl.replaceChildren(...data.totals.map((total) => renderTile(total, hero)));
  }
  fitTileValues(totalsEl);

  renderViewToggle();
  const byType = state.view === 'type' && Array.isArray(data.groups) && data.groups.length > 0;
  if (byType) accountsEl.replaceChildren(...data.groups.map((group) => renderGroup(group, data.accounts)).filter(Boolean));
  else accountsEl.replaceChildren(...groupByInstitution(data.accounts).map(renderInstitution));
}

function renderBalancesScreen() {
  if (state.data) renderBalancesData();
  else if (state.loading) renderBalancesSkeleton();
  else {
    viewToggleEl.hidden = true;
    totalsEl.replaceChildren();
    accountsEl.replaceChildren();
  }
}

// ---------- accounts screen: picker, months, sheet ----------

let scrolledChip = null;
let scrolledSheet = null;

function renderPicker(selected) {
  if (!state.data) {
    pickerEl.replaceChildren(...[0, 1, 2].map(() => el('span', { class: 'chip skeleton', text: 'Account name' })));
    return;
  }
  pickerEl.replaceChildren(
    ...orderedAccounts().map((account) => {
      const on = Boolean(selected && String(selected.id) === String(account.id));
      const pinned = Boolean(pinnedAt(account));
      return el(
        'span',
        { class: `chip${on ? ' chip--on' : ''}${pinned ? ' chip--pinned' : ''}` },
        el(
          'a',
          { class: 'chip-main', href: accountHash(account.id, state.route.period), 'aria-current': on ? 'true' : 'false', title: `${account.name} · ${account.institutionName}` },
          renderLogo({ name: account.institutionName, logo: account.institutionLogo }, 'chip'),
          el('span', { text: account.name }),
        ),
        el('button', {
          class: 'chip-star',
          type: 'button',
          'aria-label': `${pinned ? 'Unpin' : 'Pin'} ${account.name}`,
          'aria-pressed': pinned ? 'true' : 'false',
          title: pinned ? 'Unpin from the front' : 'Pin to the front',
          text: pinned ? '★' : '☆',
          onclick: () => togglePin(account),
        }),
      );
    }),
  );
  // Bring the chosen account into view when it changes, without fighting the user's own scrolling afterwards.
  const chosen = selected ? String(selected.id) : null;
  if (chosen && chosen !== scrolledChip) {
    scrolledChip = chosen;
    const active = pickerEl.querySelector('.chip--on');
    if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function renderPeriodPicker(selected) {
  const end = state.route.period;
  const now = currentMonth();
  const target = (key) => (selected ? accountHash(selected.id, key) : '#/accounts');

  const latest = shiftMonth(now, MAX_AHEAD);
  const options = [];
  for (let back = -MAX_AHEAD; back < MONTHS_BACK; back += 1) {
    const key = shiftMonth(now, -back);
    options.push(el('option', { value: key, text: formatWindow(key, VIEW_COLS), selected: key === end }));
  }
  if (!options.some((option) => option.value === end)) options.push(el('option', { value: end, text: formatWindow(end, VIEW_COLS), selected: true }));

  periodPickerEl.replaceChildren(
    el('a', { class: 'month-btn', href: target(shiftMonth(end, -1)), 'aria-label': 'Earlier months', text: '‹' }),
    el('select', { class: 'month-select month-select--range', 'aria-label': 'Months shown', onchange: (event) => { location.hash = target(event.target.value); } }, options),
    end < latest
      ? el('a', { class: 'month-btn', href: target(shiftMonth(end, 1)), 'aria-label': 'Later months', text: '›' })
      : el('span', { class: 'month-btn month-btn--disabled', 'aria-hidden': 'true', text: '›' }),
  );
}

function renderActivityHead(account, sheet) {
  if (!account) {
    activityHeadEl.replaceChildren();
    return;
  }
  const currency = sheet ? sheet.currency : account.currency;
  const balance = account.balance;
  const parts = [account.institutionName];
  if (balance) parts.push(balance.asOf ? `balance as Lunch Flow last synced it, ${relativeTime(balance.asOf)}` : 'balance now');
  if (balance && balance.treatment === 'credit-limit') parts.push(`${formatMoney(balance.available, balance.currency)} left of ${formatMoney(balance.limit, balance.currency)}`);
  else if (balance && balance.available != null && balance.available !== balance.current) parts.push(`available ${formatMoney(balance.available, balance.currency)}`);
  if (account.error) parts.push(`balance unavailable: ${account.error}`);
  if (currency) parts.push(`month-end figures in ${currency}`);
  activityHeadEl.replaceChildren(
    el(
      'div',
      { class: 'activity-title' },
      el('h2', { text: account.name }),
      balance ? el('strong', { class: 'activity-balance', text: formatMoney(balance.current, balance.currency) }) : null,
    ),
    el('span', { text: parts.join(' · ') }),
  );
}

function cellId(id, monthIndex) {
  return `${id}|${monthIndex}`;
}

function valueCell({ value, previous, monthIndex, month, id, cats, sign, label, clickable, good = null }) {
  const selected = Boolean(state.cell && state.cell.id === id && state.cell.monthIndex === monthIndex);
  const change = state.sheetMode === 'change';
  let text = formatCell(value);
  let tone = '';
  if (change) {
    if (previous === undefined || (!value && !previous)) text = '–';
    else {
      const delta = Math.round(((value || 0) - (previous || 0)) * 100) / 100;
      text = delta === 0 ? '0.00' : `${delta > 0 ? '+' : '-'}${plainNumber.format(Math.abs(delta))}`;
      if (delta !== 0 && good) tone = (delta > 0) === (good === 'up') ? ' sh-cell--good' : ' sh-cell--bad';
    }
  }
  const cls = `sh-cell${month.current ? ' sh-cell--cur' : ''}${text === '–' ? ' sh-cell--zero' : ''}${selected ? ' sh-cell--sel' : ''}${tone}`;
  let said = change ? `${label}, ${formatMonth(month.key)}: ${text} on the month before` : `${label}, ${formatMonth(month.key)}: ${formatCell(value)}`;

  // In Amounts mode every figure carries a marker: more, less or about the same (within 1%) as the month
  // before. The current month is only part way through, so its markers stay grey.
  let mark = null;
  if (!change && previous !== undefined && (value || previous)) {
    const delta = (value || 0) - (previous || 0);
    const same = Math.abs(delta) <= Math.max(0.5, 0.01 * Math.abs(previous || 0));
    const dir = same ? 'flat' : delta > 0 ? 'up' : 'down';
    const markTone = month.current || dir === 'flat' || !good ? 'flat' : dir === good ? 'good' : 'bad';
    mark = el('span', { class: `sh-mark sh-mark--${markTone}`, text: dir === 'up' ? '▲' : dir === 'down' ? '▼' : '→', 'aria-hidden': 'true' });
    said += `, ${dir === 'up' ? 'more than' : dir === 'down' ? 'less than' : 'about the same as'} the month before`;
  }

  if (clickable && value) {
    return el(
      'button',
      {
        class: cls,
        type: 'button',
        'aria-label': `${said}. Show transactions`,
        'aria-pressed': selected ? 'true' : 'false',
        onclick: () => {
          state.cell = selected ? null : { id, label, cats, sign, monthIndex };
          state.bulk = null;
          render();
        },
      },
      mark,
      text,
    );
  }
  return el('div', { class: cls, 'aria-label': mark ? said : null }, mark, text);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A bar per month, drawn from a zero line so negative nets and balances read too. */
function sparkline(values, months) {
  const nums = values.map((v) => Number(v) || 0);
  const n = nums.length;
  const w = n * 8 - 2;
  const h = 14;
  const max = Math.max(0, ...nums);
  const min = Math.min(0, ...nums);
  const span = max - min || 1;
  const zero = h - ((0 - min) / span) * h;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.setAttribute('aria-hidden', 'true');
  nums.forEach((v, i) => {
    const bar = document.createElementNS(SVG_NS, 'rect');
    const height = v === 0 ? 1 : Math.max(1, (Math.abs(v) / span) * h);
    const y = v >= 0 ? zero - height : zero;
    bar.setAttribute('x', String(i * 8));
    bar.setAttribute('y', String(Math.max(0, Math.min(h - 1, y))));
    bar.setAttribute('width', '6');
    bar.setAttribute('height', String(height));
    bar.setAttribute('rx', '1');
    bar.setAttribute('class', `spark-bar${months[i] && months[i].current ? ' spark-bar--cur' : ''}${v === 0 ? ' spark-bar--zero' : ''}`);
    svg.append(bar);
  });
  return svg;
}

/** Sparkline plus an arrow: rising, falling or steady over the complete months, coloured by whether that is welcome. */
function renderTrend(values, trend, good, { spark = true } = {}) {
  const months = state.sheet.data.months;
  const dir = trend.direction;
  const word = dir === 'up' ? 'Rising' : dir === 'down' ? 'Falling' : dir === 'flat' ? 'Steady' : 'Too early to say';
  const glyph = dir === 'up' ? '▲' : dir === 'down' ? '▼' : dir === 'flat' ? '→' : '·';
  const tone = !dir || dir === 'flat' || !good ? 'flat' : dir === good ? 'good' : 'bad';
  const bits = [dir ? `${word} over ${plural(trend.months, 'complete month')}` : `${word}: ${plural(trend.months, 'complete month')} so far`];
  const complete = months.filter((m) => !m.current && !m.future);
  if (trend.change != null && complete.length >= 2) {
    const last = complete[complete.length - 1];
    const prev = complete[complete.length - 2];
    const sign = trend.change > 0 ? '+' : trend.change < 0 ? '-' : '';
    const pct = trend.pct == null ? '' : ` (${Math.round(trend.pct * 100) > 0 ? '+' : ''}${Math.round(trend.pct * 100)}%)`;
    bits.push(`${formatMonth(last.key, { short: true })} vs ${formatMonth(prev.key, { short: true })}: ${sign}${plainNumber.format(Math.abs(trend.change))}${pct}`);
  }
  const title = bits.join(' · ');
  return el('span', { class: `trend trend--${tone}`, title, role: 'img', 'aria-label': title }, spark ? sparkline(values, months) : null, el('span', { class: 'trend-arrow', text: glyph }));
}

/**
 * Which columns are in view. The view is VIEW_COLS months ending on the route's month, which may run
 * past today. Months up to now are actuals (the earlier fetched months feed only the trends and the
 * forecasts); the current month, when in view, also gets a forecast column beside its "so far"; later
 * months are forecasts.
 */
function viewLayout() {
  const data = state.sheet.data;
  const proj = data.projection;
  const current = data.months.find((m) => m.current);
  const ahead = proj && current ? monthDiff(current.key, state.route.period) : 0;
  const futureCount = proj ? Math.max(0, Math.min(ahead, VIEW_COLS, proj.months.length)) : 0;
  const actualCount = Math.max(0, VIEW_COLS - futureCount);
  const first = Math.max(0, data.months.length - actualCount);
  const currentShown = Boolean(proj) && actualCount > 0;
  return { first, actualCount, currentShown, futureCount };
}

/** The forecast columns in view: the current month's full-month forecast (when it is in view), then the months after. */
function forecastColumns() {
  const data = state.sheet.data;
  const proj = data.projection;
  if (!proj) return [];
  const { currentShown, futureCount } = viewLayout();
  const columns = [];
  if (currentShown) columns.push({ key: data.months[data.months.length - 1].key, closing: proj.balance.currentMonthEnd, current: true, index: -1 });
  proj.months.slice(0, futureCount).forEach((month, i) => columns.push({ key: month.key, closing: proj.balance.closing[i], current: false, index: i }));
  return columns;
}

/** A forecast line's figure for one forecast column: the current month's, or the month ahead's. */
const lineAt = (line, column) => (column.current ? line.value : line.values[column.index]);

/** The figures of a { now, months } total laid along the forecast columns in view. */
const totalAlong = (total) => forecastColumns().map((column) => (column.current ? total.now : total.months[column.index]));

/**
 * The forecast cells for one row. `proj` is { line, kind } for a line the viewer can set an amount
 * for, { value } or { values } for computed rows, or null for an empty run of cells.
 */
function projCells(proj, label) {
  const budgetOnly = state.sheet.data.projection.mode === 'budget';
  return forecastColumns().map((column, c) => {
    const first = c === 0 ? ' sh-cell--pfirst' : '';
    if (!proj) return el('div', { class: `sh-cell sh-cell--proj${first}` });
    const value = proj.line ? lineAt(proj.line, column) : Array.isArray(proj.values) ? proj.values[c] : proj.value;
    const text = formatCell(value);
    const zero = text === '–' ? ' sh-cell--zero' : '';
    if (!proj.line) return el('div', { class: `sh-cell sh-cell--proj${first}${zero}`, text });
    const { line, kind } = proj;
    const setHere = line.setMonths ? line.setMonths[column.key] : line.set ? 'each' : null;
    const how = setHere === 'month' ? 'set by you for this month' : setHere ? 'set by you for every month' : budgetOnly ? 'not set' : 'automatic';
    const hint = setHere
      ? `${setHere === 'month' ? 'Set for this month.' : 'Set for every month.'} Automatic would be ${formatCell(line.auto)}. Tap to change it.`
      : budgetOnly
        ? `Nothing set. Automatic would be ${formatCell(line.auto)}. Tap to set an amount.`
        : kind === 'in'
          ? 'Its latest complete month. Tap to set your own amount, for every month or just this one.'
          : 'Average of the complete months in view. Tap to set your own amount, for every month or just this one.';
    return el(
      'button',
      {
        class: `sh-cell sh-cell--proj${first}${zero}${setHere ? ' sh-cell--set' : ''}`,
        type: 'button',
        'aria-label': `Forecast for ${label}, ${formatMonth(column.key)}: ${text}, ${how}. Change it`,
        title: hint,
        onclick: () => openBudget({ key: line.key, label, line, kind, month: column.key }),
      },
      setHere ? el('span', { class: 'sh-set-mark', text: setHere === 'month' ? '◆' : '✎', 'aria-hidden': 'true' }) : null,
      text,
    );
  });
}

function sheetRow({ id = null, label, values, cls, cats = null, sign = null, toggle = null, note = null, trend = id, good = null, proj = null }) {
  const data = state.sheet.data;
  const months = data.months;
  const { first } = viewLayout();
  const labelChildren = [];
  if (toggle) {
    labelChildren.push(
      el('button', {
        class: 'chev',
        type: 'button',
        'aria-label': `${toggle.open ? 'Collapse' : 'Expand'} ${label}`,
        'aria-expanded': toggle.open ? 'true' : 'false',
        text: toggle.open ? '▾' : '▸',
        onclick: () => {
          state.collapsed = { ...state.collapsed, [toggle.id]: toggle.open };
          if (!toggle.open) delete state.collapsed[toggle.id];
          writeCollapsed(state.collapsed);
          render();
        },
      }),
    );
  }
  labelChildren.push(el('span', { class: 'sh-name', text: label }));
  if (note) labelChildren.push(el('span', { class: 'tag tag--none', text: note }));
  const trendData = trend && state.sheet.data.trends ? state.sheet.data.trends[trend] : null;
  // A row that carries a note ("tap to sort") gets the arrow only, so the name still fits.
  if (trendData && values.some((v) => v)) labelChildren.push(renderTrend(values, trendData, good, { spark: !note }));
  const cells = [];
  for (let i = first; i < months.length; i += 1) {
    cells.push(valueCell({ value: values[i], previous: i > 0 ? values[i - 1] : undefined, monthIndex: i, month: months[i], id, cats, sign, label, clickable: Boolean(cats), good }));
  }
  if (data.projection) cells.push(...projCells(proj, label));
  return el('div', { class: `sh-row sh-row--${cls}` }, el('div', { class: 'sh-lbl' }, labelChildren), ...cells);
}

function sectionRow(label) {
  const data = state.sheet.data;
  const cells = data.months.slice(viewLayout().first).map((month) => el('div', { class: `sh-cell${month.current ? ' sh-cell--cur' : ''}` }));
  if (data.projection) cells.push(...projCells(null, label));
  return el('div', { class: 'sh-row sh-row--sec' }, el('div', { class: 'sh-lbl', text: label }), ...cells);
}

function renderSheet() {
  const data = state.sheet.data;
  const proj = data.projection;
  const layout = viewLayout();
  const { first, actualCount } = layout;
  const columns = forecastColumns();
  sheetEl.style.setProperty('--cols', String(actualCount));
  sheetEl.style.setProperty('--pcols', String(columns.length));
  sheetEl.classList.toggle('sheet--proj', columns.length > 0 && actualCount > 0);
  sheetEl.classList.toggle('sheet--noactual', columns.length > 0 && actualCount === 0);
  const anyPositive = (values) => values.some((v) => v > 0);
  const rows = [];

  const balanceCell = (closing) => el('span', { class: `sh-bal${closing == null ? ' sh-bal--none' : ''}`, text: closing == null ? '–' : `${closing < 0 ? '-' : ''}${plainNumber.format(Math.abs(closing))}` });
  rows.push(
    el(
      'div',
      { class: 'sh-row sh-row--head' },
      el(
        'div',
        { class: 'sh-lbl sh-lbl--head' },
        el('span', { text: 'Category' }),
        el('span', { class: 'sh-so-far', text: state.sheetMode === 'change' ? 'change on the month before' : 'balance at month end' }),
      ),
      ...data.months.slice(first).map((month, i) =>
        el(
          'div',
          { class: `sh-cell${month.current ? ' sh-cell--cur' : ''}` },
          el('span', { class: 'sh-month' }, formatMonth(month.key, { short: true }), month.current ? el('span', { class: 'sh-so-far sh-so-far--inline', text: 'so far' }) : null),
          balanceCell(data.balance.closing[first + i]),
        ),
      ),
      ...columns.map((column, c) =>
        el(
          'div',
          { class: `sh-cell sh-cell--proj${c === 0 ? ' sh-cell--pfirst' : ''}`, title: column.current ? 'The whole month as forecast, and the balance expected at its end' : 'Projected balance at the end of the month' },
          el('span', { class: 'sh-month' }, formatMonth(column.key, { short: true }), el('span', { class: 'sh-so-far sh-so-far--inline', text: 'forecast' })),
          balanceCell(column.closing),
        ),
      ),
    ),
  );

  // Projection lines by category id, so each row can find its forecast.
  const pIncome = proj ? new Map(proj.income.rows.map((row) => [row.id, row])) : new Map();
  const pOut = proj ? new Map(proj.outgoings.rows.map((row) => [row.id, row])) : new Map();
  const forecastOf = (line) => (line ? Math.max(line.value || 0, ...(line.values || [])) : 0);

  // Rows with nothing in any month in view, and nothing forecast, are hidden (per account, since each
  // is used for different things) unless the viewer asks to see them.
  const hide = state.hideEmpty;
  let hiddenRows = 0;
  const skip = (values, line = null) => {
    if (!hide || anyPositive(values) || forecastOf(line) > 0) return false;
    hiddenRows += 1;
    return true;
  };
  const lineProj = (line, kind) => (proj && line ? { line, kind } : null);
  const valueProj = (total) => (proj && total ? { values: totalAlong(total) } : null);

  // `good` says which way is welcome: income up, spending down. It colours the trend arrow and the Change view.
  rows.push(sectionRow('Income'));
  for (const row of data.income.rows) {
    const line = pIncome.get(row.id);
    if (skip(row.values, line)) continue;
    rows.push(sheetRow({ id: `in:${row.id}`, label: row.label, values: row.values, cls: 'cat', cats: [row.id], sign: 'in', good: 'up', proj: lineProj(line, 'in') }));
  }
  if (!skip(data.income.uncategorised, proj && proj.income.uncategorised)) {
    rows.push(
      sheetRow({
        id: 'in:none',
        label: 'Uncategorised',
        values: data.income.uncategorised,
        cls: 'cat',
        cats: [null],
        sign: 'in',
        note: anyPositive(data.income.uncategorised) ? 'tap to sort' : null,
        good: 'up',
        proj: lineProj(proj && proj.income.uncategorised, 'in'),
      }),
    );
  }
  rows.push(sheetRow({ label: 'Total income', values: data.income.total, cls: 'tot', trend: 'in:total', good: 'up', proj: valueProj(proj && proj.income.total) }));

  rows.push(sectionRow('Outgoings'));
  for (const row of data.outgoings.rows) {
    const pRow = pOut.get(row.id);
    if (row.subs) {
      if (hide && !anyPositive(row.values) && forecastOf(pRow) === 0) {
        hiddenRows += 1 + row.subs.length;
        continue;
      }
      const open = !state.collapsed[row.id];
      const pSubs = pRow && pRow.subs ? new Map(pRow.subs.map((sub) => [sub.id, sub])) : new Map();
      rows.push(
        sheetRow({ id: `out:${row.id}`, label: row.label, values: row.values, cls: 'par', cats: row.subs.map((sub) => sub.id), sign: 'out', toggle: { id: row.id, open }, good: 'down', proj: lineProj(pRow, 'out') }),
      );
      for (const sub of row.subs) {
        const line = pSubs.get(sub.id);
        if (skip(sub.values, line)) continue;
        if (open) rows.push(sheetRow({ id: `out:${sub.id}`, label: sub.label, values: sub.values, cls: 'sub', cats: [sub.id], sign: 'out', good: 'down', proj: lineProj(line, 'out') }));
      }
    } else {
      if (skip(row.values, pRow)) continue;
      rows.push(sheetRow({ id: `out:${row.id}`, label: row.label, values: row.values, cls: 'cat', cats: [row.id], sign: 'out', good: 'down', proj: lineProj(pRow, 'out') }));
    }
  }
  if (!skip(data.outgoings.uncategorised, proj && proj.outgoings.uncategorised)) {
    rows.push(
      sheetRow({
        id: 'out:none',
        label: 'Uncategorised',
        values: data.outgoings.uncategorised,
        cls: 'cat',
        cats: [null],
        sign: 'out',
        note: anyPositive(data.outgoings.uncategorised) ? 'tap to sort' : null,
        good: 'down',
        proj: lineProj(proj && proj.outgoings.uncategorised, 'out'),
      }),
    );
  }
  rows.push(sheetRow({ label: 'Total outgoings', values: data.outgoings.total, cls: 'tot', trend: 'out:total', good: 'down', proj: valueProj(proj && proj.outgoings.total) }));
  rows.push(sheetRow({ label: 'Net', values: data.net, cls: 'net', trend: 'net', good: 'up', proj: valueProj(proj && proj.net) }));

  const trIn = proj ? proj.transfers.in : null;
  const trOut = proj ? proj.transfers.out : null;
  if (!hide || anyPositive(data.transfers.in) || anyPositive(data.transfers.out) || forecastOf(trIn) > 0 || forecastOf(trOut) > 0) {
    rows.push(sectionRow('Transfers'));
    if (!skip(data.transfers.in, trIn)) rows.push(sheetRow({ id: 'tr:in', label: 'Transfers in', values: data.transfers.in, cls: 'cat', cats: [TRANSFER], sign: 'in', proj: lineProj(trIn, 'tr') }));
    if (!skip(data.transfers.out, trOut)) rows.push(sheetRow({ id: 'tr:out', label: 'Transfers out', values: data.transfers.out, cls: 'cat', cats: [TRANSFER], sign: 'out', proj: lineProj(trOut, 'tr') }));
  } else hiddenRows += 2;

  emptyToggle.textContent = hide ? `Show ${plural(hiddenRows, 'unused row')}` : 'Hide unused rows';
  emptyToggle.hidden = hide && hiddenRows === 0;
  sheetToolsSep.hidden = emptyToggle.hidden;

  rows.push(sectionRow('Balance'));
  // Forecast balances: the current month's forecast column opens on its actual opening balance and closes on
  // the expected month end; each later month opens where the one before closed.
  const closingCols = columns.map((column) => column.closing);
  const openingCols = columns.map((column, c) => (c > 0 ? closingCols[c - 1] : column.current ? data.balance.opening[data.months.length - 1] : proj ? proj.balance.currentMonthEnd : null));
  rows.push(sheetRow({ label: 'Opening balance', values: data.balance.opening, cls: 'tot', proj: proj ? { values: openingCols } : null }));
  rows.push(sheetRow({ label: 'Closing balance', values: data.balance.closing, cls: 'tot', trend: 'bal:closing', good: 'up', proj: proj ? { values: closingCols } : null }));

  for (const button of sheetModeEl.querySelectorAll('.seg-btn')) {
    button.setAttribute('aria-pressed', button.dataset.mode === state.sheetMode ? 'true' : 'false');
  }
  forecastModeEl.hidden = !proj;
  for (const button of forecastModeEl.querySelectorAll('.seg-btn')) {
    button.setAttribute('aria-pressed', proj && button.dataset.fmode === proj.mode ? 'true' : 'false');
  }

  if (proj) {
    const current = data.months.find((m) => m.current);
    const bits = [
      proj.mode === 'budget'
        ? 'Budget mode: only the amounts you set count in the forecasts. Tap a forecast to set one; anything unset counts as nothing.'
        : `Forecasts: outgoings and transfers at the average of the last ${plural(proj.basis.complete, 'complete month')}, income at its latest month. Tap a forecast to set your own amount.`,
    ];
    if (proj.balance.currentMonthEnd != null && current) {
      bits.push(`Balance now ${formatMoney(proj.balance.now, data.currency)}, expected ${formatMoney(proj.balance.currentMonthEnd, data.currency)} by the end of ${formatMonth(current.key)} once what is still due this month has gone through.`);
    }
    projNoteEl.textContent = bits.join(' ');
  }
  projNoteEl.hidden = !proj;

  sheetEl.replaceChildren(...rows);

  // On narrow screens only a couple of months fit: start with the current month in view (the forecasts
  // follow it to the right), and stay put on later re-renders.
  if (state.sheet.key !== scrolledSheet) {
    scrolledSheet = state.sheet.key;
    const current = sheetEl.querySelector('.sh-row--head .sh-cell--cur');
    const label = sheetEl.querySelector('.sh-row--head .sh-lbl');
    if (!current) sheetWrapEl.scrollLeft = sheetWrapEl.scrollWidth;
    else if (current.offsetLeft + current.offsetWidth > sheetWrapEl.clientWidth) sheetWrapEl.scrollLeft = Math.max(0, current.offsetLeft - (label ? label.offsetWidth : 0));
  }
}

function renderSheetSkeleton() {
  sheetEl.style.setProperty('--cols', String(VIEW_COLS));
  sheetEl.classList.remove('sheet--proj', 'sheet--noactual');
  forecastModeEl.hidden = true;
  const rows = [];
  for (let r = 0; r < 12; r += 1) {
    rows.push(
      el(
        'div',
        { class: `sh-row ${r === 0 ? 'sh-row--head' : 'sh-row--cat'}`, 'aria-hidden': 'true' },
        el('div', { class: 'sh-lbl' }, el('span', { class: 'skeleton', text: 'Category name' })),
        ...Array.from({ length: VIEW_COLS }, () => el('div', { class: 'sh-cell' }, el('span', { class: 'skeleton', text: '0,000.00' }))),
      ),
    );
  }
  sheetEl.replaceChildren(...rows);
}

function cellTransactions() {
  const { cell } = state;
  const data = state.sheet.data;
  if (!cell || !data) return [];
  const month = data.months[cell.monthIndex];
  if (!month) return [];
  return data.transactions.filter((t) => t.month === month.key && (cell.sign === 'in' ? t.amount >= 0 : t.amount < 0) && partsIn(t, cell.cats).length > 0);
}

/** The parts of a transaction that land in one of the given categories (one part unless it is split). */
function partsIn(txn, cats) {
  return (txn.parts || [{ category: txn.category, amount: Math.abs(txn.amount) }]).filter((part) => cats.includes(part.category));
}

function amountIn(txn, cats) {
  return partsIn(txn, cats).reduce((sum, part) => sum + part.amount, 0);
}

function renderDrill() {
  const { cell } = state;
  const data = state.sheet.data;
  if (!cell || !data) {
    drillEl.hidden = true;
    drillEl.replaceChildren();
    state.bulk = null;
    return;
  }
  const month = data.months[cell.monthIndex];
  const list = cellTransactions();
  const total = list.reduce((sum, t) => sum + amountIn(t, cell.cats), 0);
  // Bulk select: tick several transactions and file them together.
  const bulk = state.bulk && state.bulk.on ? state.bulk : null;
  const keys = bulk ? bulk.keys : null;
  const selected = bulk ? list.filter((t) => keys.has(t.key)) : [];
  const allSelected = Boolean(bulk) && list.length > 0 && selected.length === list.length;
  const rows = list.map((t) => {
    const currency = t.currency || data.currency;
    const meta = [];
    if (t.pending) meta.push(el('span', { class: 'badge badge--warning', text: 'Pending' }));
    if (t.merchant && t.description && t.merchant !== t.description) meta.push(el('span', { text: t.description }));
    // For anything still unfiled, what Lunch Flow itself called it is often the best clue.
    if (!t.category && t.providerCategory) meta.push(el('span', { text: `Lunch Flow: ${t.providerCategory}` }));
    if (t.split) meta.push(el('span', { text: `${formatMoney(Math.abs(t.amount), currency)} split: ${t.parts.map((part) => `${part.categoryLabel} ${formatMoney(part.amount, currency)}`).join(' · ')}` }));
    const here = amountIn(t, cell.cats);
    const content = [
      el('span', { class: 'txn-date', text: formatDay(t.date, { weekday: false }) }),
      el('span', { class: 'txn-main' }, el('span', { class: 'txn-desc', text: t.merchant || t.description || 'Transaction' }), el('span', { class: 'row-meta' }, meta)),
      el('span', { class: `tag${t.split || t.category ? '' : ' tag--none'}`, text: t.split ? 'Split' : t.categoryLabel }),
      el('span', { class: `txn-amount${t.amount >= 0 ? ' txn-amount--in' : ''}`, text: formatSigned(t.amount >= 0 ? here : -here, currency) }),
    ];
    if (bulk) {
      const checked = keys.has(t.key);
      return el(
        'label',
        { class: `txn txn--pick${checked ? ' txn--checked' : ''}` },
        el('input', {
          class: 'txn-check',
          type: 'checkbox',
          checked: checked ? true : null,
          'aria-label': `Select ${t.merchant || t.description}`,
          onchange: (event) => {
            if (event.target.checked) keys.add(t.key);
            else keys.delete(t.key);
            renderDrill();
          },
        }),
        ...content,
      );
    }
    return el('button', { class: 'txn', type: 'button', 'aria-label': `Change category for ${t.merchant || t.description}`, onclick: () => openCatPicker(t) }, ...content);
  });
  drillEl.replaceChildren(
    el(
      'div',
      { class: 'txns-head' },
      el(
        'span',
        { class: 'txns-head-title' },
        el('h2', { text: `${cell.label} · ${formatMonth(month.key)}` }),
        el('span', { class: 'group-count', text: bulk ? `${selected.length} of ${list.length} selected` : plural(list.length, 'transaction') }),
      ),
      el(
        'span',
        { class: 'txns-head-actions' },
        ...(bulk
          ? [
              el('button', {
                class: 'link-btn',
                type: 'button',
                text: allSelected ? 'Select none' : 'Select all',
                onclick: () => {
                  if (allSelected) keys.clear();
                  else for (const t of list) keys.add(t.key);
                  renderDrill();
                },
              }),
              el('button', { class: 'btn btn--small', type: 'button', text: `Categorise ${selected.length}…`, disabled: selected.length === 0, onclick: () => openCatPicker(selected) }),
              el('button', {
                class: 'link-btn',
                type: 'button',
                text: 'Done',
                onclick: () => {
                  state.bulk = null;
                  renderDrill();
                },
              }),
            ]
          : [
              el('span', { class: 'group-total', text: formatMoney(total, data.currency) }),
              list.length > 1
                ? el('button', {
                    class: 'link-btn',
                    type: 'button',
                    text: 'Select',
                    onclick: () => {
                      state.bulk = { on: true, keys: new Set() };
                      renderDrill();
                    },
                  })
                : null,
              el('button', {
                class: 'link-btn',
                type: 'button',
                text: 'Close',
                onclick: () => {
                  state.cell = null;
                  render();
                },
              }),
            ]),
      ),
    ),
    ...(rows.length ? rows : [el('p', { class: 'txns-empty', text: 'No transactions here.' })]),
    el('div', {
      class: 'txns-foot',
      text: bulk
        ? 'Tick the transactions to file together, then Categorise. "Always for" files every merchant among them the same way in every month.'
        : 'Tap a transaction to change its category. "Always for" a merchant files it the same way in every month.',
    }),
  );
  drillEl.hidden = false;
}

function renderAccountsScreen() {
  const account = selectedAccount();
  renderPicker(account);
  renderPeriodPicker(account);
  sheetNoteEl.hidden = true;
  sheetToolsEl.hidden = true;
  projNoteEl.hidden = true;

  if (!state.data) {
    renderActivityHead(null);
    if (state.loading) renderSheetSkeleton();
    else sheetEl.replaceChildren();
    drillEl.hidden = true;
    return;
  }
  if (!account) {
    renderActivityHead(null);
    sheetEl.replaceChildren(el('div', { class: 'txns-empty', text: 'No accounts connected yet. Connect a bank in Lunch Flow and refresh this page.' }));
    drillEl.hidden = true;
    return;
  }

  const sheet = state.sheet;
  const current = sheet.data && String(sheet.data.account.id) === String(account.id) ? sheet.data : null;
  renderActivityHead(account, current);
  if (current) {
    renderSheet();
    renderDrill();
    sheetNoteEl.hidden = false;
    sheetToolsEl.hidden = false;
  } else if (sheet.loading) {
    renderSheetSkeleton();
    drillEl.hidden = true;
  } else {
    sheetEl.replaceChildren();
    drillEl.hidden = true;
  }
}

// ---------- pinning ----------

async function togglePin(account) {
  const id = String(account.id);
  const next = cloneSettings();
  const entry = { ...(next.accounts[id] || {}) };
  if (entry.pinned) delete entry.pinned;
  else entry.pinned = Date.now();
  if (Object.keys(entry).length > 0) next.accounts[id] = entry;
  else delete next.accounts[id];
  try {
    await saveSettings(next);
  } catch (err) {
    state.error = err && err.message ? err.message : 'Could not save.';
  }
  render();
}

// ---------- category picker ----------

function catPickerGroups(txn) {
  const cats = state.sheet.data.categories;
  const groups = [];
  if (txn.amount >= 0) groups.push({ label: 'Income', items: cats.income });
  else {
    for (const entry of cats.outgoings) groups.push({ label: entry.label, items: entry.subs || [{ id: entry.id, label: entry.label }] });
  }
  groups.push({ label: 'Not counted', items: [{ id: TRANSFER, label: 'Transfer between my accounts' }, { id: '', label: 'Uncategorised' }] });
  return groups;
}

function renderCatPickerGroups() {
  const { txn, choice } = state.catPicker;
  catpickerGroups.replaceChildren(
    ...catPickerGroups(txn).map((group) =>
      el(
        'div',
        { class: 'optgroup' },
        el('span', { class: 'optlabel', text: group.label }),
        el(
          'div',
          { class: 'opts' },
          group.items.map((item) =>
            el('button', {
              class: 'opt',
              type: 'button',
              text: item.label,
              'aria-pressed': choice === item.id ? 'true' : 'false',
              onclick: () => {
                state.catPicker.choice = item.id;
                renderCatPickerGroups();
              },
            }),
          ),
        ),
      ),
    ),
  );
}

// ----- splitting one transaction between categories -----

const money2 = (value) => Math.round(value * 100) / 100;

function splitTotal() {
  return money2(Math.abs(state.catPicker.txn.amount));
}

function splitLeftAmount() {
  const allocated = state.catPicker.parts.reduce((sum, part) => sum + (Number.isFinite(part.amount) ? part.amount : 0), 0);
  return money2(splitTotal() - allocated);
}

function catPickerOptions(txn, selected) {
  return catPickerGroups(txn).map((group) =>
    el(
      'optgroup',
      { label: group.label },
      group.items.map((item) => el('option', { value: item.id, text: item.label, selected: (item.id || '') === (selected || '') })),
    ),
  );
}

function renderSplitFoot() {
  const { txn, parts } = state.catPicker;
  const currency = txn.currency || state.sheet.data.currency;
  const total = splitTotal();
  const left = splitLeftAmount();
  const incomplete = parts.some((part) => !Number.isFinite(part.amount) || part.amount <= 0);
  let text;
  if (incomplete) text = `${formatMoney(total, currency)} to share out · every part needs an amount`;
  else if (Math.abs(left) < 0.005) text = `All ${formatMoney(total, currency)} shared out`;
  else if (left > 0) text = `${formatMoney(left, currency)} of ${formatMoney(total, currency)} still to share out`;
  else text = `${formatMoney(-left, currency)} over the ${formatMoney(total, currency)} total`;
  splitLeft.textContent = text;
  splitLeft.classList.toggle('split-left--over', left < -0.005);
  catpickerSave.disabled = incomplete || Math.abs(left) >= 0.005;
}

function renderSplitEditor() {
  const { txn, parts } = state.catPicker;
  splitRows.replaceChildren(
    ...parts.map((part, i) =>
      el(
        'div',
        { class: 'split-row' },
        el(
          'select',
          {
            'aria-label': `Category for part ${i + 1}`,
            onchange: (event) => {
              part.category = event.target.value;
            },
          },
          catPickerOptions(txn, part.category),
        ),
        el('input', {
          type: 'number',
          inputmode: 'decimal',
          step: '0.01',
          min: '0',
          value: Number.isFinite(part.amount) ? String(part.amount) : '',
          'aria-label': `Amount for part ${i + 1}`,
          oninput: (event) => {
            const value = Number(event.target.value);
            part.amount = event.target.value === '' || !Number.isFinite(value) ? NaN : money2(value);
            renderSplitFoot();
          },
        }),
        el('button', {
          class: 'split-remove',
          type: 'button',
          text: '×',
          'aria-label': `Remove part ${i + 1}`,
          disabled: parts.length <= 1,
          onclick: () => {
            parts.splice(i, 1);
            renderSplitEditor();
          },
        }),
      ),
    ),
  );
  splitAdd.disabled = parts.length >= 20;
  renderSplitFoot();
}

function renderCatPickerMode() {
  const split = state.catPicker.mode === 'split';
  catpickerGroups.hidden = split;
  catpickerScope.hidden = split;
  splitEditor.hidden = !split;
  splitToggle.textContent = split ? 'File it all under one category instead' : 'Split between categories';
  if (split) renderSplitEditor();
  else {
    renderCatPickerGroups();
    catpickerSave.disabled = false;
  }
}

splitToggle.addEventListener('click', () => {
  const picker = state.catPicker;
  if (!picker) return;
  if (picker.mode === 'split') picker.mode = 'one';
  else {
    picker.mode = 'split';
    if (picker.parts.length === 0) picker.parts = [{ category: picker.choice || '', amount: splitTotal() }, { category: '', amount: NaN }];
  }
  renderCatPickerMode();
});

splitAdd.addEventListener('click', () => {
  const picker = state.catPicker;
  if (!picker || picker.mode !== 'split' || picker.parts.length >= 20) return;
  const left = splitLeftAmount();
  picker.parts.push({ category: '', amount: left > 0 ? left : NaN });
  renderSplitEditor();
  const selects = splitRows.querySelectorAll('select');
  if (selects.length) selects[selects.length - 1].focus();
});

// How card processors and marketplaces show up on statements, for the "what is this?" moment.
const PAYMENT_PREFIXES = [
  [/^sq\s*\*/i, 'Paid through Square, a card reader used by small shops, cafés and market stalls. The name after "SQ *" is the trader; the town is often tacked on the end.'],
  [/^(paypal|pp)\s*\*/i, 'Paid through PayPal. The name after the star is the seller.'],
  [/^sumup\s*\*?/i, 'Paid through SumUp, a card reader used by small traders. The name after it is the trader.'],
  [/^(zettle|iz)\s*\*/i, 'Paid through Zettle (formerly iZettle), a card reader used by small traders.'],
  [/^sp\s+/i, 'A Shopify web shop. The name after "SP" is the shop.'],
  [/^tst\s*\*/i, 'Paid through Toast, a till system used by restaurants and bars.'],
  [/^crv\s*\*/i, 'Paid with a Curve card. The name after "CRV*" is the real merchant.'],
  [/^(amzn|amazon)/i, 'Amazon: a marketplace order, Prime, or a digital purchase.'],
  [/^google\s*\*/i, 'A Google purchase: Play Store, YouTube, storage or an app subscription.'],
  [/^apple\.com\/bill/i, 'An App Store purchase or an Apple subscription.'],
  [/^(www\.|http)/i, 'An online purchase; the address is the shop.'],
];

const humanKey = (key) => {
  const words = key.replace(/[._-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Fill the Details block of the picker with everything known about one transaction. */
function renderTxnDetails(txn) {
  const currency = txn.currency || state.sheet.data.currency;
  const details = txn.details && typeof txn.details === 'object' ? txn.details : {};
  const rows = [];
  let when = formatDay(txn.date);
  if (details.time) {
    const stamp = new Date(details.time);
    if (!Number.isNaN(stamp.getTime())) when += ` · ${stamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  rows.push(['Date', when]);
  rows.push(['Amount', formatSigned(txn.amount, currency)]);
  if (txn.merchant) rows.push(['Merchant', txn.merchant]);
  if (txn.description && txn.description !== txn.merchant) rows.push(['Description', txn.description]);
  if (txn.providerCategory) rows.push(['Lunch Flow says', txn.providerCategory]);
  if (txn.pending) rows.push(['Status', 'Pending']);
  if (txn.id) rows.push(['Lunch Flow id', txn.id]);
  for (const [key, value] of Object.entries(details)) if (key !== 'time') rows.push([humanKey(key), String(value)]);
  catpickerDl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));

  const text = txn.merchant || txn.description || '';
  const known = PAYMENT_PREFIXES.find(([re]) => re.test(text) || re.test(txn.description || ''));
  catpickerKnow.textContent = known ? known[1] : '';
  catpickerKnow.hidden = !known;
  const query = text.replace(/^(sq|paypal|pp|sumup|zettle|iz|tst|crv|google)\s*\*\s*/i, '').replace(/^sp\s+/i, '').trim();
  catpickerLookup.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  catpickerLookup.hidden = !query;
}

/** Open the picker for one transaction, or for a list of them to file together. */
function openCatPicker(target) {
  if (typeof catpickerEl.showModal !== 'function') return;
  const list = Array.isArray(target) ? target : [target];
  if (list.length === 0) return;
  const txn = list[0];
  const bulk = list.length > 1;
  const split = !bulk && Boolean(txn.split) && Array.isArray(txn.parts) && txn.parts.length > 0;
  const shared = list.every((t) => (t.category || '') === (txn.category || '')) ? txn.category || '' : '';
  state.catPicker = {
    txn,
    list,
    bulk,
    choice: shared,
    mode: split ? 'split' : 'one',
    parts: split ? txn.parts.map((part) => ({ category: part.category || '', amount: money2(part.amount) })) : [],
  };
  const currency = txn.currency || state.sheet.data.currency;
  const merchantKeys = [...new Set(list.map((t) => t.merchantKey).filter(Boolean))];
  if (bulk) {
    const names = [...new Set(list.map((t) => t.merchant || t.description).filter(Boolean))];
    const sum = list.reduce((acc, t) => acc + t.amount, 0);
    catpickerTitle.textContent = plural(list.length, 'transaction');
    catpickerSub.textContent = `${formatSigned(sum, currency)} in total · ${names.length === 1 ? names[0] : plural(names.length, 'merchant')}`;
    scopeMerchantLabel.textContent = merchantKeys.length === 1 ? `Always for ${names[0]}` : `Always for these ${plural(merchantKeys.length, 'merchant')}`;
    scopeOneLabel.textContent = 'Just these';
    catpickerDetails.hidden = true;
  } else {
    catpickerTitle.textContent = txn.merchant || txn.description || 'Transaction';
    catpickerSub.textContent = `${formatDay(txn.date)} · ${formatSigned(txn.amount, currency)}${txn.description && txn.description !== txn.merchant ? ` · ${txn.description}` : ''}`;
    scopeMerchantLabel.textContent = merchantKeys.length ? `Always for ${txn.merchant || txn.description}` : 'Always for this merchant';
    scopeOneLabel.textContent = 'Just this one';
    renderTxnDetails(txn);
    catpickerDetails.hidden = false;
    catpickerDetails.open = false;
  }
  const merchant = merchantKeys.length > 0;
  scopeMerchant.disabled = !merchant;
  scopeMerchant.checked = merchant;
  scopeOne.checked = !merchant;
  // A split is one transaction's business; with several selected the toggle goes.
  splitToggle.hidden = bulk;
  if (splitToggle.nextElementSibling) splitToggle.nextElementSibling.hidden = bulk;
  catpickerError.hidden = true;
  catpickerError.textContent = '';
  catpickerHint.textContent =
    state.settings.persistent === true
      ? 'Saved for every device you open this page on.'
      : 'Saved in this browser only. To share across devices, add Upstash Redis under Storage in your Vercel project.';
  catpickerSave.disabled = false;
  renderCatPickerMode();
  catpickerEl.showModal();
}

function closeCatPicker() {
  state.catPicker = null;
  if (catpickerEl.open) catpickerEl.close();
}

async function submitCatPicker(event) {
  event.preventDefault();
  const picker = state.catPicker;
  if (!picker) return;
  const { txn, choice, mode, parts } = picker;
  const next = cloneSettings();
  if (picker.bulk) {
    for (const t of picker.list) {
      delete next.splits[t.key];
      if (scopeMerchant.checked && t.merchantKey) {
        if (choice) next.rules[t.merchantKey] = choice;
        else delete next.rules[t.merchantKey];
        delete next.transactions[t.key];
      } else if (choice) next.transactions[t.key] = choice;
      else delete next.transactions[t.key];
    }
  } else if (mode === 'split') {
    const clean = parts.filter((part) => Number.isFinite(part.amount) && part.amount > 0).map((part) => ({ category: part.category || null, amount: part.amount }));
    if (clean.length === 0 || Math.abs(splitLeftAmount()) >= 0.005) {
      catpickerError.textContent = 'Share out the whole amount first.';
      catpickerError.hidden = false;
      return;
    }
    next.splits[txn.key] = clean;
  } else {
    // Filing under one category, whatever the scope, undoes any split of this transaction.
    delete next.splits[txn.key];
    if (scopeMerchant.checked && txn.merchantKey) {
      if (choice) next.rules[txn.merchantKey] = choice;
      else delete next.rules[txn.merchantKey];
      // A per-transaction choice would still win; clear it so the merchant rule applies here too.
      delete next.transactions[txn.key];
    } else if (choice) next.transactions[txn.key] = choice;
    else delete next.transactions[txn.key];
  }

  catpickerSave.disabled = true;
  try {
    await saveSettings(next);
  } catch (err) {
    catpickerError.textContent = err && err.message ? err.message : 'Could not save.';
    catpickerError.hidden = false;
    catpickerSave.disabled = false;
    return;
  }
  closeCatPicker();
  state.bulk = null;
  ensureSheet({ force: true });
}

catpickerForm.addEventListener('submit', submitCatPicker);
catpickerCancel.addEventListener('click', closeCatPicker);
catpickerEl.addEventListener('close', () => {
  state.catPicker = null;
});

// ---------- categories added in the app ----------

const slug = (label) =>
  String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

function currentTree() {
  return state.sheet.data ? state.sheet.data.categories : { income: [], outgoings: [] };
}

function allCategoryIds() {
  const cats = currentTree();
  const ids = new Set(cats.income.map((c) => c.id));
  for (const entry of cats.outgoings) {
    ids.add(entry.id);
    if (entry.subs) for (const sub of entry.subs) ids.add(sub.id);
  }
  for (const c of state.settings.categories || []) ids.add(c.id);
  ids.add(TRANSFER);
  return ids;
}

function customId(label, taken) {
  const base = `u-${slug(label) || 'category'}`;
  let id = base;
  let n = 2;
  while (taken.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  taken.add(id);
  return id;
}

/** Put freshly added categories into the tree the page already holds, so the picker can offer them at once. */
function applyToTree(added) {
  const cats = currentTree();
  for (const c of added) {
    const item = { id: c.id, label: c.label, custom: true };
    if (c.kind === 'in') cats.income.push(item);
    else if (c.group) cats.outgoings.push({ ...item, subs: [] });
    else {
      const parent = c.parent ? cats.outgoings.find((e) => e.id === c.parent && e.subs) : null;
      if (parent) parent.subs.push(item);
      else cats.outgoings.push({ ...item, subs: null });
    }
  }
}

function removeFromTree(id) {
  const cats = currentTree();
  cats.income = cats.income.filter((c) => c.id !== id);
  const kept = [];
  for (const entry of cats.outgoings) {
    if (entry.id === id) {
      // The group goes; its sub-categories stay as categories of their own, as the server does it.
      if (entry.subs) for (const sub of entry.subs) kept.push({ ...sub, subs: null });
      continue;
    }
    if (entry.subs) entry.subs = entry.subs.filter((sub) => sub.id !== id);
    kept.push(entry);
  }
  cats.outgoings = kept;
}

function renderNewCatForm() {
  const income = newcatIn.checked;
  newcatUnderField.hidden = income;
  newcatGroupField.hidden = income || newcatUnder.value !== '__new';
  newcatSave.textContent = 'Add';
}

function renderMine() {
  const mine = state.settings.categories || [];
  newcatMine.hidden = mine.length === 0;
  if (mine.length === 0) {
    newcatMine.replaceChildren();
    return;
  }
  const labelFor = (id) => {
    for (const entry of currentTree().outgoings) if (entry.id === id) return entry.label;
    const own = mine.find((c) => c.id === id);
    return own ? own.label : id;
  };
  newcatMine.replaceChildren(
    el('div', { class: 'mine-title', text: 'Added here' }),
    ...mine.map((c) =>
      el(
        'div',
        { class: 'mine-row' },
        el('span', {}, `${c.label} `, el('span', { class: 'mine-where', text: c.kind === 'in' ? '· income' : c.group ? '· group' : c.parent ? `· under ${labelFor(c.parent)}` : '· outgoing' })),
        el('button', { class: 'link-btn', type: 'button', text: 'Remove', 'aria-label': `Remove ${c.label}`, onclick: () => removeCustom(c.id) }),
      ),
    ),
  );
}

function openNewCat() {
  if (typeof newcatEl.showModal !== 'function' || !state.sheet.data) return;
  newcatName.value = '';
  newcatGroup.value = '';
  newcatOut.checked = true;
  newcatIn.checked = false;
  const parents = currentTree().outgoings.filter((entry) => entry.subs);
  newcatUnder.replaceChildren(
    el('option', { value: '', text: 'Its own category' }),
    ...parents.map((entry) => el('option', { value: entry.id, text: entry.label })),
    el('option', { value: '__new', text: 'A new group…' }),
  );
  // Suggest the group the viewer is looking at: the first parent chosen in the picker, if any.
  if (state.catPicker && state.catPicker.choice) {
    const parent = parents.find((entry) => entry.subs.some((sub) => sub.id === state.catPicker.choice));
    if (parent) newcatUnder.value = parent.id;
  }
  newcatError.hidden = true;
  newcatError.textContent = '';
  newcatHint.textContent = state.settings.persistent === true ? 'Saved for every device you open this page on.' : 'Saved in this browser only.';
  newcatSave.disabled = false;
  renderNewCatForm();
  renderMine();
  newcatEl.showModal();
  newcatName.focus();
}

function closeNewCat() {
  if (newcatEl.open) newcatEl.close();
}

function showNewCatError(message) {
  newcatError.textContent = message;
  newcatError.hidden = false;
}

async function submitNewCat(event) {
  event.preventDefault();
  const name = newcatName.value.trim().replace(/\s+/g, ' ');
  if (!name) {
    showNewCatError('Give it a name.');
    newcatName.focus();
    return;
  }
  const kind = newcatIn.checked ? 'in' : 'out';
  const taken = allCategoryIds();
  const added = [];
  if (kind === 'in') added.push({ id: customId(name, taken), label: name, kind: 'in', parent: null, group: false });
  else if (newcatUnder.value === '__new') {
    const groupName = newcatGroup.value.trim().replace(/\s+/g, ' ');
    if (!groupName) {
      showNewCatError('Name the new group too.');
      newcatGroup.focus();
      return;
    }
    const groupId = customId(groupName, taken);
    added.push({ id: groupId, label: groupName, kind: 'out', parent: null, group: true });
    added.push({ id: customId(name, taken), label: name, kind: 'out', parent: groupId, group: false });
  } else added.push({ id: customId(name, taken), label: name, kind: 'out', parent: newcatUnder.value || null, group: false });

  const next = cloneSettings();
  next.categories = [...next.categories, ...added];
  newcatSave.disabled = true;
  try {
    await saveSettings(next);
  } catch (err) {
    showNewCatError(err && err.message ? err.message : 'Could not save.');
    newcatSave.disabled = false;
    return;
  }
  applyToTree(added);
  closeNewCat();
  const leaf = added[added.length - 1];
  if (state.catPicker) {
    // Back in the picker with the new category chosen, or offered in the split rows.
    if (state.catPicker.mode === 'one') state.catPicker.choice = leaf.id;
    renderCatPickerMode();
  }
  ensureSheet({ force: true });
}

async function removeCustom(id) {
  const next = cloneSettings();
  next.categories = next.categories.filter((c) => c.id !== id);
  newcatSave.disabled = true;
  try {
    await saveSettings(next);
  } catch (err) {
    showNewCatError(err && err.message ? err.message : 'Could not save.');
    newcatSave.disabled = false;
    return;
  }
  newcatSave.disabled = false;
  removeFromTree(id);
  renderMine();
  if (state.catPicker) {
    if (state.catPicker.choice === id) state.catPicker.choice = '';
    for (const part of state.catPicker.parts) if (part.category === id) part.category = '';
    renderCatPickerMode();
  }
  ensureSheet({ force: true });
}

newcatForm.addEventListener('submit', submitNewCat);
newcatCancel.addEventListener('click', closeNewCat);
newcatOpen.addEventListener('click', openNewCat);
newcatOpenSheet.addEventListener('click', openNewCat);
newcatOut.addEventListener('change', renderNewCatForm);
newcatIn.addEventListener('change', renderNewCatForm);
newcatUnder.addEventListener('change', renderNewCatForm);
emptyToggle.addEventListener('click', () => {
  state.hideEmpty = !state.hideEmpty;
  writeHideEmpty(state.hideEmpty);
  render();
});

// ---------- forecasts: your own amount instead of the automatic one ----------

/** What is set for a line: the amount for every month, and the months with an amount of their own. */
function budgetParts(entry) {
  if (typeof entry === 'number') return { each: entry, months: {} };
  if (entry && typeof entry === 'object') return { each: entry.each == null ? null : Number(entry.each), months: { ...(entry.months || {}) } };
  return { each: null, months: {} };
}

function renderBudgetForm() {
  const { month, currency } = state.budget;
  const parts = budgetParts((state.settings.budgets[state.budget.accountId] || {})[state.budget.key]);
  const monthly = parts.months[month];
  const scope = budgetMonth.checked ? 'month' : 'each';
  budgetAmount.value = scope === 'month' ? (monthly == null ? '' : String(monthly)) : parts.each == null ? '' : String(parts.each);
  budgetClear.hidden = scope === 'month' ? monthly == null : parts.each == null;
  budgetClear.textContent = scope === 'month' ? `Back to the usual for ${formatMonth(month, { short: true })}` : 'Use automatic';
  budgetAmount.placeholder = scope === 'month' ? `Leave blank for ${parts.each == null ? 'automatic' : 'the every-month amount'}` : 'Leave blank for automatic';
  const bits = [];
  if (parts.each != null) bits.push(`every month ${formatMoney(parts.each, currency)}`);
  const own = Object.keys(parts.months).sort();
  if (own.length) bits.push(`${plural(own.length, 'month')} with an amount of their own (${own.map((k) => `${formatMonth(k, { short: true })} ${formatMoney(parts.months[k], currency)}`).join(', ')})`);
  budgetSub.textContent = `${state.budget.accountName}${bits.length ? ` · set: ${bits.join('; ')}` : ' · nothing set'}`;
}

function openBudget({ key, label, line, kind, month }) {
  if (typeof budgetEl.showModal !== 'function') return;
  const account = selectedAccount();
  const data = state.sheet.data;
  if (!account || !data || !data.projection) return;
  const parts = budgetParts((state.settings.budgets[String(account.id)] || {})[key]);
  state.budget = { key, accountId: String(account.id), accountName: account.name, line, month, currency: data.currency };
  const basis = kind === 'in' ? 'its latest complete month' : `the average of the last ${plural(data.projection.basis.complete, 'complete month')}`;
  budgetTitle.textContent = `Forecast for ${label}`;
  budgetAuto.textContent =
    data.projection.mode === 'budget'
      ? `Budget mode: only what you set counts. For reference, automatic would be ${formatMoney(line.auto, data.currency)}, ${basis}.`
      : `Automatic: ${formatMoney(line.auto, data.currency)}, ${basis}.`;
  budgetMonthLabel.textContent = `${formatMonth(month)} only`;
  // Open on the month's own amount when it has one, otherwise on the amount for every month.
  budgetMonth.checked = parts.months[month] != null;
  budgetEach.checked = !budgetMonth.checked;
  budgetError.hidden = true;
  budgetError.textContent = '';
  budgetHint.textContent = state.settings.persistent === true ? 'Saved for every device you open this page on.' : 'Saved in this browser only.';
  budgetSave.disabled = false;
  renderBudgetForm();
  budgetEl.showModal();
  budgetAmount.focus();
}

async function writeBudget(amount) {
  const { key, accountId, month } = state.budget;
  const next = cloneSettings();
  const rows = { ...(next.budgets[accountId] || {}) };
  const parts = budgetParts(rows[key]);
  if (budgetMonth.checked) {
    if (amount == null) delete parts.months[month];
    else parts.months[month] = amount;
  } else parts.each = amount;
  const own = Object.keys(parts.months);
  if (parts.each == null && own.length === 0) delete rows[key];
  else if (own.length === 0) rows[key] = parts.each;
  else rows[key] = parts.each == null ? { months: parts.months } : { each: parts.each, months: parts.months };
  if (Object.keys(rows).length > 0) next.budgets[accountId] = rows;
  else delete next.budgets[accountId];
  budgetSave.disabled = true;
  try {
    await saveSettings(next);
  } catch (err) {
    budgetError.textContent = err && err.message ? err.message : 'Could not save.';
    budgetError.hidden = false;
    budgetSave.disabled = false;
    return;
  }
  if (budgetEl.open) budgetEl.close();
  ensureSheet({ force: true });
}

budgetForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!state.budget) return;
  const raw = budgetAmount.value.trim();
  if (raw === '') {
    writeBudget(null);
    return;
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    budgetError.textContent = 'Enter an amount of zero or more, or leave it blank for automatic.';
    budgetError.hidden = false;
    return;
  }
  writeBudget(Math.round(amount * 100) / 100);
});
budgetClear.addEventListener('click', () => {
  if (state.budget) writeBudget(null);
});
budgetEach.addEventListener('change', () => {
  if (state.budget) renderBudgetForm();
});
budgetMonth.addEventListener('change', () => {
  if (state.budget) renderBudgetForm();
});
budgetCancel.addEventListener('click', () => {
  if (budgetEl.open) budgetEl.close();
});
budgetEl.addEventListener('close', () => {
  state.budget = null;
});

// ---------- importing a ledger kept elsewhere ----------

let ledgerDraft = null;

function showLedgerError(message) {
  ledgerError.textContent = message;
  ledgerError.hidden = false;
}

function openLedger() {
  const account = selectedAccount();
  if (typeof ledgerEl.showModal !== 'function' || !account) return;
  ledgerDraft = null;
  ledgerFile.value = '';
  ledgerSub.textContent = `${account.name} · matched against the last twelve months Lunch Flow has`;
  ledgerPreview.hidden = true;
  ledgerPreview.replaceChildren();
  ledgerBudgetsField.hidden = true;
  ledgerBudgets.checked = true;
  ledgerError.hidden = true;
  ledgerError.textContent = '';
  ledgerHint.textContent = 'Choose the file to see what would change. Nothing is saved until you apply.';
  ledgerApply.disabled = true;
  ledgerEl.showModal();
}

/** Rules already saved that this import's matches contradict: the merchant now files differently, or not always the same way. */
function staleRules(result) {
  const seen = new Map();
  for (const match of result.matches) {
    if (!match.merchantKey) continue;
    if (!seen.has(match.merchantKey)) seen.set(match.merchantKey, new Set());
    seen.get(match.merchantKey).add(match.category);
  }
  const rules = state.settings.rules || {};
  return Object.keys(rules).filter((merchant) => seen.has(merchant) && !(seen.get(merchant).size === 1 && seen.get(merchant).has(rules[merchant])));
}

function renderLedgerPreview(result) {
  const months = result.months.count ? `${formatMonth(result.months.from)} to ${formatMonth(result.months.to)}` : 'no months at all';
  const stale = staleRules(result);
  const lines = [
    `Lunch Flow has ${plural(result.transactionsTotal, 'transaction')} for this account, ${months}.`,
    `${plural(result.matches.length, 'ledger line')} matched a transaction; ${plural(result.changed, 'transaction')} would change category.`,
    `${plural(Object.keys(result.rules).length, 'merchant')} matched the same way every time and would become rules.${stale.length ? ` ${plural(stale.length, 'earlier rule')} the matches contradict would be removed.` : ''}`,
  ];
  const combined = Array.isArray(result.combined) ? result.combined : [];
  if (combined.length) {
    const absorbed = combined.reduce((n, item) => n + item.lines, 0);
    lines.push(`${plural(combined.length, 'payment')} ${combined.length === 1 ? 'is' : 'are'} entered as several lines in the ledger (${plural(absorbed, 'line')} in all) and would be split the same way here.`);
  }
  if (result.unmatched.length) lines.push(`${plural(result.unmatched.length, 'line')} had no transaction of that amount in that month.`);
  if (result.outside.length) lines.push(`${plural(result.outside.length, 'line')} fall in months Lunch Flow does not have.`);
  if (result.unassignable.length) lines.push(`${plural(result.unassignable.length, 'line')} cannot be filed: no category of that name here, a group rather than a category, or a refund inside an outgoing line.`);
  const budgetRows = Object.values(result.budgets || {});
  if (budgetRows.length) {
    const varying = budgetRows.filter((row) => row && typeof row === 'object' && Object.keys(row.months || {}).length > 0).length;
    lines.push(`${plural(budgetRows.length, 'budget')} come with it${varying ? `, ${varying} of them with months of their own` : ''}.`);
  }
  const sample =result.unmatched.slice(0, 10).map((entry) => `${formatMonth(entry.month, { short: true })} · ${entry.label || entry.category || 'no category'} · ${plainNumber.format(Math.abs(entry.amount))}`);
  const splitSample = combined
    .slice(0, 10)
    .map((item) => `${formatMonth(item.month, { short: true })} · ${item.merchant || 'no merchant'} · ${plainNumber.format(Math.abs(item.amount))} = ${item.parts.map((part) => `${part.label} ${plainNumber.format(part.amount)}`).join(' + ')}`);
  ledgerPreview.replaceChildren(
    ...lines.map((text) => el('p', { text })),
    splitSample.length ? el('details', {}, el('summary', { text: `First ${splitSample.length} split payments` }), el('ul', {}, splitSample.map((text) => el('li', { text })))) : null,
    sample.length ? el('details', {}, el('summary', { text: `First ${sample.length} unmatched` }), el('ul', {}, sample.map((text) => el('li', { text })))) : null,
  );
  ledgerPreview.hidden = false;
  const hasBudgets = Object.keys(result.budgets || {}).length > 0;
  ledgerBudgetsField.hidden = !hasBudgets;
  ledgerHint.textContent = 'Nothing is saved until you apply.';
  ledgerApply.disabled = result.matches.length === 0 && combined.length === 0 && !hasBudgets;
}

async function previewLedger() {
  const file = ledgerFile.files && ledgerFile.files[0];
  const account = selectedAccount();
  if (!file || !account) return;
  ledgerError.hidden = true;
  ledgerApply.disabled = true;
  ledgerDraft = null;
  ledgerPreview.hidden = true;
  let ledger;
  try {
    ledger = JSON.parse(await file.text());
  } catch {
    showLedgerError('That file is not JSON.');
    return;
  }
  ledgerHint.textContent = 'Matching against Lunch Flow…';
  try {
    const body = { ledger };
    if (state.settings.persistent !== true) body.settings = settingsPayload();
    const res = await apiFetch(`/api/reconcile?account=${encodeURIComponent(String(account.id))}`, { method: 'POST', body });
    const result = await res.json().catch(() => null);
    if (!res.ok) throw new Error((result && (result.message || result.error)) || `Request failed with status ${res.status}`);
    ledgerDraft = { ledger, result };
    renderLedgerPreview(result);
  } catch (err) {
    ledgerHint.textContent = '';
    showLedgerError(err && err.message ? err.message : 'Could not match the ledger.');
  }
}

async function applyLedger(event) {
  event.preventDefault();
  const account = selectedAccount();
  if (!ledgerDraft || !account) return;
  const { result } = ledgerDraft;
  const next = cloneSettings();
  for (const [key, category] of Object.entries(result.choices)) {
    next.transactions[key] = category;
    delete next.splits[key];
  }
  for (const merchant of staleRules(result)) delete next.rules[merchant];
  for (const [merchant, category] of Object.entries(result.rules)) next.rules[merchant] = category;
  for (const [key, parts] of Object.entries(result.splits || {})) {
    next.splits[key] = parts.map((part) => ({ category: part.category, amount: part.amount }));
    delete next.transactions[key];
  }
  if (!ledgerBudgetsField.hidden && ledgerBudgets.checked) {
    const id = String(account.id);
    next.budgets[id] = { ...(next.budgets[id] || {}), ...result.budgets };
    next.forecast[id] = 'budget';
  }
  ledgerApply.disabled = true;
  try {
    await saveSettings(next);
  } catch (err) {
    showLedgerError(err && err.message ? err.message : 'Could not save.');
    ledgerApply.disabled = false;
    return;
  }
  if (ledgerEl.open) ledgerEl.close();
  ensureSheet({ force: true });
}

ledgerOpen.addEventListener('click', openLedger);
ledgerFile.addEventListener('change', previewLedger);
ledgerForm.addEventListener('submit', applyLedger);
ledgerCancel.addEventListener('click', () => {
  if (ledgerEl.open) ledgerEl.close();
});
ledgerEl.addEventListener('close', () => {
  ledgerDraft = null;
});

// ---------- notices, header, gate ----------

function renderNotice() {
  const { data, error, loading } = state;
  const onAccounts = state.route.screen === 'accounts';
  let kind = null;
  let title = '';
  let detail = '';

  if (error && !data) {
    kind = 'critical';
    title = 'Could not load balances.';
    detail = error;
  } else if (onAccounts && state.sheet.error) {
    kind = state.sheet.data ? 'warning' : 'critical';
    title = state.sheet.data ? 'Could not refresh the sheet.' : 'Could not load the sheet.';
    detail = state.sheet.error;
  } else if (error && data) {
    kind = 'warning';
    title = 'Could not refresh.';
    detail = `${error} Showing balances from ${relativeTime(data.fetchedAt)}.`;
  } else if (data && data.stale) {
    kind = 'warning';
    title = 'Showing cached balances.';
    detail = data.error ? `The last refresh failed: ${data.error}` : 'The last refresh failed.';
  } else if (!onAccounts && data && data.partial) {
    kind = 'warning';
    title = 'Some balances are missing.';
    detail = 'Lunch Flow could not return a balance for every account. Affected accounts are marked below.';
  }

  if (!kind || (loading && !data) || state.gate) {
    noticeEl.hidden = true;
    noticeEl.replaceChildren();
    noticeEl.className = 'notice';
    return;
  }
  noticeEl.className = `notice notice--${kind}`;
  noticeEl.replaceChildren(el('span', { class: 'notice-icon', 'aria-hidden': 'true' }), el('div', {}, el('strong', { text: title }), ' ', detail));
  noticeEl.hidden = false;
}

function renderUpdated() {
  if (state.gate) {
    updatedEl.textContent = '';
    return;
  }
  const onAccounts = state.route.screen === 'accounts';
  const busy = state.loading || (onAccounts && state.sheet.loading);
  const stamp = onAccounts && state.sheet.data ? state.sheet.data.fetchedAt : state.data ? state.data.fetchedAt : null;
  if (!stamp) {
    updatedEl.textContent = busy ? 'Loading…' : '';
    return;
  }
  updatedEl.textContent = `Updated ${relativeTime(stamp)}`;
  updatedEl.title = new Date(stamp).toLocaleString();
}

function renderGate() {
  const gate = state.gate;
  if (gate.kind === 'unconfigured') {
    gateEl.replaceChildren(el('div', { class: 'gate' }, el('h2', { text: 'Password not set' }), el('p', { text: gate.message })));
  } else {
    const input = el('input', { id: 'password', type: 'password', autocomplete: 'current-password', placeholder: 'Password', required: true });
    const form = el(
      'form',
      {
        class: 'gate',
        onsubmit: (event) => {
          event.preventDefault();
          const value = input.value.trim();
          if (!value) return;
          sessionPassword = value;
          writePassword(value);
          state.gate = null;
          load();
        },
      },
      el('h2', { text: 'Enter the password' }),
      el('p', { text: 'This page shows bank balances, so it is locked with the password set for this deployment.' }),
      el('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'moneta', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' }),
      el('label', { for: 'password', class: 'sr-only', text: 'Password' }),
      el('div', { class: 'gate-row' }, input, el('button', { class: 'btn', type: 'submit', text: 'Unlock' })),
      gate.message ? el('p', { class: 'gate-error', role: 'alert', text: gate.message }) : null,
    );
    gateEl.replaceChildren(form);
    input.focus();
  }
  gateEl.hidden = false;
}

function render() {
  const gated = Boolean(state.gate);
  const onAccounts = state.route.screen === 'accounts';
  for (const link of navLinks) link.setAttribute('aria-current', link.dataset.screen === state.route.screen ? 'page' : 'false');
  const busy = state.loading || (onAccounts && state.sheet.loading);
  refreshBtn.hidden = gated;
  refreshBtn.disabled = busy;
  refreshBtn.textContent = busy ? 'Refreshing…' : 'Refresh';
  lockBtn.hidden = gated || !(sessionPassword || readPassword());
  renderUpdated();
  renderNotice();

  if (gated) {
    renderGate();
    screenBalancesEl.hidden = true;
    screenAccountsEl.hidden = true;
    cacheHintEl.textContent = '';
    return;
  }
  gateEl.hidden = true;
  gateEl.replaceChildren();
  screenBalancesEl.hidden = onAccounts;
  screenAccountsEl.hidden = !onAccounts;

  if (state.data && state.data.ttlSeconds > 0) {
    const minutes = Math.round(state.data.ttlSeconds / 60);
    cacheHintEl.textContent = minutes >= 1 ? `Data is cached for ${plural(minutes, 'minute')}. Refresh fetches it again.` : 'Refresh fetches the data again.';
  } else cacheHintEl.textContent = '';

  if (onAccounts) renderAccountsScreen();
  else renderBalancesScreen();
}

// ---------- per-account editor ----------

function groupLabel(id) {
  const options = (state.data && state.data.groupOptions) || [];
  const match = options.find((option) => option.id === id);
  return match ? match.label : id;
}

function updateEditorFields() {
  const mode = editorBalance.value;
  editorLimitField.hidden = mode !== 'credit-limit';
  editorExplain.textContent = TREATMENT_HELP[mode] || '';
  editorLimit.removeAttribute('aria-invalid');
}

function openEditor(account) {
  if (typeof editorEl.showModal !== 'function') return;
  state.editing = account;
  editorTitle.textContent = account.name;
  const reported = account.balance ? `Lunch Flow reports ${formatMoney(account.balance.reported, account.balance.currency)}` : 'No balance available';
  editorSub.textContent = `${account.institutionName} · ${reported}`;

  const options = [el('option', { value: '', text: `Automatic (${groupLabel(account.autoGroup)})` })];
  for (const option of (state.data && state.data.groupOptions) || []) options.push(el('option', { value: option.id, text: option.label }));
  editorGroup.replaceChildren(...options);
  editorGroup.value = account.settings && account.settings.group ? account.settings.group : '';
  editorBalance.value = (account.settings && account.settings.balance) || 'reported';
  editorLimit.value = account.settings && account.settings.limit != null ? String(account.settings.limit) : '';
  editorError.hidden = true;
  editorError.textContent = '';
  editorHint.textContent =
    state.settings.persistent === true
      ? 'Saved for every device you open this page on.'
      : 'Saved in this browser only. To share settings across devices, add Upstash Redis under Storage in your Vercel project.';
  editorSave.disabled = false;
  updateEditorFields();
  editorEl.showModal();
}

function closeEditor() {
  state.editing = null;
  if (editorEl.open) editorEl.close();
}

/** Persist settings: on the server when it has a store, otherwise in this browser. */
async function saveSettings(next) {
  if (state.settings.persistent === true) {
    const res = await apiFetch('/api/settings', { method: 'PUT', body: next });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body && (body.message || body.error)) || `Saving failed with status ${res.status}`);
    state.settings = {
      ...state.settings,
      persistent: body.persistent,
      kind: body.kind,
      error: body.error ?? null,
      accounts: body.accounts || {},
      rules: body.rules || {},
      transactions: body.transactions || {},
      splits: body.splits || {},
      categories: body.categories || [],
      budgets: body.budgets || {},
      forecast: body.forecast || {},
    };
    return;
  }
  writeLocalSettings(next);
  state.settings = {
    ...state.settings,
    accounts: next.accounts,
    rules: next.rules,
    transactions: next.transactions,
    splits: next.splits || {},
    categories: next.categories || [],
    budgets: next.budgets || {},
    forecast: next.forecast || {},
  };
}

async function submitEditor(event) {
  event.preventDefault();
  const account = state.editing;
  if (!account) return;

  const next = cloneSettings();
  const id = String(account.id);
  const entry = { ...(next.accounts[id] || {}) };
  delete entry.group;
  delete entry.balance;
  delete entry.limit;
  if (editorGroup.value) entry.group = editorGroup.value;
  const mode = editorBalance.value;
  if (mode === 'negate') entry.balance = 'negate';
  if (mode === 'credit-limit') {
    const limit = Number(editorLimit.value);
    if (editorLimit.value.trim() === '' || !Number.isFinite(limit) || limit < 0) {
      editorLimit.setAttribute('aria-invalid', 'true');
      editorError.textContent = 'Enter the card’s credit limit so the amount owed can be worked out.';
      editorError.hidden = false;
      editorLimit.focus();
      return;
    }
    entry.balance = 'credit-limit';
    entry.limit = limit;
  }
  if (Object.keys(entry).length > 0) next.accounts[id] = entry;
  else delete next.accounts[id];

  editorSave.disabled = true;
  try {
    await saveSettings(next);
  } catch (err) {
    editorError.textContent = err && err.message ? err.message : 'Could not save.';
    editorError.hidden = false;
    editorSave.disabled = false;
    return;
  }
  closeEditor();
  state.sheet = { ...state.sheet, key: null }; // treatments changed: balances on the sheet must be recomputed
  load();
}

editorForm.addEventListener('submit', submitEditor);
editorBalance.addEventListener('change', updateEditorFields);
editorLimit.addEventListener('input', () => {
  editorError.hidden = true;
  editorLimit.removeAttribute('aria-invalid');
});
editorCancel.addEventListener('click', closeEditor);
editorEl.addEventListener('close', () => {
  state.editing = null;
});

// ---------- data ----------

function handleUnauthorized(res, body, password) {
  if (res.status === 401) {
    sessionPassword = '';
    writePassword('');
    state.data = null;
    state.sheet = { key: null, data: null, loading: false, error: null };
    state.gate = { kind: 'password', message: password ? 'Wrong password. Try again.' : '' };
    return true;
  }
  if (res.status === 503 && body && body.error === 'Password not configured') {
    state.data = null;
    state.gate = { kind: 'unconfigured', message: body.message };
    return true;
  }
  return false;
}

function adoptServerSettings(settings) {
  state.settings = {
    persistent: settings.persistent,
    kind: settings.kind,
    error: settings.error ?? null,
    accounts: settings.accounts || {},
    rules: settings.rules || {},
    transactions: settings.transactions || {},
    splits: settings.splits || {},
    categories: settings.categories || [],
    budgets: settings.budgets || {},
    forecast: settings.forecast || {},
  };
}

async function load({ refresh = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  state.error = null;
  render();
  try {
    const password = sessionPassword || readPassword();
    const res = await apiFetch(`/api/balances${refresh ? '?refresh=1' : ''}`);
    const body = await res.json().catch(() => null);
    if (handleUnauthorized(res, body, password)) return;
    if (!res.ok) throw new Error((body && (body.message || body.error)) || `Request failed with status ${res.status}`);
    state.gate = null;
    state.data = body;
    if (body.settings) {
      const local = readLocalSettings();
      if (body.settings.persistent === true) {
        const serverEmpty = settingsEmpty(body.settings);
        // The server keeps settings now. Move anything saved in this browser over, once, if the server has none yet.
        if (!state.migrated && !settingsEmpty(local) && serverEmpty) {
          state.migrated = true;
          adoptServerSettings({ ...body.settings, accounts: {}, rules: {}, transactions: {}, splits: {}, categories: [], budgets: {}, forecast: {} });
          try {
            await saveSettings(local);
            writeLocalSettings(null);
            state.loading = false;
            return load();
          } catch {
            /* keep the local copy; the next save will try again */
          }
        } else writeLocalSettings(null);
        adoptServerSettings(body.settings);
      } else {
        state.settings = { ...state.settings, persistent: false, kind: body.settings.kind, error: body.settings.error ?? null, ...local };
      }
    }
  } catch (err) {
    state.error = err && err.message ? err.message : 'Unknown error';
  } finally {
    state.loading = false;
    render();
    ensureSheet();
  }
}

async function loadSheet({ account, period, key, refresh = false }) {
  state.sheet = { key, data: state.sheet.key === key ? state.sheet.data : null, loading: true, error: null };
  if (state.sheet.data === null) state.cell = null;
  render();
  try {
    // Actuals end at the route's month or now, whichever is earlier; months past now are asked for as forecasts.
    const now = currentMonth();
    const params = new URLSearchParams({
      account: String(account.id),
      to: period < now ? period : now,
      months: String(SHEET_MONTHS),
      ahead: String(Math.max(1, Math.min(MAX_AHEAD, monthDiff(now, period)))),
    });
    if (refresh) params.set('refresh', '1');
    const password = sessionPassword || readPassword();
    const res = await apiFetch(`/api/sheet?${params}`);
    const body = await res.json().catch(() => null);
    if (state.sheet.key !== key) return; // the viewer moved on
    if (handleUnauthorized(res, body, password)) return;
    if (!res.ok) throw new Error((body && (body.message || body.error)) || `Request failed with status ${res.status}`);
    state.sheet = { key, data: body, loading: false, error: null };
    if (state.cell && !cellTransactions().length && !state.sheet.data.months[state.cell.monthIndex]) state.cell = null;
  } catch (err) {
    if (state.sheet.key !== key) return;
    state.sheet = { ...state.sheet, loading: false, error: err && err.message ? err.message : 'Unknown error' };
  } finally {
    if (state.sheet.key === key) {
      state.sheet.loading = false;
      render();
    }
  }
}

/** Load the selected account's sheet when the accounts screen needs it. */
function ensureSheet({ refresh = false, force = false } = {}) {
  if (state.route.screen !== 'accounts' || !state.data || state.gate) return;
  const account = selectedAccount();
  if (!account) return;
  const key = `${account.id}|${state.route.period}|${SHEET_MONTHS}`;
  if (!refresh && !force && state.sheet.key === key && (state.sheet.data || state.sheet.loading)) return;
  loadSheet({ account, period: state.route.period, key, refresh });
}

// ---------- wiring ----------

refreshBtn.addEventListener('click', () => {
  load({ refresh: true });
  if (state.route.screen === 'accounts') ensureSheet({ refresh: true });
});
lockBtn.addEventListener('click', () => {
  sessionPassword = '';
  writePassword('');
  state.data = null;
  state.error = null;
  state.sheet = { key: null, data: null, loading: false, error: null };
  state.gate = { kind: 'password', message: '' };
  render();
});
sheetModeEl.addEventListener('click', (event) => {
  const button = event.target.closest('.seg-btn');
  if (!button || button.dataset.mode === state.sheetMode) return;
  state.sheetMode = button.dataset.mode === 'change' ? 'change' : 'amounts';
  writeSheetMode(state.sheetMode);
  render();
});
forecastModeEl.addEventListener('click', async (event) => {
  const button = event.target.closest('.seg-btn');
  const account = selectedAccount();
  const data = state.sheet.data;
  if (!button || !account || !data || !data.projection) return;
  const mode = button.dataset.fmode === 'budget' ? 'budget' : 'auto';
  if (mode === data.projection.mode) return;
  const next = cloneSettings();
  if (mode === 'budget') next.forecast[String(account.id)] = 'budget';
  else delete next.forecast[String(account.id)];
  try {
    await saveSettings(next);
  } catch (err) {
    state.error = err && err.message ? err.message : 'Could not save.';
    render();
    return;
  }
  ensureSheet({ force: true });
});
viewToggleEl.addEventListener('click', (event) => {
  const button = event.target.closest('.seg-btn');
  if (!button || button.dataset.view === state.view) return;
  state.view = button.dataset.view === 'bank' ? 'bank' : 'type';
  writeView(state.view);
  render();
});
window.addEventListener('hashchange', () => {
  const previous = state.route;
  state.route = parseHash();
  if (previous.accountId !== state.route.accountId || previous.period !== state.route.period) state.cell = null;
  render();
  ensureSheet();
});

setInterval(renderUpdated, 30_000);
setInterval(() => {
  if (document.visibilityState !== 'visible' || state.gate) return;
  load();
  if (state.route.screen === 'accounts') ensureSheet({ force: true });
}, AUTO_RELOAD_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.data || state.gate) return;
  if (Date.now() - new Date(state.data.fetchedAt).getTime() > AUTO_RELOAD_MS) load();
});

render();
load();
