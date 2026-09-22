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
const activityHeadEl = $('activity-head');
const activityTilesEl = $('activity-tiles');
const activityListEl = $('activity-list');
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

const AUTO_RELOAD_MS = 60_000;
const PASSWORD_KEY = 'moneta.password';
const VIEW_KEY = 'moneta.view';
const SETTINGS_KEY = 'moneta.settings';
const TRANSACTIONS_PAGE = 100;

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
const MONTHS_BACK = 24;
const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const currentMonth = () => monthKey(new Date());
const splitMonth = (key) => key.split('-').map(Number);

function periodRange(key) {
  const [year, month] = splitMonth(key);
  return { from: localIso(new Date(year, month - 1, 1)), to: localIso(new Date(year, month, 0)) };
}

function shiftMonth(key, n) {
  const [year, month] = splitMonth(key);
  return monthKey(new Date(year, month - 1 + n, 1));
}

function formatMonth(key) {
  const [year, month] = splitMonth(key);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
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
    const period = MONTH_RE.test(parts[2] || '') && parts[2] <= now ? parts[2] : now;
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

// Settings kept in this browser, used when the server has nowhere to store them.
function readLocalSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    return parsed && typeof parsed.accounts === 'object' && parsed.accounts ? parsed.accounts : {};
  } catch {
    return {};
  }
}
function writeLocalSettings(accounts) {
  try {
    if (accounts && Object.keys(accounts).length > 0) localStorage.setItem(SETTINGS_KEY, JSON.stringify({ accounts }));
    else localStorage.removeItem(SETTINGS_KEY);
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
  view: readView(), // 'type' (savings / spending / credit) or 'bank' (by institution)
  settings: { persistent: null, kind: null, error: null, accounts: readLocalSettings() },
  editing: null, // the account open in the editor
  migrated: false,
  route: parseHash(),
  activity: { key: null, data: null, loading: false, error: null, showAll: false },
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
    formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    });
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

function apiHeaders(extra = {}) {
  const headers = { accept: 'application/json', ...extra };
  const password = sessionPassword || readPassword();
  if (password) headers.authorization = `Bearer ${password}`;
  // Until the server says it stores settings itself, send the ones kept in this browser.
  if (state.settings.persistent !== true && Object.keys(state.settings.accounts).length > 0) {
    headers['x-moneta-settings'] = JSON.stringify({ accounts: state.settings.accounts });
  }
  return headers;
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

function selectedAccount() {
  if (!state.data || state.data.accounts.length === 0) return null;
  const wanted = state.route.accountId;
  return state.data.accounts.find((account) => String(account.id) === String(wanted)) || state.data.accounts[0];
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
  const img = el('img', {
    class: `logo${suffix ? ` logo${suffix}` : ''}`,
    src: group.logo,
    alt: '',
    loading: 'lazy',
    referrerpolicy: 'no-referrer',
  });
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
  resizeTimer = setTimeout(() => {
    fitTileValues(totalsEl);
    fitTileValues(activityTilesEl);
  }, 100);
});

// ---------- balances screen ----------

function renderAccountRow(account, { showInstitution = false } = {}) {
  const inactive = account.status !== 'ACTIVE';
  const meta = [];
  if (showInstitution) meta.push(el('span', { text: account.institutionName }));
  if (inactive) meta.push(renderBadge(account.status));
  if (account.balance && account.balance.treatment === 'credit-limit') {
    meta.push(
      el('span', {
        text: `${formatMoney(account.balance.available, account.balance.currency)} left of ${formatMoney(account.balance.limit, account.balance.currency)}`,
      }),
    );
  } else if (account.balance && account.balance.available != null && account.balance.available !== account.balance.current) {
    meta.push(el('span', { text: `Available ${formatMoney(account.balance.available, account.balance.currency)}` }));
  }
  if (account.error) {
    meta.push(el('span', { class: 'row-error', text: `Balance unavailable: ${account.error}` }));
  }

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
      el('a', { class: 'row-name', href: accountHash(account.id, state.route.period), text: account.name, title: 'See income and outgoings' }),
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
    el(
      'div',
      { class: 'institution-head' },
      renderLogo(group),
      el('h2', { text: group.name }),
      el('span', { class: 'institution-count', text: plural(group.accounts.length, 'account') }),
    ),
    el('ul', { class: 'rows' }, group.accounts.map((account) => renderAccountRow(account))),
  );
}

function renderGroup(group, accounts) {
  const members = accounts.filter((account) => account.group === group.id);
  if (members.length === 0) return null;
  return el(
    'section',
    { class: 'group', 'aria-label': group.label },
    el(
      'div',
      { class: 'group-head' },
      el('div', { class: 'group-title' }, el('h2', { text: group.label }), el('span', { class: 'group-count', text: plural(members.length, 'account') })),
      renderTotals(group.totals),
    ),
    el('ul', { class: 'rows' }, members.map((account) => renderAccountRow(account, { showInstitution: true }))),
  );
}

function renderTile(total, hero) {
  const label = total.currency ? `Total in ${total.currency}` : 'Total (unknown currency)';
  const metaParts = [plural(total.accountCount, 'account')];
  if (total.available != null && total.available !== total.current) {
    metaParts.push(`${formatMoney(total.available, total.currency)} available`);
  }
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
        el(
          'ul',
          { class: 'rows' },
          [0, 1].map(() =>
            el(
              'li',
              { class: 'row' },
              el('div', { class: 'row-main' }, el('div', { class: 'row-name skeleton', text: 'Account name' })),
              el('div', { class: 'row-amount skeleton', text: '0,000.00' }),
            ),
          ),
        ),
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
        el('div', {
          class: 'tile-meta',
          text:
            data.accounts.length === 0
              ? 'Connect a bank in Lunch Flow and refresh this page.'
              : 'Lunch Flow returned accounts but no balances. Try refreshing in a moment.',
        }),
      ),
    );
  } else {
    // A single currency gets the hero treatment; several currencies are peers.
    const hero = data.totals.length === 1;
    totalsEl.replaceChildren(...data.totals.map((total) => renderTile(total, hero)));
  }
  fitTileValues(totalsEl);

  renderViewToggle();
  const byType = state.view === 'type' && Array.isArray(data.groups) && data.groups.length > 0;
  if (byType) {
    accountsEl.replaceChildren(...data.groups.map((group) => renderGroup(group, data.accounts)).filter(Boolean));
  } else {
    accountsEl.replaceChildren(...groupByInstitution(data.accounts).map(renderInstitution));
  }
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

// ---------- accounts screen ----------

function renderPicker(selected) {
  if (!state.data) {
    pickerEl.replaceChildren(...[0, 1, 2].map(() => el('span', { class: 'chip skeleton', text: 'Account name' })));
    return;
  }
  pickerEl.replaceChildren(
    ...state.data.accounts.map((account) =>
      el(
        'a',
        {
          class: 'chip',
          href: accountHash(account.id, state.route.period),
          'aria-current': selected && String(selected.id) === String(account.id) ? 'true' : 'false',
          title: `${account.name} · ${account.institutionName}`,
        },
        renderLogo({ name: account.institutionName, logo: account.institutionLogo }, 'chip'),
        el('span', { text: account.name }),
      ),
    ),
  );
}

function renderPeriodPicker(selected) {
  const month = state.route.period;
  const now = currentMonth();
  const target = (key) => (selected ? accountHash(selected.id, key) : '#/accounts');

  const options = [];
  for (let back = 0; back < MONTHS_BACK; back += 1) {
    const key = shiftMonth(now, -back);
    options.push(el('option', { value: key, text: formatMonth(key), selected: key === month }));
  }
  if (!options.some((option) => option.value === month)) {
    options.push(el('option', { value: month, text: formatMonth(month), selected: true }));
  }

  periodPickerEl.replaceChildren(
    el('a', { class: 'month-btn', href: target(shiftMonth(month, -1)), 'aria-label': `Previous month, ${formatMonth(shiftMonth(month, -1))}`, text: '‹' }),
    el(
      'select',
      {
        class: 'month-select',
        'aria-label': 'Month',
        onchange: (event) => {
          location.hash = target(event.target.value);
        },
      },
      options,
    ),
    month < now
      ? el('a', { class: 'month-btn', href: target(shiftMonth(month, 1)), 'aria-label': `Next month, ${formatMonth(shiftMonth(month, 1))}`, text: '›' })
      : el('span', { class: 'month-btn month-btn--disabled', 'aria-hidden': 'true', text: '›' }),
  );
}

function renderActivityHead(account) {
  if (!account) {
    activityHeadEl.replaceChildren();
    return;
  }
  const month = state.route.period;
  const suffix = month === currentMonth() ? ' · month so far' : '';
  activityHeadEl.replaceChildren(
    el('h2', { text: account.name }),
    el('span', { text: `${account.institutionName} · ${formatMonth(month)}${suffix}` }),
  );
}

function statTile(label, value, meta, extraClass = '') {
  return el(
    'div',
    { class: `tile${extraClass ? ` ${extraClass}` : ''}` },
    el('div', { class: 'tile-label', text: label }),
    el('div', { class: 'tile-value', text: value }),
    el('div', { class: 'tile-meta', text: meta }),
  );
}

function renderActivityTiles(data) {
  const currency = data.currency;
  const inCount = data.transactions.filter((t) => t.amount >= 0).length;
  const outCount = data.transactions.length - inCount;
  const closingLabel = data.closingIsCurrent ? 'Balance now' : 'Month-end balance';
  let closingMeta;
  if (data.closingBalance == null) closingMeta = data.account.error ? 'Balance unavailable' : 'No balance reported';
  else {
    closingMeta = `Opened at ${formatMoney(data.openingBalance, currency)}`;
    closingMeta += data.closingIsCurrent ? ' · month in progress' : ` · closed ${formatDay(data.period.to, { weekday: false })}`;
  }
  activityTilesEl.replaceChildren(
    statTile('Money in', formatMoney(data.income, currency), plural(inCount, 'payment')),
    statTile('Money out', formatMoney(data.outgoings, currency), plural(outCount, 'payment')),
    statTile('Net', formatSigned(data.net, currency), data.net >= 0 ? 'More in than out' : 'More out than in'),
    statTile(closingLabel, formatMoney(data.closingBalance, currency), closingMeta),
  );
  fitTileValues(activityTilesEl);
}

function renderTransactions(data) {
  if (data.transactions.length === 0) {
    activityListEl.replaceChildren(el('p', { class: 'txns-empty', text: 'No transactions in this period.' }));
    return;
  }
  const shown = state.activity.showAll ? data.transactions : data.transactions.slice(0, TRANSACTIONS_PAGE);
  const nodes = [];
  let lastDate = null;
  for (const t of shown) {
    if (t.date !== lastDate) {
      nodes.push(el('h3', { class: 'txn-date', text: formatDay(t.date) }));
      lastDate = t.date;
    }
    const meta = [];
    if (t.pending) meta.push(el('span', { class: 'badge badge--warning', text: 'Pending' }));
    if (t.category) meta.push(el('span', { text: t.category }));
    if (t.merchant && t.merchant !== t.description) meta.push(el('span', { text: t.description }));
    nodes.push(
      el(
        'div',
        { class: 'txn' },
        el('div', { class: 'txn-main' }, el('div', { class: 'txn-desc', text: t.merchant || t.description || 'Transaction' }), el('div', { class: 'row-meta' }, meta)),
        el('div', { class: `txn-amount${t.amount >= 0 ? ' txn-amount--in' : ''}`, text: formatSigned(t.amount, t.currency || data.currency) }),
      ),
    );
  }
  if (shown.length < data.transactions.length) {
    nodes.push(
      el(
        'div',
        { class: 'txns-more' },
        el('button', {
          class: 'btn btn--ghost',
          type: 'button',
          text: `Show all ${data.transactions.length} transactions`,
          onclick: () => {
            state.activity.showAll = true;
            render();
          },
        }),
      ),
    );
  }
  activityListEl.replaceChildren(...nodes);
}

function renderAccountsScreen() {
  const account = selectedAccount();
  renderPicker(account);
  renderPeriodPicker(account);

  if (!state.data) {
    renderActivityHead(null);
    activityTilesEl.replaceChildren(...(state.loading ? [skeletonTile(), skeletonTile(), skeletonTile(), skeletonTile()] : []));
    activityListEl.replaceChildren();
    return;
  }
  if (!account) {
    renderActivityHead(null);
    activityTilesEl.replaceChildren(
      el('div', { class: 'tile tile--empty' }, el('div', { class: 'tile-value', text: 'No accounts connected yet.' }), el('div', { class: 'tile-meta', text: 'Connect a bank in Lunch Flow and refresh this page.' })),
    );
    activityListEl.replaceChildren();
    return;
  }

  const activity = state.activity;
  const current = activity.data && String(activity.data.account.id) === String(account.id) ? activity.data : null;
  renderActivityHead(account);
  if (current) {
    renderActivityTiles(current);
    renderTransactions(current);
  } else if (activity.loading) {
    activityTilesEl.replaceChildren(skeletonTile(), skeletonTile(), skeletonTile(), skeletonTile());
    activityListEl.replaceChildren(
      ...[0, 1, 2, 3].map(() =>
        el('div', { class: 'txn' }, el('div', { class: 'txn-main' }, el('div', { class: 'txn-desc skeleton', text: 'Merchant name' })), el('div', { class: 'txn-amount skeleton', text: '000.00' })),
      ),
    );
  } else {
    activityTilesEl.replaceChildren();
    activityListEl.replaceChildren();
  }
}

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
  } else if (onAccounts && state.activity.error) {
    kind = state.activity.data ? 'warning' : 'critical';
    title = state.activity.data ? 'Could not refresh the transactions.' : 'Could not load the transactions.';
    detail = state.activity.error;
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
  noticeEl.replaceChildren(
    el('span', { class: 'notice-icon', 'aria-hidden': 'true' }),
    el('div', {}, el('strong', { text: title }), ' ', detail),
  );
  noticeEl.hidden = false;
}

function renderUpdated() {
  if (state.gate) {
    updatedEl.textContent = '';
    return;
  }
  const onAccounts = state.route.screen === 'accounts';
  const busy = state.loading || (onAccounts && state.activity.loading);
  const stamp = onAccounts && state.activity.data ? state.activity.data.fetchedAt : state.data ? state.data.fetchedAt : null;
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
    gateEl.replaceChildren(
      el('div', { class: 'gate' }, el('h2', { text: 'Password not set' }), el('p', { text: gate.message })),
    );
  } else {
    const input = el('input', {
      id: 'password',
      type: 'password',
      autocomplete: 'current-password',
      placeholder: 'Password',
      required: true,
    });
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
      // Hidden username lets password managers file the entry under this site.
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
  for (const link of navLinks) {
    link.setAttribute('aria-current', link.dataset.screen === state.route.screen ? 'page' : 'false');
  }
  const busy = state.loading || (onAccounts && state.activity.loading);
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
    cacheHintEl.textContent =
      minutes >= 1 ? `Data is cached for ${plural(minutes, 'minute')}. Refresh fetches it again.` : 'Refresh fetches the data again.';
  } else {
    cacheHintEl.textContent = '';
  }

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
  for (const option of (state.data && state.data.groupOptions) || []) {
    options.push(el('option', { value: option.id, text: option.label }));
  }
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

async function saveSettings(accounts) {
  if (state.settings.persistent === true) {
    const res = await fetch('/api/settings', { method: 'PUT', headers: apiHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ accounts }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body && (body.message || body.error)) || `Saving failed with status ${res.status}`);
    state.settings = { ...state.settings, persistent: body.persistent, kind: body.kind, error: body.error ?? null, accounts: body.accounts };
    return;
  }
  writeLocalSettings(accounts);
  state.settings = { ...state.settings, accounts };
}

async function submitEditor(event) {
  event.preventDefault();
  const account = state.editing;
  if (!account) return;

  const entry = {};
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

  const accounts = { ...state.settings.accounts };
  if (Object.keys(entry).length > 0) accounts[String(account.id)] = entry;
  else delete accounts[String(account.id)];

  editorSave.disabled = true;
  try {
    await saveSettings(accounts);
  } catch (err) {
    editorError.textContent = err && err.message ? err.message : 'Could not save.';
    editorError.hidden = false;
    editorSave.disabled = false;
    return;
  }
  closeEditor();
  state.activity = { ...state.activity, key: null }; // treatments changed: recompute closing balances
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
    // Wrong or missing password: forget it and ask.
    sessionPassword = '';
    writePassword('');
    state.data = null;
    state.activity = { key: null, data: null, loading: false, error: null, showAll: false };
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

async function load({ refresh = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  state.error = null;
  render();
  try {
    const password = sessionPassword || readPassword();
    const res = await fetch(`/api/balances${refresh ? '?refresh=1' : ''}`, { headers: apiHeaders() });
    const body = await res.json().catch(() => null);
    if (handleUnauthorized(res, body, password)) return;
    if (!res.ok) {
      throw new Error((body && (body.message || body.error)) || `Request failed with status ${res.status}`);
    }
    state.gate = null;
    state.data = body;
    if (body.settings) {
      const local = readLocalSettings();
      if (body.settings.persistent === true) {
        // The server keeps settings now. Move anything saved in this browser over, once, if the server has none yet.
        if (!state.migrated && Object.keys(local).length > 0 && Object.keys(body.settings.accounts || {}).length === 0) {
          state.migrated = true;
          state.settings = { persistent: true, kind: body.settings.kind, error: null, accounts: {} };
          try {
            await saveSettings(local);
            writeLocalSettings(null);
            state.loading = false;
            return load();
          } catch {
            /* keep the local copy; the next save will try again */
          }
        } else {
          writeLocalSettings(null);
        }
      }
      state.settings = {
        persistent: body.settings.persistent,
        kind: body.settings.kind,
        error: body.settings.error ?? null,
        accounts: body.settings.persistent ? body.settings.accounts || {} : local,
      };
    }
  } catch (err) {
    state.error = err && err.message ? err.message : 'Unknown error';
  } finally {
    state.loading = false;
    render();
    ensureActivity();
  }
}

async function loadActivity({ account, from, to, key, refresh = false }) {
  state.activity = { key, data: state.activity.key === key ? state.activity.data : null, loading: true, error: null, showAll: false };
  render();
  try {
    const params = new URLSearchParams({ account: String(account.id), from, to });
    if (refresh) params.set('refresh', '1');
    const password = sessionPassword || readPassword();
    const res = await fetch(`/api/activity?${params}`, { headers: apiHeaders() });
    const body = await res.json().catch(() => null);
    if (state.activity.key !== key) return; // the viewer moved on
    if (handleUnauthorized(res, body, password)) return;
    if (!res.ok) throw new Error((body && (body.message || body.error)) || `Request failed with status ${res.status}`);
    state.activity = { key, data: body, loading: false, error: null, showAll: false };
  } catch (err) {
    if (state.activity.key !== key) return;
    state.activity = { ...state.activity, loading: false, error: err && err.message ? err.message : 'Unknown error' };
  } finally {
    if (state.activity.key === key) {
      state.activity.loading = false;
      render();
    }
  }
}

/** Load the selected account's activity when the accounts screen needs it. */
function ensureActivity({ refresh = false, force = false } = {}) {
  if (state.route.screen !== 'accounts' || !state.data || state.gate) return;
  const account = selectedAccount();
  if (!account) return;
  const { from, to } = periodRange(state.route.period);
  const key = `${account.id}|${from}|${to}`;
  if (!refresh && !force && state.activity.key === key && (state.activity.data || state.activity.loading)) return;
  loadActivity({ account, from, to, key, refresh });
}

// ---------- wiring ----------

refreshBtn.addEventListener('click', () => {
  load({ refresh: true });
  if (state.route.screen === 'accounts') ensureActivity({ refresh: true });
});
lockBtn.addEventListener('click', () => {
  sessionPassword = '';
  writePassword('');
  state.data = null;
  state.error = null;
  state.activity = { key: null, data: null, loading: false, error: null, showAll: false };
  state.gate = { kind: 'password', message: '' };
  render();
});
viewToggleEl.addEventListener('click', (event) => {
  const button = event.target.closest('.seg-btn');
  if (!button || button.dataset.view === state.view) return;
  state.view = button.dataset.view === 'bank' ? 'bank' : 'type';
  writeView(state.view);
  render();
});
window.addEventListener('hashchange', () => {
  state.route = parseHash();
  render();
  ensureActivity();
});

setInterval(renderUpdated, 30_000);
setInterval(() => {
  if (document.visibilityState !== 'visible' || state.gate) return;
  load();
  if (state.route.screen === 'accounts') ensureActivity({ force: true });
}, AUTO_RELOAD_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.data || state.gate) return;
  if (Date.now() - new Date(state.data.fetchedAt).getTime() > AUTO_RELOAD_MS) load();
});

render();
load();
