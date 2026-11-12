import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { TraceEvent } from './browser-probe.ts';
import type { ProbeResult } from './detector.ts';
import { requireLocal } from './protocol.ts';
requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11');
const suffix = process.argv[2] ?? '1794329495606';
const browserPrefix = process.argv.includes('--firefox') ? 'firefox-' : '';
const verdicts: unknown[] = [];
for (const kind of ['none', 'delay-50', 'frame', 'drop', 'stale', 'gamepad']) {
  const job = `validation-${browserPrefix}${kind}-${suffix}`, receipt = JSON.parse(await fs.readFile(path.join(directory, job + '.json'), 'utf8')) as { results: ProbeResult[]; viewport: unknown; renderer: string };
  const events: TraceEvent[] = [];
  let idleMaxDisplacement = 0, previous: TraceEvent | undefined, armed = false;
  for await (const line of createInterface({ input: createReadStream(path.join(directory, job + '-trace.jsonl')), crlfDelay: Infinity })) {
    if (!line.trim()) continue; const event = JSON.parse(line) as TraceEvent;
    if (event.stage === 'probe-armed') armed = true;
    if (event.stage === 'present' && !armed) { if (previous) idleMaxDisplacement = Math.max(idleMaxDisplacement, Math.hypot(Number(event.data['x']) - Number(previous.data['x']), Number(event.data['z']) - Number(previous.data['z']))); previous = event; }
    if (event.stage.startsWith('injected-')) events.push(event);
  }
  const first = receipt.results.find(result => result.id === 1), original = events.find(event => event.stage === 'injected-original-result'), replay = events.find(event => event.stage === 'injected-result');
  let pass = receipt.results.every(result => result.status === 'completed');
  if (kind === 'drop' || kind === 'stale') pass = !!first && first.status !== 'completed' && receipt.results.every(result => result.status !== 'completed') && !!original && !!replay;
  if (kind === 'delay-50') pass &&= !!original && !!replay && Number(replay.data['waitedMs']) >= 49.5 && first?.responseAt !== null && first?.responseAt !== undefined && first.responseAt >= replay.now;
  if (kind === 'frame') pass &&= !!original && !!replay && replay.frame > original.frame && first?.responseAt !== null && first?.responseAt !== undefined && first.responseAt >= replay.now;
  verdicts.push({ kind, pass, attempts: receipt.results.length, completed: receipt.results.filter(result => result.status === 'completed').length, first, original: original ? { now: original.now, frame: original.frame } : null, replay: replay ? { now: replay.now, frame: replay.frame, data: replay.data } : null, idleMaxDisplacement, idleObservationsAvailable: previous !== undefined, viewport: receipt.viewport, renderer: receipt.renderer, interpretation: 'Known response suppression occurs on probe 1 only. This validates causal timing/failure detection; aggregate percentiles of the other probes are not a claimed 50 ms or one-frame shift.' });
}
await fs.writeFile(path.join(directory, browserPrefix ? 'probe-validation-firefox.json' : 'probe-validation.json'), JSON.stringify(verdicts, null, 2));
console.log(JSON.stringify(verdicts.map(value => { const row = value as { kind: string; pass: boolean }; return { kind: row.kind, pass: row.pass }; })));
