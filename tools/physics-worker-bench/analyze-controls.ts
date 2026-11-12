import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { TraceEvent } from './browser-probe.ts';
import type { SimulationInput } from '../../src/contracts/simulation.ts';
import { requireLocal } from './protocol.ts';

requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11');
interface Condition { name: string; id?: number; movingActions?: number; sprintActions?: number; dropped?: number; width?: number; height?: number; observedFailure?: boolean; presented?: { now: number; generation: number; tick: number; x: number; z: number }[] }
const schedule = JSON.parse(await fs.readFile(path.join(directory, 'render-queue-supplement-completed.json'), 'utf8')) as { jobs: { id: string; variant: string; device: string }[] };
const rows: unknown[] = [];
function nested(event: TraceEvent): TraceEvent[] {
  const value = event.data['diagnostics'] as { events?: TraceEvent[] } | undefined;
  return [event, ...(value?.events ?? []).flatMap(nested)];
}
const moving = (input: SimulationInput | undefined) => !!input && Math.hypot(input.x, input.z) > .001;
for (const job of schedule.jobs) {
  const receipt = JSON.parse(await fs.readFile(path.join(directory, job.id + '.json'), 'utf8')) as { results: Condition[] };
  const submitted = new Map<string, number>();
  const accepted: { identity: string }[] = [];
  const publications: number[] = [];
  const pauses: { start: number; end: number }[] = [];
  const relevantIds = new Set(receipt.results.filter(value => ['pause-held-fresh-input', 'manual-save-load', 'disconnect-reconnect-held'].includes(value.name)).map(value => value.id));
  const mainByProbe = new Map<number, TraceEvent[]>();
  let pauseStart: number | undefined;
  for await (const line of createInterface({ input: createReadStream(path.join(directory, job.id + '-trace.jsonl')), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    for (const event of nested(JSON.parse(line) as TraceEvent)) {
      if (event.realm === 'main') {
        const id = Number(event.data['probeId']);
        if (relevantIds.has(id) && ['host-frame', 'action', 'raw-keyboard', 'raw-gamepad'].includes(event.stage)) {
          const events = mainByProbe.get(id) ?? []; events.push(event); mainByProbe.set(id, events);
        }
        if (event.stage === 'input-submitted' && moving(event.data['input'] as SimulationInput | undefined)) submitted.set(`${event.data['generation']}-${event.data['inputSequence']}`, Number(event.data['probeId']));
        if (event.stage === 'publication') publications.push(event.now);
        if (event.stage === 'host-frame') {
          if (event.data['paused'] === true && pauseStart === undefined) pauseStart = event.now;
          else if (event.data['paused'] === false && pauseStart !== undefined) { pauses.push({ start: pauseStart, end: event.now }); pauseStart = undefined; }
        }
      }
      if (event.stage === 'simulation-input' && moving(event.data['input'] as SimulationInput | undefined)) accepted.push({ identity: `${event.data['generation']}-${event.data['inputSequence']}` });
    }
  }
  const submittedProbes = new Set(submitted.values());
  const acceptedProbes = new Set(accepted.map(value => submitted.get(value.identity)).filter((value): value is number => value !== undefined));
  const taps = [20, 40, 60, 100].map(duration => {
    const conditions = receipt.results.filter(value => value.name.startsWith(`tap-${duration}-`));
    return { durationMs: duration, attempted: conditions.length, actionObserved: conditions.filter(value => (value.movingActions ?? 0) > 0).length, nonzeroSubmitted: conditions.filter(value => submittedProbes.has(value.id!)).length, nonzeroAccepted: conditions.filter(value => acceptedProbes.has(value.id!)).length };
  });
  const load = receipt.results.find(value => value.name === 'manual-save-load');
  const generations = [...new Set(load?.presented?.map(value => value.generation) ?? [])].sort((a, b) => a - b);
  const reconnect = receipt.results.find(value => value.name === 'disconnect-reconnect-held');
  const neutral = (event: TraceEvent) => event.stage === 'raw-keyboard' ? event.data['down'] === false : event.stage === 'raw-gamepad' && (event.data['samples'] as ({ axes: number[] } | null)[]).some(value => value && value.axes[0] === 0 && value.axes[1] === 0);
  const heldWindow = (condition: Condition | undefined, resumedAt: number | undefined) => {
    const events = mainByProbe.get(condition?.id ?? -1) ?? [];
    const neutralAt = resumedAt === undefined ? undefined : events.find(event => event.now > resumedAt && neutral(event))?.now;
    if (resumedAt === undefined || neutralAt === undefined) return null;
    const actions = events.filter(event => event.stage === 'action' && Math.hypot(Number(event.data['x']), Number(event.data['z'])) > .001);
    return { resumedAt, neutralAt, nonzeroActionsBeforeNeutralAfter150msGrace: actions.filter(event => event.now > resumedAt + 150 && event.now < neutralAt).length, freshNonzeroActionsAfterNeutral: actions.filter(event => event.now > neutralAt).length };
  };
  const pauseCondition = receipt.results.find(value => value.name === 'pause-held-fresh-input');
  const hostFrames = (mainByProbe.get(pauseCondition?.id ?? -1) ?? []).filter(event => event.stage === 'host-frame');
  const hostGap = hostFrames.slice(1).map((event, index) => ({ milliseconds: event.now - hostFrames[index].now, resumedAt: event.now })).sort((a, b) => b.milliseconds - a.milliseconds)[0];
  let disconnected = false, reconnectedAt: number | undefined;
  for (const event of mainByProbe.get(reconnect?.id ?? -1) ?? []) if (event.stage === 'raw-gamepad') {
    const samples = event.data['samples'] as ({ axes: number[] } | null)[];
    if (!samples.some(Boolean)) disconnected = true;
    else if (disconnected && reconnectedAt === undefined) reconnectedAt = event.now;
  }
  const firstLoadGeneration = load?.presented?.[0]?.generation;
  const loadedAt = load?.presented?.find(frame => frame.generation !== firstLoadGeneration)?.now;
  const presentationGaps = ['pause-held-fresh-input', 'zero-size-viewport'].map(name => {
    const frames = receipt.results.find(value => value.name === name)?.presented ?? [];
    const gaps = frames.slice(1).map((frame, index) => ({ milliseconds: frame.now - frames[index].now, tickDelta: frame.tick - frames[index].tick, positionDeltaMetres: Math.hypot(frame.x - frames[index].x, frame.z - frames[index].z), sameGeneration: frame.generation === frames[index].generation }));
    let start = frames[0], longestTickPlateauMs = 0;
    for (const frame of frames) { if (!start || frame.tick !== start.tick || frame.generation !== start.generation) start = frame; else longestTickPlateauMs = Math.max(longestTickPlateauMs, frame.now - start.now); }
    return { name, longestTickPlateauMs, largestObservedGap: gaps.sort((a, b) => b.milliseconds - a.milliseconds)[0] ?? null };
  });
  rows.push({ ...job, conditions: receipt.results.length, taps, retryObserved: receipt.results.some(value => value.name === 'renderer-retry' && value.observedFailure), sprintActions: receipt.results.find(value => value.name === 'diagonal-sprint')?.sprintActions, zeroSizeObserved: receipt.results.some(value => value.name === 'hidden-renderer-host' && value.width === 0 && value.height === 0), presentationGaps, pauseIntervals: pauses.map(value => ({ milliseconds: value.end - value.start, publicationsAfter250msGrace: publications.filter(now => now > value.start + 250 && now < value.end).length })), pauseHostGap: hostGap, pauseHeldRecovery: heldWindow(pauseCondition, hostGap && hostGap.milliseconds > 250 ? hostGap.resumedAt : undefined), manualLoadGenerations: generations, manualLoadHeldRecovery: heldWindow(load, loadedAt), reconnectHeldRecovery: heldWindow(reconnect, reconnectedAt), traceDropped: receipt.results.reduce((sum, value) => sum + (value.dropped ?? 0), 0), disconnectCondition: reconnect ? { id: reconnect.id, movingActions: reconnect.movingActions, dropped: reconnect.dropped } : null, analog: receipt.results.filter(value => value.name.startsWith('analog-')).map(value => ({ name: value.name, actionObserved: (value.movingActions ?? 0) > 0, nonzeroAccepted: acceptedProbes.has(value.id!) })) });
}
const result = { rows, interpretation: 'Tap registration is reported at action, submission and accepted logical-input boundaries, separately from sustained latency. Paused publication counts allow a 250 ms in-flight grace. Zero-size and generation observations corroborate those paths; they are not physical timing, full focus-loss qualification or sustained p99.' };
await fs.writeFile(path.join(directory, 'supplemental-control-analysis.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ jobs: rows.length, output: 'supplemental-control-analysis.json' }));
