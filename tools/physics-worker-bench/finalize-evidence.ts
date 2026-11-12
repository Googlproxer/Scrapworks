import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { distribution, type Distribution } from './statistics.ts';
import type { TraceEvent } from './browser-probe.ts';
import { requireLocal } from './protocol.ts';

requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11');
async function read<T>(name: string): Promise<T> { return JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')) as T; }
async function write(name: string, value: unknown) { await fs.writeFile(path.join(directory, name), JSON.stringify(value, null, 2)); }
interface Comparison { verdict: string; difference: number | null; lower95?: number | null; upper95?: number | null; reason?: string }
interface ComparisonGroup { paired: Record<string, Comparison>; playableCapacity: Record<string, Comparison>; variants: Record<string, { operations: Record<string, Distribution> }> }
interface Job { id: string; variant: string; device: string; case: string }
interface Analysis {
  measures: Record<string, Distribution>;
  phaseAssignments: { operation: string; nominalTickPhaseMs: number; sinceSubmittedFrameMs: number | null }[];
  phases: Record<string, { count: number; completed: number; rawLatenciesMs: number[] }>;
  responseDetails: { probes: Record<string, unknown>[] };
}
const comparisons = await read<Record<string, ComparisonGroup>>('latency-analysis.json');
const rollups: unknown[] = [];
const lines = ['# Primary software latency tables', '', 'All values are milliseconds. B0/C1 cells show p50 / p95 / p99 among completed probes. CI cells show C1 minus B0, lower95 to upper95, and the frozen gate verdict. Failures and insufficient acquisitions override successful-only percentiles. These are synthetic software endpoints, not physical presentation.', '', '| Browser | Workload | Input | Operation | B0 | C1 | p50 difference [bounds]; verdict | p95 difference [bounds]; verdict | p99 difference [bounds]; verdict |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
const format = (value: number | null | undefined) => value == null ? '—' : value.toFixed(1);
const counts = (values: Comparison[]) => Object.fromEntries([...new Set(values.map(value => value.verdict))].map(verdict => [verdict, values.filter(value => value.verdict === verdict).length]));
for (const [key, value] of Object.entries(comparisons).filter(([key]) => key.startsWith('latency-'))) {
  const match = /^latency-(firefox-)?horizontal-(.+)-(keyboard|synthetic-gamepad)$/.exec(key);
  if (!match) throw new Error(key);
  const [, firefox, workload, device] = match;
  rollups.push({ browser: firefox ? 'firefox-headless' : 'bundled-chromium', workload, device, architectureGates: counts(Object.values(value.paired)), playableGates: counts(Object.values(value.playableCapacity)) });
  for (const operation of ['start', 'reverse', 'release']) {
    const metrics = ['B0', 'C1'].map(variant => { const row = value.variants[variant].operations[operation]; return [row.p50, row.p95, row.p99].map(format).join(' / '); });
    const intervals = [50, 95, 99].map(percentile => { const row = value.paired[`${operation}-p${percentile}`]; return `${format(row.difference)} [${format(row.lower95)}, ${format(row.upper95)}]; ${row.verdict}`; });
    lines.push(`| ${firefox ? 'Firefox headless' : 'Bundled Chromium'} | ${workload} | ${device} | ${operation} | ${metrics.join(' | ')} | ${intervals.join(' | ')} |`);
  }
}
await fs.writeFile(path.join(directory, 'latency-tables.md'), lines.join('\n') + '\n');
const scaling = ['# Tabulated compute scaling curves', '', 'Milliseconds per measured tick: median of three repetition percentiles, 200 measured ticks per repetition after 40 warm-up ticks. Deadline misses count all three repetitions. P0 uses the existing population; other counts are added colliders/bodies. These short compute curves do not establish playable capacity, sustained p99, or an independently repeatable gain.', '', '| Browser | S/profile/added count | B0 p50 / p95 / p99 | B1 p50 / p95 / p99 | C1 p50 / p95 / p99 | Screen B0 / B1 / C1 | >50 ms ticks B0 / B1 / C1 |', '| --- | --- | --- | --- | --- | --- | --- |'];
for (const browser of ['bundled', 'firefox']) {
  const matrix = await read<{ rows: { key: string; variant: string; medianRunPercentiles: Distribution; screenPass: boolean; deadlineMisses: number }[] }>(`matrix-summary-${browser}.json`);
  for (const key of [...new Set(matrix.rows.map(row => row.key))]) {
    const rows = ['B0', 'B1', 'C1'].map(variant => { const row = matrix.rows.find(row => row.key === key && row.variant === variant); if (!row) throw new Error(`Missing ${browser}/${key}/${variant}`); return row; });
    scaling.push(`| ${browser} | ${key} | ${rows.map(row => [row.medianRunPercentiles.p50, row.medianRunPercentiles.p95, row.medianRunPercentiles.p99].map(format).join(' / ')).join(' | ')} | ${rows.map(row => row.screenPass ? 'pass' : 'fail').join(' / ')} | ${rows.map(row => row.deadlineMisses).join(' / ')} |`);
  }
}
await fs.writeFile(path.join(directory, 'compute-scaling-tables.md'), scaling.join('\n') + '\n');

const phaseAndStage: unknown[] = [];
for (const [browser, queueName] of [['bundled-chromium', 'render-queue-bundled-main-completed.json'], ['firefox-headless', 'render-queue-firefox-main-completed.json']]) {
  const queue = await read<{ jobs: Job[] }>(queueName);
  const groups = new Map<string, { job: Job; analysis: Analysis }[]>();
  for (const job of queue.jobs) {
    let analysis: Analysis;
    try { analysis = await read<Analysis>(job.id + '-analysis.json'); } catch { continue; }
    const key = `${job.case}/${job.variant}/${job.device}`;
    const values = groups.get(key) ?? []; values.push({ job, analysis }); groups.set(key, values);
  }
  for (const [key, values] of groups) {
    const stages = Object.fromEntries(Object.keys(values[0].analysis.measures).map(stage => [stage, { medianRunP95: distribution(values.flatMap(value => value.analysis.measures[stage].p95 ?? [])).p50, maximum: Math.max(0, ...values.flatMap(value => value.analysis.measures[stage].max ?? [])) }]));
    const phases = Object.fromEntries(['start', 'reverse', 'release'].map(operation => [operation, Array.from({ length: 10 }, (_, bin) => {
      const rows = values.flatMap(value => value.analysis.phases[`${operation}-${bin * 5}`] ?? []);
      return { fromMs: bin * 5, toMs: (bin + 1) * 5, attempted: rows.reduce((sum, row) => sum + row.count, 0), completed: rows.reduce((sum, row) => sum + row.completed, 0), latency: distribution(rows.flatMap(row => row.rawLatenciesMs)) };
    })]));
    const probes = values.flatMap(value => value.analysis.responseDetails.probes);
    const companions = Object.fromEntries(['start', 'reverse', 'release'].map(operation => [operation, Object.fromEntries(['rawToSubmissionMs', 'submissionToMovementMs', 'facingMs', 'clipMs', 'cameraMs', 'stableReverseMs', 'wrongDirectionMetres', 'wrongDirectionDurationMs', 'stoppingDistanceMetres'].map(metric => [metric, distribution(probes.filter(probe => probe['operation'] === operation && typeof probe[metric] === 'number').map(probe => probe[metric] as number))]))]));
    phaseAndStage.push({ browser, key, fullReceipts: values.length, stages, phases, sincePreviousSubmittedFrameMs: distribution(values.flatMap(value => value.analysis.phaseAssignments.flatMap(phase => phase.sinceSubmittedFrameMs ?? []))), companions });
  }
}
await write('phase-stage-companions.json', { rows: phaseAndStage, limitations: 'Complete receipts only; aborted attempts remain in the primary failure ledger. Stage summaries use median per-run p95, not pooled percentiles. Nominal tick phase is reconstructed from the host accumulator, not a clock synchronization estimate. Companion endpoints do not replace movement or qualify physical input. Every phase bin is retained, including sparse/empty bins.' });

interface SoakEvent { kind: string; data: { variant: string; rawReceipt: string; seconds: number; startTick: number; tick: number; maximumPendingCredits: number; droppedSeconds: number; countsAfterWarmup: Record<string, unknown>; countsAfter: Record<string, unknown> } }
const soakEvents = await read<SoakEvent[]>('soak-full-bundled.json');
const soaks: unknown[] = [];
for (const { data } of soakEvents.filter(value => value.kind === 'soak-pass')) {
  const raw = await read<{ rawAdvanceMs: number[]; rawElapsedSeconds: number[] }>(data.rawReceipt + '.json');
  soaks.push({ variant: data.variant, seconds: data.seconds, ticks: data.tick - data.startTick, pendingCreditsMaximum: data.maximumPendingCredits, droppedSeconds: data.droppedSeconds, allAdvanceCalls: distribution(raw.rawAdvanceMs), positiveAdvanceCalls: distribution(raw.rawAdvanceMs.filter(value => value > 0)), advanceCallsOver50ms: raw.rawAdvanceMs.filter(value => value > 50).length, countsAfterWarmup: data.countsAfterWarmup, countsAfter: data.countsAfter });
}
const pressureQueue = await read<{ jobs: Job[] }>('render-queue-pressure-completed.json');
const pressure: unknown[] = [];
for (const job of pressureQueue.jobs) { const receipt = await read<{ results: { status: string }[]; frames: Distribution }>(job.id + '.json'); pressure.push({ ...job, attempted: receipt.results.length, completed: receipt.results.filter(value => value.status === 'completed').length, frames: receipt.frames }); }

const reconnect: unknown[] = [];
for (const variant of ['B0', 'B1', 'C1']) {
  const job = `reconnect-${variant}-1794425000000`;
  const receipt = await read<{ results: { name: string; at?: number; dropped?: number }[] }>(job + '.json');
  const marker = (name: string) => { const at = receipt.results.find(value => value.name === name)?.at; if (at === undefined) throw new Error(`Missing ${job}/${name}`); return at; };
  const disconnectAt = marker('disconnect'), reconnectedAt = marker('reconnect'), neutralAt = marker('neutral-after-reconnect'), freshAt = marker('fresh-after-reconnect');
  const actions: TraceEvent[] = [], submitted = new Map<string, number>(), accepted: string[] = [];
  function consume(event: TraceEvent) {
    if (event.realm === 'main' && event.stage === 'action' && Math.hypot(Number(event.data['x']), Number(event.data['z'])) > .001) actions.push(event);
    if (event.realm === 'main' && event.stage === 'input-submitted' && event.data['operation'] === 'advance') submitted.set(`${event.data['generation']}-${event.data['inputSequence']}`, event.now);
    if (event.stage === 'simulation-input') { const input = event.data['input'] as { x: number; z: number } | undefined; if (input && Math.hypot(input.x, input.z) > .001) accepted.push(`${event.data['generation']}-${event.data['inputSequence']}`); }
    const diagnostics = event.data['diagnostics'] as { events?: TraceEvent[] } | undefined; for (const nested of diagnostics?.events ?? []) consume(nested);
  }
  for await (const line of createInterface({ input: createReadStream(path.join(directory, job + '-trace.jsonl')), crlfDelay: Infinity })) if (line.trim()) consume(JSON.parse(line) as TraceEvent);
  const window = (start: number, end: number) => ({ nonzeroActionsAfter150msGrace: actions.filter(event => event.now > start + 150 && event.now < end).length, acceptedNonzeroSubmissionsAfter150msGrace: accepted.filter(identity => { const at = submitted.get(identity); return at !== undefined && at > start + 150 && at < end; }).length });
  reconnect.push({ variant, job, disconnectAt, reconnectedAt, neutralAt, freshAt, disconnectedHeld: window(disconnectAt, reconnectedAt), reconnectedHeld: window(reconnectedAt, neutralAt), freshInput: window(freshAt, freshAt + 400), droppedTraceEvents: receipt.results.reduce((sum, value) => sum + (value.dropped ?? 0), 0) });
}
await write('reconnect-followup-analysis.json', { rows: reconnect, qualification: 'Three post-acquisition labelled synthetic control diagnostics. Explicit helper markers close the original poll-signature timing gap. Concurrent offline postprocessing makes these unsuitable for latency ranking. Held input and fresh input are reported separately; this is not physical DualSense testing.' });
await write('final-evidence-summary.json', { generatedAt: new Date().toISOString(), rollups, soaks, pressure, reconnect });
console.log(JSON.stringify({ strata: rollups.length, phaseStageGroups: phaseAndStage.length, soaks: soaks.length, pressure: pressure.length, reconnect }));
