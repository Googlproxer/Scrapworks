import fs from 'node:fs/promises';
import path from 'node:path';
import inspector from 'node:inspector';
import v8 from 'node:v8';
import { PerformanceObserver, constants as performanceConstants } from 'node:perf_hooks';

const job = JSON.parse(process.argv[2]);
const beforeImport = process.memoryUsage();
const started = performance.now();
const post = (session, method, params = {}) =>
  new Promise((resolve, reject) =>
    session.post(method, params, (error, result) => (error ? reject(error) : resolve(result))),
  );
const memory = () => {
  global.gc?.();
  return process.memoryUsage();
};
const checkpoint = async (name, value) => {
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
    result = {
      importMs: performance.now() - importStart,
      checkpoints: { beforeImport, afterImport: memory() },
      gc: [],
      cycles: [],
    };
    const session = new inspector.Session();
    session.connect();
    let empty = await factory({ size: 0, capacity: job.size * 2, seed: 1729, workload: 'churn' });
    result.checkpoints.emptyRuntime = memory();
    await empty.dispose();
    empty = null;
    result.checkpoints.afterEmptyDisposed = memory();
    let world = await factory({ size: job.size, seed: 1729, workload: 'churn' });
    result.checkpoints.populated = memory();
    world.instrumentDirty(true);
    const observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        result.gc.push({
          startTime: e.startTime,
          duration: e.duration,
          detail: e.detail,
          forced: Boolean(e.detail.flags & performanceConstants.NODE_PERFORMANCE_GC_FLAGS_FORCED),
        });
    });
    observer.observe({ entryTypes: ['gc'] });
    await post(session, 'Profiler.enable');
    await post(session, 'Profiler.start');
    for (let i = 0; i < (job.cpuTicks ?? 200); i++) {
      const pending = world.step();
      if (pending) await pending;
      consumeProjection(await world.project());
    }
    const cpu = await post(session, 'Profiler.stop');
    const cpuPath = job.output + '.cpuprofile';
    await fs.writeFile(cpuPath, JSON.stringify(cpu.profile));
    result.cpuProfile = path.basename(cpuPath);
    await post(session, 'HeapProfiler.enable');
    await post(session, 'HeapProfiler.startSampling', {
      samplingInterval: 32768,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    result.soakRange = { start: performance.now(), end: null };
    for (let i = 0; i < (job.soakTicks ?? 10000); i++) {
      const pending = world.step();
      if (pending) await pending;
      consumeProjection(await world.project());
      if (i % 1000 === 0) {
        result.checkpoints[`soak-${i}`] = process.memoryUsage();
        await checkpoint('soak', i);
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    result.soakRange.end = performance.now();
    const allocations = await post(session, 'HeapProfiler.stopSampling');
    const allocationPath = job.output + '.heapprofile';
    await fs.writeFile(allocationPath, JSON.stringify(allocations.profile));
    result.allocationProfile = path.basename(allocationPath);
    releaseProjection();
    result.checkpoints.steady = memory();
    result.dirtyTracking = world.dirtyDiagnostics();
    result.heapSnapshot = path.basename(v8.writeHeapSnapshot(job.output + '.heapsnapshot'));
    let capture = await world.capture();
    result.checkpoints.captureHeld = memory();
    let rebuilt = await factory(capture.fixture, capture);
    result.checkpoints.rebuildHeld = memory();
    capture = null;
    result.checksum = await digest(world);
    await world.dispose();
    await rebuilt.dispose();
    world = null;
    rebuilt = null;
    for (let cycle = 0; cycle < (job.cycles ?? 20); cycle++) {
      let current = await factory({ size: job.size, seed: 1729, workload: 'mixed' });
      let snapshot = await current.capture();
      let restored = await factory(snapshot.fixture, snapshot);
      snapshot = null;
      await current.dispose();
      await restored.dispose();
      current = null;
      restored = null;
      result.cycles.push(memory());
      await checkpoint('lifecycle', cycle);
    }
    result.checkpoints.disposed = memory();
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
      error: String(error?.stack ?? error),
      elapsedMs: performance.now() - started,
    }),
  );
  process.exitCode = 1;
}
