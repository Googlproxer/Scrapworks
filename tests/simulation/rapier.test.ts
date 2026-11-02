import '../../tools/testing/register-typescript.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldDefinition } from '../../src/contracts/world.ts';
import { worldFixture } from '../support/world-fixture.ts';
const { rebuildPhysics } = await import('../../tools/testing/rebuild-physics.ts');
const { Simulation } = await import('../../src/simulation/ecs-runtime.ts');
const { PresentationCache } = await import('../../src/session/presentation-cache.ts');
const { SimulationRuntime } = await import('../../src/session/runtime.ts');
const captureModule = await import('../../src/simulation/capture.ts');
const assertSnapshot: typeof captureModule.assertSnapshot = captureModule.assertSnapshot;
const { OPENING_CONTENT } = await import('../../src/content/opening.ts');
const { WorldPhysics } = await import('../../src/simulation/physics/world-physics.ts');

const still = { x: 0, z: 0, sprint: false };
function definition(): WorldDefinition {
  return {
    ...worldFixture(),
    deposits: [],
    blockers: [],
    bodies: [
      {
        id: 'crate',
        position: { x: 1, y: 0.45, z: 3.5 },
        rotation: 0,
        collision: { shape: 'box', width: 0.9, height: 0.9, depth: 0.9 },
        motion: 'dynamic',
        mass: 8,
      },
      {
        id: 'falling',
        position: { x: -2, y: 2, z: 4 },
        rotation: 1,
        collision: { shape: 'box', width: 0.7, height: 0.7, depth: 0.7 },
        motion: 'dynamic',
        mass: 4,
      },
      {
        id: 'mover',
        position: { x: -5, y: 0.3, z: -4 },
        rotation: 0,
        collision: { shape: 'box', width: 1.5, height: 0.6, depth: 1.5 },
        motion: 'kinematic',
        mass: 30,
        travel: { axis: 'x', distance: 4, periodTicks: 160 },
      },
    ],
  };
}

function platformDefinition(spawn: WorldDefinition['spawn']): WorldDefinition {
  return {
    ...definition(),
    spawn,
    bodies: [{ ...definition().bodies![2], position: { x: 0, y: 0.3, z: 0 } }],
  };
}

for (const gap of [1.105, 1.15]) {
  for (const side of [
    { name: 'south', x: 0, z: -1, pushed: false },
    { name: 'north', x: 0, z: 1, pushed: false },
    { name: 'east', x: 1, z: 0, pushed: true },
    { name: 'west', x: -1, z: 0, pushed: false },
  ]) {
    test(`a moving block does not attach the player at its ${side.name} side (${gap} m)`, () => {
      const world = new Simulation(platformDefinition({ x: side.x * gap, y: 0, z: side.z * gap }));
      try {
        const start = world.view.player.position;
        for (let tick = 0; tick < 80; tick++) world.step(still);
        const peak = world.view.player.position;
        if (side.pushed) {
          assert(peak.x > 5, 'The approaching face must still push the player clear');
          assert(peak.x - world.view.bodies![0].position.x >= 1.1 - 0.002);
        } else {
          assert(Math.abs(peak.x - start.x) < 0.01, 'A side contact must not carry or pull');
        }
        assert(Math.abs(peak.z - start.z) < 0.01);
        for (let tick = 80; tick < 160; tick++) world.step(still);
        const returned = world.view.player.position;
        assert(Math.abs(returned.x - peak.x) < 0.06, 'Reversing must not pull the player back');
        assert(Math.abs(returned.z - peak.z) < 0.01);
        for (let tick = 0; tick < 20; tick++) world.step({ ...side, sprint: false });
        const escaped = world.view.player.position;
        assert(
          (escaped.x - returned.x) * side.x + (escaped.z - returned.z) * side.z > 1.4,
          'The player must be able to walk away from each face',
        );
      } finally {
        world.dispose();
      }
    });
  }
}

test('a supporting platform still carries the player through reversal and lets them walk off', () => {
  const source = platformDefinition({ x: 0, y: 0, z: 2 });
  const setup = new Simulation(source);
  const snapshot = setup.capture();
  setup.dispose();
  snapshot.entities.find((entity) => entity.kind === 'player')!.transform!.position = {
    x: 0,
    y: 0.6,
    z: 0,
  };
  rebuildPhysics(snapshot);
  const world = new Simulation(source, { snapshot });
  let restored: InstanceType<typeof Simulation> | undefined;
  try {
    for (let tick = 0; tick < 75; tick++) world.step(still);
    assert(world.view.player.position.x > 3.6);
    assert(Math.abs(world.view.player.position.y - 0.6) < 0.02);
    restored = new Simulation(source, { snapshot: JSON.parse(JSON.stringify(world.capture())) });
    for (let tick = 75; tick < 160; tick++) {
      world.step(still);
      restored.step(still);
      assert.deepEqual(restored.view, world.view, `Platform continuation diverged at ${tick}`);
    }
    assert(Math.abs(world.view.player.position.x) < 0.06);
    assert(Math.abs(world.view.player.position.y - 0.6) < 0.02);
    for (let tick = 0; tick < 25; tick++) world.step({ x: 0, z: 1, sprint: false });
    for (let tick = 0; tick < 20; tick++) world.step(still);
    const landed = world.view.player.position;
    assert.equal(landed.y, 0);
    for (let tick = 0; tick < 80; tick++) world.step(still);
    assert.deepEqual(world.view.player.position, landed, 'Walking off releases platform transport');
  } finally {
    restored?.dispose();
    world.dispose();
  }
});

test('releasing movement after touching a platform stays detached across capture and reversal', () => {
  const source = platformDefinition({ x: 0, y: 0, z: -1.3 });
  const world = new Simulation(source);
  let restored: InstanceType<typeof Simulation> | undefined;
  try {
    for (let tick = 0; tick < 6; tick++) world.step({ x: 0, z: 1, sprint: false });
    const touching = world.view.player.position;
    assert(touching.z > -1.11 && touching.z < -1.09);
    restored = new Simulation(source, { snapshot: JSON.parse(JSON.stringify(world.capture())) });
    for (let tick = 0; tick < 320; tick++) {
      world.step(still);
      restored.step(still);
      assert.deepEqual(restored.view, world.view);
      assert(Math.abs(world.view.player.position.x - touching.x) < 0.01);
    }
    assert.deepEqual(restored.capture().physics, world.capture().physics);
  } finally {
    restored?.dispose();
    world.dispose();
  }
});

test('side-contact policy preserves native platform interactions with dynamic bodies', () => {
  const source = platformDefinition({ x: 0, y: 0, z: -1.105 });
  const bodies: WorldDefinition['bodies'] = [
    ...source.bodies!,
    {
      id: 'riding-crate',
      position: { x: 0, y: 0.81, z: 0 },
      rotation: 0,
      collision: { shape: 'box', width: 0.4, height: 0.4, depth: 0.4 },
      motion: 'dynamic',
      mass: 4,
    },
  ];
  const beside = new Simulation({ ...source, bodies });
  const distant = new Simulation({ ...source, bodies, spawn: { x: -5, y: 0, z: -5 } });
  try {
    for (let tick = 0; tick < 160; tick++) {
      beside.step(still);
      distant.step(still);
      assert.deepEqual(beside.view.bodies, distant.view.bodies);
      if (tick === 79) {
        assert(beside.view.bodies!.find((body) => body.id === 'riding-crate')!.position.x > 3.5);
      }
    }
  } finally {
    distant.dispose();
    beside.dispose();
  }
});

test('the real character controller pushes a dynamic crate while gravity and kinematic motion advance', () => {
  const world = new Simulation(definition());
  try {
    for (let tick = 0; tick < 55; tick++) world.step({ x: 0, z: 1, sprint: false });
    const view = world.view;
    assert.ok(
      view.bodies!.find((body) => body.id === 'crate')!.position.z > 4,
      'The capsule must push the crate',
    );
    assert.ok(
      Math.abs(view.bodies!.find((body) => body.id === 'falling')!.position.y - 0.35) < 0.01,
      'The falling box rests on the ground',
    );
    assert.ok(
      view.bodies!.find((body) => body.id === 'mover')!.position.x > -3,
      'Kinematic motion uses fixed steps',
    );
    assert.ok(view.player.position.z > 3);
  } finally {
    world.dispose();
  }
});

test('native physics capture survives JSON and continues contact, rotation and platform motion exactly for 1000 steps', () => {
  const world = new Simulation(definition());
  let restored: InstanceType<typeof Simulation> | undefined;
  try {
    for (let tick = 0; tick < 45; tick++) world.step({ x: 0, z: 1, sprint: false });
    const snapshot = JSON.parse(JSON.stringify(world.capture()));
    assertSnapshot(snapshot, OPENING_CONTENT);
    restored = new Simulation(definition(), { snapshot });
    assert.deepEqual(restored.view, world.view);
    for (let tick = 0; tick < 1000; tick++) {
      const movement = tick < 15 ? { x: 0, z: 1, sprint: true } : still;
      world.step(movement);
      restored.step(movement);
      assert.deepEqual(restored.view, world.view, `Continuation diverged at step ${tick}`);
    }
    assert.deepEqual(restored.capture().physics, world.capture().physics);
  } finally {
    restored?.dispose();
    world.dispose();
  }
});

test('physics orientations use a separate transferred stream and sleeping bodies stop publishing', () => {
  const source = definition();
  const world = new Simulation({
    ...source,
    bodies: source.bodies!.filter((body) => body.motion === 'dynamic'),
  });
  const cache = new PresentationCache();
  try {
    const packet = world.publish(new Set(), true);
    assert.equal(packet.rows.byteLength, 3 * 8 * 8, 'Base entity stride stays unchanged');
    assert.equal(packet.rotations!.byteLength, 2 * 6 * 8);
    const transferred = structuredClone(packet, {
      transfer: [packet.rows, packet.removed, packet.rotations!],
    });
    assert.equal(packet.rotations!.byteLength, 0);
    cache.apply(transferred, 1);
    assert.equal(cache.read().bodies!.length, 2);
    for (let tick = 0; tick < 200; tick++) world.step(still);
    cache.apply(world.publish(new Set()), 1);
    for (let tick = 0; tick < 20; tick++) world.step(still);
    const idle = world.publish(new Set());
    assert.equal(idle.rotations, undefined);
    cache.apply(idle, 1);
    assert.deepEqual(cache.read().changes!.bodies, []);
    assert.equal(cache.read().bodies!.length, 2);
  } finally {
    cache.dispose();
    world.dispose();
  }
});

test('malformed orientation packets cannot partially mutate the retained presentation', () => {
  const world = new Simulation(definition());
  const cache = new PresentationCache();
  try {
    cache.apply(world.publish(new Set(), true), 1);
    const before = cache.read();
    world.step(still);
    const packet = world.publish(new Set());
    const rotation = new Float64Array(packet.rotations!);
    rotation[2] = NaN;
    assert.throws(() => cache.apply(packet, 1), /rotation/);
    assert.equal(cache.read(), before);
  } finally {
    cache.dispose();
    world.dispose();
  }
});

test('a physics snapshot with mismatched ECS poses is rejected without replacing the active runtime', () => {
  const world = new Simulation(definition());
  const runtime = new SimulationRuntime();
  try {
    const initial = runtime.handle({
      protocol: 2,
      id: 1,
      generation: 1,
      revision: 0,
      operation: 'initialize',
      definition: definition(),
    });
    assert.equal(initial.ok, true);
    const snapshot = world.capture();
    snapshot.entities.find((entity) => entity.id === 'crate')!.transform!.position.x += 1;
    const rejected = runtime.handle({
      protocol: 2,
      id: 2,
      generation: 2,
      revision: 0,
      operation: 'initialize',
      definition: definition(),
      capture: {
        world: snapshot,
        ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 },
        pending: [],
      },
    });
    assert.equal(rejected.ok, false);
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
    );
    const corrupted = world.capture();
    corrupted.physics = { ...corrupted.physics, bytes: [0, 1, 2] };
    const badBytes = runtime.handle({
      protocol: 2,
      id: 4,
      generation: 2,
      revision: 0,
      operation: 'initialize',
      definition: definition(),
      capture: {
        world: corrupted,
        ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 },
        pending: [],
      },
    });
    assert.equal(badBytes.ok, false);
    assert.equal(
      runtime.handle({
        protocol: 2,
        id: 5,
        generation: 1,
        revision: 0,
        operation: 'advance',
        steps: 1,
      }).ok,
      true,
    );
  } finally {
    runtime.dispose();
    world.dispose();
  }
});

test('native engine version and byte corruption fail validation and fresh world teardown is repeatable', () => {
  for (let cycle = 0; cycle < 12; cycle++) {
    const world = new Simulation(definition());
    world.step(still);
    const snapshot = world.capture();
    assert.throws(
      () => assertSnapshot({ ...snapshot, version: 2 }, OPENING_CONTENT),
      /Unsupported snapshot/,
    );
    assertSnapshot(snapshot, OPENING_CONTENT);
    world.dispose();
    world.dispose();
    assert.throws(() => world.step(still), /Disposed/);
  }
  const world = new Simulation(definition());
  try {
    const snapshot = world.capture();
    assert.throws(
      () =>
        assertSnapshot(
          { ...snapshot, physics: { ...snapshot.physics, format: 1 } },
          OPENING_CONTENT,
        ),
      /physics snapshot/,
    );
    assert.throws(
      () =>
        assertSnapshot(
          { ...snapshot, physics: { ...snapshot.physics, engineVersion: 'unknown' } },
          OPENING_CONTENT,
        ),
      /physics snapshot/,
    );
    assert.throws(
      () =>
        assertSnapshot(
          { ...snapshot, physics: { ...snapshot.physics, bytes: [999] } },
          OPENING_CONTENT,
        ),
      /bytes/,
    );
  } finally {
    world.dispose();
  }
});

test('physical component reconciliation creates and removes native bodies without touching the player', () => {
  const source = definition();
  const physics = new WorldPhysics(source, 'player', source.spawn);
  try {
    physics.syncStatic([]);
    physics.syncBodies([source.bodies![0]]);
    assert(physics.capture().bodyIds.includes('entity:crate'));
    physics.movePlayer(0, 0, 0);
    physics.syncBodies([]);
    const remaining = physics.capture().bodyIds;
    assert(!remaining.includes('entity:crate'));
    assert(remaining.includes('player:player'));
    physics.syncBodies([source.bodies![0]]);
    assert(physics.capture().bodyIds.includes('entity:crate'));
  } finally {
    physics.dispose();
  }
});
