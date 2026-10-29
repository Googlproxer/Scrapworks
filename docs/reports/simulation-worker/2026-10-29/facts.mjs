// Compact, reproducible facts for the reviewed narrative; no live measurements.
import fs from 'node:fs/promises';
import path from 'node:path';
const directory = import.meta.dirname;
const read = async (file) => JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
const summary = await read('summary.json');
const exploratory = await read('exploratory/summary.json');
const profiles = await read('profiles.json');
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};
const target = summary.rows.filter(
  (r) => r.options.size === 100000 && r.options.workload === 'mixed',
);
const primary = summary.jobs.filter((j) => j.mode === 'trial' && !j.diagnostic);
const rows = target.map((r) => {
  const runs = primary.filter(
    (j) =>
      j.options.candidate === r.options.candidate &&
      j.options.execution === r.options.execution &&
      j.options.size === 100000 &&
      j.options.workload === 'mixed',
  );
  return {
    candidate: r.options.candidate,
    execution: r.options.execution,
    metrics: Object.fromEntries(
      [
        'workAndPublication',
        'roundTrip',
        'observedReceiver',
        'receiveData',
        'hostApply',
        'systems',
        'structural',
        'publication',
      ].map((key) => [
        key,
        {
          p95: r.metrics[key].p95.median,
          p99: r.metrics[key].p99.median,
          p95Runs: r.metrics[key].p95.values,
          p99Runs: r.metrics[key].p99.values,
        },
      ]),
    ),
    postP95:
      r.options.execution === 'worker' ? median(runs.map((j) => j.result.postMessage.p95)) : null,
    postP99:
      r.options.execution === 'worker' ? median(runs.map((j) => j.result.postMessage.p99)) : null,
    initializationMs: median(runs.map((j) => j.result.initializationMs)),
    coldInitializationMs: median(runs.map((j) => j.result.coldInitializationMs)),
    firstTickMs: median(runs.map((j) => j.result.firstTickMs)),
    disposalMs: median(runs.map((j) => j.result.disposalMs)),
    ticksPerSecond: median(runs.map((j) => j.result.throughput)),
    completed: runs.map((j) => j.result.resources.completed),
    hashes: [...new Set(runs.map((j) => j.result.hash))],
  };
});
function groupPaced(jobs, key) {
  const groups = new Map();
  for (const job of jobs) {
    const k = key(job),
      a = groups.get(k) ?? [];
    a.push(job);
    groups.set(k, a);
  }
  return [...groups].map(([key, runs]) => ({
    key,
    frame95: runs.map((j) => j.result.statistics.frames.p95),
    frame99: runs.map((j) => j.result.statistics.frames.p99),
    input95: runs.map((j) => j.result.statistics.inputToVisible.p95),
    input99: runs.map((j) => j.result.statistics.inputToVisible.p99),
    ticks: runs.map((j) => j.result.ticks),
    publications: runs.map((j) => j.result.publications),
    droppedMs: runs.map((j) =>
      j.options.clock === 'worker' ? j.result.workerClock.droppedMs : j.result.droppedMs,
    ),
    longTasks: runs.reduce((n, j) => n + j.result.longTasks.length, 0),
    maxQueue: Math.max(...runs.map((j) => j.result.maxQueue)),
    pending: runs.map((j) => ({
      unapplied: j.result.pendingInputProbes,
      appliedNotPresented:
        j.result.statistics.inputToApplied.count - j.result.statistics.inputToVisible.count,
    })),
  }));
}
const paced = groupPaced(
  summary.jobs.filter((j) => j.mode === 'paced' && !j.diagnostic),
  (j) =>
    [j.options.candidate, j.options.execution, j.options.workload, j.options.pressureMs].join('/'),
);
const clocks = groupPaced(
  summary.jobs.filter((j) => j.mode === 'paced' && j.diagnostic && j.options.hz !== 120),
  (j) => [j.options.candidate, j.options.clock].join('/'),
);
const bytes = (contexts) =>
  Object.values(contexts).reduce((n, c) => n + (c.usedSize ?? 0) + (c.backingStorageSize ?? 0), 0);
const memory = profiles.map((p) => ({
  candidate: p.options.candidate,
  execution: p.options.execution,
  checkpointsMiB: Object.fromEntries(
    Object.entries(p.checkpoints).map(([k, v]) => [k, bytes(v) / 1024 ** 2]),
  ),
  soakFirstMiB: bytes(p.soak[0].memory) / 1024 ** 2,
  soakLastMiB: bytes(p.soak.at(-1).memory) / 1024 ** 2,
  allocatedGiB: p.allocation.map((a) => ({
    context: a.file.includes('.worker.') ? 'worker' : 'main',
    estimated: a.estimatedAllocatedBytes / 1024 ** 3,
  })),
  allCyclesTerminated: p.lifecycle.every((c) => c.workerTargets === 0),
  cycleMainFirstMiB:
    (p.lifecycle[0].main.usedSize + p.lifecycle[0].main.backingStorageSize) / 1024 ** 2,
  cycleMainLastMiB:
    (p.lifecycle.at(-1).main.usedSize + p.lifecycle.at(-1).main.backingStorageSize) / 1024 ** 2,
}));
const facts = {
  rows,
  paced,
  clocks,
  memory,
  qualifications: summary.qualifications,
  scaling: summary.rows.map((r) => ({
    candidate: r.options.candidate,
    execution: r.options.execution,
    size: r.options.size,
    workload: r.options.workload,
    complete: r.complete,
    runs: r.runs,
    cpu95: r.metrics.workAndPublication.p95.median,
    roundTrip95: r.metrics.roundTrip.p95.median,
  })),
  payloads: summary.jobs
    .filter((j) => j.mode === 'payloads')
    .map((j) => ({ options: j.options, result: j.result })),
  ancillary: exploratory.jobs
    .filter((j) => j.mode === 'ancillary')
    .map((j) => ({
      options: j.options,
      captureMs: j.result.captureMs,
      encodeMs: j.result.encodeMs,
      decodeMs: j.result.decodeMs,
      rebuildMs: j.result.rebuildMs,
      bytes: j.result.bytes,
    })),
  variants: exploratory.jobs
    .filter((j) => j.mode === 'trial' && j.diagnostic)
    .map((j) => ({
      options: j.options,
      roundTrip95: j.result.statistics.roundTrip.p95,
      cpu95: j.result.statistics.workAndPublication.p95,
      packing95: j.result.statistics.packing.p95,
      hostApply95: j.result.statistics.hostApply.p95,
      throughput: j.result.throughput,
    })),
};
await fs.writeFile(path.join(directory, 'facts.json'), JSON.stringify(facts, null, 2) + '\n');
console.log('Wrote facts.json');
