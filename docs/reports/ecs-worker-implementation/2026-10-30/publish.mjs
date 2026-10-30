// Offline publication only. Run after measurements and the profile/heap analysis.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { report } from '../../../../tools/simulation-worker-bench/report.mjs';

const [input, destination = import.meta.dirname] = process.argv.slice(2);
if (!input) throw new Error('Usage: node publish.mjs run-directory [destination]');
process.env.MPLCONFIGDIR ??= path.resolve('tmp/ecs-bench/matplotlib');
await fs.mkdir(process.env.MPLCONFIGDIR, { recursive: true });
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const write = async (name, value) =>
  fs.writeFile(path.join(destination, name), JSON.stringify(value, null, 2) + '\n');
await report(input, destination);
const summary = await read(path.join(destination, 'summary.json'));
// The reused laboratory generator lists both candidates; this production cohort
// executes only Miniplex. An absent candidate is not a failed configuration.
const executed = new Set(summary.jobs.map((job) => job.options.candidate));
summary.qualifications = summary.qualifications.filter((row) => executed.has(row.candidate));
summary.productionProtocol = {
  note: 'Manifest qualification notes are inherited laboratory history. This cohort uses the actual production runtime, retained runtime/system warm-up, host credits and callback-arrival metrics. No earlier cohort is pooled.',
  numericFields: 14,
  bytesPerRow: 112,
  subscriptions: 2,
  multiWorkerImplemented: false,
};
await write('summary.json', summary);
const csv = (rows) =>
  rows
    .map((row) =>
      row
        .map((value) =>
          typeof value === 'string' ? '"' + value.replaceAll('"', '""') + '"' : (value ?? ''),
        )
        .join(','),
    )
    .join('\n') + '\n';
const trials = [
  [
    'file',
    'execution',
    'size',
    'workload',
    'repetition',
    'status',
    'ticks',
    'metric',
    'p50',
    'p95',
    'p99',
    'max',
    'mean',
    'throughput',
    'completed',
    'transfers',
    'replacements',
    'coldInitializationMs',
    'firstTickMs',
    'disposalMs',
  ],
];
const paced = [
  [
    'file',
    'execution',
    'workload',
    'pressureMs',
    'requestedHz',
    'achievedHz',
    'repetition',
    'diagnostic',
    'frames',
    'ticks',
    'frameP95',
    'frameP99',
    'frameMax',
    'inputP95',
    'inputP99',
    'longTasks',
    'maxBacklogMs',
    'maxQueue',
    'droppedMs',
    'pendingInputProbes',
  ],
];
for (const job of summary.jobs) {
  const r = job.result,
    o = job.options;
  if (job.mode === 'trial')
    for (const [metric, v] of Object.entries(r.statistics))
      trials.push([
        job.file,
        o.execution,
        o.size,
        o.workload,
        job.repetition,
        job.status,
        r.measuredTicks,
        metric,
        v?.p50,
        v?.p95,
        v?.p99,
        v?.max,
        v?.mean,
        r.throughput,
        r.resources.counters.completed,
        r.resources.counters.transfers,
        r.resources.counters.replacements,
        r.coldInitializationMs,
        r.firstTickMs,
        r.disposalMs,
      ]);
  if (job.mode === 'paced')
    paced.push([
      job.file,
      o.execution,
      o.workload,
      o.pressureMs,
      o.hz ?? 60,
      (r.frames * 1000) / r.durationMs,
      job.repetition,
      job.diagnostic,
      r.frames,
      r.ticks,
      r.statistics.frames.p95,
      r.statistics.frames.p99,
      r.statistics.frames.max,
      r.statistics.inputToVisible?.p95,
      r.statistics.inputToVisible?.p99,
      r.longTasks.length,
      r.maxBacklogMs,
      r.maxQueue,
      r.droppedMs,
      r.pendingInputProbes,
    ]);
}
await fs.writeFile(path.join(destination, 'trials.csv'), csv(trials));
await fs.writeFile(path.join(destination, 'paced.csv'), csv(paced));
const profiles = await read(path.join(destination, 'profile-evidence.json'));
const memory = [
  [
    'execution',
    'checkpoint',
    'context',
    'usedHeapBytes',
    'backingStorageBytes',
    'embedderBytes',
    'allocatedHeapBytes',
  ],
];
for (const p of profiles) {
  const append = (label, record) => {
    for (const context of ['main', 'worker'])
      if (record[context]) {
        const m = record[context];
        memory.push([
          p.options.execution,
          label,
          context,
          m.usedSize,
          m.backingStorageSize,
          m.embedderHeapUsedSize,
          m.totalSize,
        ]);
      }
  };
  for (const [name, record] of Object.entries(p.checkpoints)) append(name, record);
  for (const point of p.soak) append('soak-' + point.tick, point.memory);
  for (const point of p.lifecycle) append('disposed-cycle-' + point.cycle, point);
}
await fs.writeFile(path.join(destination, 'memory.csv'), csv(memory));
const manifest = summary.manifest;
const first = await read(path.join(input, summary.jobs[0].file));
await write('environment.json', {
  manifest,
  engine: first.engine,
  launch: first.launch,
  completion: await read(path.join(input, 'completion.json')),
  matrix: await read(path.join(input, 'matrix.json')),
});
const artifacts = [];
for (const name of (await fs.readdir(input)).sort()) {
  const file = path.join(input, name),
    stat = await fs.stat(file);
  if (!stat.isFile()) continue;
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  artifacts.push({ file: name, bytes: stat.size, sha256: hash.digest('hex') });
}
await write('raw-artifacts.json', artifacts);
const metadata = await read('dist/scrapworks/browser-stats.json');
const worker = Object.keys(metadata.outputs).find((name) => /worker-.+\.js$/.test(name));
if (!worker) throw new Error('Built simulation worker not found');
const bytes = await fs.readFile(path.join('dist/scrapworks/browser', path.basename(worker)));
await write('packaging.json', {
  worker: path.basename(worker),
  minifiedBytes: bytes.length,
  gzipBytes: gzipSync(bytes).length,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  sceneAcceptance: await read('tmp/production-worker-browser/result.json'),
});
const number = (value) => value.toFixed(2);
const lines = [
  '# Complete production qualification results',
  '',
  'All timings below are milliseconds. Aggregate values are medians of the five per-run percentiles; the CSV and JSON retain every percentile, maximum, throughput and work counter. Normal budgets apply at 100,000 meaningful entities.',
  '',
  '| Entities | Workload | Mode | p50 compute/publication | p95 | p99 | p95 receiver | p99 receiver | p95 round trip |',
  '| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
];
for (const row of summary.rows)
  lines.push(
    `| ${row.options.size} | ${row.options.workload} | ${row.options.execution} | ${number(row.metrics.workAndPublication.p50.median)} | ${number(row.metrics.workAndPublication.p95.median)} | ${number(row.metrics.workAndPublication.p99.median)} | ${number(row.metrics.observedReceiver.p95.median)} | ${number(row.metrics.observedReceiver.p99.median)} | ${number(row.metrics.roundTrip.p95.median)} |`,
  );
lines.push(
  '',
  '## All target normal repetitions and spread',
  '',
  '| Mode | Metric | Five runs in execution order | Median | Range |',
  '| --- | --- | --- | ---: | --- |',
);
for (const row of summary.rows.filter(
  (row) => row.options.size === 100000 && row.options.workload === 'mixed',
)) {
  for (const metric of [
    'workAndPublication',
    'observedReceiver',
    'roundTrip',
    'systems',
    'structural',
    'publication',
  ])
    for (const percentile of ['p95', 'p99']) {
      const values = row.metrics[metric][percentile];
      lines.push(
        `| ${row.options.execution} | ${metric} ${percentile} | ${values.values.map(number).join(', ')} | ${number(values.median)} | ${number(values.min)}–${number(values.max)} |`,
      );
    }
}
lines.push(
  '',
  '## Every paced repetition',
  '',
  '120 Hz rows are timer diagnostics; use achieved Hz. Required rows are normal mixed work at requested 60 Hz. Idle/active at 8 ms pressure are diagnostics.',
  '',
  '| Mode | Workload | Pressure | Requested / achieved Hz | Rep | Callback p95/p99 | Input p95/p99 | Max backlog | Dropped ms | Long tasks |',
  '| --- | --- | ---: | --- | ---: | --- | --- | ---: | ---: | ---: |',
);
for (const j of summary.jobs.filter((j) => j.mode === 'paced')) {
  const r = j.result,
    o = j.options,
    f = r.statistics.frames,
    i = r.statistics.inputToVisible;
  lines.push(
    `| ${o.execution} | ${o.workload} | ${o.pressureMs} | ${o.hz ?? 60} / ${number((r.frames * 1000) / r.durationMs)} | ${j.repetition ?? 0} | ${number(f.p95)} / ${number(f.p99)} | ${number(i.p95)} / ${number(i.p99)} | ${number(r.maxBacklogMs)} | ${number(r.droppedMs)} | ${r.longTasks.length} |`,
  );
}
lines.push(
  '',
  '## Ancillary single-run diagnostics',
  '',
  '| Mode | Initialization | Capture | Encode | Decode | Rebuild and full presentation | Disposal | Snapshot bytes |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
);
for (const j of summary.jobs.filter((j) => j.mode === 'ancillary')) {
  const r = j.result;
  lines.push(
    `| ${j.options.execution} | ${number(r.initializationMs)} | ${number(r.captureMs)} | ${number(r.encodingMs)} | ${number(r.decodingMs)} | ${number(r.rebuildMs)} | ${number(r.disposalMs)} | ${r.snapshotBytes} |`,
  );
}
await fs.writeFile(path.join(destination, 'results.md'), lines.join('\n') + '\n');
console.log(
  JSON.stringify({
    jobs: summary.counts,
    qualifications: summary.qualifications,
    artifacts: artifacts.length,
    workerBytes: bytes.length,
  }),
);
