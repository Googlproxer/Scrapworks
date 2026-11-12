import test from 'node:test';
import assert from 'node:assert/strict';
import { requireLocal, requireRunRelease } from './protocol.ts';
import { replaceExact } from './instrument.ts';
import { distribution, pairedQuantileDifference } from './statistics.ts';
import { requireMatchingReply } from './physics-protocol.ts';
import type { PhysicsRequest, PhysicsReply } from './physics-protocol.ts';
import { detectResponse } from './detector.ts';
import { compareRunEvidence, type ResponseRun } from './comparison.ts';
import { ContactEngagement } from './contact-engagement.ts';
import type { TraceEvent } from './browser-probe.ts';

test('sufficient completed samples cannot hide an unresolved normal probe or failed acquisition', () => {
  const runs = (variant: string): ResponseRun[] => Array.from({ length: 5 }, (_, index) => ({ job: `latency-normal-${variant}-keyboard-run${index + 1}-1`, results: Array.from({ length: 220 }, (_, id) => ({ id, operation: 'start', status: 'completed', latencyMs: 40 })) }));
  const baseline = runs('B0'), candidate = runs('C1');
  candidate[0].results.push({ id: 221, operation: 'start', status: 'timed-out', latencyMs: null });
  assert.equal(compareRunEvidence(baseline, candidate, 'start', .99, 8).verdict, 'fail');
  candidate[0].results.pop();
  assert.equal(compareRunEvidence(baseline, candidate, 'start', .99, 8, 1).verdict, 'incomplete');
});

test('local-only guards reject hosted execution and held runs', () => {
  for (const name of ['CI', 'GITHUB_ACTIONS', 'TF_BUILD', 'BUILD_BUILDID'])
    assert.throws(() => requireLocal({ [name]: 'true' }), /CI execution is forbidden/);
  assert.throws(() => requireRunRelease(false), /held/);
  requireLocal({});
});

test('instrumentation refuses ambiguous or missing source anchors', () => {
  assert.throws(() => replaceExact('a a', 'a', 'b'), /anchor count/);
  assert.throws(() => replaceExact('other', 'a', 'b'), /anchor count/);
});

test('latency inference preserves insufficient sampling and rejects a consistent tail regression', () => {
  assert.deepEqual(distribution([]), { count: 0, p50: null, p95: null, p99: null, max: null });
  assert.equal(pairedQuantileDifference([], 0.99, 8).verdict, 'incomplete');
  const runs = Array.from({ length: 5 }, () => ({
    baseline: Array.from({ length: 10 }, () => Array<number>(20).fill(20)),
    candidate: Array.from({ length: 10 }, () => Array<number>(20).fill(32)),
  }));
  const result = pairedQuantileDifference(runs, 0.99, 8, { replicates: 100 });
  assert.equal(result.verdict, 'fail');
  assert.equal(result.upper95, 12);
});

test('physics replies cannot cross a generation, tick, substep or collider boundary', () => {
  const request: PhysicsRequest = {
    protocol: 1,
    id: 2,
    generation: 3,
    tick: 7,
    substepTarget: 21,
    colliderRevision: 4,
    operation: 'tick',
    deltas: [],
    motion: { x: 0.1, z: 0, tick: 6 },
  };
  const reply: PhysicsReply = { ...request, ok: true, position: { x: 1, y: 0, z: 0 }, poses: [] };
  requireMatchingReply(request, reply);
  for (const key of ['id', 'generation', 'tick', 'substepTarget', 'colliderRevision'] as const)
    assert.throws(() => requireMatchingReply(request, { ...reply, [key]: reply[key] + 1 }));
  assert.throws(
    () => requireMatchingReply(request, { ...reply, position: { x: NaN, y: 0, z: 0 } }),
    /poses/,
  );
});

function event(stage: string, now: number, data: Record<string, unknown>, frame = 1): TraceEvent {
  return { stage, now, data, frame, origin: 100000, realm: 'main' };
}
const attempt = {
  id: 1,
  operation: 'start' as const,
  device: 'keyboard' as const,
  direction: { x: 1, z: 0 },
};
function prefix() {
  return [
    event('raw-keyboard', 10, { probeId: 1 }),
    event('input-submitted', 20, {
      probeId: 1,
      operation: 'advance',
      generation: 2,
      inputSequence: 3,
      input: { x: 1, z: 0 },
    }),
    event('publication', 30, { generation: 2, inputSequence: 3, ticks: [4] }),
    event('present', 31, { generation: 2, tick: 4, x: 0, z: 0 }, 1),
    event('frame-submitted', 32, {}, 1),
    event('present', 40, { generation: 2, tick: 4, x: 0.01, z: 0 }, 2),
  ];
}

test('movement alone and a worker acknowledgment cannot stand in for a submitted response frame', () => {
  assert.equal(detectResponse(attempt, prefix()).status, 'pending');
  const result = detectResponse(attempt, [...prefix(), event('frame-submitted', 42, {}, 2)]);
  assert.equal(result.status, 'completed');
  assert.equal(result.latencyMs, 32);
  assert.equal(result.tick, 4);
});

test('retired-world movement cannot satisfy a new input; unresolved probes remain counted', () => {
  const events = prefix().map((value) =>
    value.stage === 'present' ? { ...value, data: { ...value.data, generation: 1 } } : value,
  );
  const result = detectResponse(attempt, [...events, event('frame-submitted', 42, {}, 2)], {
    windowEndedAt: 3000,
  });
  assert.equal(result.status, 'timed-out');
  assert.equal(result.latencyMs, null);
});

test('unsubmitted intermediate transforms do not hide the first visible response', () => {
  const events = prefix();
  events.splice(
    events.length - 1,
    0,
    event('present', 35, { generation: 2, tick: 4, x: 0.01, z: 0 }, 99),
  );
  events.push(event('frame-submitted', 42, {}, 2));
  assert.equal(detectResponse(attempt, events).latencyMs, 32);
});

test('release waits for subsequent stationary submitted frames and reports the first retrospectively', () => {
  const release = { ...attempt, operation: 'release' as const };
  const events = prefix().slice(0, 3);
  events[1].data['input'] = { x: 0, z: 0 };
  events.push(event('present', 31, { generation: 2, tick: 4, x: 0, z: 0 }, 1));
  events.push(event('frame-submitted', 32, {}, 1));
  for (let n = 2; n <= 4; ++n) {
    events.push(event('present', 30 + n * 10, { generation: 2, tick: 4, x: 0, z: 0 }, n));
    events.push(event('frame-submitted', 31 + n * 10, {}, n));
  }
  assert.equal(detectResponse(release, events.slice(0, -2)).status, 'pending');
  assert.equal(detectResponse(release, events).responseAt, 51);
});

test('support-relative release rejects world-space carrying and requires the support in each submitted frame', () => {
  const release = { ...attempt, operation: 'release' as const }, events = prefix().slice(0, 3);
  events[1].data['input'] = { x: 0, z: 0 };
  for (let n = 1; n <= 4; ++n) {
    events.push(event('present', 30 + n * 10, { generation: 2, tick: 4, x: n * .01, z: 0 }, n));
    events.push(event('body-present', 30 + n * 10, { id: 'mover', x: n * .01, z: 0 }, n));
    events.push(event('frame-submitted', 31 + n * 10, {}, n));
  }
  assert.equal(detectResponse(release, events).status, 'pending');
  assert.equal(detectResponse(release, events, { supportId: 'mover' }).responseAt, 51);
  assert.equal(detectResponse(release, events, { supportId: 'missing' }).status, 'pending');
  const lateralJitter = events.map(value => value.stage === 'present' ? { ...value, data: { ...value.data, x: Number(value.data['x']) + value.frame * .001 } } : value);
  assert.equal(detectResponse({ ...release, direction: { x: 0, z: 1 } }, lateralJitter, { supportId: 'mover', releaseComponentOnly: true }).status, 'completed');
});

test('a completed movement route cannot stand in for actually encountering the contact fixture', () => {
  const wrongWay = new ContactEngagement('corner-contact');
  wrongWay.observe([event('action', 10, { probeId: 1, x: .7, z: -.7 }), event('present', 100, { probeId: 1, x: 7, y: 0, z: -5 })]);
  assert.equal(wrongWay.report().pass, false);
  const missedCorner = new ContactEngagement('corner-contact');
  missedCorner.observe([event('action', 10, { probeId: 1, x: .7, z: .7 }), event('present', 100, { probeId: 1, x: 7, y: 0, z: 7 })]);
  assert.equal(missedCorner.report().pass, false);
  const engaged = new ContactEngagement('corner-contact');
  engaged.observe([event('action', 10, { probeId: 1, x: .7, z: .7 }), event('present', 100, { probeId: 1, x: 2.14, y: 0, z: 6.14 })]);
  assert.equal(engaged.report().pass, true);
});

test('crate engagement requires observed crate displacement during forward input', () => {
  const engagement = new ContactEngagement('crate-contact');
  engagement.startup([event('body-present', 0, { id: 'crate', x: 1, y: .45, z: 3.5 })]);
  engagement.observe([event('action', 10, { probeId: 1, x: 0, z: 1 }), event('body-present', 100, { probeId: 1, id: 'crate', x: 1, y: .45, z: 3.5 })]);
  assert.equal(engagement.report().pass, false);
  engagement.observe([event('body-present', 200, { probeId: 1, id: 'crate', x: 1, y: .45, z: 4 })]);
  assert.equal(engagement.report().pass, true);
});
