import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { distribution } from './statistics.ts';
import type { TraceEvent } from './browser-probe.ts';
import type { ProbeResult } from './detector.ts';
import { requireLocal } from './protocol.ts';
import { ResponseDetails } from './response-details.ts';
import { compareRunEvidence } from './comparison.ts';
requireLocal();
const directory = path.resolve(process.argv[2] ?? 'docs/reports/split-physics-worker/2026-11-11');
interface Receipt {
  job: string; device: string; results: ProbeResult[]; frames: ReturnType<typeof distribution>;
  cycles: number; hold: number; elapsedMs: number; savedHistory: { kind: string }[];
  viewport: unknown; renderer: string | null; freshBrowserProcess: boolean;
}
const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
function nested(event: TraceEvent): TraceEvent[] {
  const value = event.data['diagnostics'] as { events?: TraceEvent[] } | undefined;
  return [event, ...(value?.events ?? []).flatMap(nested)];
}
async function traceSummary(file: string, receipt: Receipt) {
  const details = new ResponseDetails(receipt.results);
  const measures: Record<string, number[]> = { renderMs: [], workerRoundTripMs: [], runtimeMs: [], physicsMs: [], physicsRoundTripMs: [], packetBytes: [], activeBodies: [], changedPoses: [], staticColliders: [], submittedCredits: [], queueSize: [], holdsMs: [] };
  const submitted = new Map<string, number>(), physicsStarted = new Map<string, number>(), dispatched = new Map<string, number>();
  const phases: Record<string, { count: number; completed: number; latencyMs: number[] }> = {};
  const phaseAssignments: { id: number; operation: string; nominalTickPhaseMs: number; sinceSubmittedFrameMs: number | null }[] = [];
  const results = new Map(receipt.results.map(result => [result.id, result]));
  const blocked = new Map<number, { hold: boolean; capturing: boolean; paused: boolean }>();
  let host: TraceEvent | undefined, frameStart = 0, lastSubmittedFrame: number | undefined, holdStart: number | undefined;
  let maxOutstanding = 0, lines = 0, inputSamples = 0;
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    if (!line.trim()) continue; ++lines;
    const main = JSON.parse(line) as TraceEvent;
    details.consume(main);
    for (const event of nested(main)) {
      const data = event.data, identity = `${data['generation']}-${data['request'] ?? data['id']}`;
      if (event.realm === 'main') {
        if (event.stage === 'frame-begin') frameStart = event.now;
        if (event.stage === 'frame-submitted' && frameStart) { measures['renderMs'].push(event.now - frameStart); lastSubmittedFrame = event.now; }
        if (event.stage === 'host-frame') { host = event; maxOutstanding = Math.max(maxOutstanding, numeric(data['outstanding'])); }
        if (event.stage === 'hold-start' && data['holds'] === 1) holdStart = event.now;
        if (event.stage === 'hold-end' && data['holds'] === 0 && holdStart !== undefined) { measures['holdsMs'].push(event.now - holdStart); holdStart = undefined; }
        if (event.stage === 'input-submitted') { submitted.set(identity, event.now); if (data['operation'] === 'advance') { measures['submittedCredits'].push(numeric(data['steps'])); measures['queueSize'].push(numeric(data['queue'])); } }
        if (event.stage === 'worker-receipt') { const start = submitted.get(identity); if (start !== undefined) { measures['workerRoundTripMs'].push(event.now - start); submitted.delete(identity); } }
        if (event.stage === 'raw-keyboard' || event.stage === 'raw-gamepad') {
          const result = results.get(numeric(data['probeId']));
          if (result && result.observedAt === event.now && host) {
            ++inputSamples;
            // host-frame is emitted before advance charges its frame interval to the accumulator.
            const phase = (((numeric(host.data['elapsed']) + Math.max(0, numeric(host.data['seconds']))) * 1000 + event.now - host.now) % 50 + 50) % 50;
            phaseAssignments.push({ id: result.id, operation: result.operation, nominalTickPhaseMs: phase, sinceSubmittedFrameMs: lastSubmittedFrame === undefined ? null : event.now - lastSubmittedFrame });
            const key = `${result.operation}-${Math.floor(phase / 5) * 5}`;
            const row = phases[key] ??= { count: 0, completed: 0, latencyMs: [] }; ++row.count;
            if (result.latencyMs !== null) { ++row.completed; row.latencyMs.push(result.latencyMs); }
            if (result.submittedAt === null && (numeric(host.data['holds']) > 0 || host.data['capturing'] || host.data['paused'])) blocked.set(result.id, { hold: numeric(host.data['holds']) > 0, capturing: !!host.data['capturing'], paused: !!host.data['paused'] });
          }
        }
      }
      if (event.stage === 'runtime-finish') { measures['runtimeMs'].push(numeric(data['elapsedMs'])); measures['packetBytes'].push(numeric(data['packetBytes'])); }
      if (event.stage === 'physics-start') physicsStarted.set(`${event.realm}-${data['tick']}`, event.now);
      if (event.stage === 'physics-finish') { const key = `${event.realm}-${data['tick']}`, start = physicsStarted.get(key); if (start !== undefined) { measures['physicsMs'].push(event.now - start); physicsStarted.delete(key); } }
      if (event.stage === 'physics-dispatched') dispatched.set(identity, event.now);
      if (event.stage === 'physics-received') { const start = dispatched.get(identity); if (start !== undefined) { measures['physicsRoundTripMs'].push(event.now - start); dispatched.delete(identity); } }
      if (event.stage === 'native-population') { measures['activeBodies'].push(numeric(data['activeEntityBodies'])); measures['changedPoses'].push(numeric(data['changedPoses'])); }
      if (event.stage === 'collider-sync') measures['staticColliders'].push(numeric(data['count']));
    }
  }
  return { version: 2, lines, inputSamples, maxOutstanding, phaseAssignments, responseDetails: details.report(), measures: Object.fromEntries(Object.entries(measures).map(([key, values]) => [key, distribution(values)])), phases: Object.fromEntries(Object.entries(phases).map(([key, row]) => [key, { count: row.count, completed: row.completed, latency: distribution(row.latencyMs), rawLatenciesMs: row.latencyMs }])), deliberateBlockedCandidates: [...blocked.entries()].map(([id, reason]) => ({ id, ...reason })), blockingQualification: 'A contemporaneous blocked host frame with no matching submission is reported separately. Accepted or unexplained failures remain failures.' };
}
const names = await fs.readdir(directory);
const receipts: Receipt[] = [];
for (const name of names.filter(name => /^(baseline|latency)-.*-run\d+-\d+\.json$/.test(name))) {
  const value = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')) as Receipt;
  receipts.push(value);
  const analyzed = path.join(directory, value.job + '-analysis.json');
  try { const cached = JSON.parse(await fs.readFile(analyzed, 'utf8')) as { version?: number }; if (cached.version !== 2) throw new Error('Analysis version changed'); } catch {
    const summary = await traceSummary(path.join(directory, value.job + '-trace.jsonl'), value);
    await fs.writeFile(analyzed, JSON.stringify(summary, null, 2));
  }
}
const groups: Record<string, Receipt[]> = {};
const acquisitionFailures: Record<string, { job: string; file: string; error?: string; attempted: number }[]> = {};
function groupKey(job: string) {
  const match = /^(baseline|latency)-(.+)-(B0|B1|C1)-(keyboard|synthetic-gamepad)-run(\d+)-/.exec(job);
  if (!match) throw new Error(`Unrecognized acquisition identity: ${job}`);
  return `${match[1]}-${match[2]}-${match[4]}`;
}
for (const receipt of receipts) {
  const key = groupKey(receipt.job);
  (groups[key] ??= []).push(receipt);
}
for (const file of names.filter(name => /^(baseline|latency)-.*-run\d+-\d+-failure\.json$/.test(name))) {
  const job = file.slice(0, -'-failure.json'.length), key = groupKey(job);
  const value = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')) as { error?: string; attempted?: unknown[] };
  (acquisitionFailures[key] ??= []).push({ job, file, error: value.error, attempted: value.attempted?.length ?? 0 });
  groups[key] ??= [];
}
const failedAcquisitions = (key: string, variants: string[]) => (acquisitionFailures[key] ?? []).filter(row => variants.some(variant => row.job.includes(`-${variant}-`))).length;
const report: Record<string, unknown> = {};
for (const [key, rows] of Object.entries(groups)) {
  const variants = Object.fromEntries(['B0', 'B1', 'C1'].map(variant => {
    const values = rows.filter(row => row.job.includes(`-${variant}-`));
    return [variant, { runs: values.length, attempted: values.reduce((n, value) => n + value.results.length, 0), completed: values.reduce((n, value) => n + value.results.filter(result => result.status === 'completed').length, 0), failures: values.flatMap(value => value.results.filter(result => result.status !== 'completed').map(result => ({ job: value.job, ...result }))), operations: Object.fromEntries(['start', 'reverse', 'release'].map(operation => [operation, distribution(values.flatMap(value => value.results.filter(result => result.operation === operation && result.latencyMs !== null).map(result => result.latencyMs!)))])), frameRuns: values.map(value => ({ job: value.job, frames: value.frames, saves: value.savedHistory })), freshBrowserProcesses: values.length > 0 && values.every(value => value.freshBrowserProcess) }];
  }));
  const paired: Record<string, unknown> = {};
  for (const operation of ['start', 'reverse', 'release'] as const) for (const [probability, budget] of [[.5, 2], [.95, 5], [.99, 8]]) {
    paired[`${operation}-p${probability * 100}`] = compareRunEvidence(rows.filter(row => row.job.includes('-B0-')), rows.filter(row => row.job.includes('-C1-')), operation, probability, budget, failedAcquisitions(key, ['B0', 'C1']));
  }
  const playableCapacity: Record<string, unknown> = {};
  if (key.startsWith('latency-')) {
    const normalKey = key.replace(/horizontal-.+-(keyboard|synthetic-gamepad)$/, 'horizontal-normal-$1');
    const normal = (groups[normalKey] ?? []).filter(row => row.job.includes('-B0-'));
    for (const variant of ['B0', 'C1']) for (const operation of ['start', 'reverse', 'release'] as const) for (const [probability, budget] of [[.5, 2], [.95, 5], [.99, 8]]) {
      playableCapacity[`${variant}-${operation}-p${probability * 100}`] = normalKey === key && variant === 'B0' ? { verdict: 'reference', difference: 0 } : normalKey === key ? paired[`${operation}-p${probability * 100}`] : compareRunEvidence(normal, rows.filter(row => row.job.includes(`-${variant}-`)), operation, probability, budget, failedAcquisitions(normalKey, ['B0']) + failedAcquisitions(key, [variant]));
    }
  }
  const framePairs = Array.from({ length: 5 }, (_, index) => {
    const run = index + 1, baseline = rows.find(row => row.job.includes('-B0-') && row.job.includes(`-run${run}-`)), candidate = rows.find(row => row.job.includes('-C1-') && row.job.includes(`-run${run}-`));
    const differencesMs = Object.fromEntries((['p50', 'p95', 'p99', 'max'] as const).map(metric => {
      const a = baseline?.frames[metric], b = candidate?.frames[metric];
      return [metric, typeof a === 'number' && typeof b === 'number' ? b - a : null];
    }));
    return { run, baseline: baseline?.frames, candidate: candidate?.frames, differencesMs, interpretation: 'Paired per-run submitted-frame distributions; no physical presentation inference.' };
  });
  report[key] = { variants, paired, playableCapacity, framePairs, acquisitionFailures: acquisitionFailures[key] ?? [], qualification: 'Synthetic software endpoint. Bundled-browser runs use fresh documents/workers in a shared process; Firefox headless runs are a separate diagnostic with fresh processes. Physical timing, physical 60 Hz and human A/B are unavailable.' };
}
await fs.writeFile(path.join(directory, 'latency-analysis.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ groups: Object.keys(report), receipts: receipts.length, path: path.join(directory, 'latency-analysis.json') }));
