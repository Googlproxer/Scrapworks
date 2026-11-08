import type { WorldDefinition } from '../../src/contracts/world';
import type { SimulationSnapshot } from '../../src/contracts/simulation';
import { MANUAL_SLOT, type SaveSnapshot } from '../../src/contracts/save';
import { Simulation } from '../../src/simulation/ecs-runtime';
import { OPENING_TECHNOLOGIES } from '../../src/content/opening';
import { preparePlayerSave } from '../../src/simulation/player-save';

export function envelope(world: SimulationSnapshot): SaveSnapshot {
  return {
    schema: 1,
    slot: MANUAL_SLOT,
    runId: 'benchmark-run',
    token: 'benchmark-token',
    savedAt: '2026-11-08T00:00:00.000Z',
    worldId: world.resources.worldId,
    contentVersion: world.contentVersion,
    tick: world.resources.tick,
    world,
  };
}

/** Deterministic existing production shapes; no future factory components or invented native bytes. */
export function fixture(authored: WorldDefinition, population?: number, bodies = 0): SaveSnapshot {
  let definition = structuredClone(authored);
  if (bodies) {
    definition = {
      version: 1,
      id: `save-bench-physics-${bodies}`,
      grid: { origin: { x: 0, z: 0 }, columns: 100, rows: 100, metresPerCell: 2 },
      terrain: Array<string>(10000).fill('soil'),
      spawn: { x: 1, y: 0, z: 1 },
      deposits: [],
      blockers: [],
      bodies: Array.from({ length: bodies }, (_, i) => ({
        id: `bench-body-${i}`,
        position: { x: 10 + (i % 90) * 2, y: 0.5, z: 10 + Math.floor(i / 90) * 2 },
        rotation: 0,
        motion: 'dynamic',
        mass: 1 + (i % 5),
        collision: { shape: 'box', width: 0.5, height: 1, depth: 0.5 },
      })),
    };
  }
  const initial = new Simulation(definition);
  let world: SimulationSnapshot;
  try {
    world = initial.capture();
  } finally {
    initial.dispose();
  }
  if (population !== undefined) {
    if (
      !Number.isSafeInteger(population) ||
      population < world.entities.length ||
      population > 250000
    )
      throw new Error('Population must include the base entities and be at most 250000.');
    const player = world.entities.find((entity) => entity.kind === 'player')!;
    for (const tech of OPENING_TECHNOLOGIES)
      world.resources.research[tech.id] = {
        consumed: Object.fromEntries(tech.costs.map((cost) => [cost.item, cost.quantity])),
        work: tech.seconds,
        unlocked: true,
      };
    player.inventory!.slots[0] = { item: 'scrap', quantity: 80 };
    player.inventory!.slots[1] = { item: 'plate', quantity: 20 };
    player.inventory!.slots[2] = { item: 'wire', quantity: 20 };
    player.opening!.minifab.owned = true;
    const base = world.entities.length,
      grid = definition.grid;
    for (let i = base; i < population; i++)
      world.entities.push({
        id: `pile:${i}`,
        kind: 'pile',
        transform: {
          position: {
            x:
              grid.origin.x +
              0.1 +
              (((i * 7919) % 1000) / 1000) * (grid.columns * grid.metresPerCell - 0.2),
            y: 0,
            z:
              grid.origin.z +
              0.1 +
              (((i * 1543) % 1000) / 1000) * (grid.rows * grid.metresPerCell - 0.2),
          },
          facing: ((i % 16) * Math.PI) / 8,
          moving: false,
          sprinting: false,
        },
        pile: { item: i % 3 === 0 ? 'plate' : 'scrap', quantity: 1 + (i % 31) },
      });
    world.resources.nextEntityId = population + 100;
    const work = new Simulation(definition, { snapshot: world });
    try {
      // Intake happens before handcraft starts: handcraft intentionally blocks new bag intake.
      work.step({ x: 0, z: 0, sprint: false }, [
        { type: 'minifab', recipe: 'mechanical-part', quantity: 2 },
      ]);
      work.step({ x: 0, z: 0, sprint: false }, [
        { type: 'handcraft-ui', visible: true },
        { type: 'craft', recipe: 'metal-plate', quantity: 3 },
      ]);
      world = work.capture();
      const active = world.entities.find((entity) => entity.kind === 'player')!.opening!;
      if (!active.handcraft || !active.minifab.job) throw new Error('Missing fixture work.');
    } finally {
      work.dispose();
    }
  }
  // Setup validates all durable gameplay invariants even if the host's independent size gate rejects it.
  preparePlayerSave(world);
  return envelope(world);
}
