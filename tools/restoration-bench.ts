import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import type { SaveSnapshot } from '../src/contracts/save';
import type { SimulationSnapshot } from '../src/contracts/simulation';

// Manual only. Profiles a detached earned save; never mutates its file or enters CI.
if (process.env['CI'] || process.env['GITHUB_ACTIONS'])
  throw new Error('Restoration profiling is local/manual only.');
const root = path.resolve(import.meta.dirname, '..');
const input = path.resolve(
  root,
  process.argv[2] ?? 'tmp/transport-browser/earned-restoration-final.json',
);
const output = path.resolve(root, process.argv[3] ?? 'tmp/restoration-bench/result.json');
const payload = JSON.parse(await fs.readFile(input, 'utf8')) as
  SaveSnapshot | { world: SimulationSnapshot };
const modules = await createServer({
  configFile: false,
  resolve: { tsconfigPaths: true },
  server: { middlewareMode: true, hmr: false },
  logLevel: 'error',
});
const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    medianMs: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    maxMs: sorted.at(-1),
  };
};
try {
  const { Simulation } = (await modules.ssrLoadModule(
    '/src/simulation/ecs-runtime.ts',
  )) as typeof import('../src/simulation/ecs-runtime');
  const { preparePlayerSave } = (await modules.ssrLoadModule(
    '/src/simulation/player-save.ts',
  )) as typeof import('../src/simulation/player-save');
  const world = preparePlayerSave(payload.world),
    frontierFixture = process.argv.includes('--frontier');
  if (frontierFixture) {
    assert(world.resources.environment);
    world.resources.environment.health.fill(0);
    world.resources.environment.completed = false;
    world.resources.environment.completedTick = null;
  }
  const sim = new Simulation(world.definition, { snapshot: world });
  try {
    const still = { x: 0, z: 0, sprint: false },
      watched = new Set(
        world.entities
          .filter((e) => e.machine?.utility)
          .slice(0, 4)
          .map((e) => e.id),
      );
    const step: number[] = [],
      publication: number[] = [];
    sim.publish(watched, true);
    for (let n = 0; n < 2500; n++) {
      let start = performance.now();
      sim.step(still);
      step.push(performance.now() - start);
      start = performance.now();
      sim.publish(watched);
      publication.push(performance.now() - start);
    }
    let start = performance.now();
    const saved = sim.capture(),
      captureMs = performance.now() - start;
    start = performance.now();
    const restored = new Simulation(saved.definition, { snapshot: preparePlayerSave(saved) }),
      rebuildMs = performance.now() - start;
    try {
      for (let n = 0; n < 1000; n++) {
        sim.step(still);
        restored.step(still);
      }
      assert.deepEqual(restored.capture(), sim.capture());
    } finally {
      restored.dispose();
    }
    const result = {
      date: '2026-11-09',
      frontierFixture,
      input: path.relative(root, input),
      node: process.version,
      cpu: os.cpus()[0]?.model,
      cells: world.definition.terrain.length,
      machines: world.entities.filter((e) => e.machine).length,
      pipeConnections: world.resources.environment!.connections.length,
      samples: 2500,
      step: summary(step),
      publication: summary(publication),
      captureMs,
      rebuildMs,
      snapshotJsonBytes: Buffer.byteLength(JSON.stringify(saved)),
      continuationSteps: 1000,
      continuationIdentical: true,
      qualification:
        'Local Node/native compute and publication; not renderer FPS, human pacing or target-device acceptance. Never CI.',
    };
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    sim.dispose();
  }
} finally {
  await modules.close();
}
