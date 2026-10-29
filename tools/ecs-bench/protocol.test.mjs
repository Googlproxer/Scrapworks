import assert from 'node:assert/strict';
import test from 'node:test';
import { statistics } from './experiment.ts';
import { recordFor, statusFor } from './model.ts';
import { Reference } from './adapters/reference.ts';
import { Session } from './check.ts';
import { isJobResultFile } from './report.mjs';
import { runSignature } from './options.mjs';
import { expectedDirtyCounts } from './consumer.ts';

test('publication guards account for active entities, overlapping edits and churn at every command phase', async () => {
  for (const size of [1000, 10000])
    for (const workload of ['mixed', 'idle', 'active', 'churn']) {
      const fixture = { size, seed: 1729, workload };
      const expected = expectedDirtyCounts(fixture);
      const world = new Reference(fixture);
      try {
        for (let tick = 1; tick <= 200; tick++) {
          world.step();
          const view = await world.project();
          assert.equal(view.records.length, expected[tick % 100], `${size}/${workload}/${tick}`);
          assert.equal(view.removed.length, workload === 'churn' ? size / 100 : 0);
        }
      } finally {
        world.dispose();
      }
    }
});

test('resume cannot silently mix different tick, scale or candidate settings', () => {
  const original = ['full', '--output', 'tmp/a', '--ticks', '2000', '--scales', '100000'];
  assert.equal(
    runSignature(original),
    runSignature([
      'full',
      '--scales',
      '100000',
      '--ticks',
      '2000',
      '--resume',
      '--output',
      'tmp/a',
    ]),
  );
  assert.notEqual(
    runSignature(original),
    runSignature(['full', '--output', 'tmp/a', '--ticks', '50', '--scales', '100000', '--resume']),
  );
});

test('profile streams and progress checkpoints never become failed benchmark jobs', () => {
  assert.equal(isJobResultFile('0017-browser-profile-becsy-100000-all-0.json'), true);
  for (const name of [
    'manifest.json',
    'completion.json',
    '0017-browser-profile-becsy-100000-all-0.json.progress.json',
    '0017-browser-profile-becsy-100000-all-0.json.trace.json',
  ])
    assert.equal(isJobResultFile(name), false);
});

test('percentiles retain the observed tail rather than averaging it away', () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.deepEqual(statistics(values), { p50: 50, p95: 95, p99: 99, max: 100, mean: 50.5 });
  assert.throws(() => statistics([]));
});
test('canonical fixture has exact meaningful entity and status populations', () => {
  for (const workload of ['mixed', 'idle', 'active']) {
    const fixture = { size: 1000, seed: 1729, workload };
    const counts = { processor: 0, owner: 0, deposit: 0, pile: 0 };
    const status = [0, 0, 0];
    for (let i = 0; i < fixture.size; i++) {
      const r = recordFor(i, fixture);
      counts[r.payload.kind]++;
      if (r.payload.kind === 'processor') status[statusFor(i, workload)]++;
    }
    assert.deepEqual(counts, { processor: 600, owner: 200, deposit: 100, pile: 100 });
    assert.deepEqual(
      status,
      workload === 'mixed' ? [120, 360, 120] : workload === 'idle' ? [6, 534, 60] : [600, 0, 0],
    );
  }
});
test('paced scheduler handles zero/invalid delta, pause and bounded catch-up', async () => {
  const world = new Reference({ size: 1000, seed: 1729, workload: 'mixed' });
  const session = new Session(world);
  await session.advance(Number.NaN);
  await session.advance(-1);
  await session.advance(0);
  assert.equal(world.resources.tick, 0);
  await session.advance(10);
  assert.equal(world.resources.tick, 5);
  session.pause(true);
  await session.advance(1);
  session.pause(false);
  await session.advance(0.01);
  assert.equal(world.resources.tick, 5);
  await session.advance(0.04);
  assert.equal(world.resources.tick, 6);
  world.dispose();
});
