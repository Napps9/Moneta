const totalsEl = document.getElementById('totals');
const accountsEl = document.getElementById('accounts');
const noticeEl = document.getElementById('notice');
const updatedEl = document.getElementById('updated');
const refreshBtn = document.getElementById('refresh');
const cacheHintEl = document.getElementById('cache-hint');

const AUTO_RELOAD_MS = 60_000;

const state = {
  data: null,
  loading: false,
  error: null,
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

function renderLogo(group) {
  const fallback = el('div', { class: 'logo-fallback', 'aria-hidden': 'true', text: group.name.trim().charAt(0) || '?' });
  if (!group.logo || !/^https?:\/\//i.test(group.logo)) return fallback;
  const img = el('img', {
    class: 'logo',
    src: group.logo,
    alt: '',
    loading: 'lazy',
    referrerpolicy: 'no-referrer',
  });
  img.addEventListener('error', () => img.replaceWith(fallback));
  return img;
}

function renderBadge(status) {
  const info = STATUS[status] || { label: status ? status.toLowerCase() : 'Unknown', kind: 'neutral' };
  return el('span', { class: `badge badge--${info.kind}`, text: info.label });
}

function renderAccountRow(account) {
  const inactive = account.status !== 'ACTIVE';
  const meta = [];
  if (inactive) meta.push(renderBadge(account.status));
  if (account.balance && account.balance.available != null && account.balance.available !== account.balance.current) {
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
    { class: `row${inactive ? ' row--inactive' : ''}` },
    el('div', { class: 'row-main' }, el('div', { class: 'row-name', text: account.name }), el('div', { class: 'row-meta' }, meta)),
    amount,
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

  if (!kind || loading) {
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
  if (loading && !data) {
    updatedEl.textContent = 'Loading…';
    return;
  }
  if (!data) {
    updatedEl.textContent = '';
    return;
  }
  const when = relativeTime(data.fetchedAt);
  updatedEl.textContent = `Updated ${when}`;
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

  accountsEl.replaceChildren(...groupByInstitution(data.accounts).map(renderInstitution));

  if (data.ttlSeconds > 0) {
    const minutes = Math.round(data.ttlSeconds / 60);
    cacheHintEl.textContent =
      minutes >= 1 ? `Balances are cached for ${plural(minutes, 'minute')}. Refresh fetches them again.` : 'Refresh fetches balances again.';
  } else {
    cacheHintEl.textContent = '';
  }
}

function render() {
  refreshBtn.disabled = state.loading;
  refreshBtn.textContent = state.loading ? 'Refreshing…' : 'Refresh';
  renderUpdated();
  renderNotice();
  if (state.data) renderData();
  else if (state.loading) renderSkeletons();
  else {
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
    const res = await fetch(`/api/balances${refresh ? '?refresh=1' : ''}`, { headers: { accept: 'application/json' } });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((body && (body.message || body.error)) || `Request failed with status ${res.status}`);
    }
    state.data = body;
  } catch (err) {
    state.error = err && err.message ? err.message : 'Unknown error';
  } finally {
    state.loading = false;
    render();
  }
}

refreshBtn.addEventListener('click', () => load({ refresh: true }));

setInterval(renderUpdated, 30_000);
setInterval(() => {
  if (document.visibilityState === 'visible') load();
}, AUTO_RELOAD_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.data) return;
  if (Date.now() - new Date(state.data.fetchedAt).getTime() > AUTO_RELOAD_MS) load();
});

load();
