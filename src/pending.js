/**
 * Pending transactions that have since cleared.
 *
 * Lunch Flow warns that when a pending purchase posts, the bank may hand it back as a brand-new
 * record with a different id rather than updating the pending one, and that pending ones can also
 * vanish. So a pending transaction whose posted twin is present is dropped: same amount to the
 * penny, a similar merchant or description, dated on the same day or up to a week later. Each
 * posted transaction stands in for at most one pending one, the oldest first, and a posted
 * transaction dated before the pending one is never its twin, so two coffees of the same price on
 * consecutive days are left alone.
 */
const WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const words = (txn) =>
  String((txn && (txn.merchant || txn.description)) || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function alike(a, b) {
  const x = words(a);
  const y = words(b);
  if (!x || !y) return x === y;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const firstX = x.split(' ')[0];
  const firstY = y.split(' ')[0];
  return firstX.length >= 3 && firstX === firstY;
}

const day = (iso) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
const daysBetween = (from, to) => Math.round((day(to) - day(from)) / DAY_MS);

export function dedupePending(transactions) {
  const list = Array.isArray(transactions) ? transactions : [];
  const posted = list.filter((txn) => txn && !txn.pending && Number.isFinite(Number(txn.amount)));
  // Oldest pending first: the one that has waited longest is the likeliest to have cleared.
  const pending = list.filter((txn) => txn && txn.pending).sort((a, b) => (String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : 0));
  const taken = new Set();
  const dropped = new Set();
  for (const txn of pending) {
    const pence = Math.round(Number(txn.amount) * 100);
    if (!Number.isFinite(pence)) continue;
    let twin = null;
    for (const candidate of posted) {
      if (taken.has(candidate) || Math.round(Number(candidate.amount) * 100) !== pence) continue;
      const gap = daysBetween(txn.date, candidate.date);
      if (!Number.isFinite(gap) || gap < 0 || gap > WINDOW_DAYS || !alike(txn, candidate)) continue;
      if (!twin || gap < daysBetween(txn.date, twin.date)) twin = candidate;
    }
    if (twin) {
      taken.add(twin);
      dropped.add(txn);
    }
  }
  return list.filter((txn) => !dropped.has(txn));
}
