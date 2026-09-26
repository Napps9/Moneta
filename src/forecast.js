/**
 * Forecasts that learn from their own track record.
 *
 * Each line (a category, uncategorised, transfers) has a history: its total in each complete month,
 * oldest first. Several ways of forecasting the next month are tried against that history as if
 * each past month were still to come, using only the months before it, and the way that would
 * have been closest over the recent months is used for the months ahead. Every month that passes
 * adds another test, so the choice gets better on its own. Nothing is stored.
 *
 *   average  the average of the last six months (the default for spending and transfers)
 *   latest   the same as last month (the default for income; right for rent, salaries, bills)
 *   median   a typical month of the last six, one-offs ignored
 *   recent   an average weighted towards the latest months, for lines that have shifted
 *   year     the average over the last twelve months, for lumpy lines paid a few times a year
 */
export const METHODS = ['average', 'latest', 'median', 'recent', 'year'];
export const MIN_PRIOR = 3; // months of history before a month can be used as a test
export const MAX_TESTS = 6; // how many recent months are tested
export const MIN_TESTS = 3; // fewer tests than this and the default stands

const round2 = (n) => Math.round(n * 100) / 100;
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

function median(list) {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The forecast for the month after `prior` (oldest first) by one method. */
export function forecastBy(method, prior) {
  const values = prior.map((v) => Number(v) || 0);
  if (!values.length) return 0;
  switch (method) {
    case 'latest':
      return values[values.length - 1];
    case 'median':
      return median(values.slice(-6));
    case 'recent': {
      let level = values[0];
      for (let i = 1; i < values.length; i += 1) level = 0.5 * values[i] + 0.5 * level;
      return level;
    }
    case 'year':
      return mean(values.slice(-12));
    case 'average':
    default:
      return mean(values.slice(-6));
  }
}

/**
 * Learn how to forecast one line from its monthly history (complete months, oldest first).
 * Returns the forecast, the method chosen, and how it fared: `error` is the average miss per
 * month over the months tested, `baselineError` the same for the default method, `tested` how
 * many months were tested. `trail` has, per tested month, the chosen and the default forecast and
 * what actually happened, so totals across lines can be judged the same way.
 */
export function learnForecast(series, { fallback = 'average' } = {}) {
  const history = (Array.isArray(series) ? series : []).map((v) => Number(v) || 0);
  const n = history.length;
  const first = Math.max(MIN_PRIOR, n - MAX_TESTS);
  const tests = [];
  for (let t = first; t < n; t += 1) {
    const prior = history.slice(0, t);
    const byMethod = {};
    for (const method of METHODS) byMethod[method] = forecastBy(method, prior);
    tests.push({ t, actual: history[t], byMethod });
  }
  const errorOf = (method) => mean(tests.map((test) => Math.abs(test.byMethod[method] - test.actual)));
  let method = fallback;
  if (tests.length >= MIN_TESTS) {
    const baseline = errorOf(fallback);
    let best = fallback;
    let bestError = baseline;
    for (const candidate of METHODS) {
      const error = errorOf(candidate);
      if (error < bestError) {
        best = candidate;
        bestError = error;
      }
    }
    // Only move off the default when the gain is real: at least 5% and 50p a month.
    if (best !== fallback && baseline - bestError >= Math.max(0.5, baseline * 0.05)) method = best;
  }
  return {
    value: round2(forecastBy(method, history)),
    method,
    fallback,
    months: n,
    tested: tests.length,
    error: tests.length ? round2(errorOf(method)) : null,
    baselineError: tests.length ? round2(errorOf(fallback)) : null,
    trail: tests.map((test) => ({ t: test.t, chosen: test.byMethod[method], baseline: test.byMethod[fallback], actual: test.actual })),
  };
}

/**
 * How a group of lines would have fared together: the average miss per month on their total,
 * for the learned forecasts and for the defaults, over the months every line was tested on.
 */
export function combinedAccuracy(learned) {
  const lines = learned.filter((item) => item && item.trail && item.trail.length);
  if (!lines.length) return null;
  const months = new Map();
  for (const line of lines) {
    for (const step of line.trail) {
      if (!months.has(step.t)) months.set(step.t, { chosen: 0, baseline: 0, actual: 0, count: 0 });
      const month = months.get(step.t);
      month.chosen += step.chosen;
      month.baseline += step.baseline;
      month.actual += step.actual;
      month.count += 1;
    }
  }
  const full = [...months.values()].filter((month) => month.count === lines.length);
  // Too few months to say, or nothing at all happened in them: nothing worth reporting.
  if (full.length < MIN_TESTS || full.every((month) => month.actual === 0)) return null;
  return {
    tested: full.length,
    error: round2(mean(full.map((m) => Math.abs(m.chosen - m.actual)))),
    baselineError: round2(mean(full.map((m) => Math.abs(m.baseline - m.actual)))),
  };
}

/** How far an amount set by hand would have been from what happened, month by month. */
export function setAccuracy(amount, series) {
  const recent = (Array.isArray(series) ? series : []).slice(-MAX_TESTS).map((v) => Number(v) || 0);
  if (amount == null || !Number.isFinite(Number(amount)) || recent.length < MIN_TESTS) return null;
  return { tested: recent.length, error: round2(mean(recent.map((v) => Math.abs(Number(amount) - v)))) };
}
