import type { SimulationCapture, SimulationSnapshot } from '../../src/contracts/simulation';
import type { WorldCommand, WorldDefinition } from '../../src/contracts/world';
import { Simulation } from '../../src/simulation/simulation';
import { assertSnapshot } from '../../src/simulation/capture';
import { OPENING_CONTENT, OPENING_TECHNOLOGIES } from '../../src/content/opening';

export const workloads = [
  'opening-v2-idle-piles',
  'opening-v2-salvage-research',
  'opening-v2-handcraft',
  'opening-v2-minifab',
  'opening-v2-pickup-burst',
] as const;
export type Workload = (typeof workloads)[number];
export const definition: WorldDefinition = {
  version: 1,
  id: 'current-game-benchmark-v2',
  grid: { origin: { x: 0, z: 0 }, columns: 10, rows: 10, metresPerCell: 2 },
  terrain: Array<string>(100).fill('soil'),
  spawn: { x: 1, y: 0, z: 1 },
  deposits: [
    {
      id: 'scrap',
      kind: 'scrap',
      quantity: 250000,
      position: { x: 3, y: 0, z: 1 },
      footprint: { width: 1, depth: 1 },
      rotation: 0,
    },
  ],
  blockers: [],
};

/** Detached validated production captures; setup and replenishment are outside timing. */
export function fixture(workload: Workload, population = 1000): SimulationCapture {
  const simulation = new Simulation(definition);
  const world: SimulationSnapshot = simulation.capture();
  simulation.dispose();
  const player = world.entities.find((entity) => entity.kind === 'player')!;
  const opening = player.opening!;
  if (workload === 'opening-v2-idle-piles' || workload === 'opening-v2-pickup-burst') {
    for (let index = 0; index < population; index++)
      world.entities.push({
        id: `pile-${index}`,
        kind: 'pile',
        transform: { position: { x: 1, y: 0, z: 1 }, facing: 0, moving: false, sprinting: false },
        pile: { item: 'scrap', quantity: 1 },
      });
    world.resources.nextEntityId += population;
  } else {
    player.inventory!.slots[0] = { item: 'scrap', quantity: 100 };
    world.resources.extractionTotals['scrap'] = 100;
    for (const technology of OPENING_TECHNOLOGIES)
      world.resources.research[technology.id] = {
        consumed:
          workload === 'opening-v2-salvage-research'
            ? {}
            : Object.fromEntries(technology.costs.map((cost) => [cost.item, cost.quantity])),
        work: workload === 'opening-v2-salvage-research' ? 0 : technology.seconds,
        unlocked: workload !== 'opening-v2-salvage-research',
      };
    if (workload === 'opening-v2-minifab') {
      opening.minifab.owned = true;
      opening.minifab.charge = 60;
      opening.minifab.status = 'idle';
    }
  }
  assertSnapshot(world, OPENING_CONTENT);
  return { world, pending: [], ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 } };
}

export function commands(workload: Workload): WorldCommand[] {
  switch (workload) {
    case 'opening-v2-salvage-research':
      return [
        { type: 'salvage', target: 'scrap' },
        { type: 'research', technology: 'improvised-tools', enabled: true },
      ];
    case 'opening-v2-handcraft':
      return [
        { type: 'handcraft-ui', visible: true },
        { type: 'craft', recipe: 'metal-plate', quantity: 10 },
      ];
    case 'opening-v2-minifab':
      return [{ type: 'minifab', recipe: 'metal-plate', quantity: 10 }];
    case 'opening-v2-pickup-burst':
      return Array.from({ length: 64 }, (_, index) => ({
        type: 'pickup',
        target: `pile-${index}`,
      }));
    default:
      return [];
  }
}
