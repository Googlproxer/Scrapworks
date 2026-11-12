import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { TraceEvent } from './browser-probe.ts';
import { requireLocal } from './protocol.ts';

requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11');
interface Attempt { id: number; operation: string; status?: string; observedAt?: number | null }
interface Receipt { results?: Attempt[]; attempted?: Attempt[]; error?: string }
const rows: unknown[] = [];
for (const queueName of ['render-queue-bundled-main-completed.json', 'render-queue-firefox-main-completed.json']) {
  const queue = JSON.parse(await fs.readFile(path.join(directory, queueName), 'utf8')) as { jobs: { id: string; case: string; variant: string; device: string }[] };
  for (const job of queue.jobs) {
    let receipt: Receipt;
    try { receipt = JSON.parse(await fs.readFile(path.join(directory, job.id + '.json'), 'utf8')) as Receipt; }
    catch { receipt = JSON.parse(await fs.readFile(path.join(directory, job.id + '-failure.json'), 'utf8')) as Receipt; }
    const failed = (receipt.results ?? receipt.attempted ?? []).filter(value => value.status !== 'completed');
    if (!failed.length && !receipt.error) continue;
    if (!(receipt.results ?? receipt.attempted)?.length) { rows.push({ ...job, error: receipt.error, attempted: 0 }); continue; }
    const holds: { start: number; end: number | null }[] = [];
    const captureStarts = new Map<string, number>();
    const captures: { start: number; end: number; milliseconds: number }[] = [];
    const firstRaw = new Map<number, number>();
    const submissions = new Map<number, number[]>();
    let hold: { start: number; end: number | null } | undefined;
    let pendingPose: TraceEvent | undefined, previousPose: TraceEvent | undefined;
    let firstGuard: unknown = null, maximumSubmittedDisplacementMetres = 0;
    for await (const line of createInterface({ input: createReadStream(path.join(directory, job.id + '-trace.jsonl')), crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as TraceEvent;
      if (event.realm !== 'main') continue;
      const data = event.data, probe = Number(data['probeId']), request = `${data['generation']}-${data['request']}`;
      if ((event.stage === 'raw-keyboard' || event.stage === 'raw-gamepad') && !firstRaw.has(probe)) firstRaw.set(probe, event.now);
      if (event.stage === 'hold-start' && data['holds'] === 1) { hold = { start: event.now, end: null }; holds.push(hold); }
      if (event.stage === 'hold-end' && data['holds'] === 0 && hold) { hold.end = event.now; hold = undefined; }
      if (event.stage === 'input-submitted') {
        if (data['operation'] === 'capture') captureStarts.set(request, event.now);
        if (data['operation'] === 'advance') { const values = submissions.get(probe) ?? []; values.push(event.now); submissions.set(probe, values); }
      }
      if (event.stage === 'worker-receipt' && captureStarts.has(request)) { const start = captureStarts.get(request)!; captures.push({ start, end: event.now, milliseconds: event.now - start }); captureStarts.delete(request); }
      if (event.stage === 'present') pendingPose = event;
      if (event.stage === 'frame-submitted' && pendingPose?.frame === event.frame) {
        const pose = pendingPose;
        const x = Number(pose.data['x']), z = Number(pose.data['z']);
        const displacement = previousPose && previousPose.data['generation'] === pose.data['generation'] ? Math.hypot(x - Number(previousPose.data['x']), z - Number(previousPose.data['z'])) : 0;
        maximumSubmittedDisplacementMetres = Math.max(maximumSubmittedDisplacementMetres, displacement);
        if (!firstGuard && (x <= -2.2 || x >= 5.8 || Math.abs(z - 1) > .1)) firstGuard = { now: event.now, x, z, tick: pose.data['tick'], displacementSincePreviousFrameMetres: displacement };
        previousPose = pose;
      }
    }
    rows.push({ ...job, error: receipt.error ?? null, firstGuard, maximumSubmittedDisplacementMetres, holds: holds.map(value => ({ ...value, milliseconds: value.end === null ? null : value.end - value.start })), captures, failed: failed.map(value => {
      const observedAt = value.observedAt ?? firstRaw.get(value.id) ?? null;
      const overlappingHolds = observedAt === null ? [] : holds.filter(interval => observedAt >= interval.start && (interval.end === null || observedAt <= interval.end));
      const overlappingCaptures = observedAt === null ? [] : captures.filter(interval => observedAt >= interval.start && observedAt <= interval.end);
      return { ...value, status: value.status ?? 'interrupted', observedAt, observationSource: value.observedAt == null ? 'first raw observation for the interrupted probe; not a recovered response endpoint' : 'primary receipt', overlappingHolds, overlappingCaptures, advanceSubmissionsWhileProbeArmed: submissions.get(value.id) ?? [], attribution: overlappingHolds.length || overlappingCaptures.length ? 'Input observation coincided with a recorded hold or outstanding capture request. It remains unresolved under the frozen gate; interval coincidence does not establish the full causal mechanism.' : 'No contemporaneous hold or capture request established; retain as unexplained/incomplete.' };
    }) });
  }
}
await fs.writeFile(path.join(directory, 'primary-failure-attribution.json'), JSON.stringify({ rows, interpretation: 'All intervals use main-thread timestamps. Hold coincidence identifies a blocked input window, not proof of hardware or OS cause. A corridor crossing is an acquisition failure, not by itself proof of a physics discontinuity. No failed attempt is removed from qualification.' }, null, 2));
console.log(JSON.stringify({ jobs: rows.length, output: 'primary-failure-attribution.json' }));
