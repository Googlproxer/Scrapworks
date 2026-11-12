import fs from 'node:fs/promises';
import path from 'node:path';
import type { TraceEvent } from './browser-probe.ts';
import { distribution } from './statistics.ts';
import { requireLocal } from './protocol.ts';
requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11'), results = [];
for (const file of (await fs.readdir(directory)).filter(file => file.startsWith('baseline-') && file.endsWith('-startup.json'))) {
  const buffer = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')) as { events: TraceEvent[]; dropped: number };
  const last = buffer.events.at(-1)?.now ?? 0, frames = buffer.events.filter(event => event.stage === 'present' && event.now >= last - 10000);
  const deltas = frames.slice(1).map((frame, index) => Math.hypot(Number(frame.data['x']) - Number(frames[index].data['x']), Number(frame.data['z']) - Number(frames[index].data['z'])));
  const drift = distribution(deltas);
  results.push({ file, frames: frames.length, dropped: buffer.dropped, driftMetres: drift, thresholdMetres: .0001, pass: deltas.length >= 100 && buffer.dropped === 0 && drift.max !== null && drift.max < .0001, limitation: 'Free-space warmed idle only. Contact/platform latency needs support-relative observations; world-space stationarity is not sufficient there.' });
}
await fs.writeFile(path.join(directory, 'idle-calibration.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
