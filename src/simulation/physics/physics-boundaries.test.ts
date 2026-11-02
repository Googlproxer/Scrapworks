import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { WorldDefinition } from '../../contracts/world.ts';
import type { SimulationSnapshot } from '../../contracts/simulation.ts';
import { worldFixture } from '../../../tests/support/world-fixture.ts';
const { Simulation } = await import('../ecs-runtime.ts');
const { SimulationRuntime } = await import('../../session/runtime.ts');
const { PresentationCache } = await import('../../session/presentation-cache.ts');
const { RAPIER } = await import('./rapier.ts');
const { rebuildPhysics } = await import('../../../tools/testing/rebuild-physics.ts');
const { OPENING_CONTENT } = await import('../../content/opening.ts');
const capture = await import('../capture.ts');
const assertSnapshot: typeof capture.assertSnapshot = capture.assertSnapshot;
const still = { x: 0, z: 0, sprint: false };

function physicalWorld(): WorldDefinition {
  return {
    ...worldFixture(),
    bodies: [
      {
        id: 'crate',
        position: { x: 1, y: 2, z: 4 },
        rotation: 0,
        collision: { shape: 'box', width: 0.9, height: 0.9, depth: 0.9 },
        motion: 'dynamic',
        mass: 8,
      },
    ],
  };
}

function editNative(
  snapshot: SimulationSnapshot,
  edit: (
    world: InstanceType<typeof RAPIER.World>,
    bodies: ReadonlyMap<string, InstanceType<typeof RAPIER.RigidBody>>,
  ) => void,
): void {
  const world = RAPIER.World.restoreSnapshot(Uint8Array.from(snapshot.physics.bytes));
  try {
    const bodies = new Map<string, InstanceType<typeof RAPIER.RigidBody>>();
    let index = 0;
    world.forEachRigidBody((body) => bodies.set(snapshot.physics.bodyIds[index++], body));
    edit(world, bodies);
    snapshot.physics = { ...snapshot.physics, bytes: Array.from(world.takeSnapshot()) };
  } finally {
    world.free();
  }
}

const mismatches: { name: string; edit: (snapshot: SimulationSnapshot) => void }[] = [
  {
    name: 'declared dimensions',
    edit: (snapshot) => {
      snapshot.definition.bodies![0].collision = {
        shape: 'box',
        width: 0.2,
        height: 0.9,
        depth: 0.9,
      };
      snapshot.entities.find((e) => e.physics)!.physics = structuredClone(
        snapshot.definition.bodies![0],
      );
    },
  },
  {
    name: 'declared mass',
    edit: (snapshot) => {
      snapshot.definition.bodies![0].mass = 2;
      snapshot.entities.find((e) => e.physics)!.physics = structuredClone(
        snapshot.definition.bodies![0],
      );
    },
  },
  {
    name: 'declared motion',
    edit: (snapshot) => {
      snapshot.definition.bodies![0].motion = 'kinematic';
      snapshot.entities.find((e) => e.physics)!.physics = structuredClone(
        snapshot.definition.bodies![0],
      );
    },
  },
  {
    name: 'gravity',
    edit: (snapshot) =>
      editNative(snapshot, (world) => {
        world.gravity.y = 0;
      }),
  },
  {
    name: 'timestep',
    edit: (snapshot) =>
      editNative(snapshot, (world) => {
        world.timestep = 0.1;
      }),
  },
  {
    name: 'floor',
    edit: (snapshot) =>
      editNative(snapshot, (_, bodies) => {
        bodies
          .get('floor')!
          .collider(0)
          .setShape(new RAPIER.HalfSpace({ x: 1, y: 0, z: 0 }));
      }),
  },
  {
    name: 'boundary',
    edit: (snapshot) =>
      editNative(snapshot, (_, bodies) => {
        bodies.get('boundary:west')!.setTranslation({ x: 0, y: 5, z: 0 }, false);
      }),
  },
  {
    name: 'static motion',
    edit: (snapshot) =>
      editNative(snapshot, (_, bodies) => {
        bodies.get('solid:entity:blocker')!.setBodyType(RAPIER.RigidBodyType.Dynamic, false);
      }),
  },
  {
    name: 'player capsule',
    edit: (snapshot) =>
      editNative(snapshot, (_, bodies) => {
        bodies.get('player:player')!.collider(0).setShape(new RAPIER.Capsule(0.5, 0.1));
      }),
  },
  {
    name: 'disabled collisions',
    edit: (snapshot) =>
      editNative(snapshot, (_, bodies) => {
        bodies.get('entity:crate')!.collider(0).setSensor(true);
      }),
  },
  {
    name: 'local collider offset',
    edit: (snapshot) =>
      editNative(snapshot, (_, bodies) => {
        bodies.get('entity:crate')!.collider(0).setTranslationWrtParent({ x: 1, y: 0, z: 0 });
      }),
  },
];

for (const mismatch of mismatches) {
  test(`restoration rejects inconsistent ${mismatch.name} before replacing the active world`, () => {
    const setup = new Simulation(physicalWorld());
    const snapshot = setup.capture();
    setup.dispose();
    mismatch.edit(snapshot);
    assertSnapshot(snapshot, OPENING_CONTENT);
    const runtime = new SimulationRuntime();
    try {
      assert.equal(
        runtime.handle({
          protocol: 2,
          id: 1,
          generation: 1,
          revision: 0,
          operation: 'initialize',
          definition: physicalWorld(),
        }).ok,
        true,
      );
      const rejected = runtime.handle({
        protocol: 2,
        id: 2,
        generation: 2,
        revision: 0,
        operation: 'initialize',
        definition: snapshot.definition,
        capture: {
          world: snapshot,
          ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 },
          pending: [],
        },
      });
      assert.equal(rejected.ok, false, mismatch.name);
      if (!rejected.ok) assert.match(rejected.error, /Physics snapshot\//);
      assert.equal(
        runtime.handle({
          protocol: 2,
          id: 3,
          generation: 1,
          revision: 0,
          operation: 'advance',
          steps: 1,
        }).ok,
        true,
        'The original world remains usable',
      );
    } finally {
      runtime.dispose();
    }
  });
}

test('terrain and authored colliders cannot alias and their capture continues exactly', () => {
  const source = worldFixture();
  const definition: WorldDefinition = {
    ...source,
    spawn: { x: 0, y: 0, z: -1 },
    terrain: source.terrain.map((terrain, i) => (i === 0 ? 'water' : terrain)),
    blockers: [{ ...source.blockers[0], id: 'water:0:0' }],
  };
  const world = new Simulation(definition);
  let restored: InstanceType<typeof Simulation> | undefined;
  try {
    const snapshot = world.capture();
    assert(snapshot.physics.bodyIds.includes('solid:entity:water:0:0'));
    assert(snapshot.physics.bodyIds.includes('solid:terrain:water:0:0'));
    restored = new Simulation(definition, { snapshot: JSON.parse(JSON.stringify(snapshot)) });
    for (let tick = 0; tick < 60; tick++) {
      world.step({ x: 1, z: 0, sprint: true });
      restored.step({ x: 1, z: 0, sprint: true });
      assert.deepEqual(restored.view, world.view);
    }
    assert(world.view.player.position.x < 1.66, 'The authored blocker still blocks movement');
  } finally {
    restored?.dispose();
    world.dispose();
  }
});

test('elevated salvage overflow captures, continues and supports deliberate pickup', () => {
  const source = worldFixture();
  const definition: WorldDefinition = {
    ...source,
    spawn: { x: 0, y: 0, z: 2 },
    blockers: [],
    deposits: [
      {
        ...source.deposits[0],
        position: { x: 1, y: 0, z: 1 },
        collision: { shape: 'cylinder', radius: 0.25, height: 0.2 },
      },
    ],
    bodies: [
      {
        id: 'platform',
        position: { x: 0, y: 0.3, z: 0 },
        rotation: 0,
        collision: { shape: 'box', width: 1.5, height: 0.6, depth: 1.5 },
        motion: 'kinematic',
        mass: 30,
      },
    ],
  };
  const setup = new Simulation(definition);
  const initial = setup.capture();
  setup.dispose();
  const player = initial.entities.find((e) => e.kind === 'player')!;
  player.transform!.position = { x: 0, y: 0.6, z: 0 };
  player.inventory!.slots = Array.from({ length: 24 }, () => ({ item: 'scrap', quantity: 100 }));
  initial.entities.push({
    id: 'other-level',
    kind: 'pile',
    pile: { item: 'scrap', quantity: 1 },
    transform: { position: { x: 0, y: 4, z: 0 }, facing: 0, moving: false, sprinting: false },
  });
  rebuildPhysics(initial);
  const world = new Simulation(definition, { snapshot: initial });
  let restored: InstanceType<typeof Simulation> | undefined;
  let pickup: InstanceType<typeof Simulation> | undefined;
  try {
    assert.equal(
      world.step(still, [{ type: 'salvage', target: 'scrap' }]).commandResults[0].accepted,
      true,
    );
    for (let tick = 0; tick < 61 && world.view.ground!.length === 1; tick++) world.step(still);
    const pile = world.view.ground!.find((item) => item.id !== 'other-level')!;
    assert(pile, 'A distant elevated pile must not absorb this drop');
    assert(pile.position.y > 0.5);
    assert.deepEqual(
      pile.position,
      world.view.player.position,
      'The pile starts at the drop location',
    );
    const snapshot = JSON.parse(JSON.stringify(world.capture()));
    assertSnapshot(snapshot, OPENING_CONTENT);
    restored = new Simulation(definition, { snapshot });
    for (let tick = 0; tick < 20; tick++) {
      world.step(still);
      restored.step(still);
      assert.deepEqual(restored.view, world.view);
    }
    const withSpace = restored.capture();
    withSpace.entities.find((e) => e.kind === 'player')!.inventory!.slots[0] = null;
    pickup = new Simulation(definition, { snapshot: withSpace });
    assert.equal(
      pickup.step(still, [{ type: 'pickup', target: 'other-level' }]).commandResults[0].accepted,
      false,
    );
    const result = pickup.step(still, [
      { type: 'salvage', target: null },
      { type: 'pickup', target: pile.id },
    ]);
    assert.equal(result.commandResults[1].accepted, true);
    assert(!pickup.view.ground!.some((item) => item.id === pile.id));
  } finally {
    pickup?.dispose();
    restored?.dispose();
    world.dispose();
  }
});

test('moving physical bodies retain unchanged presentation collections, including 1000 piles', () => {
  const setup = new Simulation(physicalWorld());
  const snapshot = setup.capture();
  setup.dispose();
  for (let n = 0; n < 1000; n++)
    snapshot.entities.push({
      id: `pile-${n}`,
      kind: 'pile',
      pile: { item: 'scrap', quantity: 1 },
      transform: { position: { x: 7, y: 0, z: 7 }, facing: 0, moving: false, sprinting: false },
    });
  const world = new Simulation(snapshot.definition, { snapshot });
  const cache = new PresentationCache(true);
  try {
    cache.apply(world.publish(new Set(), true), 1);
    const before = cache.read();
    world.step(still);
    cache.apply(world.publish(new Set()), 1);
    const after = cache.read();
    assert.notEqual(after.bodies, before.bodies);
    assert(after.changes!.bodies!.length > 0);
    for (const kind of ['ground', 'deposits', 'buildings'] as const)
      assert.equal(after[kind], before[kind], `${kind} must retain its array identity`);
    assert.equal(after.ground!.length, 1000);
    cache.apply(world.publish(new Set(), true), 1);
    assert.notEqual(cache.read().ground, before.ground, 'A full resynchronization rebuilds arrays');
    assert.deepEqual(cache.read().ground, before.ground);
  } finally {
    cache.dispose();
    world.dispose();
  }
});

test('presentation updates and removals invalidate only their own collection', () => {
  const setup = new Simulation(physicalWorld(), { developerFixture: true });
  assert.equal(
    setup.step(still, [
      { type: 'place', buildingId: 'test-building', cell: { column: 6, row: 5 }, rotation: 0 },
    ]).commandResults[0].accepted,
    true,
  );
  const snapshot = setup.capture();
  setup.dispose();
  snapshot.entities.push({
    id: 'pile',
    kind: 'pile',
    pile: { item: 'scrap', quantity: 1 },
    transform: { position: { x: 1, y: 0, z: 1 }, facing: 0, moving: false, sprinting: false },
  });
  const world = new Simulation(snapshot.definition, { snapshot, developerFixture: true });
  try {
    const full = world.publish(new Set(), true);
    const rows = new Float64Array(full.rows);
    const rotations = new Float64Array(full.rotations!);
    const kinds = ['deposits', 'buildings', 'ground', 'bodies'] as const;
    for (const kind of kinds) {
      const cache = new PresentationCache(true);
      try {
        cache.apply(full, 1);
        const before = cache.read();
        const id = before[kind]![0].id;
        const mapping = full.mappings.find((m) => m.id === id)!;
        const at = rows.findIndex((_, i) => i % 8 === 0 && rows[i] === mapping.slot);
        const row = rows.slice(at, at + 8);
        row[2] += 0.25;
        const rotationAt = rotations.findIndex(
          (_, i) => i % 6 === 0 && rotations[i] === mapping.slot,
        );
        const delta = {
          ...full,
          full: false,
          base: full.version,
          version: full.version + 1,
          mappings: [],
          rows: row.buffer,
          removed: new ArrayBuffer(0),
          rotations: mapping.physics
            ? rotations.slice(rotationAt, rotationAt + 6).buffer
            : undefined,
        };
        cache.apply(delta, 1);
        const updated = cache.read();
        assert.notEqual(updated[kind], before[kind]);
        assert.equal(updated[kind]![0].position.x, before[kind]![0].position.x + 0.25);
        for (const other of kinds.filter((other) => other !== kind))
          assert.equal(updated[other], before[other]);
        cache.apply(
          {
            ...delta,
            base: delta.version,
            version: delta.version + 1,
            rows: new ArrayBuffer(0),
            rotations: undefined,
            removed: new Float64Array([mapping.slot, mapping.generation]).buffer,
          },
          1,
        );
        const removed = cache.read();
        assert.equal(removed[kind]!.length, 0);
        assert.deepEqual(removed.changes!.removedIds, [id]);
        for (const other of kinds.filter((other) => other !== kind))
          assert.equal(removed[other], updated[other]);
      } finally {
        cache.dispose();
      }
    }
  } finally {
    world.dispose();
  }
});
