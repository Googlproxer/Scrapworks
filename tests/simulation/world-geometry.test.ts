import type { BuildingView, QuarterTurn, WorldDefinition } from '../../src/contracts/world.ts';
import type { RuntimeRequest, SimulationSnapshot } from '../../src/contracts/simulation.ts';
import '../../tools/testing/register-typescript.ts';
const { rebuildPhysics } = await import('../../tools/testing/rebuild-physics.ts');
import assert from 'node:assert/strict';
import test from 'node:test';
const { Simulation } = await import('../../src/simulation/ecs-runtime.ts');
const { SimulationRuntime } = await import('../../src/session/runtime.ts');
const { PresentationCache } = await import('../../src/session/presentation-cache.ts');
const { assertSnapshot } = await import('../../src/simulation/capture.ts');
const { OPENING_CONTENT: EMPTY_CONTENT } = await import('../../src/content/opening.ts');
const { validatePlacement } = await import('../../src/simulation/placement.ts');
const { cellCenter } = await import('../../src/core/world-grid.ts');

const still = { x: 0, z: 0, sprint: false };
const definition: WorldDefinition = {
  version: 1,
  id: 'geometry-regression',
  grid: { origin: { x: 0, z: 0 }, columns: 5, rows: 5, metresPerCell: 2 },
  terrain: Array.from({ length: 25 }, (_, index) => (index === 11 ? 'water' : 'soil')),
  spawn: { x: 1, y: 0, z: 1 },
  deposits: [
    {
      id: 'deposit',
      kind: 'scrap',
      quantity: 10,
      position: { x: 3, y: 0, z: 1 },
      footprint: { width: 1, depth: 1 },
      rotation: 0,
    },
  ],
  blockers: [
    {
      id: 'blocker',
      position: { x: 5, y: 0, z: 3 },
      footprint: { width: 1, depth: 1 },
      rotation: 0,
    },
  ],
};

test('removing a deposit clears live collision and placement occupancy across capture restoration', () => {
  const world = new Simulation(definition, {
    developerFixture: true,
  });
  const cache = new PresentationCache();
  let restored: InstanceType<typeof Simulation> | undefined;
  let placement: InstanceType<typeof Simulation> | undefined;
  const cell = { column: 1, row: 0 };
  try {
    cache.apply(world.publish(new Set(['player']), true), 1);
    assert.equal(validatePlacement(definition, cache.read(), cell, 0, true).reason, 'occupied');
    world.step(still, [{ type: 'salvage', target: 'deposit' }]);
    for (let tick = 1; tick < 600; tick++) world.step(still);
    cache.apply(world.publish(new Set(['player'])), 1);
    assert.deepEqual(
      cache.read().deposits.filter((deposit) => deposit.quantity > 0),
      [],
    );
    assert.equal(validatePlacement(definition, cache.read(), cell, 0, true).valid, true);
    assert.equal(
      validatePlacement(definition, cache.read(), { column: 2, row: 1 }, 0, true).reason,
      'occupied',
    );
    assert.equal(
      validatePlacement(definition, cache.read(), { column: 1, row: 2 }, 0, true).reason,
      'terrain',
    );
    const cleared = world.capture();
    for (let tick = 0; tick < 20; tick++) world.step({ x: 1, z: 0, sprint: false });
    assert.ok(world.view.player.position.x > 2, 'Movement must enter the former footprint');
    restored = new Simulation(definition, { snapshot: world.capture() });
    assert.deepEqual(restored.view.player.position, world.view.player.position);
    for (let tick = 0; tick < 30; tick++) restored.step({ x: 1, z: 0, sprint: false });
    assert.ok(restored.view.player.position.x > 4, 'Restored collision must remain clear');
    placement = new Simulation(definition, { snapshot: cleared, developerFixture: true });
    const result = placement.step(still, [
      { type: 'place', buildingId: 'test-building', cell, rotation: 0 },
    ]);
    assert.equal(result.commandResults[0].accepted, true);
    assert.equal(placement.view.buildings.length, 1);
    for (let tick = 0; tick < 40; tick++) placement.step({ x: 1, z: 0, sprint: false });
    assert.ok(placement.view.player.position.x < 2, 'The new building must still collide');
  } finally {
    placement?.dispose();
    restored?.dispose();
    world.dispose();
    cache.dispose();
  }
});

const edgeDefinition: WorldDefinition = {
  version: 1,
  id: 'snapshot-edge-regression',
  grid: { origin: { x: -3.5, z: 4.25 }, columns: 5, rows: 3, metresPerCell: 1.5 },
  terrain: Array<string>(15).fill('soil'),
  spawn: { x: -2.75, y: 0, z: 5 },
  deposits: [],
  blockers: [],
};

function snapshotWithBuilding(rotation: QuarterTurn = 0): SimulationSnapshot {
  const world = new Simulation(edgeDefinition);
  try {
    const snapshot = world.capture();
    const cell = { column: rotation % 2 ? 4 : 3, row: rotation % 2 ? 1 : 2 };
    snapshot.entities.push({
      id: 'edge-building',
      kind: 'building',
      building: {
        id: 'edge-building',
        buildingId: 'test-building',
        cell,
        position: cellCenter(edgeDefinition.grid, cell),
        footprint: { width: 2, depth: 1 },
        rotation,
      },
    });
    rebuildPhysics(snapshot);
    return snapshot;
  } finally {
    world.dispose();
  }
}

test('valid rotated buildings restore at the edges of a non-square offset grid', () => {
  for (const rotation of [0, 1, 2, 3] as const) {
    const snapshot = snapshotWithBuilding(rotation);
    assert.doesNotThrow(() => assertSnapshot(snapshot, EMPTY_CONTENT));
    const restored = new Simulation(edgeDefinition, { snapshot });
    try {
      assert.deepEqual(restored.view.buildings, [snapshot.entities.at(-1)!.building]);
    } finally {
      restored.dispose();
    }
  }
});

const invalidBuildings: { name: string; change: (building: BuildingView) => BuildingView }[] = [
  {
    name: 'unbounded width',
    change: (building) => ({ ...building, footprint: { width: 1000000000, depth: 1 } }),
  },
  {
    name: 'unbounded depth',
    change: (building) => ({ ...building, footprint: { width: 2, depth: 1000000000 } }),
  },
  {
    name: 'rotated width outside the grid',
    change: (building) => ({ ...building, footprint: { width: 1, depth: 3 }, rotation: 1 }),
  },
  {
    name: 'rotated depth outside the grid',
    change: (building) => ({ ...building, rotation: 1 }),
  },
  {
    name: 'column outside the grid',
    change: (building) => ({ ...building, cell: { ...building.cell, column: 5 } }),
  },
  {
    name: 'row outside the grid',
    change: (building) => ({ ...building, cell: { ...building.cell, row: 3 } }),
  },
  {
    name: 'position outside the grid',
    change: (building) => ({ ...building, position: { ...building.position, x: 100 } }),
  },
  {
    name: 'position inconsistent with its cell',
    change: (building) => ({
      ...building,
      position: { ...building.position, x: building.position.x + 0.25 },
    }),
  },
  {
    name: 'cell inconsistent with its position',
    change: (building) => ({ ...building, cell: { ...building.cell, column: 2 } }),
  },
];

for (const { name, change } of invalidBuildings)
  test(`invalid building ${name} is rejected without replacing the live runtime`, () => {
    const snapshot = snapshotWithBuilding();
    const entity = snapshot.entities.at(-1)!;
    entity.building = change(entity.building!);
    // Validate first so the regression fails without attempting an enormous allocation.
    assert.throws(() => assertSnapshot(snapshot, EMPTY_CONTENT));
    const runtime = new SimulationRuntime();
    let id = 0;
    const request = (
      operation: RuntimeRequest['operation'],
      fields: Partial<RuntimeRequest> = {},
    ) =>
      runtime.handle({ protocol: 2, generation: 1, revision: 0, id: ++id, operation, ...fields });
    try {
      assert.equal(request('initialize', { definition: edgeDefinition }).ok, true);
      const before = request('capture').capture;
      const rejected = request('initialize', {
        generation: 2,
        definition: edgeDefinition,
        capture: {
          world: snapshot,
          ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 },
          pending: [],
        },
      });
      assert.equal(rejected.ok, false);
      assert.deepEqual(request('capture').capture, before);
      assert.equal(request('advance', { steps: 1 }).ok, true);
    } finally {
      runtime.dispose();
    }
  });
