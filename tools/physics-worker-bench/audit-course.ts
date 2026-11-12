import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import type { TraceEvent } from './browser-probe.ts';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
import { requireLocal } from './protocol.ts';
requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11'), results = [];
for (const name of (await fs.readdir(directory)).filter(name => /^baseline-.+-run\d+-\d+-trace\.jsonl$/.test(name))) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, frames = 0;
  for await (const line of createInterface({ input: createReadStream(path.join(directory, name)), crlfDelay: Infinity })) {
    if (!line.trim()) continue; const event = JSON.parse(line) as TraceEvent; if (event.stage !== 'present' || event.realm !== 'main') continue;
    const x = Number(event.data['x']), z = Number(event.data['z']); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); ++frames;
  }
  const job = name.slice(0, -'-trace.jsonl'.length);
  let savedCratePoses: unknown[] = [];
  try { const saved = JSON.parse(await fs.readFile(path.join(directory, 'saved-' + job + '.json'), 'utf8')) as { payloads: { payload: SaveSnapshot }[] }; savedCratePoses = saved.payloads.map(row => ({ tick: row.payload.tick, position: row.payload.world.entities.find(entity => entity.id === 'physics-crate')?.transform?.position })); } catch { /* Separately reported absent save evidence. */ }
  results.push({ job, frames, minX, maxX, minZ, maxZ, initialCrateContactRisk: Math.abs(minX - 1) < .8 && maxZ >= 2.7, savedCratePoses, interpretation: 'Observed world-space course envelope and native saved crate poses. Bounding proximity is a risk indicator, not a fabricated exact contact count.' });
}
await fs.writeFile(path.join(directory, 'course-audit.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
