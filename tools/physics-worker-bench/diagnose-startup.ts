import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
import type { SimulationCapture } from '../../src/contracts/simulation.ts';
import { requireRunRelease } from './protocol.ts';

requireRunRelease(process.argv.includes('--start-authorized'));
const root = process.cwd();
const directory = path.join(root, 'docs/reports/split-physics-worker/2026-11-11');
const server = await createServer({ configFile: false, root, resolve: { tsconfigPaths: true }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
try {
  const { decodeSave } = await server.ssrLoadModule('/src/persistence/save-codec.ts') as typeof import('../../src/persistence/save-codec.ts');
  const { saveFixture } = await server.ssrLoadModule('/tests/support/save-fixture.ts') as typeof import('../../tests/support/save-fixture.ts');
  const rows: { file: string; world: string; characters: number; plainDataEntries: number; largestArray: number; loadable: boolean; error?: string }[] = [];
  function inspect(file: string, text: string, save: SaveSnapshot): void {
    const pending: unknown[] = [save];
    let plainDataEntries = 0, largestArray = 0;
    while (pending.length) {
      const value = pending.pop(); ++plainDataEntries;
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) largestArray = Math.max(largestArray, value.length);
        for (const child of Object.values(value)) pending.push(child);
      }
    }
    const row = { file, world: save.world.definition.id, characters: text.length, plainDataEntries, largestArray, loadable: false };
    try { decodeSave(save); rows.push({ ...row, loadable: true }); }
    catch (error) { rows.push({ ...row, error: String(error) }); }
  }
  for (const file of ['fixture-largest-mixed.json', 'fixture-steady-soak.json', 'fixture-physics-heavy.json', 'fixture-dense-contact.json']) {
    const text = await fs.readFile(path.join(directory, file), 'utf8');
    inspect(file, text, JSON.parse(text) as SaveSnapshot);
  }
  const soak = JSON.parse(await fs.readFile(path.join(directory, 'soak-full-bundled.json'), 'utf8')) as { kind: string; data: { variant: string; rawReceipt: string } }[];
  for (const event of soak.filter(event => event.kind === 'soak-pass')) {
    const file = event.data.rawReceipt + '.json';
    const raw = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')) as { final: SimulationCapture };
    const envelope = saveFixture(raw.final.world);
    inspect(file + '#final-capture-envelope', JSON.stringify(envelope), envelope);
  }
  await fs.writeFile(path.join(directory, 'startup-save-codec-diagnosis.json'), JSON.stringify({ rows, interpretation: 'The production decoder runs its existing bounded plain-data walk before loading. Limits and game code are unchanged. Worker-only snapshot coherence does not establish application save loadability.' }, null, 2));
  console.log(JSON.stringify(rows));
} finally { await server.close(); }
