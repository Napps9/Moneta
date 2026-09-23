import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { LunchFlowError } from './lunchflow.js';
import { MAX_SETTINGS_BYTES, parseSettingsJson } from './settings.js';
import { ActivityError } from './activity.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function send(req, res, status, body, type) {
  res.statusCode = status;
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  res.setHeader('Content-Type', type);
  const payload = Buffer.from(body);
  res.setHeader('Content-Length', payload.length);
  if (req.method === 'HEAD') return res.end();
  return res.end(payload);
}

const sendJson = (req, res, status, body) => send(req, res, status, JSON.stringify(body), MIME['.json']);
const sendText = (req, res, status, body) => send(req, res, status, body, MIME['.txt']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Read a JSON request body, whether the host already parsed it (Vercel) or it is still a stream. */
async function readJsonBody(req, limit = MAX_SETTINGS_BYTES) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    return parseSettingsJson(String(req.body));
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? parseSettingsJson(text) : {};
}

/**
 * Settings the page sends along when the server has nowhere to keep them:
 * in a POST body as `{ settings }` (any size), or in an `x-moneta-settings`
 * header for small payloads. A body that cannot be read throws.
 */
async function settingsFromRequest(req) {
  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    return body && typeof body === 'object' && body.settings && typeof body.settings === 'object' ? body.settings : null;
  }
  const header = req.headers['x-moneta-settings'];
  if (!header) return null;
  try {
    return parseSettingsJson(Array.isArray(header) ? header[0] : header);
  } catch {
    return null;
  }
}

const READ_METHODS = ['GET', 'HEAD', 'POST'];

function checkAuth(auth, req) {
  if (!auth) return null;
  return auth.check(req);
}

function describeUpstreamError(err) {
  if (err instanceof LunchFlowError) {
    if (err.status === 401 || err.status === 403) {
      return {
        status: 502,
        body: {
          error: 'Lunch Flow rejected the API key',
          message: `${err.message}. Check LUNCHFLOW_API_KEY in your environment.`,
          upstreamStatus: err.status,
        },
      };
    }
    return {
      status: 502,
      body: { error: 'Lunch Flow request failed', message: err.message, upstreamStatus: err.status },
    };
  }
  return { status: 500, body: { error: 'Internal error', message: err && err.message ? err.message : String(err) } };
}

/**
 * Handler for `GET /api/balances`. Works both inside the Node server and as a
 * serverless function, since it only relies on the standard request/response API.
 */
export function createBalancesHandler({ service = null, auth = null, logger = console } = {}) {
  return async function handleBalances(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!READ_METHODS.includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, POST');
      return sendJson(req, res, 405, { error: 'Method not allowed' });
    }
    const denied = checkAuth(auth, req);
    if (denied) {
      if (denied.status === 401 && denied.attempted) await sleep(300); // slow down guessing
      return sendJson(req, res, denied.status, denied.body);
    }
    if (!service) {
      return sendJson(req, res, 503, {
        error: 'Lunch Flow API key not configured',
        message: 'Set LUNCHFLOW_API_KEY in the environment variables (or LUNCHFLOW_MOCK=1 for sample data) and redeploy.',
      });
    }

    let url;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      return sendJson(req, res, 400, { error: 'Bad request' });
    }
    const refresh = /^(1|true|yes)$/i.test(url.searchParams.get('refresh') ?? '');
    let settings;
    try {
      settings = await settingsFromRequest(req);
    } catch (err) {
      return sendJson(req, res, 400, { error: 'Bad request', message: err.message });
    }
    try {
      const data = await service.getSnapshot({ refresh, settings });
      return sendJson(req, res, 200, data);
    } catch (err) {
      logger.error?.(`Balance snapshot failed: ${err && err.message ? err.message : err}`);
      const { status, body } = describeUpstreamError(err);
      return sendJson(req, res, status, body);
    }
  };
}

/** Handler for `GET|POST /api/sheet?account=&to=YYYY-MM&months=6`: the Accounts sheet. */
export function createSheetHandler({ service = null, auth = null, logger = console } = {}) {
  return async function handleSheet(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!READ_METHODS.includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, POST');
      return sendJson(req, res, 405, { error: 'Method not allowed' });
    }
    const denied = checkAuth(auth, req);
    if (denied) {
      if (denied.status === 401 && denied.attempted) await sleep(300);
      return sendJson(req, res, denied.status, denied.body);
    }
    if (!service) {
      return sendJson(req, res, 503, { error: 'Lunch Flow API key not configured', message: 'Set LUNCHFLOW_API_KEY and redeploy.' });
    }
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      return sendJson(req, res, 400, { error: 'Bad request' });
    }
    const accountId = url.searchParams.get('account');
    if (!accountId) return sendJson(req, res, 400, { error: 'Bad request', message: 'account is required' });
    let settings;
    try {
      settings = await settingsFromRequest(req);
    } catch (err) {
      return sendJson(req, res, 400, { error: 'Bad request', message: err.message });
    }
    try {
      const data = await service.getSheet({
        accountId,
        to: url.searchParams.get('to'),
        months: url.searchParams.get('months') ?? 6,
        ahead: url.searchParams.get('ahead') ?? 3,
        refresh: /^(1|true|yes)$/i.test(url.searchParams.get('refresh') ?? ''),
        settings,
      });
      return sendJson(req, res, 200, data);
    } catch (err) {
      if (err instanceof ActivityError) {
        return sendJson(req, res, err.status, { error: err.status === 404 ? 'Not found' : 'Bad request', message: err.message });
      }
      logger.error?.(`Sheet request failed: ${err && err.message ? err.message : err}`);
      const { status, body } = describeUpstreamError(err);
      return sendJson(req, res, status, body);
    }
  };
}

/**
 * Handler for `POST /api/reconcile?account=` with `{ ledger, settings? }`: match a ledger kept elsewhere
 * (see src/ledger.js) to the account's transactions and propose the choices, rules and budgets.
 * Nothing is saved; the page applies what comes back through the settings.
 */
export function createReconcileHandler({ service = null, auth = null, logger = console } = {}) {
  return async function handleReconcile(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(req, res, 405, { error: 'Method not allowed' });
    }
    const denied = checkAuth(auth, req);
    if (denied) {
      if (denied.status === 401 && denied.attempted) await sleep(300);
      return sendJson(req, res, denied.status, denied.body);
    }
    if (!service) {
      return sendJson(req, res, 503, { error: 'Lunch Flow API key not configured', message: 'Set LUNCHFLOW_API_KEY and redeploy.' });
    }
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      return sendJson(req, res, 400, { error: 'Bad request' });
    }
    const accountId = url.searchParams.get('account');
    if (!accountId) return sendJson(req, res, 400, { error: 'Bad request', message: 'account is required' });
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(req, res, 400, { error: 'Bad request', message: err.message });
    }
    if (!body || typeof body !== 'object' || !body.ledger || typeof body.ledger !== 'object') {
      return sendJson(req, res, 400, { error: 'Bad request', message: 'ledger is required: { entries: [{ month, kind, category, amount }] }' });
    }
    const settings = body.settings && typeof body.settings === 'object' ? body.settings : null;
    try {
      const data = await service.reconcile({ accountId, ledger: body.ledger, settings });
      return sendJson(req, res, 200, data);
    } catch (err) {
      if (err instanceof ActivityError) {
        return sendJson(req, res, err.status, { error: err.status === 404 ? 'Not found' : 'Bad request', message: err.message });
      }
      logger.error?.(`Reconcile request failed: ${err && err.message ? err.message : err}`);
      const { status, body: payload } = describeUpstreamError(err);
      return sendJson(req, res, status, payload);
    }
  };
}

/** Handler for `GET /api/activity?account=&from=&to=`: one account's money in, money out and balances for a period. */
export function createActivityHandler({ service = null, auth = null, logger = console } = {}) {
  return async function handleActivity(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return sendJson(req, res, 405, { error: 'Method not allowed' });
    }
    const denied = checkAuth(auth, req);
    if (denied) {
      if (denied.status === 401 && denied.attempted) await sleep(300);
      return sendJson(req, res, denied.status, denied.body);
    }
    if (!service) {
      return sendJson(req, res, 503, { error: 'Lunch Flow API key not configured', message: 'Set LUNCHFLOW_API_KEY and redeploy.' });
    }
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      return sendJson(req, res, 400, { error: 'Bad request' });
    }
    const accountId = url.searchParams.get('account');
    if (!accountId) return sendJson(req, res, 400, { error: 'Bad request', message: 'account is required' });
    const refresh = /^(1|true|yes)$/i.test(url.searchParams.get('refresh') ?? '');
    let settings;
    try {
      settings = await settingsFromRequest(req);
    } catch (err) {
      return sendJson(req, res, 400, { error: 'Bad request', message: err.message });
    }
    try {
      const data = await service.getActivity({
        accountId,
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        refresh,
        settings,
      });
      return sendJson(req, res, 200, data);
    } catch (err) {
      if (err instanceof ActivityError) {
        return sendJson(req, res, err.status, { error: err.status === 404 ? 'Not found' : 'Bad request', message: err.message });
      }
      logger.error?.(`Activity request failed: ${err && err.message ? err.message : err}`);
      const { status, body } = describeUpstreamError(err);
      return sendJson(req, res, status, body);
    }
  };
}

/** Handler for `GET` and `PUT /api/settings`: per-account settings made in the app. */
export function createSettingsHandler({ service = null, auth = null, logger = console } = {}) {
  return async function handleSettings(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'PUT') {
      res.setHeader('Allow', 'GET, HEAD, PUT');
      return sendJson(req, res, 405, { error: 'Method not allowed' });
    }
    const denied = checkAuth(auth, req);
    if (denied) {
      if (denied.status === 401 && denied.attempted) await sleep(300);
      return sendJson(req, res, denied.status, denied.body);
    }
    if (!service) {
      return sendJson(req, res, 503, { error: 'Lunch Flow API key not configured', message: 'Set LUNCHFLOW_API_KEY and redeploy.' });
    }
    try {
      if (req.method === 'PUT') {
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          return sendJson(req, res, 400, { error: 'Bad request', message: err.message });
        }
        return sendJson(req, res, 200, await service.saveSettings(body));
      }
      return sendJson(req, res, 200, await service.getSettings());
    } catch (err) {
      logger.error?.(`Settings request failed: ${err && err.message ? err.message : err}`);
      return sendJson(req, res, 500, { error: 'Settings storage failed', message: err && err.message ? err.message : String(err) });
    }
  };
}

/** Handler for `GET /api/health`. Tells the page whether a password is needed. */
export function createHealthHandler({ auth = null } = {}) {
  return function handleHealth(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    return sendJson(req, res, 200, { ok: true, passwordRequired: Boolean(auth && auth.enabled) });
  };
}

/** Full handler for the self-hosted server: the API plus the static page. */
export function createRequestHandler({ service = null, activity = null, auth = null, publicDir, logger = console }) {
  if (!publicDir) throw new Error('A public directory is required');
  const root = path.resolve(publicDir);
  const balances = createBalancesHandler({ service, auth, logger });
  const settings = createSettingsHandler({ service, auth, logger });
  const activityHandler = createActivityHandler({ service: activity, auth, logger });
  const sheet = createSheetHandler({ service: activity, auth, logger });
  const reconcile = createReconcileHandler({ service: activity, auth, logger });
  const health = createHealthHandler({ auth });

  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return sendText(req, res, 405, 'Method not allowed');
    }
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return sendText(req, res, 400, 'Bad request');
    }
    if (decoded.includes('\0')) return sendText(req, res, 400, 'Bad request');

    const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
    const filePath = path.resolve(root, relative);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) return sendText(req, res, 404, 'Not found');

    let info;
    try {
      info = await stat(filePath);
    } catch {
      return sendText(req, res, 404, 'Not found');
    }
    if (!info.isFile()) return sendText(req, res, 404, 'Not found');

    res.statusCode = 200;
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Content-Length', info.size);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.method === 'HEAD') return res.end();

    await new Promise((resolve) => {
      const stream = createReadStream(filePath);
      stream.on('error', (err) => {
        logger.error?.(`Failed to read ${filePath}: ${err.message}`);
        res.destroy(err);
        resolve();
      });
      stream.on('close', resolve);
      stream.pipe(res);
    });
  }

  return async function handleRequest(req, res) {
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      return sendText(req, res, 400, 'Bad request');
    }

    try {
      if (url.pathname === '/api/balances') return await balances(req, res);
      if (url.pathname === '/api/settings') return await settings(req, res);
      if (url.pathname === '/api/activity') return await activityHandler(req, res);
      if (url.pathname === '/api/sheet') return await sheet(req, res);
      if (url.pathname === '/api/reconcile') return await reconcile(req, res);
      if (url.pathname === '/api/health') return health(req, res);
      if (url.pathname.startsWith('/api/')) return sendJson(req, res, 404, { error: 'Not found' });
      return await serveStatic(req, res, url.pathname);
    } catch (err) {
      logger.error?.(err);
      if (!res.headersSent) return sendJson(req, res, 500, { error: 'Internal error', message: 'Unexpected server error' });
      res.destroy();
    }
  };
}
