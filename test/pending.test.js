import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupePending } from '../src/pending.js';

const tx = (id, date, amount, description, pending = false) => ({ id, date, amount, description, merchant: null, pending });

test('a pending transaction whose posted twin has arrived is dropped', () => {
  const list = [
    tx('p1', '2026-09-20', -24, 'PRET A MANGER', true),
    tx('c1', '2026-09-22', -24, 'PRET A MANGER LONDON'),
    tx('p2', '2026-09-21', -80.5, 'TESCO STORES 1234', true),
    tx('c2', '2026-09-23', -80.5, 'TESCO STORES 1234'),
    tx('p3', '2026-09-23', -3.5, 'COSTA', true),
  ];
  assert.deepEqual(dedupePending(list).map((t) => t.id), ['c1', 'c2', 'p3'], 'the two that cleared under new ids go; the one still pending stays');
});

test('only a later or same-day posted transaction of the same amount and merchant counts as the twin', () => {
  const earlier = [tx('c1', '2026-09-19', -3.5, 'COSTA'), tx('p1', '2026-09-20', -3.5, 'COSTA', true)];
  assert.deepEqual(dedupePending(earlier).map((t) => t.id), ['c1', 'p1'], 'yesterday’s coffee is not today’s pending one');

  const tooLate = [tx('p1', '2026-09-10', -3.5, 'COSTA', true), tx('c1', '2026-09-19', -3.5, 'COSTA')];
  assert.deepEqual(dedupePending(tooLate).map((t) => t.id), ['p1', 'c1'], 'more than a week on is a different purchase');

  const otherAmount = [tx('p1', '2026-09-20', -3.5, 'COSTA', true), tx('c1', '2026-09-21', -3.6, 'COSTA')];
  assert.equal(dedupePending(otherAmount).length, 2);

  const otherShop = [tx('p1', '2026-09-20', -3.5, 'COSTA', true), tx('c1', '2026-09-21', -3.5, 'GREGGS')];
  assert.equal(dedupePending(otherShop).length, 2);

  const sameDay = [tx('p1', '2026-09-20', -3.5, 'COSTA', true), tx('c1', '2026-09-20', -3.5, 'COSTA COFFEE')];
  assert.deepEqual(dedupePending(sameDay).map((t) => t.id), ['c1']);
});

test('each posted transaction stands in for at most one pending one, the oldest first', () => {
  const list = [
    tx('p2', '2026-09-20', -10, 'UBER', true),
    tx('p1', '2026-09-18', -10, 'UBER', true),
    tx('c1', '2026-09-21', -10, 'UBER TRIP'),
  ];
  assert.deepEqual(dedupePending(list).map((t) => t.id), ['p2', 'c1'], 'the posted one clears the pending one that has waited longest, whatever the list order');
  assert.deepEqual(dedupePending([]), []);
  assert.deepEqual(dedupePending(null), []);
});
