import './register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { GameSession } = await import('../../src/app/features/game/session/game-session.ts');
const { Simulation, PLAYER_RADIUS } = await import('../../src/simulation/simulation.ts');
const { validatePlacement } = await import('../../src/simulation/placement.ts');
const { cellCenter, worldToCell, metresToScene, sceneToMetres, footprintCells } =
  await import('../../src/core/world-grid.ts');
import { compileMarkers } from './compile.mjs';
import { fixtureMarkers } from './test-fixture.mjs';

const definition = () => compileMarkers(fixtureMarkers());
const stationary = { x: 0, z: 0, sprint: false };

test('cell centres, negative origin, half-open edges and unit conversion round-trip', () => {
  const grid = definition().grid;
  assert.deepEqual(worldToCell(grid, { x: -10, y: 0, z: -10 }), { column: 0, row: 0 });
  assert.equal(worldToCell(grid, { x: 10, y: 0, z: 0 }), null);
  assert.equal(worldToCell(grid, { x: -10.01, y: 0, z: 0 }), null);
  assert.equal(worldToCell(grid, { x: NaN, y: 0, z: 0 }), null);
  for (let row = 0; row < 10; row++)
    for (let column = 0; column < 10; column++) {
      const point = cellCenter(grid, { column, row });
      assert.deepEqual(worldToCell(grid, point), { column, row });
      assert.deepEqual(sceneToMetres(metresToScene(point)), point);
    }
  assert.deepEqual(footprintCells({ column: 4, row: 5 }, { width: 2, depth: 1 }, 1), [
    { column: 4, row: 5 },
    { column: 4, row: 6 },
  ]);
});

test('new worlds have empty possessions and independent detached views', () => {
  const simulation = new Simulation(definition());
  const view = simulation.view;
  assert.deepEqual(view.inventory, {});
  assert.deepEqual(view.equipment, []);
  assert.deepEqual(view.research, []);
  assert.deepEqual(view.productionTotals, {});
  assert.deepEqual(view.buildings, []);
  view.player.position.x = 100;
  view.deposits[0].quantity = 0;
  assert.equal(simulation.view.player.position.x, 1);
  assert.equal(simulation.view.deposits[0].quantity, 100);
});

test('movement is deterministic across render schedules; diagonal distance is normalized', () => {
  const run = (frames, direction) => {
    const session = new GameSession(definition());
    session.setMovement(direction);
    for (const duration of frames) session.advance(duration);
    return session.view;
  };
  const slow = run(Array(30).fill(1 / 30), { x: 0, z: 1 });
  const fast = run(Array(144).fill(1 / 144), { x: 0, z: 1 });
  assert.deepEqual(slow, fast);
  assert.equal(slow.tick, 20);
  assert.ok(Math.abs(slow.player.position.z - 2.5) < 1e-10);
  const diagonal = run(Array(60).fill(1 / 60), { x: 1, z: 1 });
  assert.ok(
    Math.abs(Math.hypot(diagonal.player.position.x - 1, diagonal.player.position.z - 1) - 1.5) <
      1e-10,
  );
});

test('catch-up is bounded and pause clears held input, queued placement and leftover time', () => {
  const session = new GameSession(definition(), { developerFixture: true });
  session.setMovement({ x: 0, z: 1 }, true);
  session.advance(60);
  assert.equal(session.view.tick, 5);
  assert.ok(Math.abs(session.view.player.position.z - 1.75) < 1e-10);
  session.advance(0.04);
  session.enqueue({
    type: 'place',
    buildingId: 'test-building',
    cell: { column: 4, row: 6 },
    rotation: 0,
  });
  session.setPaused(true);
  session.advance(60);
  const point = session.view.player.position;
  session.setPaused(false);
  session.advance(0.01);
  assert.equal(session.view.tick, 5);
  session.advance(0.04);
  assert.equal(session.view.tick, 6);
  assert.deepEqual(session.view.player.position, point);
  assert.equal(session.view.buildings.length, 0);
});

test('player circle cannot cross blockers or map boundaries', () => {
  const simulation = new Simulation(definition());
  for (let i = 0; i < 200; i++) simulation.step({ x: 1, z: 0, sprint: true });
  assert.ok(simulation.view.player.position.x <= 10 - PLAYER_RADIUS);
  const blocked = new Simulation({ ...definition(), spawn: { x: 3, y: 0, z: 1 } });
  for (let i = 0; i < 80; i++) blocked.step({ x: 0, z: -1, sprint: true });
  assert.ok(blocked.view.player.position.z >= PLAYER_RADIUS);
});

test('normal worlds cannot place test buildings; dev fixture validates and rechecks queued occupancy', () => {
  const normal = new Simulation(definition());
  const command = {
    type: 'place',
    buildingId: 'test-building',
    cell: { column: 4, row: 6 },
    rotation: 0,
  };
  const rejectedBefore = normal.view;
  normal.enqueue(command);
  normal.step(stationary);
  assert.equal(normal.view.lastCommandResult.reason, 'unavailable');
  assert.deepEqual(normal.view.inventory, rejectedBefore.inventory);
  assert.equal(normal.view.buildings.length, 0);
  const dev = new Simulation(definition(), { developerFixture: true });
  dev.enqueue(command);
  dev.enqueue(command);
  dev.step(stationary);
  assert.equal(dev.view.buildings.length, 1);
  assert.equal(dev.view.lastCommandResult.reason, 'occupied');
  assert.deepEqual(dev.view.inventory, {});
  assert.equal(dev.view.nextEntityId, 2);
});

test('placement validates the previous completed position before the player motor advances', () => {
  const simulation = new Simulation(
    { ...definition(), spawn: { x: 1.2, y: 0, z: 0.97 } },
    { developerFixture: true },
  );
  const cell = { column: 4, row: 6 };
  simulation.enqueue({ type: 'place', buildingId: 'test-building', cell, rotation: 0 });
  simulation.step({ x: 1, z: 0, sprint: false });
  const view = simulation.view;
  assert.deepEqual(view.lastCommandResult, { accepted: true, reason: null });
  assert.equal(view.buildings.length, 1);
  const anchor = cellCenter(definition().grid, cell);
  assert.ok(Math.hypot(anchor.x - view.player.position.x, anchor.z - view.player.position.z) > 3);
});

test('placement rejects invalid rotations, occupied cells, player overlap, reach and map edges', () => {
  const world = definition();
  const view = new Simulation(world).view;
  const check = (cell, rotation = 0) => validatePlacement(world, view, cell, rotation, true);
  assert.equal(check({ column: 0, row: 0 }, 4).reason, 'invalid-cell');
  assert.equal(check({ column: 9, row: 9 }).reason, 'out-of-bounds');
  assert.equal(check({ column: 5, row: 5 }).reason, 'player-overlap');
  assert.equal(check({ column: 6, row: 4 }).reason, 'occupied');
  assert.equal(check({ column: 0, row: 0 }).reason, 'out-of-reach');
  assert.equal(check({ column: 4, row: 6 }).valid, true);
});
