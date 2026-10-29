import test from 'node:test';
import assert from 'node:assert/strict';
import { Credits, validRequest } from './protocol.ts';

test('outstanding work and accumulated time share one five-step budget', () => {
  const credits = new Credits();
  credits.add(10000);
  assert.equal(credits.take(5), 5);
  credits.add(100, 5);
  assert.equal(credits.take(5), 0);
  assert.equal(credits.max, 250);
  assert.equal(credits.dropped, 9850);
});
test('pause clears fractional elapsed time and invalid deltas add nothing', () => {
  const credits = new Credits();
  credits.add(49);
  credits.clear();
  for (const delta of [NaN, Infinity, -10, 0]) credits.add(delta);
  assert.equal(credits.take(), 0);
  credits.add(50);
  assert.equal(credits.take(), 1);
});
test('invalid envelopes, movement and unbounded command batches are rejected', () => {
  const request = {
    protocol: 1,
    generation: 1,
    revision: 0,
    id: 1,
    operation: 'advance',
    sentEpoch: 0,
    steps: 1,
  };
  validRequest(request);
  for (const patch of [
    { protocol: 2 },
    { steps: 6 },
    { steps: -1 },
    { operation: 'invented' },
    { input: { x: NaN, z: 0, sprint: false } },
    { commands: Array(257).fill({ sequence: 1, value: 1 }) },
  ])
    assert.throws(() => validRequest({ ...request, ...patch }));
});
test('uneven frames retain fractional time without repeating consumed credits', () => {
  const credits = new Credits();
  let ticks = 0;
  for (const delta of [16, 16, 18, 16, 17, 17, 200]) {
    credits.add(delta);
    ticks += credits.take(5);
  }
  assert.equal(ticks, 6);
  assert.equal(credits.elapsed, 0);
});
