import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
import { requireRunRelease } from './protocol.ts';
requireRunRelease(process.argv.includes('--start-authorized'));
const root = process.cwd(), directory = path.join(root, 'docs/reports/split-physics-worker/2026-11-11');
const server = await createServer({ configFile: false, root, resolve: { tsconfigPaths: true }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
try {
  const { Simulation } = await server.ssrLoadModule('/src/simulation/ecs-runtime.ts') as typeof import('../../src/simulation/ecs-runtime.ts');
  const { assertSaveData } = await server.ssrLoadModule('/src/persistence/save-codec.ts') as typeof import('../../src/persistence/save-codec.ts');
  const results: unknown[] = [];
  for (const file of (await fs.readdir(directory)).filter(file => file.startsWith('saved-') && file.endsWith('.json'))) {
    const exported = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')) as { payloads: { payload: SaveSnapshot }[] };
    for (const row of exported.payloads) {
      const save = row.payload;
      try {
        assertSaveData(save); const original = new Simulation(save.world.definition, { snapshot: save.world, developerFixture: true });
        try {
          const second = new Simulation(save.world.definition, { snapshot: JSON.parse(JSON.stringify(original.capture())) as SaveSnapshot['world'], developerFixture: true });
          try {
            for (let n = 0; n < 100; ++n) { const movement = { x: n % 40 < 20 ? .5 : -.5, z: 0, sprint: false }; original.step(movement); second.step(movement); }
            if (JSON.stringify(original.capture()) !== JSON.stringify(second.capture())) throw new Error('Restored native/gameplay continuation diverged');
          } finally { second.dispose(); }
        } finally { original.dispose(); }
        results.push({ file, token: save.token, kind: save.kind, tick: save.tick, valid: true, nativeContinuationTicks: 100 });
      } catch (error) { results.push({ file, token: save.token, kind: save.kind, valid: false, error: String(error) }); }
    }
  }
  await fs.writeFile(path.join(directory, 'actual-save-audit.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ audited: results.length, failures: results.filter(result => !(result as { valid: boolean }).valid).length }));
} finally { await server.close(); }
