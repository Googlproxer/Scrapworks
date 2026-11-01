import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [inputArgument, destinationArgument, packagingArgument] = process.argv.slice(2);
if (!inputArgument || !destinationArgument)
  throw new Error('Usage: node publish.mjs input destination [packaging.json]');
const input = path.resolve(inputArgument),
  destination = path.resolve(destinationArgument);
await fs.mkdir(destination, { recursive: true });
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const names = (await fs.readdir(input)).filter(
  (name) => /^\d{4}-.+\.json$/.test(name) && !name.includes('.json.'),
);
const jobs = [];
for (const name of names) jobs.push({ file: name, ...(await read(path.join(input, name))) });
const manifest = await read(path.join(input, 'manifest.json'));
const trials = jobs
  .filter((j) => j.mode === 'trial')
  .map((j) => ({
    file: j.file,
    options: j.options,
    repetition: j.repetition ?? null,
    diagnostic: j.diagnostic ?? false,
    status: j.status === 'ok' ? j.result?.status : j.status,
    error: j.error,
    ...j.result,
    samples: undefined,
  }));
await fs.writeFile(path.join(destination, 'trials.json'), JSON.stringify(trials, null, 2) + '\n');
const csv = [
  [
    'file',
    'candidate',
    'execution',
    'size',
    'workload',
    'wire',
    'batch',
    'repetition',
    'diagnostic',
    'status',
    'measuredTicks',
    'metric',
    'p50',
    'p95',
    'p99',
    'max',
    'mean',
    'completed',
    'throughput',
    'initializationMs',
    'firstTickMs',
    'disposalMs',
  ],
];
for (const t of trials)
  for (const [metric, values] of Object.entries(t.statistics ?? {}))
    csv.push([
      t.file,
      t.options.candidate,
      t.options.execution,
      t.options.size,
      t.options.workload,
      t.options.wire,
      t.options.batch ?? 1,
      t.repetition,
      t.diagnostic,
      t.status,
      t.measuredTicks,
      metric,
      values?.p50,
      values?.p95,
      values?.p99,
      values?.max,
      values?.mean,
      t.resources?.completed,
      t.throughput,
      t.initializationMs,
      t.firstTickMs,
      t.disposalMs,
    ]);
const csvString = (rows) =>
  rows
    .map((row) =>
      row
        .map((v) => (typeof v === 'string' ? '"' + v.replaceAll('"', '""') + '"' : (v ?? '')))
        .join(','),
    )
    .join('\n') + '\n';
await fs.writeFile(path.join(destination, 'trials.csv'), csvString(csv));
const paced = [
  [
    'file',
    'candidate',
    'execution',
    'workload',
    'pressureMs',
    'clock',
    'hz',
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
    'maxLongTask',
    'droppedMs',
    'maxQueue',
    'pendingInputProbes',
    'maxBacklogMs',
    'publications',
    'receiverP95',
    'receiverP99',
    'frameReceiverP99',
    'appliedNotPresented',
  ],
];
for (const j of jobs.filter((j) => j.mode === 'paced' && j.status === 'ok')) {
  const r = j.result;
  paced.push([
    j.file,
    j.options.candidate,
    j.options.execution,
    j.options.workload,
    j.options.pressureMs,
    j.options.clock,
    j.options.hz ?? 60,
    j.repetition ?? '',
    j.diagnostic ?? false,
    r.frames,
    r.ticks,
    r.statistics.frames.p95,
    r.statistics.frames.p99,
    r.statistics.frames.max,
    r.statistics.inputToVisible?.p95,
    r.statistics.inputToVisible?.p99,
    r.longTasks.length,
    Math.max(0, ...r.longTasks.map((t) => t.duration)),
    j.options.clock === 'worker' ? r.workerClock?.droppedMs : r.droppedMs,
    r.maxQueue,
    r.pendingInputProbes,
    j.options.clock === 'worker' ? r.workerClock?.maxBacklog : r.maxBacklogMs,
    r.publications ?? r.statistics.acknowledgement?.count,
    r.statistics.observedReceiver?.p95,
    r.statistics.observedReceiver?.p99,
    r.statistics.frameReceiver?.p99,
    (r.statistics.inputToApplied?.count ?? 0) - (r.statistics.inputToVisible?.count ?? 0),
  ]);
}
await fs.writeFile(path.join(destination, 'paced.csv'), csvString(paced));
const count = (steps, initial, period) =>
  steps < initial ? 0 : 1 + Math.floor((steps - initial) / period);
const completionChecks = [];
for (const t of trials.filter((t) => t.resources)) {
  const { size, seed, workload } = t.options;
  const ticks = t.resources.tick;
  let expected = 0;
  for (let ordinal = 0; ordinal < size; ordinal++) {
    if (ordinal % 10 >= 6) continue;
    const rank = (Math.floor(ordinal / 10) * 6 + (ordinal % 10)) % 100;
    const active = workload === 'active' || rank < (workload === 'idle' ? 1 : 20);
    if (!active) continue;
    const initial = 20 + ((ordinal + seed) % 7),
      period = 20 + (ordinal % 7);
    if (workload !== 'churn') expected += count(ticks, initial, period);
    else {
      const first = Math.floor(ordinal / (size / 100)) || 100;
      if (ticks <= first) expected += count(ticks, initial, period);
      else {
        const remaining = ticks - first;
        expected +=
          count(first, initial, period) +
          Math.floor(remaining / 100) * count(100, initial, period) +
          count(remaining % 100, initial, period);
      }
    }
  }
  completionChecks.push({
    file: t.file,
    ticks,
    expected,
    actual: t.resources.completed,
    match: expected === t.resources.completed,
  });
}
await fs.writeFile(
  path.join(destination, 'completed-work-checks.json'),
  JSON.stringify(completionChecks, null, 2) + '\n',
);
if (completionChecks.some((c) => !c.match))
  throw new Error('Independent completed-operation arithmetic mismatch');
const groups = new Map();
for (const t of trials.filter((t) => !t.diagnostic && t.status === 'ok')) {
  const key = [t.options.size, t.options.workload, t.resources.tick].join('/');
  const group = groups.get(key) ?? [];
  group.push({ file: t.file, hash: t.hash });
  groups.set(key, group);
}
const hashes = [...groups].map(([key, runs]) => ({
  key,
  runs,
  equivalent: new Set(runs.map((r) => r.hash)).size === 1,
}));
await fs.writeFile(
  path.join(destination, 'state-equivalence.json'),
  JSON.stringify(hashes, null, 2) + '\n',
);
if (hashes.some((group) => !group.equivalent))
  throw new Error('Cross-configuration state hash mismatch');
const artifacts = [];
const artifactWalk = async (directory) => {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (directory !== input || entry.name === 'build') await artifactWalk(file);
      continue;
    }
    if (!entry.isFile() || entry.name.endsWith('.log')) continue;
    const data = await fs.readFile(file);
    artifacts.push({
      file: path.relative(input, file).replaceAll('\\', '/'),
      bytes: data.length,
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
    });
  }
};
await artifactWalk(input);
await fs.writeFile(
  path.join(destination, 'raw-artifacts.json'),
  JSON.stringify(artifacts, null, 2) + '\n',
);
const packaging = await read(
  packagingArgument ?? 'tmp/simulation-worker-bench/angular-packaging/verification.json',
);
const environment = {
  manifest,
  completion: await read(path.join(input, 'completion.json')),
  engine: jobs.find((j) => j.engine)?.engine,
  context: jobs.find((j) => j.context)?.context,
  launch: jobs.find((j) => j.launch)?.launch,
  packaging,
  ignoredRawDirectory: path.relative(process.cwd(), input).replaceAll('\\', '/'),
  validation: 'Repository validation is recorded after all measurements finish.',
};
await fs.writeFile(
  path.join(destination, 'environment.json'),
  JSON.stringify(environment, null, 2) + '\n',
);
await fs.writeFile(
  path.join(destination, 'correctness.json'),
  JSON.stringify(
    jobs
      .filter((j) => j.mode === 'check')
      .map((j) => ({
        file: j.file,
        options: j.options,
        status: j.status,
        result: j.result,
        error: j.error,
      })),
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    trials: trials.length,
    paced: paced.length - 1,
    artifacts: artifacts.length,
    completionChecks: completionChecks.length,
    equivalenceGroups: hashes.length,
    allPass: true,
  }),
);
