import { check, Session } from './check.ts';
import { ancillary, digest, statistics, trial } from './experiment.ts';
import { load } from './load.ts';
import { consumeProjection, projectionConsumer, releaseProjection } from './consumer.ts';
import type { Candidate, Instance, Snapshot, Workload } from './model.ts';
import type { Trial } from './experiment.ts';

let world: Instance | undefined;
let snapshot: Snapshot | undefined;
let rebuilt: Instance | undefined;
export const laboratory = {
  projectionConsumer,
  releaseProjection,
  check,
  trial,
  ancillary,
  async preload(candidate: Candidate): Promise<number> {
    const start = performance.now();
    await load(candidate);
    return performance.now() - start;
  },
  async create(
    candidate: Candidate,
    size: number,
    workload: Workload = 'churn',
    capacity = Math.max(1, size * 2),
  ): Promise<void> {
    world = await (await load(candidate))({ size, capacity, seed: 1729, workload });
  },
  async ticks(count: number): Promise<string> {
    if (!world) throw new Error('No world');
    for (let i = 0; i < count; i++) {
      const pending = world.step();
      if (pending) await pending;
      consumeProjection(await world.project());
    }
    return `${world.resources.tick}:${world.resources.completed}`;
  },
  async capture(): Promise<void> {
    snapshot = await world!.capture();
  },
  async rebuild(candidate: Candidate): Promise<void> {
    rebuilt = await (await load(candidate))(snapshot!.fixture, snapshot);
  },
  releaseCapture(): void {
    snapshot = undefined;
  },
  async dispose(): Promise<void> {
    releaseProjection();
    await world?.dispose();
    await rebuilt?.dispose();
    world = rebuilt = undefined;
    snapshot = undefined;
  },
  async cycle(candidate: Candidate, size: number): Promise<void> {
    await this.create(candidate, size, 'mixed');
    await this.capture();
    await this.rebuild(candidate);
    await this.dispose();
  },
  checksum(): Promise<string> {
    return digest(world!);
  },
  instrumentDirty(enabled: boolean): void {
    world!.instrumentDirty(enabled);
  },
  dirtyDiagnostics() {
    return world!.dirtyDiagnostics();
  },
  async paced(candidate: Candidate, size: number, workload: Workload, durationMs: number) {
    await this.create(candidate, size, workload);
    const session = new Session(world!);
    const frames: number[] = [];
    const ticks: number[] = [];
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ entryTypes: ['longtask'] });
    let previous = performance.now();
    const start = previous;
    let caughtUp = 0;
    let maxAccumulator = 0;
    try {
      while (performance.now() - start < durationMs) {
        const timestamp = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
        const elapsed = timestamp - previous;
        previous = timestamp;
        frames.push(elapsed);
        const tick = world!.resources.tick;
        const advance = performance.now();
        await session.advance(Math.max(0, elapsed / 1000));
        consumeProjection(session.view);
        const advanced = world!.resources.tick - tick;
        if (advanced) ticks.push(performance.now() - advance);
        if (advanced > 1) caughtUp++;
        maxAccumulator = Math.max(maxAccumulator, session.accumulator);
      }
      const before = world!.resources.tick;
      const catchupStart = performance.now();
      await session.advance(0.3);
      return {
        frames: statistics(frames),
        frameSamples: frames,
        advancementSamples: ticks,
        longTasks,
        caughtUp,
        maxAccumulator,
        catchup: { steps: world!.resources.tick - before, ms: performance.now() - catchupStart },
        completed: world!.resources.completed,
        elapsedMs: performance.now() - start,
      };
    } finally {
      observer.disconnect();
      await this.dispose();
    }
  },
};
declare global {
  interface Window {
    ecsLaboratory: typeof laboratory;
    ecsTrialType?: Trial;
  }
}
window.ecsLaboratory = laboratory;
