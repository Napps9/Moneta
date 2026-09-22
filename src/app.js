import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { LunchFlowError } from './lunchflow.js';

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

function send(res, status, body, type) {
  res.statusCode = status;
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  res.setHeader('Content-Type', type);
  const payload = Buffer.from(body);
  res.setHeader('Content-Length', payload.length);
  if (res.req && res.req.method === 'HEAD') return res.end();
  return res.end(payload);
}

const sendJson = (res, status, body) => send(res, status, JSON.stringify(body), MIME['.json']);
const sendText = (res, status, body) => send(res, status, body, MIME['.txt']);

function describeUpstreamError(err) {
  if (err instanceof LunchFlowError) {
    if (err.status === 401 || err.status === 403) {
      return {
        status: 502,
        body: {
          error: 'Lunch Flow rejected the API key',
          message: `${err.message}. Check LUNCHFLOW_API_KEY in your .env file.`,
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

export function createRequestHandler({ service, publicDir, logger = console }) {
  if (!service) throw new Error('A balance service is required');
  if (!publicDir) throw new Error('A public directory is required');
  const root = path.resolve(publicDir);

  async function handleBalances(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const refresh = /^(1|true|yes)$/i.test(url.searchParams.get('refresh') ?? '');
    try {
      const data = await service.getSnapshot({ refresh });
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 200, data);
    } catch (err) {
      logger.error?.(`Balance snapshot failed: ${err && err.message ? err.message : err}`);
      const { status, body } = describeUpstreamError(err);
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, status, body);
    }
  }

  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return sendText(res, 405, 'Method not allowed');
    }
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return sendText(res, 400, 'Bad request');
    }
    if (decoded.includes('\0')) return sendText(res, 400, 'Bad request');

    const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
    const filePath = path.resolve(root, relative);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) return sendText(res, 404, 'Not found');

    let info;
    try {
      info = await stat(filePath);
    } catch {
      return sendText(res, 404, 'Not found');
    }
    if (!info.isFile()) return sendText(res, 404, 'Not found');

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
      return sendText(res, 400, 'Bad request');
    }

    try {
      if (url.pathname === '/api/balances') return await handleBalances(req, res, url);
      if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true });
      if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
      return await serveStatic(req, res, url.pathname);
    } catch (err) {
      logger.error?.(err);
      if (!res.headersSent) return sendJson(res, 500, { error: 'Internal error', message: 'Unexpected server error' });
      res.destroy();
    }
  };
}
