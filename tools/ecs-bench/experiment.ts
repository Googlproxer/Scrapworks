import type { Candidate, Fixture, Instance, Workload } from './model.ts';
import { load } from './load.ts';
import {
  consumeProjection,
  expectedDirtyCounts,
  projectionConsumer,
  releaseProjection,
} from './consumer.ts';

export interface Trial {
  candidate: Candidate;
  size: number;
  workload: Workload;
  seed: number;
  ticks: number;
  warmupMs: number;
  warmupTicks: number;
  fullProjection?: boolean;
}
export function statistics(samples: number[]): {
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
} {
  if (!samples.length) throw new Error('No measurements');
  const sorted = [...samples].sort((a, b) => a - b);
  const p = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
  return {
    p50: p(0.5),
    p95: p(0.95),
    p99: p(0.99),
    max: sorted[sorted.length - 1],
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}
export async function timedTick(world: Instance): Promise<void> {
  const pending = world.step();
  if (pending) await pending;
}
export async function digest(world: Instance): Promise<string> {
  // Full-state fingerprint is outside timed regions, never a scalar shortcut.
  const snapshot = await world.capture();
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function trial(options: Trial) {
  const initial = performance.now();
  const factory = await load(options.candidate);
  const importMs = performance.now() - initial;
  const fixture: Fixture = { size: options.size, seed: options.seed, workload: options.workload };
  const expected = expectedDirtyCounts(fixture);
  let world = await factory(fixture);
  const warmStart = performance.now();
  let warmed = 0;
  while (warmed < options.warmupTicks || performance.now() - warmStart < options.warmupMs) {
    const pending = world.step();
    if (pending) await pending;
    const projection = world.project();
    consumeProjection(projection instanceof Promise ? await projection : projection);
    warmed++;
  }
  releaseProjection();
  await world.dispose();
  const initStart = performance.now();
  world = await factory(fixture);
  const initializeMs = performance.now() - initStart;
  const firstStart = performance.now();
  const first = world.step();
  if (first) await first;
  const firstView = world.project();
  consumeProjection(firstView instanceof Promise ? await firstView : firstView);
  const initialPublishedRecords = projectionConsumer.records;
  const firstQueryAndTickMs = performance.now() - firstStart;
  const combined: number[] = [],
    systems: number[] = [],
    structural: number[] = [],
    publication: number[] = [];
  try {
    const measuredStart = performance.now();
    let timedOut = false;
    for (let tick = 0; tick < options.ticks; tick++) {
      if (performance.now() - measuredStart > 120000) {
        timedOut = true;
        break;
      }
      const start = performance.now();
      const pending = world.step();
      if (pending) await pending;
      // Projection can execute another native system (Becsy), replacing phase counters.
      const systemMs = world.phases.systems;
      const structuralMs = world.phases.structural;
      const projectStart = performance.now();
      const projected = world.project(options.fullProjection);
      const view = projected instanceof Promise ? await projected : projected;
      consumeProjection(view);
      const end = performance.now();
      if (view.tick !== tick + 2) throw new Error('Tick or publication skipped');
      const expectedRecords = options.fullProjection ? options.size : expected[view.tick % 100];
      if (
        view.records.length !== expectedRecords ||
        view.removed.length !== (options.workload === 'churn' ? options.size / 100 : 0)
      )
        throw new Error(
          `Publication cardinality mismatch at ${view.tick}: ${view.records.length} != ${expectedRecords}`,
        );
      combined.push(end - start);
      publication.push(end - projectStart);
      systems.push(systemMs);
      structural.push(structuralMs);
    }
    if (world.resources.completed === 0 && options.ticks >= 100)
      throw new Error('No completed work');
    const result = {
      options,
      status: timedOut ? 'timeout' : 'ok',
      measuredTicks: combined.length,
      importMs,
      initializeMs,
      firstQueryAndTickMs,
      warmup: { ticks: warmed, minimumMs: options.warmupMs },
      metrics: {
        combined: statistics(combined),
        systems: statistics(systems),
        structural: statistics(structural),
        publication: statistics(publication),
      },
      throughputTicksPerSecond: 1000 / statistics(combined).mean,
      completed: world.resources.completed,
      publishedRecords: projectionConsumer.records - initialPublishedRecords,
      checksum: await digest(world),
      samples: { combined, systems, structural, publication },
    };
    const disposeStart = performance.now();
    await world.dispose();
    return { ...result, disposeMs: performance.now() - disposeStart };
  } finally {
    releaseProjection();
    await world.dispose();
  }
}

export async function ancillary(candidate: Candidate, size: number, count = 10) {
  const factory = await load(candidate);
  const growthStart = performance.now();
  const growing = await factory({ size: 1000, capacity: size * 2, seed: 1729, workload: 'mixed' });
  const growthInitializeMs = performance.now() - growthStart;
  const growStart = performance.now();
  await growing.grow(size);
  const growMs = performance.now() - growStart;
  const afterGrowthStart = performance.now();
  const growthPending = growing.step();
  if (growthPending) await growthPending;
  const firstGrownTickMs = performance.now() - afterGrowthStart;
  await growing.dispose();
  const world = await factory({ size, seed: 1729, workload: 'mixed' });
  const projections: { fraction: number; full: boolean; ms: number[]; records: number }[] = [];
  try {
    for (const fraction of [0, 0.01, 0.1, 1])
      for (const full of [false, true]) {
        const ms: number[] = [];
        let records = 0;
        for (let i = 0; i < count; i++) {
          world.setDirty(fraction);
          const start = performance.now();
          const pending = world.project(full);
          const value = pending instanceof Promise ? await pending : pending;
          consumeProjection(value);
          ms.push(performance.now() - start);
          records = value.records.length;
        }
        if (records !== (full ? size : Math.floor(size * fraction)))
          throw new Error('Wrong projection cardinality');
        projections.push({ fraction, full, ms, records });
      }
    releaseProjection();
    const captureStart = performance.now();
    let snapshot = await world.capture();
    const captureMs = performance.now() - captureStart;
    const encodeStart = performance.now();
    let encoded = JSON.stringify(snapshot);
    const encodeMs = performance.now() - encodeStart;
    const bytes = new TextEncoder().encode(encoded).byteLength;
    const decodeStart = performance.now();
    snapshot = JSON.parse(encoded) as typeof snapshot;
    const decodeMs = performance.now() - decodeStart;
    encoded = '';
    const rebuildStart = performance.now();
    const restored = await factory(snapshot.fixture, snapshot);
    const rebuildMs = performance.now() - rebuildStart;
    snapshot.records.length = 0;
    try {
      for (let i = 0; i < 1000; i++) {
        const a = world.step();
        if (a) await a;
        const b = restored.step();
        if (b) await b;
        await world.project();
        await restored.project();
      }
      if ((await digest(world)) !== (await digest(restored)))
        throw new Error('Ancillary rebuild continuation mismatch');
    } finally {
      await restored.dispose();
    }
    const probeMs: number[] = [];
    for (let i = 0; i < count; i++) {
      const start = performance.now();
      const pending = world.probe();
      if (pending) await pending;
      probeMs.push(performance.now() - start);
    }
    return {
      projections,
      captureMs,
      encodeMs,
      decodeMs,
      bytes,
      rebuildMs,
      continuedTicks: 1000,
      growthInitializeMs,
      growMs,
      firstGrownTickMs,
      membershipProbeMs: probeMs,
    };
  } finally {
    releaseProjection();
    await world.dispose();
  }
}
