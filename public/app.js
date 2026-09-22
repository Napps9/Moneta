const totalsEl = document.getElementById('totals');
const accountsEl = document.getElementById('accounts');
const noticeEl = document.getElementById('notice');
const gateEl = document.getElementById('gate');
const updatedEl = document.getElementById('updated');
const refreshBtn = document.getElementById('refresh');
const lockBtn = document.getElementById('lock');
const cacheHintEl = document.getElementById('cache-hint');

const viewToggleEl = document.getElementById('view-toggle');
const editorEl = document.getElementById('editor');
const editorForm = document.getElementById('editor-form');
const editorTitle = document.getElementById('editor-title');
const editorSub = document.getElementById('editor-sub');
const editorGroup = document.getElementById('editor-group');
const editorBalance = document.getElementById('editor-balance');
const editorLimitField = document.getElementById('editor-limit-field');
const editorLimit = document.getElementById('editor-limit');
const editorExplain = document.getElementById('editor-explain');
const editorError = document.getElementById('editor-error');
const editorHint = document.getElementById('editor-hint');
const editorCancel = document.getElementById('editor-cancel');
const editorSave = document.getElementById('editor-save');

const AUTO_RELOAD_MS = 60_000;
const PASSWORD_KEY = 'moneta.password';
const VIEW_KEY = 'moneta.view';
const SETTINGS_KEY = 'moneta.settings';

const TREATMENT_HELP = {
  reported: 'Uses the number exactly as Lunch Flow reports it.',
  negate: 'Lunch Flow reports what you owe as a positive number. It will be shown as negative and subtracted from the totals.',
  'credit-limit': 'Lunch Flow reports what is left to spend. What you owe is the credit limit minus that, shown as negative.',
};

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

const state = {
  data: null,
  loading: false,
  error: null,
  gate: null, // null | { kind: 'password' | 'unconfigured', message }
  view: readView(), // 'type' (savings / spending / credit) or 'bank' (by institution)
  settings: { persistent: null, kind: null, error: null, accounts: readLocalSettings() },
  editing: null, // the account open in the editor
  migrated: false,
};

const STATUS = {
  ACTIVE: { label: 'Active', kind: 'good' },
  DISCONNECTED: { label: 'Disconnected', kind: 'warning' },
  ERROR: { label: 'Error', kind: 'critical' },
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

// The password is kept in this browser only, as a convenience so the page opens straight to balances.
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

// ---------- rendering ----------

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
    el('div', { class: 'row-main' }, el('div', { class: 'row-name', text: account.name }), el('div', { class: 'row-meta' }, meta)),
    amount,
    el('button', { class: 'row-edit', type: 'button', 'aria-label': `Edit ${account.name}`, title: 'Edit', onclick: () => openEditor(account) }, pencilIcon()),
  );
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
    const headers = { 'content-type': 'application/json', accept: 'application/json' };
    const password = sessionPassword || readPassword();
    if (password) headers.authorization = `Bearer ${password}`;
    const res = await fetch('/api/settings', { method: 'PUT', headers, body: JSON.stringify({ accounts }) });
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

function renderViewToggle() {
  const hasGroups = Boolean(state.data && Array.isArray(state.data.groups) && state.data.groups.length > 0);
  viewToggleEl.hidden = !hasGroups;
  for (const button of viewToggleEl.querySelectorAll('.seg-btn')) {
    button.setAttribute('aria-pressed', button.dataset.view === state.view ? 'true' : 'false');
  }
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
    el('ul', { class: 'rows' }, group.accounts.map(renderAccountRow)),
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

/** Shrink a tile's value until it fits on one line, so a big number never wraps mid-digit. */
function fitTileValues() {
  for (const node of totalsEl.querySelectorAll('.tile-value')) {
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
  resizeTimer = setTimeout(fitTileValues, 100);
});

function renderSkeletons() {
  totalsEl.replaceChildren(
    ...[0, 1].map(() =>
      el(
        'div',
        { class: 'tile', 'aria-hidden': 'true' },
        el('div', { class: 'tile-label skeleton', text: 'Total' }),
        el('div', { class: 'tile-value skeleton', text: '0,000.00' }),
        el('div', { class: 'tile-meta skeleton', text: 'accounts' }),
      ),
    ),
  );
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

function renderNotice() {
  const { data, error, loading } = state;
  let kind = null;
  let title = '';
  let detail = '';

  if (error && !data) {
    kind = 'critical';
    title = 'Could not load balances.';
    detail = error;
  } else if (error && data) {
    kind = 'warning';
    title = 'Could not refresh.';
    detail = `${error} Showing balances from ${relativeTime(data.fetchedAt)}.`;
  } else if (data && data.stale) {
    kind = 'warning';
    title = 'Showing cached balances.';
    detail = data.error ? `The last refresh failed: ${data.error}` : 'The last refresh failed.';
  } else if (data && data.partial) {
    kind = 'warning';
    title = 'Some balances are missing.';
    detail = 'Lunch Flow could not return a balance for every account. Affected accounts are marked below.';
  }

  if (!kind || loading || state.gate) {
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
  const { data, loading } = state;
  if (state.gate) {
    updatedEl.textContent = '';
    return;
  }
  if (loading && !data) {
    updatedEl.textContent = 'Loading…';
    return;
  }
  if (!data) {
    updatedEl.textContent = '';
    return;
  }
  updatedEl.textContent = `Updated ${relativeTime(data.fetchedAt)}`;
  updatedEl.title = new Date(data.fetchedAt).toLocaleString();
}

function renderData() {
  const { data } = state;
  if (!data) return;

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
  fitTileValues();

  renderViewToggle();
  const byType = state.view === 'type' && Array.isArray(data.groups) && data.groups.length > 0;
  if (byType) {
    accountsEl.replaceChildren(...data.groups.map((group) => renderGroup(group, data.accounts)).filter(Boolean));
  } else {
    accountsEl.replaceChildren(...groupByInstitution(data.accounts).map(renderInstitution));
  }

  if (data.ttlSeconds > 0) {
    const minutes = Math.round(data.ttlSeconds / 60);
    cacheHintEl.textContent =
      minutes >= 1 ? `Balances are cached for ${plural(minutes, 'minute')}. Refresh fetches them again.` : 'Refresh fetches balances again.';
  } else {
    cacheHintEl.textContent = '';
  }
}

function render() {
  const gated = Boolean(state.gate);
  refreshBtn.hidden = gated;
  refreshBtn.disabled = state.loading;
  refreshBtn.textContent = state.loading ? 'Refreshing…' : 'Refresh';
  lockBtn.hidden = gated || !(sessionPassword || readPassword());
  renderUpdated();
  renderNotice();

  if (gated) {
    renderGate();
    totalsEl.replaceChildren();
    accountsEl.replaceChildren();
    viewToggleEl.hidden = true;
    cacheHintEl.textContent = '';
    return;
  }
  gateEl.hidden = true;
  gateEl.replaceChildren();

  if (state.data) renderData();
  else if (state.loading) {
    viewToggleEl.hidden = true;
    renderSkeletons();
  } else {
    viewToggleEl.hidden = true;
    totalsEl.replaceChildren();
    accountsEl.replaceChildren();
  }
}

// ---------- data ----------

async function load({ refresh = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  state.error = null;
  render();
  try {
    const headers = { accept: 'application/json' };
    const password = sessionPassword || readPassword();
    if (password) headers.authorization = `Bearer ${password}`;
    // Until the server says it stores settings itself, send the ones kept in this browser.
    if (state.settings.persistent !== true && Object.keys(state.settings.accounts).length > 0) {
      headers['x-moneta-settings'] = JSON.stringify({ accounts: state.settings.accounts });
    }

    const res = await fetch(`/api/balances${refresh ? '?refresh=1' : ''}`, { headers });
    const body = await res.json().catch(() => null);

    if (res.status === 401) {
      // Wrong or missing password: forget it and ask.
      sessionPassword = '';
      writePassword('');
      state.data = null;
      state.gate = { kind: 'password', message: password ? 'Wrong password. Try again.' : '' };
      return;
    }
    if (res.status === 503 && body && body.error === 'Password not configured') {
      state.data = null;
      state.gate = { kind: 'unconfigured', message: body.message };
      return;
    }
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
  }
}

refreshBtn.addEventListener('click', () => load({ refresh: true }));
viewToggleEl.addEventListener('click', (event) => {
  const button = event.target.closest('.seg-btn');
  if (!button || button.dataset.view === state.view) return;
  state.view = button.dataset.view === 'bank' ? 'bank' : 'type';
  writeView(state.view);
  render();
});
lockBtn.addEventListener('click', () => {
  sessionPassword = '';
  writePassword('');
  state.data = null;
  state.error = null;
  state.gate = { kind: 'password', message: '' };
  render();
});

setInterval(renderUpdated, 30_000);
setInterval(() => {
  if (document.visibilityState === 'visible' && !state.gate) load();
}, AUTO_RELOAD_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.data || state.gate) return;
  if (Date.now() - new Date(state.data.fetchedAt).getTime() > AUTO_RELOAD_MS) load();
});

load();
