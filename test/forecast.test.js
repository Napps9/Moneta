import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinedAccuracy, forecastBy, learnForecast, setAccuracy } from '../src/forecast.js';

test('each method forecasts the next month from the months before it', () => {
  const prior = [100, 100, 100, 100, 400, 100];
  assert.equal(forecastBy('average', prior), 150);
  assert.equal(forecastBy('latest', prior), 100);
  assert.equal(forecastBy('median', prior), 100, 'one-offs are ignored');
  assert.equal(forecastBy('year', [10, 20, 30]), 20);
  assert.equal(forecastBy('recent', [0, 0, 100]), 50, 'weighted towards the latest months');
  assert.equal(forecastBy('average', []), 0);
});

test('a fixed payment learns to repeat itself', () => {
  // Rent that went up in the spring: the average lags, last month is right every time.
  const rent = [800, 800, 800, 800, 800, 800, 950, 950, 950, 950, 950, 950];
  const learned = learnForecast(rent, { fallback: 'average' });
  assert.equal(learned.method, 'latest');
  assert.equal(learned.value, 950);
  assert.equal(learned.tested, 6);
  assert.equal(learned.error, 25, 'only the month of the rise itself is missed, by 150');
  assert.equal(learned.baselineError, 87.5, 'the plain average would have lagged for months after it');
});

test('spending with one-off spikes learns to ignore them', () => {
  const food = [200, 210, 190, 205, 900, 195, 200, 210, 1200, 190, 205, 200];
  const learned = learnForecast(food, { fallback: 'average' });
  assert.equal(learned.method, 'median');
  assert.ok(learned.value >= 195 && learned.value <= 210);
  assert.ok(learned.error < learned.baselineError);
});

test('the default stands without enough history, or without a real gain', () => {
  const short = learnForecast([100, 120, 140], { fallback: 'average' });
  assert.deepEqual([short.method, short.tested, short.value, short.error], ['average', 0, 120, null], 'no month can be tested yet');
  const steady = learnForecast([100, 100, 100, 100, 100, 100, 100], { fallback: 'latest' });
  assert.equal(steady.method, 'latest', 'every method is exact, so the default is kept');
  assert.deepEqual(learnForecast([], { fallback: 'latest' }), { value: 0, method: 'latest', fallback: 'latest', months: 0, tested: 0, error: null, baselineError: null, trail: [] });
});

test('as months pass, more are tested', () => {
  const series = [50, 60, 55, 65, 58, 62, 57, 61, 59, 63];
  assert.equal(learnForecast(series.slice(0, 5)).tested, 2);
  assert.equal(learnForecast(series.slice(0, 8)).tested, 5);
  assert.equal(learnForecast(series).tested, 6, 'capped at the six most recent months');
});

test('lines are judged together on their monthly total', () => {
  const a = learnForecast([800, 800, 800, 950, 950, 950, 950], { fallback: 'average' });
  const b = learnForecast([100, 100, 100, 100, 100, 100, 100], { fallback: 'average' });
  const both = combinedAccuracy([a, b]);
  assert.equal(both.tested, 4);
  assert.equal(both.error, 37.5, 'the rise is missed once, then the total is exact');
  assert.equal(both.baselineError, 106.88);
  assert.equal(combinedAccuracy([learnForecast([1, 2])]), null, 'too little history to say');
});

test('an amount set by hand is checked against what happened', () => {
  assert.deepEqual(setAccuracy(150, [200, 200, 200, 200]), { tested: 4, error: 50 });
  assert.equal(setAccuracy(150, [200, 200]), null);
  assert.equal(setAccuracy(null, [200, 200, 200]), null);
});
