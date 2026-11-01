// Derive compact evidence after measurement; uses the same cohort for every metric.
import fs from 'node:fs/promises';
import path from 'node:path';
const root = import.meta.dirname;
const read = async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const summary = await read('summary.json');
const profiles = await read('profiles.json');
const median = (values) => {
  const a = [...values].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const spread = (a) => ({ median: median(a), min: Math.min(...a), max: Math.max(...a), values: a });
const trials = summary.jobs.filter((j) => j.mode === 'trial' && !j.diagnostic);
const rows = summary.rows
  .filter((r) => r.options.size === 100000 && r.options.workload === 'mixed')
  .map((row) => {
    const runs = trials.filter(
      (j) =>
        j.options.candidate === row.options.candidate &&
        j.options.execution === row.options.execution &&
        j.options.size === 100000 &&
        j.options.workload === 'mixed',
    );
    return {
      candidate: row.options.candidate,
      execution: row.options.execution,
      metrics: row.metrics,
      postP95:
        row.options.execution === 'worker'
          ? spread(runs.map((j) => j.result.postMessage.p95))
          : null,
      initializationMs: spread(runs.map((j) => j.result.initializationMs)),
      disposalMs: spread(runs.map((j) => j.result.disposalMs)),
      ticksPerSecond: spread(runs.map((j) => j.result.throughput)),
      bufferBytes: spread(runs.map((j) => j.result.statistics.bufferBytes.mean)),
      detailRecords: spread(runs.map((j) => j.result.statistics.detailRecords.mean)),
      completed: runs.map((j) => j.result.resources.completed),
      hashes: [...new Set(runs.map((j) => j.result.hash))],
    };
  });
const groups = new Map();
for (const job of summary.jobs.filter((j) => j.mode === 'paced' && j.status === 'ok')) {
  const key = [
    job.options.candidate,
    job.options.execution,
    job.options.workload,
    job.options.pressureMs,
    job.options.hz ?? 60,
    job.diagnostic,
  ].join('/');
  const group = groups.get(key) ?? [];
  group.push(job);
  groups.set(key, group);
}
const paced = [...groups].map(([key, runs]) => ({
  key,
  frame95: spread(runs.map((j) => j.result.statistics.frames.p95)),
  frame99: spread(runs.map((j) => j.result.statistics.frames.p99)),
  input95: spread(runs.map((j) => j.result.statistics.inputToVisible.p95)),
  input99: spread(runs.map((j) => j.result.statistics.inputToVisible.p99)),
  ticks: runs.map((j) => j.result.ticks),
  longTasks: runs.map((j) => j.result.longTasks.length),
  maxQueue: Math.max(...runs.map((j) => j.result.maxQueue)),
  droppedMs: runs.map((j) => j.result.droppedMs),
  pending: runs.map((j) => ({
    unapplied: j.result.pendingInputProbes,
    appliedNotPresented:
      j.result.statistics.inputToApplied.count - j.result.statistics.inputToVisible.count,
  })),
}));
const bytes = (contexts) =>
  Object.values(contexts).reduce((n, c) => n + (c.usedSize ?? 0) + (c.backingStorageSize ?? 0), 0);
const memory = profiles.map((p) => ({
  candidate: p.options.candidate,
  execution: p.options.execution,
  checkpointsMiB: Object.fromEntries(
    Object.entries(p.checkpoints).map(([k, c]) => [k, bytes(c) / 1024 ** 2]),
  ),
  soakMiB: p.soak.map((c) => ({ tick: c.tick, total: bytes(c.memory) / 1024 ** 2 })),
  allocatedGiB: p.allocation.map((a) => ({
    context: a.file.includes('.worker.') ? 'worker' : 'main',
    estimate: a.estimatedAllocatedBytes / 1024 ** 3,
  })),
  lifecycleMainMiB: p.lifecycle.map(
    (c) => (c.main.usedSize + c.main.backingStorageSize) / 1024 ** 2,
  ),
  allCyclesTerminated: p.lifecycle.every((c) => c.workerTargets === 0),
}));
const facts = {
  rows,
  paced,
  memory,
  qualifications: summary.qualifications,
  counts: summary.counts,
  scaling: summary.rows.map((r) => ({
    options: r.options,
    complete: r.complete,
    runs: r.runs,
    cpu95: r.metrics.workAndPublication.p95.median,
    cpu99: r.metrics.workAndPublication.p99.median,
    roundTrip95: r.metrics.roundTrip.p95.median,
  })),
  payloads: summary.jobs
    .filter((j) => j.mode === 'payloads')
    .map((j) => ({ options: j.options, ...j.result })),
  ancillary: summary.jobs
    .filter((j) => j.mode === 'ancillary')
    .map((j) => ({ options: j.options, ...j.result })),
};
await fs.writeFile(path.join(root, 'facts.json'), JSON.stringify(facts, null, 2) + '\n');
console.log(JSON.stringify({ qualifications: facts.qualifications, counts: facts.counts }));
