import fs from 'node:fs/promises';
import path from 'node:path';
import inspector from 'node:inspector/promises';
import type { HeapProfiler, Profiler } from 'node:inspector';
import type { Instance, Snapshot } from './model.ts';
import type { Job, DiagnosticProfile } from './jobs.ts';
import v8 from 'node:v8';
import { PerformanceObserver, constants as performanceConstants } from 'node:perf_hooks';

const job = JSON.parse(process.argv[2]) as Job;
const beforeImport = process.memoryUsage();
const started = performance.now();

const memory = () => {
  global.gc?.();
  // The second checkpoint collection updates external-memory accounting after released buffers.
  global.gc?.();
  return process.memoryUsage();
};

const checkpoint = async (name: string, value: unknown) => {
  if (job.output)
    await fs.writeFile(
      job.output + '.progress.json',
      JSON.stringify({ name, value, elapsedMs: performance.now() - started }),
    );
};

try {
  let result;
  if (job.mode === 'check') {
    const { check } = await import('./check.ts');
    result = await check(job.candidate);
  } else if (job.mode === 'trial') {
    const { trial } = await import('./experiment.ts');
    result = await trial(job);
  } else if (job.mode === 'ancillary') {
    const { ancillary } = await import('./experiment.ts');
    result = await ancillary(job.candidate, job.size, job.count);
  } else if (job.mode === 'profile') {
    const { load } = await import('./load.ts');
    const { digest } = await import('./experiment.ts');
    const { consumeProjection, releaseProjection } = await import('./consumer.ts');
    const importStart = performance.now();
    const factory = await load(job.candidate);
    const profile: DiagnosticProfile<NodeJS.MemoryUsage> = {
      importMs: performance.now() - importStart,
      checkpoints: { beforeImport, afterImport: memory() },
      gc: [],
      cycles: [],
    };
    result = profile;
    const session = new inspector.Session();
    session.connect();
    let empty: Instance | null = await factory({
      size: 0,
      capacity: job.size * 2,
      seed: 1729,
      workload: 'churn',
    });
    profile.checkpoints.emptyRuntime = memory();
    await empty.dispose();
    empty = null;
    profile.checkpoints.afterEmptyDisposed = memory();
    let world: Instance | null = await factory({ size: job.size, seed: 1729, workload: 'churn' });
    profile.checkpoints.populated = memory();
    world.instrumentDirty(true);
    const observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        profile.gc!.push({
          startTime: e.startTime,
          duration: e.duration,
          detail: (e as import('node:perf_hooks').PerformanceEntry & { detail: { flags: number } })
            .detail,
          forced: Boolean(
            (e as import('node:perf_hooks').PerformanceEntry & { detail: { flags: number } }).detail
              .flags & performanceConstants.NODE_PERFORMANCE_GC_FLAGS_FORCED,
          ),
        });
    });
    observer.observe({ entryTypes: ['gc'] });
    await session.post('Profiler.enable');
    await session.post('Profiler.start');
    for (let i = 0; i < (job.cpuTicks ?? 200); i++) {
      const pending = world.step();
      if (pending) await pending;
      consumeProjection(await world.project());
    }
    let cpu: Profiler.StopReturnType | null = await session.post('Profiler.stop');
    const cpuPath = job.output + '.cpuprofile';
    await fs.writeFile(cpuPath, JSON.stringify(cpu.profile));
    profile.cpuProfile = path.basename(cpuPath);
    cpu = null;
    await session.post('HeapProfiler.enable');
    await session.post('HeapProfiler.startSampling', {
      samplingInterval: 32768,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    profile.soakRange = { start: performance.now(), end: null };
    for (let i = 0; i < (job.soakTicks ?? 10000); i++) {
      const pending = world.step();
      if (pending) await pending;
      consumeProjection(await world.project());
      if (i % 1000 === 0) {
        profile.checkpoints[`soak-${i}`] = process.memoryUsage();
        await checkpoint('soak', i);
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    profile.soakRange!.end = performance.now();
    let allocations: HeapProfiler.StopSamplingReturnType | null = await session.post(
      'HeapProfiler.stopSampling',
    );
    const allocationPath = job.output + '.heapprofile';
    await fs.writeFile(allocationPath, JSON.stringify(allocations.profile));
    profile.allocationProfile = path.basename(allocationPath);
    // Sampling includes collected allocations: its sample list can be hundreds of MiB.
    // Persist it, then release it before attributing retained memory to the world.
    allocations = null;
    await new Promise((resolve) => setImmediate(resolve));
    releaseProjection();
    profile.checkpoints.steady = memory();
    profile.dirtyTracking = world.dirtyDiagnostics();
    profile.heapSnapshot = path.basename(v8.writeHeapSnapshot(job.output + '.heapsnapshot'));
    let capture: Snapshot | null = await world.capture();
    profile.checkpoints.captureHeld = memory();
    let rebuilt: Instance | null = await factory(capture.fixture, capture);
    profile.checkpoints.rebuildHeld = memory();
    capture = null;
    profile.checksum = await digest(world);
    await world.dispose();
    await rebuilt.dispose();
    world = null;
    rebuilt = null;
    for (let cycle = 0; cycle < (job.cycles ?? 20); cycle++) {
      let current: Instance | null = await factory({
        size: job.size,
        seed: 1729,
        workload: 'mixed',
      });
      let snapshot: Snapshot | null = await current.capture();
      let restored: Instance | null = await factory(snapshot.fixture, snapshot);
      snapshot = null;
      await current.dispose();
      await restored.dispose();
      current = null;
      restored = null;
      profile.cycles.push(memory());
      await checkpoint('lifecycle', cycle);
    }
    profile.checkpoints.disposed = memory();
    profile.disposedHeapSnapshot = path.basename(
      v8.writeHeapSnapshot(job.output + '.disposed.heapsnapshot'),
    );
    observer.disconnect();
    session.disconnect();
  } else throw new Error(`Unknown job mode: ${job.mode}`);
  await fs.writeFile(
    job.output,
    JSON.stringify({ ...job, status: 'ok', result, elapsedMs: performance.now() - started }),
  );
} catch (error) {
  await fs.writeFile(
    job.output,
    JSON.stringify({
      ...job,
      status: 'error',
      error: error instanceof Error ? error.stack : String(error),
      elapsedMs: performance.now() - started,
    }),
  );
  process.exitCode = 1;
}
