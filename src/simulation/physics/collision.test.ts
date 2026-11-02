import type { WorldDefinition } from '../../contracts/world.ts';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { worldFixture } from '../../../tests/support/world-fixture.ts';
const { Simulation } = await import('../ecs-runtime.ts');
const { PresentationCache } = await import('../../session/presentation-cache.ts');
const { entityCollider } = await import('../../core/world-collision.ts');
const { validatePlacement } = await import('../placement.ts');
const { PLAYER_RADIUS } = await import('../world-rules.ts');

function shapedWorld(): WorldDefinition {
  const world = worldFixture();
  return {
    ...world,
    blockers: world.blockers.map((entity) => ({
      ...entity,
      collision: { shape: 'box', width: 1.5, height: 1.5, depth: 1.5 },
    })),
    deposits: world.deposits.map((entity) => ({
      ...entity,
      collision: { shape: 'cylinder', radius: 0.25, height: 1.7 },
    })),
  };
}

test('box contact uses its surface and the unchanged player radius', () => {
  const definition = { ...shapedWorld(), spawn: { x: 1, y: 0, z: -1 } };
  const world = new Simulation(definition);
  try {
    for (let tick = 0; tick < 40; tick++) world.step({ x: 1, z: 0, sprint: true });
    assert.ok(Math.abs(world.view.player.position.x - (3 - 0.75 - PLAYER_RADIUS)) < 0.005);
    assert.equal(world.view.player.moving, false);
    const before = world.view.player.position;
    world.step({ x: 1, z: 1, sprint: true });
    assert.ok(Math.abs(world.view.player.position.x - before.x) < 0.001);
    assert.ok(world.view.player.position.z > before.z, 'Contact must allow sliding');
  } finally {
    world.dispose();
  }
});

test('cylinder permits entering its reserved cell while placement still respects the footprint', () => {
  const definition = { ...shapedWorld(), spawn: { x: -5, y: 0, z: 1 } };
  const world = new Simulation(definition);
  const cache = new PresentationCache();
  try {
    for (let tick = 0; tick < 40; tick++) world.step({ x: 1, z: 0, sprint: true });
    assert.ok(Math.abs(world.view.player.position.x - (-3 - 0.25 - PLAYER_RADIUS)) < 0.005);
    assert.ok(world.view.player.position.x > -4, 'Player enters the occupied grid cell');
    assert.equal(
      validatePlacement(definition, world.view, { column: 3, row: 5 }, 0, true).reason,
      'occupied',
    );
    cache.apply(world.publish(new Set(['player']), true), 1);
    assert.deepEqual(cache.read().deposits[0].collision, definition.deposits[0].collision);
    const restored = new Simulation(definition, { snapshot: world.capture() });
    try {
      restored.step({ x: 1, z: 0, sprint: true });
      assert.ok(Math.abs(restored.view.player.position.x - world.view.player.position.x) < 0.001);
    } finally {
      restored.dispose();
    }
  } finally {
    world.dispose();
    cache.dispose();
  }
});

test('clearing a cylinder deposit removes its collider, including after restore', () => {
  const source = shapedWorld();
  const definition = {
    ...source,
    spawn: { x: -5, y: 0, z: 1 },
    deposits: source.deposits.map((entity) => ({ ...entity, quantity: 1 })),
  };
  const world = new Simulation(definition);
  try {
    for (let tick = 0; tick < 40; tick++) world.step({ x: 1, z: 0, sprint: true });
    world.step({ x: 0, z: 0, sprint: false }, [{ type: 'salvage', target: 'scrap' }]);
    for (let tick = 0; tick < 60; tick++) world.step({ x: 0, z: 0, sprint: false });
    assert.equal(world.view.deposits[0].quantity, 0);
    const restored = new Simulation(definition, { snapshot: world.capture() });
    try {
      for (let tick = 0; tick < 20; tick++) restored.step({ x: 1, z: 0, sprint: false });
      assert.ok(
        restored.view.player.position.x > -3,
        'The cleared cylinder must not block movement',
      );
    } finally {
      restored.dispose();
    }
  } finally {
    world.dispose();
  }
});

test('quarter turns rotate rectangular bounds about the centre of a multi-cell footprint', () => {
  const collider = entityCollider(shapedWorld().grid, {
    id: 'rotated',
    position: { x: 3, y: 0, z: 1 },
    footprint: { width: 2, depth: 1 },
    rotation: 1,
    collision: { shape: 'box', width: 3, depth: 0.6, height: 2 },
  });
  assert.deepEqual(collider, {
    shape: 'box',
    width: 0.6,
    depth: 3,
    height: 2,
    center: { x: 3, y: 1, z: 2 },
  });
});

test('Rapier prevents sprinting through shapes from either direction', () => {
  for (const entity of [...shapedWorld().blockers, ...shapedWorld().deposits]) {
    const collider = entityCollider(shapedWorld().grid, entity);
    for (const axis of ['x', 'z'] as const)
      for (const direction of [-1, 1]) {
        const position = {
          ...collider.center,
          y: 0,
          [axis]: collider.center[axis] - direction * 5,
        };
        const world = new Simulation({
          ...shapedWorld(),
          deposits: [],
          blockers: [entity],
          spawn: position,
        });
        try {
          for (let tick = 0; tick < 80; tick++)
            world.step({
              x: axis === 'x' ? direction : 0,
              z: axis === 'z' ? direction : 0,
              sprint: true,
            });
          assert.ok(direction * (world.view.player.position[axis] - collider.center[axis]) < 0);
        } finally {
          world.dispose();
        }
      }
  }
});

test('rounded box corners and cylindrical sides allow close passes without intersecting', () => {
  const definition = { ...shapedWorld(), spawn: { x: -5, y: 0, z: 1.61 } };
  const world = new Simulation(definition);
  try {
    for (let tick = 0; tick < 30; tick++) world.step({ x: 1, z: 0, sprint: true });
    assert.ok(world.view.player.position.x > -1, 'A cylinder must not block its entire cell');
  } finally {
    world.dispose();
  }
  const corner = new Simulation({ ...definition, spawn: { x: 1, y: 0, z: 0 } });
  try {
    for (let tick = 0; tick < 15; tick++) corner.step({ x: 1, z: 0, sprint: true });
    assert.ok(corner.view.player.position.x > 1.9, 'The capsule rounds the box corner');
  } finally {
    corner.dispose();
  }
});
