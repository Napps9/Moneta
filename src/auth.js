import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value) => createHash('sha256').update(String(value)).digest();

/**
 * Optional password gate for the balances API.
 *
 * The page sends the password as `Authorization: Bearer <password>`. Protection is
 * on whenever a password is configured, or when `required` is set (public hosts
 * such as Vercel), in which case a missing password blocks the API with a clear
 * message instead of exposing balances.
 */
export function createAuth({ password = '', required = false } = {}) {
  const enabled = required || Boolean(password);
  const expected = password ? digest(password) : null;

  return {
    enabled,
    configured: Boolean(password),

    /** Returns null when the request may proceed, otherwise `{ status, body, attempted }`. */
    check(req) {
      if (!enabled) return null;
      if (!expected) {
        return {
          status: 503,
          attempted: false,
          body: {
            error: 'Password not configured',
            message: 'This deployment is public, so a password is required. Set MONETA_PASSWORD in the environment variables and redeploy.',
          },
        };
      }
      const header = req.headers?.authorization ?? '';
      const match = /^Bearer\s+(.+)$/i.exec(header);
      const supplied = match ? match[1].trim() : '';
      if (supplied && timingSafeEqual(digest(supplied), expected)) return null;
      return {
        status: 401,
        attempted: Boolean(supplied),
        body: { error: 'Unauthorized', message: supplied ? 'Wrong password.' : 'Password required.' },
      };
    },
  };
}
