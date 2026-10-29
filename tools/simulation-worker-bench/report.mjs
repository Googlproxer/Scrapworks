import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import crypto from 'node:crypto';

const median = (values) => {
  const a = [...values].sort((a, b) => a - b);
  return a.length
    ? a.length % 2
      ? a[(a.length - 1) / 2]
      : (a[a.length / 2 - 1] + a[a.length / 2]) / 2
    : null;
};
const spread = (values) => ({
  median: median(values),
  min: values.length ? Math.min(...values) : null,
  max: values.length ? Math.max(...values) : null,
  values,
});
const number = (value) =>
  value === null || value === undefined ? 'unavailable' : value.toFixed(3);
export async function report(input, destination, pacedInput) {
  const manifest = JSON.parse(await fs.readFile(path.join(input, 'manifest.json'), 'utf8'));
  const jobs = [];
  for (const name of (await fs.readdir(input)).filter(
    (name) => /^\d{4}-.+\.json$/.test(name) && !name.includes('.json.'),
  ))
    jobs.push({ file: name, ...JSON.parse(await fs.readFile(path.join(input, name), 'utf8')) });
  let pacedManifest;
  let compatibility;
  if (pacedInput) {
    const supplement = path.resolve(pacedInput);
    pacedManifest = JSON.parse(await fs.readFile(path.join(supplement, 'manifest.json'), 'utf8'));
    const allowedChanges = new Set([
      'tools/simulation-worker-bench/browser.ts',
      'tools/simulation-worker-bench/runner.mjs',
      'tools/simulation-worker-bench/cli.mjs',
      'tools/simulation-worker-bench/report.mjs',
      'tools/simulation-worker-bench/qualification.json',
      'tools/simulation-worker-bench/plot.py',
    ]);
    const changed = Object.keys({ ...manifest.source.files, ...pacedManifest.source.files }).filter(
      (file) => manifest.source.files[file] !== pacedManifest.source.files[file],
    );
    const unexpected = changed.filter((file) => !allowedChanges.has(file));
    let primaryHash = manifest.primaryHotPathHash;
    if (!primaryHash) {
      const frozen = await fs.readFile(path.join(input, 'frozen-browser.ts'), 'utf8');
      if (
        crypto.createHash('sha256').update(frozen).digest('hex') !==
        manifest.source.files['tools/simulation-worker-bench/browser.ts']
      )
        throw new Error('Frozen primary browser source does not match its manifest');
      primaryHash = crypto
        .createHash('sha256')
        .update(frozen.split('\nasync function paced(')[0].trimEnd())
        .digest('hex');
    }
    compatibility = {
      changedSources: changed,
      unchangedPrimaryHotPath: primaryHash === pacedManifest.primaryHotPathHash,
      primaryHotPathHash: primaryHash,
      unchangedCoreSources: unexpected.length === 0,
      unchangedPackages:
        JSON.stringify(manifest.packages) === JSON.stringify(pacedManifest.packages),
      unchangedGates:
        JSON.stringify(manifest.protocol.gates) === JSON.stringify(pacedManifest.protocol.gates),
      sameEnvironmentLabel: manifest.label === pacedManifest.label,
      sameHardware: JSON.stringify(manifest.hardware) === JSON.stringify(pacedManifest.hardware),
      sameNode:
        manifest.node.node === pacedManifest.node.node &&
        manifest.node.v8 === pacedManifest.node.v8,
    };
    if (
      !compatibility.unchangedPrimaryHotPath ||
      !compatibility.unchangedCoreSources ||
      !compatibility.unchangedPackages ||
      !compatibility.unchangedGates ||
      !compatibility.sameEnvironmentLabel ||
      !compatibility.sameHardware ||
      !compatibility.sameNode ||
      pacedManifest.qualification?.warmupContext !== 'retained' ||
      pacedManifest.qualification?.frameMetric !== 'callback-arrival'
    )
      throw new Error(
        'Cohorts cannot be combined: primary code, packages, gates or frame metric differ',
      );
    for (let index = jobs.length - 1; index >= 0; index--)
      if (jobs[index].mode === 'paced') jobs.splice(index, 1);
    for (const job of jobs) job.file = 'primary/' + job.file;
    for (const name of (await fs.readdir(supplement)).filter(
      (name) => /^\d{4}-.+\.json$/.test(name) && !name.includes('.json.'),
    )) {
      const job = JSON.parse(await fs.readFile(path.join(supplement, name), 'utf8'));
      if (job.mode === 'paced' || job.mode === 'check')
        jobs.push({ file: 'paced/' + name, ...job });
    }
  }
  const compact = jobs.map((job) => {
    const { samples: _samples, ...result } = job.result ?? {};
    return {
      file: job.file,
      mode: job.mode,
      options: job.options,
      repetition: job.repetition,
      diagnostic: job.diagnostic ?? false,
      status: job.status,
      error: job.error,
      engine: job.engine,
      context: job.context,
      loadedMs: job.loadedMs,
      result,
    };
  });
  const groups = new Map();
  for (const j of compact.filter((j) => j.mode === 'trial')) {
    const key = [
      j.options.candidate,
      j.options.execution,
      j.options.size,
      j.options.workload,
      j.options.wire,
      j.options.batch ?? 1,
      !!j.options.yielding,
    ].join('/');
    const list = groups.get(key) ?? [];
    list.push(j);
    groups.set(key, list);
  }
  const rows = [];
  for (const [key, runs] of groups) {
    const metrics = {};
    for (const name of [
      'roundTrip',
      'workAndPublication',
      'systems',
      'structural',
      'publication',
      'hostApply',
      'receiveData',
      'observedReceiver',
      'packing',
    ]) {
      metrics[name] = {};
      for (const percentile of ['p50', 'p95', 'p99', 'max'])
        metrics[name][percentile] = spread(
          runs
            .filter((j) => j.result?.statistics?.[name])
            .map((j) => j.result.statistics[name][percentile]),
        );
    }
    rows.push({
      key,
      options: runs[0].options,
      runs: runs.length,
      complete: runs.filter(
        (j) => j.status === 'ok' && j.result?.status === 'ok' && j.result?.measuredTicks === 2000,
      ).length,
      metrics,
    });
  }
  const primary = compact.filter(
    (j) =>
      j.mode === 'trial' &&
      !j.diagnostic &&
      j.options.size === 100000 &&
      j.options.workload === 'mixed',
  );
  const hashes = primary.filter((j) => j.result?.status === 'ok').map((j) => j.result.hash);
  const stateEquivalent = hashes.length > 0 && new Set(hashes).size === 1;
  const warmContextRetained = manifest.qualification?.warmupContext === 'retained';
  const frameMetricVerified =
    (pacedManifest ?? manifest).qualification?.frameMetric === 'callback-arrival';
  const receiverMetric = warmContextRetained ? 'observedReceiver' : 'hostApply';
  const qualifications = [];
  for (const candidate of ['miniplex', 'bitecs']) {
    const row = rows.find(
      (r) =>
        r.options.candidate === candidate &&
        r.options.execution === 'worker' &&
        r.options.size === 100000 &&
        r.options.workload === 'mixed' &&
        r.options.wire === 'object' &&
        !r.options.batch,
    );
    const paced = compact.filter(
      (j) =>
        j.mode === 'paced' &&
        !j.diagnostic &&
        j.options.candidate === candidate &&
        j.options.execution === 'worker' &&
        j.options.workload === 'mixed',
    );
    const correctness = compact.filter(
      (j) => j.mode === 'check' && j.options.candidate === candidate,
    );
    const gate = manifest.protocol.gates;
    const complete =
      !!row && row.complete === 5 && paced.length === 9 && paced.every((j) => j.status === 'ok');
    const cpu =
      !!row &&
      row.metrics.workAndPublication.p95.median <= gate.workerP95 &&
      row.metrics.workAndPublication.p99.median <= gate.workerP99;
    const apply =
      !!row &&
      row.metrics[receiverMetric].p95.median <= gate.hostApplyP95 &&
      row.metrics[receiverMetric].p99.median <= gate.hostApplyP99;
    const frames =
      paced.length === 9 &&
      paced.every(
        (j) =>
          j.result?.statistics?.frames?.p95 <= gate.frameP95 &&
          j.result.statistics.frames.p99 <= gate.frameP99,
      );
    const input =
      paced.length === 9 &&
      paced.every(
        (j) =>
          j.result?.statistics?.inputToVisible?.p95 <= gate.inputP95 &&
          j.result.statistics.inputToVisible.p99 <= gate.inputP99,
      );
    const correct =
      correctness.length >= 2 &&
      new Set(correctness.map((j) => j.options.execution)).size === 2 &&
      correctness.every((j) => j.status === 'ok') &&
      stateEquivalent;
    qualifications.push({
      candidate,
      complete,
      correct,
      cpu,
      hostApplication: apply,
      frames,
      input,
      warmContextRetained,
      frameMetricVerified,
      receiverMetric,
      qualifies:
        warmContextRetained &&
        frameMetricVerified &&
        complete &&
        correct &&
        cpu &&
        apply &&
        frames &&
        input,
    });
  }
  const summary = {
    schema: 1,
    manifest,
    pacedManifest,
    compatibility,
    stateEquivalent,
    warmContextRetained,
    frameMetricVerified,
    receiverMetric,
    qualifications,
    counts: {
      jobs: jobs.length,
      failures: jobs.filter((j) => j.status !== 'ok').length,
      timeouts: jobs.filter((j) => j.result?.status === 'timeout').length,
    },
    rows,
    jobs: compact,
  };
  const target = path.resolve(destination ?? path.join(input, 'report'));
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(path.join(target, 'summary.json'), JSON.stringify(summary, null, 2));
  const csv = [
    [
      'candidate',
      'execution',
      'size',
      'workload',
      'wire',
      'batch',
      'repetitions',
      'complete',
      'roundTripP95Median',
      'roundTripP99Median',
      'workPublicationP95Median',
      'workPublicationP99Median',
      'hostApplyP95Median',
      'observedReceiverP95Median',
      'observedReceiverP99Median',
    ],
  ];
  for (const row of rows)
    csv.push([
      row.options.candidate,
      row.options.execution,
      row.options.size,
      row.options.workload,
      row.options.wire,
      row.options.batch ?? 1,
      row.runs,
      row.complete,
      row.metrics.roundTrip.p95.median,
      row.metrics.roundTrip.p99.median,
      row.metrics.workAndPublication.p95.median,
      row.metrics.workAndPublication.p99.median,
      row.metrics.hostApply.p95.median,
      row.metrics.observedReceiver.p95.median,
      row.metrics.observedReceiver.p99.median,
    ]);
  await fs.writeFile(
    path.join(target, 'summary.csv'),
    csv.map((row) => row.map((value) => JSON.stringify(value ?? '')).join(',')).join('\n') + '\n',
  );
  const lines = [
    '# Generated worker evidence',
    '',
    `Source: ${manifest.source.hash}. Jobs: ${jobs.length}; failures: ${summary.counts.failures}; timeouts: ${summary.counts.timeouts}.`,
    ...(pacedManifest
      ? [
          `Paced source: ${pacedManifest.source.hash}; unchanged primary hot path and core source verified.`,
          '',
        ]
      : []),
    '',
    `Target state hashes equivalent across complete primary runs: ${stateEquivalent}.`,
    '',
    '| Candidate | Execution | p95 round trip ms | p99 round trip ms | p95 work/publication ms | p99 work/publication ms | Complete |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of rows.filter(
    (row) =>
      row.options.size === 100000 &&
      row.options.workload === 'mixed' &&
      row.options.wire === 'object' &&
      !row.options.batch,
  ))
    lines.push(
      `| ${row.options.candidate} | ${row.options.execution} | ${number(row.metrics.roundTrip.p95.median)} | ${number(row.metrics.roundTrip.p99.median)} | ${number(row.metrics.workAndPublication.p95.median)} | ${number(row.metrics.workAndPublication.p99.median)} | ${row.complete}/${row.runs} |`,
    );
  lines.push(
    '',
    `Warm execution context verified by manifest: ${warmContextRetained}. Receiver gate metric: ${receiverMetric}.`,
    '',
    'hostApply measures explicit JavaScript decoding/cache application. Where present, observedReceiver measures the whole message handler, including MessageEvent.data access and request bookkeeping; browser-internal work before that access can remain unattributed. Round trips and frame intervals include delivery. Epoch-aligned estimates are diagnostic only. Profiling runs do not contribute to ranking.',
    '',
  );
  await fs.writeFile(path.join(target, 'evidence.md'), lines.join('\n'));
  const bundled = path.join(
    os.homedir(),
    '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
  );
  const python =
    process.env.ECS_BENCH_PYTHON ??
    ((await fs.stat(bundled).catch(() => false))
      ? bundled
      : process.platform === 'win32'
        ? 'python'
        : 'python3');
  const plotted = spawnSync(
    python,
    [path.join(import.meta.dirname, 'plot.py'), path.join(target, 'summary.json'), target],
    { encoding: 'utf8' },
  );
  if (plotted.status !== 0)
    await fs.writeFile(
      path.join(target, 'plot-error.txt'),
      plotted.stderr ?? String(plotted.error),
    );
  console.log(`Report: ${target}`);
  return summary;
}
