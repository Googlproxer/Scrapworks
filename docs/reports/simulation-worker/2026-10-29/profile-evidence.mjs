// Analyze saved diagnostics only; never run this during latency measurement.
import fs from 'node:fs/promises';
import path from 'node:path';

const [input, destination] = process.argv.slice(2);
if (!input || !destination) throw new Error('Usage: node profile-evidence.mjs input output.json');
const read = async (name) => JSON.parse(await fs.readFile(path.join(input, name), 'utf8'));
const files = await fs.readdir(input);
const results = [];
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
};
for (const file of files.filter(
  (name) => /^\d{4}-profile-.+\.json$/.test(name) && !name.includes('.json.'),
)) {
  const job = await read(file);
  if (job.status !== 'ok') {
    results.push({ file, status: job.status, error: job.error });
    continue;
  }
  const cpu = [];
  for (const artifact of job.result.artifacts.filter((name) => name.endsWith('.cpuprofile'))) {
    const profile = await read(artifact);
    const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
    const self = new Map();
    let totalMs = 0;
    for (const [i, id] of (profile.samples ?? []).entries()) {
      const frame = nodes.get(id)?.callFrame ?? {};
      const key = JSON.stringify([
        frame.functionName,
        frame.url,
        frame.lineNumber,
        frame.columnNumber,
      ]);
      const ms = (profile.timeDeltas?.[i] ?? 0) / 1000;
      self.set(key, (self.get(key) ?? 0) + ms);
      totalMs += ms;
    }
    cpu.push({
      file: artifact,
      totalSampleMs: totalMs,
      durationMs: (profile.endTime - profile.startTime) / 1000,
      topSelf: [...self]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([key, ms]) => ({
          frame: JSON.parse(key),
          ms,
          fraction: totalMs ? ms / totalMs : 0,
        })),
    });
  }
  const allocation = [];
  for (const artifact of job.result.artifacts.filter((name) => name.endsWith('.heapprofile'))) {
    const profile = await read(artifact);
    let bytes = 0;
    const top = [];
    const visit = (node) => {
      bytes += node.selfSize;
      if (node.selfSize) top.push({ frame: node.callFrame, bytes: node.selfSize });
      for (const child of node.children ?? []) visit(child);
    };
    visit(profile.head);
    allocation.push({
      file: artifact,
      estimatedAllocatedBytes: bytes,
      topSelf: top.sort((a, b) => b.bytes - a.bytes).slice(0, 15),
    });
  }
  const trace = await read(file + '.gc-trace.json');
  const durations = new Map();
  for (const event of trace.traceEvents ?? []) {
    if (event.ph !== 'X' || !/gc|garbage|scaveng/i.test(event.name) || !Number.isFinite(event.dur))
      continue;
    const key = [event.pid, event.tid, event.name].join('/');
    const list = durations.get(key) ?? [];
    list.push(event.dur / 1000);
    durations.set(key, list);
  }
  const gc = [...durations].map(([key, values]) => ({
    key,
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.reduce((maximum, value) => Math.max(maximum, value), 0),
  }));
  results.push({
    file,
    options: job.options,
    status: 'ok',
    checkpoints: job.result.checkpoints,
    soak: job.result.soak,
    lifecycle: job.result.lifecycle,
    workerTerminationVerified: job.result.workerTerminationVerified,
    cpu,
    allocation,
    gc,
    notes: [
      'CPU self samples include unsymbolized/native/idle time; minified frame locations are retained.',
      'Allocation sampling includes collected objects and estimates volume, not retained or peak memory.',
      'GC trace events overlap and include forced diagnostic collections; durations are not summed as unique pauses.',
      'Main and worker heap checkpoints are separate; worker-target absence after termination is explicit.',
    ],
  });
}
await fs.writeFile(destination, JSON.stringify(results, null, 2) + '\n');
console.log(
  JSON.stringify(
    results.map((r) => ({
      file: r.file,
      status: r.status,
      cpuContexts: r.cpu?.length,
      allocationContexts: r.allocation?.length,
      workerTerminationVerified: r.workerTerminationVerified,
    })),
  ),
);
