import assert from 'node:assert/strict';
import { test } from 'vitest';
import { canFollowReportedPaint } from '../../tests/acceptance/paint-timing.ts';

test('paint ordering accounts only for the documented upward-rounded presentation bucket', () => {
  // CI observation: actual presentation can be in (36, 40], then reported as 40.
  assert.equal(canFollowReportedPaint(37.6, 40), true);
  assert.equal(canFollowReportedPaint(40, 40), true);
  assert.equal(canFollowReportedPaint(41, 40), true);
  // Earlier buckets are unambiguously before paint and must still fail.
  assert.equal(canFollowReportedPaint(36, 40), false);
  assert.equal(canFollowReportedPaint(35.9, 40), false);
  for (const pair of [
    [0, 40],
    [40, 0],
    [NaN, 40],
    [40, Infinity],
    [-1, 40],
  ])
    assert.equal(canFollowReportedPaint(pair[0], pair[1]), false);
});
