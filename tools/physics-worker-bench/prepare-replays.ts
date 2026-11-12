import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { TraceEvent } from './browser-probe.ts';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
import type { SimulationInput } from '../../src/contracts/simulation.ts';
import type { ProbeResult } from './detector.ts';
import { canonicalJson, type AcceptedReplayPlan } from './replay-plan.ts';
import { requireLocal } from './protocol.ts';
requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11'), output = path.join(directory, 'replay-plans');
await fs.mkdir(output, { recursive: true });
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const index: { job: string; browser: string; ticks: number; expectedSha256: string }[] = [], failures: unknown[] = [];
function nested(event: TraceEvent): TraceEvent[] { const diagnostics = event.data['diagnostics'] as { events?: TraceEvent[] } | undefined; return [event, ...(diagnostics?.events ?? []).flatMap(nested)]; }
for (const file of (await fs.readdir(directory)).filter(file => /^saved-(?:baseline|latency)-.+\.json$/.test(file))) {
  const job = file.slice('saved-'.length, -'.json'.length);
  try {
    let receipt: { results: ProbeResult[]; case?: string };
    try { receipt = JSON.parse(await fs.readFile(path.join(directory, job + '.json'), 'utf8')) as typeof receipt; }
    catch { failures.push({ job, reason: 'No completed acquisition receipt; raw save remains available for separate native validation.' }); continue; }
    const generation = receipt.results.find(result => result.generation !== null)?.generation;
    if (generation === null || generation === undefined) throw new Error('No accepted input generation');
    const inputs = new Map<number, SimulationInput>();
    const consume = (event: TraceEvent) => { for (const value of nested(event)) if (value.stage === 'simulation-input' && value.data['generation'] === generation) inputs.set(Number(value.data['tick']), value.data['input'] as SimulationInput); };
    const startupText = await fs.readFile(path.join(directory, job + '-startup.json'), 'utf8');
    for (const event of (JSON.parse(startupText) as { events: TraceEvent[] }).events) consume(event);
    const traceHash = createHash('sha256');
    for await (const line of createInterface({ input: createReadStream(path.join(directory, job + '-trace.jsonl')), crlfDelay: Infinity })) { if (!line.trim()) continue; traceHash.update(line + '\n'); consume(JSON.parse(line) as TraceEvent); }
    const maximum = Math.max(...inputs.keys());
    const rows = (JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')) as { payloads: { payload: SaveSnapshot }[] }).payloads.map(row => row.payload);
    const expectedSave = rows.filter(save => save.kind === 'auto' && save.tick <= maximum + 1).sort((a, b) => b.tick - a.tick)[0];
    if (!expectedSave) throw new Error('No actual autosave within the captured accepted stream');
    let initial: AcceptedReplayPlan['initial'] = null;
    if (receipt.case && receipt.case !== 'normal') {
      // The per-job IndexedDB export retains its exact seed even when another
      // browser selects a different fixture for the same case name.
      const fixture = rows.find(save => save.token === `bench-${receipt.case}-initial`);
      if (!fixture) throw new Error('The acquisition seed is missing from its save export');
      if (canonicalJson(fixture.world.definition) !== canonicalJson(expectedSave.world.definition)) throw new Error('Fixture definition changed after acquisition');
      initial = fixture.world;
    }
    const start = initial?.resources.tick ?? 0, stream: AcceptedReplayPlan['inputs'] = [];
    for (let tick = start; tick < expectedSave.tick; ++tick) { const input = inputs.get(tick); if (!input) throw new Error(`Missing accepted input at logical tick ${tick}`); stream.push({ tick, input }); }
    const plan: AcceptedReplayPlan = { job, browser: job.includes('-firefox-') ? 'firefox' : 'bundled', initial, inputs: stream, expected: expectedSave.world, generation, traceSha256: traceHash.digest('hex'), startupSha256: sha256(startupText), expectedSha256: sha256(canonicalJson(expectedSave.world)) };
    await fs.writeFile(path.join(output, job + '.json'), JSON.stringify(plan)); index.push({ job, browser: plan.browser, ticks: stream.length, expectedSha256: plan.expectedSha256 });
  } catch (error) { failures.push({ job, error: String(error) }); }
}
await fs.writeFile(path.join(output, 'index.json'), JSON.stringify({ index, failures }, null, 2)); console.log(JSON.stringify({ planned: index.length, failures }));
