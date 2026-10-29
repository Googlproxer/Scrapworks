import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};
const primary = ['miniplex', 'bitecs', 'koota', 'becsy'];
export const isJobResultFile = (name) => /^\d{4}-.+\.json$/.test(name) && !name.includes('.json.');
export async function report(input, destination, profilesFrom) {
  const maintainability = JSON.parse(
    await fs.readFile(path.join(import.meta.dirname, 'maintainability.json'), 'utf8'),
  );
  const manifest = JSON.parse(await fs.readFile(path.join(input, 'manifest.json'), 'utf8'));
  const jobs = [];
  for (const name of (await fs.readdir(input)).filter(isJobResultFile))
    jobs.push(JSON.parse(await fs.readFile(path.join(input, name), 'utf8')));
  let diagnosticManifest;
  if (profilesFrom) {
    profilesFrom = path.resolve(profilesFrom);
    diagnosticManifest = JSON.parse(
      await fs.readFile(path.join(profilesFrom, 'manifest.json'), 'utf8'),
    );
    if (
      diagnosticManifest.lockHash !== manifest.lockHash ||
      diagnosticManifest.runtime.node !== manifest.runtime.node ||
      JSON.stringify(diagnosticManifest.hardware) !== JSON.stringify(manifest.hardware)
    )
      throw new Error('Diagnostic replacement must use the same lock, Node version and hardware');
    const additional = [];
    for (const name of (await fs.readdir(profilesFrom)).filter(isJobResultFile))
      additional.push(JSON.parse(await fs.readFile(path.join(profilesFrom, name), 'utf8')));
    for (const environment of ['node', 'browser'])
      for (const candidate of primary) {
        const replacement = additional.find(
          (job) =>
            job.mode === 'profile' &&
            job.environment === environment &&
            job.candidate === candidate,
        );
        if (!replacement || replacement.soakTicks !== 10000 || replacement.cycles !== 20)
          throw new Error(`Missing full diagnostic replacement for ${environment}/${candidate}`);
        const index = jobs.findIndex(
          (job) =>
            job.mode === 'profile' &&
            job.environment === environment &&
            job.candidate === candidate,
        );
        if (index < 0) throw new Error('Original cohort lacks the corresponding profile');
        jobs[index] = { ...replacement, rawDirectory: profilesFrom };
      }
    jobs.push(...additional.filter((job) => job.mode === 'check'));
  }
  const groups = new Map();
  for (const job of jobs.filter((j) => j.mode === 'trial' && j.status === 'ok')) {
    const key = `${job.environment},${job.candidate},${job.size},${job.workload}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);
  }
  const rows = [...groups]
    .map(([key, trials]) => {
      const [environment, candidate, size, workload] = key.split(',');
      const successful = trials.filter((t) => t.result.status === 'ok');
      const data = successful.length ? successful : trials;
      const p95 = data.map((t) => t.result.metrics.combined.p95),
        p99 = data.map((t) => t.result.metrics.combined.p99);
      return {
        environment,
        candidate,
        size: Number(size),
        workload,
        repetitions: trials.length,
        successful: successful.length,
        fullProtocol:
          successful.filter((t) => t.ticks === 2000 && t.warmupTicks >= 200 && t.warmupMs >= 2000)
            .length === 5,
        p50: median(data.map((t) => t.result.metrics.combined.p50)),
        p95: median(p95),
        p99: median(p99),
        p95Min: Math.min(...p95),
        p95Max: Math.max(...p95),
        systemP95: median(data.map((t) => t.result.metrics.systems.p95)),
        structuralP95: median(data.map((t) => t.result.metrics.structural.p95)),
        publicationP95: median(data.map((t) => t.result.metrics.publication.p95)),
        throughput: median(data.map((t) => t.result.throughputTicksPerSecond)),
        checksums: [...new Set(successful.map((t) => t.result.checksum))],
        trials: trials.map((t) => ({
          repetition: t.repetition,
          status: t.result.status,
          measuredTicks: t.result.measuredTicks,
          p95: t.result.metrics.combined.p95,
          p99: t.result.metrics.combined.p99,
          initializeMs: t.result.initializeMs,
          firstQueryAndTickMs: t.result.firstQueryAndTickMs,
          disposeMs: t.result.disposeMs,
        })),
      };
    })
    .sort(
      (a, b) =>
        a.environment.localeCompare(b.environment) ||
        a.workload.localeCompare(b.workload) ||
        a.candidate.localeCompare(b.candidate) ||
        a.size - b.size,
    );
  for (const row of rows) {
    const reference = rows.find(
      (r) =>
        r.candidate === 'reference' &&
        r.environment === row.environment &&
        r.size === row.size &&
        r.workload === row.workload,
    );
    row.equivalentToReference =
      reference && row.successful === 5 && reference.successful === 5
        ? row.checksums.length === 1 &&
          reference.checksums.length === 1 &&
          row.checksums[0] === reference.checksums[0]
        : null;
  }
  const correctness = jobs
    .filter((j) => j.mode === 'check')
    .map((j) => ({
      environment: j.environment,
      candidate: j.candidate,
      status: j.status,
      assertions: j.result?.assertions,
      error: j.error,
    }));
  const qualification = primary.map((candidate) => {
    const target = ['node', 'browser'].map((environment) =>
      rows.find(
        (r) =>
          r.environment === environment &&
          r.candidate === candidate &&
          r.size === 100000 &&
          r.workload === 'mixed',
      ),
    );
    const correct =
      !rows.some((r) => r.candidate === candidate && r.equivalentToReference === false) &&
      !correctness.some((c) => c.candidate === candidate && c.status !== 'ok') &&
      ['node', 'browser'].every((environment) =>
        correctness.some(
          (c) => c.candidate === candidate && c.environment === environment && c.status === 'ok',
        ),
      );
    const matrixAttempted = ['node', 'browser'].every((environment) =>
      [1000, 10000, 50000, 100000, 250000].every((size) =>
        ['mixed', 'idle', 'active', 'churn'].every(
          (workload) =>
            jobs.filter(
              (j) =>
                j.mode === 'trial' &&
                j.environment === environment &&
                j.candidate === candidate &&
                j.size === size &&
                j.workload === workload &&
                j.ticks === 2000 &&
                j.warmupTicks >= 200 &&
                j.warmupMs >= 2000,
            ).length === 5,
        ),
      ),
    );
    const diagnosticsComplete =
      ['node', 'browser'].every(
        (environment) =>
          jobs.some(
            (j) =>
              j.mode === 'profile' &&
              j.candidate === candidate &&
              j.environment === environment &&
              j.status === 'ok' &&
              j.soakTicks === 10000 &&
              j.cycles === 20,
          ) &&
          jobs.some(
            (j) =>
              j.mode === 'ancillary' &&
              j.candidate === candidate &&
              j.environment === environment &&
              j.status === 'ok',
          ),
      ) &&
      ['mixed', 'idle', 'active'].every(
        (workload) =>
          jobs.filter(
            (j) =>
              j.mode === 'paced' &&
              j.candidate === candidate &&
              j.workload === workload &&
              j.status === 'ok' &&
              j.durationMs === 30000,
          ).length === 3,
      );
    const complete =
      manifest.protocol.observableProjectionConsumer === true &&
      manifest.protocol.exactPublicationCounts === true &&
      target.every((r) => r?.fullProtocol) &&
      matrixAttempted &&
      diagnosticsComplete;
    return {
      candidate,
      correct,
      complete,
      qualifies:
        manifest.label === 'reference-desktop' &&
        manifest.runtime.node === '24.21.0' &&
        correct &&
        complete &&
        target.every((r) => r.p95 <= 5 && r.p99 <= 8),
      target: target.filter(Boolean),
      status: !correct
        ? 'correctness incomplete/failed'
        : !complete
          ? 'measurements incomplete'
          : target.every((r) => r.p95 <= 5 && r.p99 <= 8)
            ? 'passes timing gate'
            : 'fails timing gate',
    };
  });
  const errors = jobs
    .filter((j) => j.status !== 'ok' || j.result?.status === 'timeout')
    .map((j) => ({
      environment: j.environment,
      candidate: j.candidate,
      mode: j.mode,
      size: j.size,
      workload: j.workload,
      error: j.error ?? '120-second measured-trial timeout',
      measuredTicks: j.result?.measuredTicks,
    }));
  const profiles = jobs
    .filter((j) => j.mode === 'profile')
    .map((j) => ({
      environment: j.environment,
      candidate: j.candidate,
      size: j.size,
      status: j.status,
      sourceDirectory: j.rawDirectory ?? input,
      result: j.result,
      error: j.error,
    }));
  for (const profile of profiles.filter((p) => p.status === 'ok')) {
    const result = profile.result;
    if (result.gcTrace) {
      try {
        const events = JSON.parse(
          await fs.readFile(path.join(profile.sourceDirectory, result.gcTrace), 'utf8'),
        ).traceEvents;
        const gc = events.filter(
          (event) => event.ph === 'X' && /GC|Scavenge|MarkCompact/.test(event.name),
        );
        result.gcTraceSummary = {
          completeEvents: gc.length,
          names: [...new Set(gc.map((event) => event.name))],
          maxEventMs: Math.max(0, ...gc.map((event) => (event.dur ?? 0) / 1000)),
          note: 'Nested GC events can overlap; durations are not summed as unique pause time.',
        };
      } catch (error) {
        result.gcTraceUnavailable = String(error);
      }
    }
    result.gcSummary = result.gc && {
      count: result.gc.length,
      totalMs: result.gc.reduce((sum, gc) => sum + gc.duration, 0),
      maxMs: Math.max(0, ...result.gc.map((gc) => gc.duration)),
      forcedCount: result.gc.filter((gc) => gc.forced).length,
      soakCount: result.gc.filter(
        (gc) => gc.startTime >= result.soakRange.start && gc.startTime < result.soakRange.end,
      ).length,
      soakMs: result.gc
        .filter(
          (gc) => gc.startTime >= result.soakRange.start && gc.startTime < result.soakRange.end,
        )
        .reduce((sum, gc) => sum + gc.duration, 0),
      note: 'All-phase totals include checkpoint/profile GC. Soak totals use event timestamps within the unforced workload interval.',
    };
    try {
      const cpu = JSON.parse(
        await fs.readFile(path.join(profile.sourceDirectory, result.cpuProfile), 'utf8'),
      );
      const durations = new Map();
      for (let i = 0; i < (cpu.samples ?? []).length; i++)
        durations.set(
          cpu.samples[i],
          (durations.get(cpu.samples[i]) ?? 0) + (cpu.timeDeltas?.[i] ?? 0),
        );
      result.cpuTopSelf = cpu.nodes
        .map((node) => ({
          function: node.callFrame.functionName || '(anonymous)',
          file: node.callFrame.url,
          selfMs: (durations.get(node.id) ?? 0) / 1000,
        }))
        .sort((a, b) => b.selfMs - a.selfMs)
        .slice(0, 15);
    } catch (error) {
      result.cpuAnalysisUnavailable = String(error);
    }
    try {
      const allocations = JSON.parse(
        await fs.readFile(path.join(profile.sourceDirectory, result.allocationProfile), 'utf8'),
      );
      const nodes = [];
      const walk = (node) => {
        nodes.push({
          function: node.callFrame.functionName,
          file: node.callFrame.url,
          estimatedBytes: node.selfSize,
        });
        for (const child of node.children ?? []) walk(child);
      };
      walk(allocations.head);
      result.allocationSummary = {
        estimatedSampledBytes: nodes.reduce((sum, node) => sum + node.estimatedBytes, 0),
        top: nodes.sort((a, b) => b.estimatedBytes - a.estimatedBytes).slice(0, 15),
      };
    } catch (error) {
      result.allocationAnalysisUnavailable = String(error);
    }
    const used = (value) =>
      value
        ? profile.environment === 'node'
          ? value.heapUsed + value.external
          : value.usedSize + (value.backingStorageSize ?? 0)
        : null;
    result.memoryAttribution = {
      metric:
        profile.environment === 'node'
          ? 'heapUsed + external; arrayBuffers already included in external'
          : 'JS heap usedSize + reported backingStorageSize',
      imported: used(result.checkpoints.afterImport ?? result.checkpoints.beforeImport),
      empty: used(result.checkpoints.emptyRuntime),
      populated: used(result.checkpoints.populated),
      steady: used(result.checkpoints.steady),
      disposed: used(result.checkpoints.disposed),
      lifecycle: result.cycles.map(used),
      note: 'Allocation profiles are statistical; RSS is separate; lifecycle growth requires retained-object investigation before a leak claim.',
    };
  }
  const ancillary = jobs
    .filter((j) => j.mode === 'ancillary')
    .map((j) => ({
      environment: j.environment,
      candidate: j.candidate,
      status: j.status,
      result: j.result,
      error: j.error,
    }));
  const paced = jobs
    .filter((j) => j.mode === 'paced')
    .map((j) => ({
      environment: j.environment,
      candidate: j.candidate,
      workload: j.workload,
      repetition: j.repetition,
      status: j.status,
      result: j.result && { ...j.result, frameSamples: undefined, advancementSamples: undefined },
      error: j.error,
    }));
  const summary = {
    schema: 1,
    manifest,
    diagnosticManifest,
    rows,
    correctness,
    qualification,
    errors,
    profiles,
    ancillary,
    paced,
    maintainability,
  };
  const bundles = await fs
    .readFile(path.join(input, 'bundles.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => []);
  const trees = primary.map((candidate) => {
    const selected = new Set();
    const visit = (file) => {
      if (selected.has(file)) return;
      const chunk = bundles.find((chunk) => chunk.file === file);
      if (!chunk) return;
      selected.add(file);
      for (const dependency of chunk.imports) visit(dependency);
    };
    const adapter = bundles.find((chunk) =>
      chunk.modules.some((module) => module.endsWith(`/adapters/${candidate}.ts`)),
    );
    if (adapter) visit(adapter.file);
    if (candidate === 'becsy') {
      const perf = bundles.find((chunk) =>
        chunk.modules.some((module) => module.endsWith('/becsy/lib/perf.js')),
      );
      if (perf) visit(perf.file);
    }
    return { candidate, selected };
  });
  const shared = new Set(
    [...trees[0].selected].filter((file) => trees.every((tree) => tree.selected.has(file))),
  );
  summary.bundles = trees.map((tree) => {
    const chunks = bundles.filter(
      (chunk) => tree.selected.has(chunk.file) && !shared.has(chunk.file),
    );
    return {
      candidate: tree.candidate,
      bytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
      gzipBytes: chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
      chunks: chunks.map((chunk) => chunk.file),
      note: 'Emitted adapter and native-package chunks, static dependencies included, common harness chunks excluded; individual gzip sizes summed.',
    };
  });
  const ranked = qualification
    .filter((q) => q.qualifies)
    .map((q) => ({
      candidate: q.candidate,
      score: Object.values(maintainability[q.candidate]).reduce((sum, value) => sum + value[0], 0),
      retained:
        profiles.find(
          (p) => p.candidate === q.candidate && p.environment === 'node' && p.status === 'ok',
        )?.result.memoryAttribution.steady ?? Number.MAX_SAFE_INTEGER,
      p95: median(q.target.map((row) => row.p95)),
    }))
    .sort((a, b) => b.score - a.score || a.retained - b.retained || a.p95 - b.p95);
  summary.ranking = ranked;
  summary.recommendation = ranked[0]?.candidate ?? null;
  const targetDirectory = destination ? path.resolve(destination) : input;
  await fs.mkdir(targetDirectory, { recursive: true });
  await fs.writeFile(path.join(targetDirectory, 'summary.json'), JSON.stringify(summary, null, 2));
  const columns = [
    'environment',
    'candidate',
    'size',
    'workload',
    'repetitions',
    'successful',
    'p50',
    'p95',
    'p99',
    'p95Min',
    'p95Max',
    'systemP95',
    'structuralP95',
    'publicationP95',
    'throughput',
  ];
  await fs.writeFile(
    path.join(targetDirectory, 'summary.csv'),
    [columns.join(','), ...rows.map((row) => columns.map((column) => row[column]).join(','))].join(
      '\n',
    ) + '\n',
  );
  const targetRows = rows.filter((r) => r.size === 100000 && r.workload === 'mixed');
  const format = (value) => value.toFixed(3);
  const lines = [
    '# ECS benchmark investigation',
    '',
    `Run started ${manifest.createdAt}. Environment label: **${manifest.label}**.`,
    '',
    `Reference hardware: ${manifest.hardware.cpu}; ${(manifest.hardware.memoryBytes / 1024 ** 3).toFixed(1)} GiB RAM; ${manifest.hardware.os}; Node ${manifest.runtime.node}.`,
    '',
    `Source revision: \`${manifest.revision}\`; benchmark/lock fingerprint: \`${manifest.sourceHash}\`. The working-tree status in summary.json identifies uncommitted benchmark sources at run start.`,
    '',
    '## Target results',
    '',
    '100,000 meaningful entities; mixed processors 20% active, 60% idle, 20% blocked. Values include native systems, structural updates, dirty tracking and deep detached changed-view publication. Target: p95 ≤5 ms and p99 ≤8 ms. Phase percentiles cannot be added to reconstruct a combined percentile.',
    '',
    '| Environment | Candidate | Completed repeats | p95 ms | p99 ms | Publication p95 ms | p95 range ms |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |',
    ...targetRows.map(
      (r) =>
        `| ${r.environment} | ${r.candidate} | ${r.successful}/${r.repetitions} | ${format(r.p95)} | ${format(r.p99)} | ${format(r.publicationP95)} | ${format(r.p95Min)}–${format(r.p95Max)} |`,
    ),
    '',
    ...qualification.map((q) => `- **${q.candidate}:** ${q.status}.`),
    '',
    qualification.some((q) => q.qualifies)
      ? `Recommended candidate: **${summary.recommendation}**, after correctness, complete evidence and both timing gates. Maintainability scores and evidence are recorded in summary.json.`
      : '**No final runtime adoption is justified by this run.** Incomplete measurements and failed budgets remain explicit; the agreed thresholds have not been relaxed.',
    '',
    '## Evidence and limits',
    '',
    `Completed job files: ${jobs.length}; correctness results: ${correctness.length}; error/timeout records: ${errors.length}; profile records: ${profiles.length}; paced browser records: ${paced.length}.`,
    '',
    'The standalone benchmark imports no Angular/Babylon application or Editor assets. It qualifies synthetic simulation workloads on the recorded machine; RAF results are not full-game GPU/FPS guarantees. All raw timings and instrumented profiles are kept separately. Instrumented results do not rank timing performance.',
    '',
    'Heap figures, external/ArrayBuffer figures and RSS have different meanings; ArrayBuffer bytes are included in Node external memory. Post-GC checkpoints and retained-object profiles must be considered together before attributing a leak. Becsy preallocates configured capacities; those retained allocations are part of its measured cost.',
    '',
    'Canonical correctness compares all state, buffers, reservations, ownership and history against the plain TypeScript oracle and verifies 1,000 continued steps after rebuilding a fresh runtime. Native iteration order is not a stock-allocation priority.',
    '',
    '## Reproduction',
    '',
    'Run `yarn bench:ecs:check`, `yarn bench:ecs:smoke`, then `yarn bench:ecs:full --output tmp/ecs-bench/<run-id>`. The full suite uses fresh sequential worker processes and a production Vite harness. Resume with the same command/output and `--resume`; source and lock hashes must match. `yarn bench:ecs:report --input <run-directory> --destination <report-directory>` regenerates summaries.',
    '',
    'See summary.json for all repetitions, errors, memory checkpoints, capture/rebuild costs, lifecycle cycles, browser versions and paced samples. Large CPU/heap profiles and per-tick samples remain in the ignored run directory and CI artifacts.',
    '',
  ];
  lines.push(
    '## Maintainability review',
    '',
    '| Candidate | Score / 10 | Domain reuse | Types | Lifecycle | Capture/projection | Package risk |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...primary.map((candidate) => {
      const values = Object.values(maintainability[candidate]).map((value) => value[0]);
      return `| ${candidate} | ${values.reduce((a, b) => a + b, 0)} | ${values.join(' | ')} |`;
    }),
    '',
    'Scores are evidence-based engineering assessments, not performance measurements. They decide only among qualifying candidates; higher is simpler. Full per-criterion rationale is included in summary.json.',
    '',
  );
  if (errors.length)
    lines.push(
      '## Errors and timeouts',
      '',
      ...errors.map(
        (e) =>
          `- ${e.environment}/${e.candidate}/${e.mode}/${e.size ?? ''}/${e.workload ?? ''}: ${String(e.error).split('\n')[0]}`,
      ),
      '',
    );
  await fs.writeFile(path.join(targetDirectory, 'evidence.md'), lines.join('\n'));
  if (rows.length) {
    const bundled = path.join(
      os.homedir(),
      '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
    );
    const python =
      process.env.ECS_BENCH_PYTHON ??
      ((await fs.stat(bundled).catch(() => null))
        ? bundled
        : process.platform === 'win32'
          ? 'python'
          : 'python3');
    try {
      execFileSync(python, [path.join(import.meta.dirname, 'plot.py'), targetDirectory], {
        cwd: path.resolve(import.meta.dirname, '../..'),
        timeout: 60000,
        stdio: 'pipe',
      });
      await fs.appendFile(
        path.join(targetDirectory, 'evidence.md'),
        '\n## Scaling and memory charts\n\n![Scaling](scaling.svg)\n\n![Memory](memory.svg)\n',
      );
    } catch (error) {
      await fs.writeFile(path.join(targetDirectory, 'plot-error.txt'), String(error));
      await fs.appendFile(
        path.join(targetDirectory, 'evidence.md'),
        '\nCharts unavailable: install tools/ecs-bench/plot-requirements.txt into tmp/ecs-bench/plotting with Python 3.12+ and regenerate the report.\n',
      );
    }
  }
  console.log(`Report: ${targetDirectory}`);
  return summary;
}
