import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'vite';
import type { EntityData } from '../src/contracts/simulation';
import type { WorldDefinition } from '../src/contracts/world';

// Manual only: representative real Simulation/native physics, not a CI performance assertion.
const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, process.argv[2] ?? 'tmp/factory-bench/result.json');
const modules = await createServer({
  configFile: false,
  resolve: { tsconfigPaths: true },
  server: { middlewareMode: true },
  logLevel: 'error',
});
const quantile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
const summary = (values: number[]) => ({
  medianMs: quantile(values, 0.5),
  p95Ms: quantile(values, 0.95),
});
const results: Record<string, unknown>[] = [];
try {
  const { Simulation } = (await modules.ssrLoadModule(
    '/src/simulation/ecs-runtime.ts',
  )) as typeof import('../src/simulation/ecs-runtime');
  const { newMachine } = (await modules.ssrLoadModule(
    '/src/simulation/factory.ts',
  )) as typeof import('../src/simulation/factory');
  const { OPENING_TECHNOLOGIES } = (await modules.ssrLoadModule(
    '/src/content/opening.ts',
  )) as typeof import('../src/content/opening');
  const { rebuildPhysics } = (await modules.ssrLoadModule(
    '/tools/testing/rebuild-physics.ts',
  )) as typeof import('./testing/rebuild-physics');
  for (const count of [0, 50, 250, 1000])
    for (const active of count ? [false, true] : [false]) {
      const definition: WorldDefinition = {
        version: 1,
        id: 'factory-benchmark',
        grid: { origin: { x: 0, z: 0 }, columns: 64, rows: 64, metresPerCell: 2 },
        terrain: Array<string>(4096).fill('soil'),
        spawn: { x: 1, y: 0, z: 1 },
        deposits: [],
        blockers: [],
      };
      const initial = new Simulation(definition),
        snapshot = initial.capture();
      initial.dispose();
      for (const t of OPENING_TECHNOLOGIES)
        snapshot.resources.research[t.id] = {
          consumed: Object.fromEntries(t.costs.map((c) => [c.item, c.quantity])),
          work: t.seconds,
          unlocked: true,
        };
      snapshot.resources.nextEntityId = count * 2 + 100;
      for (let i = 0; i < count; i++) {
        const id = `building-${i + 1}`,
          kind = i % 5 === 0 ? 'wind-turbine' : 'basic-fabricator';
        const cell = { column: (i % 60) + 2, row: Math.floor(i / 60) + 2 },
          position = { x: cell.column * 2 + 1, y: 0, z: cell.row * 2 + 1 };
        const machine = newMachine(kind, id, null);
        if (kind === 'basic-fabricator') {
          machine.recipe = 'mechanical-part';
          if (active)
            machine.input.slots = machine.input.slots.map(() => ({ item: 'plate', quantity: 100 }));
          snapshot.resources.factory!.connections.push({
            id: `connection-${count + i + 1}`,
            from: `building-${Math.floor(i / 5) * 5 + 1}`,
            to: id,
          });
        }
        const entity: EntityData = {
          id,
          kind: 'building',
          transform: { position, facing: 0, moving: false, sprinting: false },
          building: {
            id,
            buildingId: kind,
            cell,
            position,
            rotation: 0,
            footprint: { width: 1, depth: 1 },
            collision: { shape: 'box', width: 1.2, depth: 1.2, height: 1.5 },
          },
          machine,
        };
        snapshot.entities.push(entity);
      }
      rebuildPhysics(snapshot);
      const sim = new Simulation(definition, { snapshot });
      const still = { x: 0, z: 0, sprint: false };
      const watched = new Set(
        snapshot.entities
          .filter((e) => e.machine)
          .slice(0, 4)
          .map((e) => e.id),
      );
      sim.publish(watched, true);
      for (let i = 0; i < 40; i++) {
        sim.step(still);
        sim.publish(watched);
      }
      const steps: number[] = [],
        publications: number[] = [],
        inspections: number[] = [];
      let bytes = 0;
      for (let i = 0; i < 160; i++) {
        let start = performance.now();
        sim.step(still);
        steps.push(performance.now() - start);
        start = performance.now();
        const packet = sim.publish(watched);
        publications.push(performance.now() - start);
        if (i === 159)
          bytes =
            packet.rows.byteLength +
            packet.removed.byteLength +
            Buffer.byteLength(JSON.stringify({ ...packet, rows: null, removed: null }));
        start = performance.now();
        sim.inspect([...watched]);
        inspections.push(performance.now() - start);
      }
      let start = performance.now();
      const saved = sim.capture();
      const captureMs = performance.now() - start;
      const savedBytes = Buffer.byteLength(JSON.stringify(saved));
      start = performance.now();
      const restored = new Simulation(definition, { snapshot: saved });
      const rebuildMs = performance.now() - start;
      restored.dispose();
      sim.dispose();
      const result = {
        count,
        active,
        steps: summary(steps),
        publication: summary(publications),
        inspection: summary(inspections),
        details: watched.size,
        publicationBytes: bytes,
        captureMs,
        rebuildMs,
        snapshotJsonBytes: savedBytes,
      };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(
    output,
    JSON.stringify(
      {
        date: '2026-11-08',
        node: process.version,
        platform: process.platform,
        cpu: os.cpus()[0]?.model,
        clock: '20 Hz',
        samples: 160,
        qualification:
          'Manual Node compute/publication/native capture measurements; not renderer FPS or target-device qualification. No CI performance gate.',
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await modules.close();
}
