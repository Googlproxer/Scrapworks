import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'vite';
import type { WorldDefinition } from '../src/contracts/world';

// Manual only. Real worker-owned simulation rules and native captures; never invoke in CI.
const output = path.resolve(process.argv[2] ?? 'tmp/transport-bench/result.json');
const modules = await createServer({
  configFile: false,
  resolve: { tsconfigPaths: true },
  server: { middlewareMode: true, hmr: false },
  logLevel: 'error',
});
const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    medianMs: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
  };
};
const results: Record<string, unknown>[] = [];
try {
  const { Simulation } = (await modules.ssrLoadModule(
    '/src/simulation/ecs-runtime.ts',
  )) as typeof import('../src/simulation/ecs-runtime');
  const { OPENING_TECHNOLOGIES } = (await modules.ssrLoadModule(
    '/src/content/opening.ts',
  )) as typeof import('../src/content/opening');
  for (const count of [0, 50, 250, 1000]) {
    const definition: WorldDefinition = {
      version: 1,
      id: 'transport-benchmark',
      grid: { origin: { x: 0, z: 0 }, columns: 64, rows: 64, metresPerCell: 2 },
      terrain: Array<string>(4096).fill('soil'),
      spawn: { x: 1, y: 0, z: 1 },
      deposits: [],
      blockers: [],
    };
    const seed = new Simulation(definition),
      snapshot = seed.capture();
    seed.dispose();
    snapshot.resources.research = Object.fromEntries(
      OPENING_TECHNOLOGIES.map((t) => [
        t.id,
        {
          unlocked: true,
          work: t.seconds,
          consumed: Object.fromEntries(t.costs.map((c) => [c.item, c.quantity])),
        },
      ]),
    );
    for (let i = 0; i < count; i++) {
      const cell = { column: (i % 40) + 2, row: Math.floor(i / 40) + 2 },
        position = { x: cell.column * 2 + 1, y: 0, z: cell.row * 2 + 1 },
        id = `building:${i + 1}`;
      snapshot.entities.push({
        id,
        kind: 'building',
        transform: { position: { ...position }, facing: 0, moving: false, sprinting: false },
        building: {
          id,
          buildingId: 'conveyor',
          cell,
          position,
          rotation: 1,
          footprint: { width: 1, depth: 1 },
        },
        transport: {
          turn: 'straight',
          filters: [null, null],
          units: i % 3 === 0 ? [{ item: 'plate', lane: 0, progress: 5 }] : [],
          status: 'moving',
        },
      });
      if (i % 40 !== 39 && i + 1 < count)
        snapshot.resources.factory!.transport!.connections.push({
          id: `material:${count + i + 1}`,
          from: id,
          output: 'front',
          to: `building:${i + 2}`,
          input: 'back',
          cooldown: 0,
          lastItem: null,
        });
    }
    snapshot.resources.nextEntityId = count * 2 + 10;
    const sim = new Simulation(definition, { snapshot });
    try {
      const watched = new Set(
        snapshot.entities
          .filter((e) => e.transport)
          .slice(0, 4)
          .map((e) => e.id),
      );
      const step: number[] = [],
        publication: number[] = [];
      for (let i = 0; i < 200; i++) {
        let start = performance.now();
        sim.step({ x: 0, z: 0, sprint: false });
        if (i >= 40) step.push(performance.now() - start);
        start = performance.now();
        sim.publish(watched);
        if (i >= 40) publication.push(performance.now() - start);
      }
      let start = performance.now();
      const capture = sim.capture(),
        captureMs = performance.now() - start;
      start = performance.now();
      const rebuilt = new Simulation(definition, { snapshot: capture }),
        rebuildMs = performance.now() - start;
      rebuilt.dispose();
      const packet = sim.publish(watched, true);
      results.push({
        conveyors: count,
        step: stats(step),
        publication: stats(publication),
        captureMs,
        rebuildMs,
        snapshotBytes: Buffer.byteLength(JSON.stringify(capture)),
        projectedUnits: packet.factory!.transport!.segments.reduce((n, s) => n + s.units.length, 0),
        details: packet.details.length,
      });
    } finally {
      sim.dispose();
    }
  }
  const report = { manualOnly: true, node: process.version, cpu: os.cpus()[0].model, results };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await modules.close();
}
