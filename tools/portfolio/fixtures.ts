import { MACHINE_COLLISION } from '../../src/content/factory';
import type { WorldDefinition } from '../../src/contracts/world';
import type { EntityData, SimulationSnapshot } from '../../src/contracts/simulation';
import type { MachineKind } from '../../src/contracts/factory';
import { Simulation } from '../../src/simulation/ecs-runtime';
import { preparePlayerSave } from '../../src/simulation/player-save';
import { newMachine } from '../../src/simulation/factory';
import { emptyTransport } from '../../src/content/transport';
import { cellCenter } from '../../src/core/world-grid';
import { OPENING_CONTENT, OPENING_TECHNOLOGIES, OPENING_RECIPES } from '../../src/content/opening';
import { canFabricate } from '../../src/content/first-factory';
import { saveFixture } from '../../tests/support/save-fixture.ts';
import { WorldPhysics } from '../../src/simulation/physics/world-physics';
import { staticColliders } from '../../src/simulation/physics/collision-definitions';

export const WORKLOADS = ['renewable', 'mixed', 'stress'] as const;
export type Workload = (typeof WORKLOADS)[number];

/** Controlled diagnostic state, never earned progress. Uses the unchanged authored map/native bodies. */
export function portfolioFixture(definition: WorldDefinition, workload: Workload, machineCount?: number) {
  const initial = new Simulation(definition);
  const snapshot = initial.capture();
  initial.dispose();
  for (const t of OPENING_TECHNOLOGIES)
    snapshot.resources.research[t.id] = {
      consumed: Object.fromEntries(t.costs.map((c) => [c.item, c.quantity])),
      work: t.seconds,
      unlocked: true,
    };
  const player = snapshot.entities.find((e) => e.kind === 'player')!;
  player.opening!.minifab.owned = true;
  player.opening!.moved = true;
  player.inventory!.slots[0] = { item: 'scrap', quantity: 100 };
  const safe: { column: number; row: number }[] = [];
  for (let row = 1; row < definition.grid.rows - 1; row++)
    for (let column = 1; column < definition.grid.columns - 1; column++) {
      const cell = { column, row },
        p = cellCenter(definition.grid, cell);
      if (definition.terrain[row * definition.grid.columns + column] === 'water') continue;
      if (
        snapshot.entities.some(
          (e) =>
            e.transform &&
            Math.hypot(e.transform.position.x - p.x, e.transform.position.z - p.z) < 3,
        )
      )
        continue;
      if (definition.blockers.some((e) => Math.hypot(e.position.x - p.x, e.position.z - p.z) < 4))
        continue;
      safe.push(cell);
    }
  safe.sort((a, b) => {
    const pa = cellCenter(definition.grid, a),
      pb = cellCenter(definition.grid, b),
      p = definition.spawn;
    return (
      Math.hypot(pa.x - p.x, pa.z - p.z) - Math.hypot(pb.x - p.x, pb.z - p.z) ||
      a.row - b.row ||
      a.column - b.column
    );
  });
  const kinds: MachineKind[] = [
    'solar-panel',
    'recycler',
    'wind-turbine',
    'basic-fabricator',
    'medium-fabricator',
    'laboratory',
    'battery',
    'greenhouse',
    'water-treatment',
    'water-tank',
    ...(workload === 'renewable' ? [] : ['coal-generator' as const, 'air-scrubber' as const]),
  ];
  const count = Math.min(safe.length, machineCount ?? (workload === 'stress' ? 96 : 24));
  const machines: EntityData[] = [];
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length],
      cell = safe[i],
      p = cellCenter(definition.grid, cell),
      id = `building-${snapshot.resources.nextEntityId++}`;
    const machine = newMachine(kind, id, null);
    if (kind === 'basic-fabricator' || kind === 'medium-fabricator')
      machine.recipe =
        OPENING_RECIPES.find((r) =>
          canFabricate(
            r,
            kind === 'basic-fabricator' ? 'basic' : 'medium',
            OPENING_TECHNOLOGIES.map((t) => t.id),
          ),
        )?.id ?? null;
    const inputs =
      kind === 'recycler'
        ? [{ item: 'scrap', quantity: 100 }]
        : kind === 'laboratory'
          ? [{ item: 'research-kit', quantity: 30 }]
          : kind === 'coal-generator'
            ? [{ item: 'coal', quantity: 20 }]
            : (OPENING_RECIPES.find((r) => r.id === machine.recipe)?.inputs.map((s) => ({
                item: s.item,
                quantity: Math.min(50, OPENING_CONTENT.items[s.item].stackLimit),
              })) ?? []);
    inputs.forEach((s, n) => {
      machine.input.slots[n] = s;
    });
    if (kind === 'battery') machine.utility!.charge = 60000;
    if (
      machine.utility &&
      ['greenhouse', 'water-treatment', 'water-tank', 'coal-generator'].includes(kind)
    ) {
      const source = snapshot.resources.environment!.sources[0];
      if (source) {
        machine.utility.water = [{ source: source.id, volume: 8, quality: 100 }];
        source.volume -= 8;
        source.extracted += 8;
      }
    }
    const entity: EntityData = {
      id,
      kind: 'building',
      transform: { position: { ...p }, facing: 0, moving: false, sprinting: false },
      building: {
        id,
        buildingId: kind,
        collision: { ...MACHINE_COLLISION },
        position: p,
        cell,
        rotation: 0,
        footprint: { width: 1, depth: 1 },
      },
      machine,
    };
    snapshot.entities.push(entity);
    machines.push(entity);
  }
  const generators = machines.filter((e) =>
    ['solar-panel', 'wind-turbine'].includes(e.building!.buildingId),
  );
  for (const e of machines.filter((e) => !generators.includes(e))) {
    const g = generators.find(
      (g) =>
        Math.hypot(
          g.building!.position.x - e.building!.position.x,
          g.building!.position.z - e.building!.position.z,
        ) <= 12,
    );
    if (g)
      snapshot.resources.factory!.connections.push({
        id: `power-${snapshot.resources.nextEntityId++}`,
        from: g.id,
        to: e.id,
      });
  }
  // Adjacent bounded conveyors exercise backpressure without requiring an earned save file.
  for (let i = count; i < Math.min(safe.length, count + 12); i++) {
    const cell = safe[i],
      p = cellCenter(definition.grid, cell),
      id = `building-${snapshot.resources.nextEntityId++}`,
      transport = emptyTransport();
    transport.units = [
      { item: 'plate', lane: 0, progress: 4 },
      { item: 'wire', lane: 0, progress: 2 },
    ];
    const e: EntityData = {
      id,
      kind: 'building',
      transform: { position: { ...p }, facing: 0, moving: false, sprinting: false },
      building: {
        id,
        buildingId: 'conveyor',
        position: p,
        cell,
        rotation: 1,
        footprint: { width: 1, depth: 1 },
      },
      transport,
    };
    snapshot.entities.push(e);
    const previous = snapshot.entities.find(
      (a) =>
        a.transport &&
        a.id !== id &&
        a.building!.cell.row === cell.row &&
        a.building!.cell.column === cell.column - 1,
    );
    snapshot.resources.factory!.transport ??= { connections: [], cursors: {} };
    if (previous)
      snapshot.resources.factory!.transport.connections.push({
        id: `material-${snapshot.resources.nextEntityId++}`,
        from: previous.id,
        output: 'front',
        to: id,
        input: 'back',
        cooldown: 4,
        lastItem: null,
      });
  }
  if (workload === 'renewable') {
    snapshot.resources.research['pollution-mitigation'] = {
      consumed: {},
      work: 0,
      unlocked: false,
    };
    const target = OPENING_TECHNOLOGIES.find((t) => t.id === 'coal-power')!;
    snapshot.resources.research[target.id] = { consumed: {}, work: 0, unlocked: false };
    player.opening!.researchQueue = [target.id];
    player.opening!.fieldEnabled = true;
  }
  // A controlled layout needs matching native colliders, not the empty-world snapshot.
  const physics = new WorldPhysics(definition, player.id, player.transform!.position);
  try {
    physics.syncStatic(
      staticColliders(
        definition,
        snapshot.entities.flatMap((e) => (e.building ? [e.building] : [])),
        definition.deposits,
      ),
    );
    physics.syncBodies(definition.bodies ?? []);
    physics.assertClearance();
    snapshot.physics = physics.capture();
  } finally {
    physics.dispose();
  }
  const sim = new Simulation(definition, { snapshot: preparePlayerSave(snapshot) });
  try {
    for (let i = 0; i < 25; i++) sim.step({ x: 0, z: 0, sprint: false });
    return saveFixture(
      preparePlayerSave(sim.capture()),
      `portfolio-${workload}`,
      `portfolio-${workload}-baseline`,
    );
  } finally {
    sim.dispose();
  }
}

export function workloadCounts(world: SimulationSnapshot) {
  const machines = world.entities.flatMap((e) => (e.machine ? [e.machine] : []));
  const statuses: Record<string, number> = {};
  const kinds: Record<string, number> = {};
  for (const entity of world.entities) {
    if (entity.machine)
      statuses[entity.machine.status] = (statuses[entity.machine.status] ?? 0) + 1;
    if (entity.building)
      kinds[entity.building.buildingId] = (kinds[entity.building.buildingId] ?? 0) + 1;
  }
  const slots = machines.flatMap((m) => [...m.input.slots, ...m.output.slots]);
  return {
    entities: world.entities.length,
    machines: world.entities.filter((e) => e.machine).length,
    transport: world.entities.filter((e) => e.transport).length,
    powerConnections: world.resources.factory?.connections.length ?? 0,
    materialConnections: world.resources.factory?.transport?.connections.length ?? 0,
    waterConnections: world.resources.environment?.connections.length ?? 0,
    nativeBodies: world.definition.bodies?.length ?? 0,
    kinds,
    statuses,
    activeJobs: machines.filter((m) => m.job).length,
    bufferSlots: slots.length,
    occupiedBufferSlots: slots.filter(Boolean).length,
    bufferedItems: slots.reduce((n, s) => n + (s?.quantity ?? 0), 0),
  };
}
