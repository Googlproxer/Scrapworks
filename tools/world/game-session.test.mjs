import './register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { GameSession } = await import('../../src/app/features/game/session/game-session.ts');
const { PlayerMotor } = await import('../../src/simulation/player-motor.ts');
import { compileMarkers } from './compile.mjs';
import { fixtureMarkers } from './test-fixture.mjs';

const definition = () => compileMarkers(fixtureMarkers());
const placement = {
  type: 'place',
  buildingId: 'test-building',
  cell: { column: 4, row: 6 },
  rotation: 0,
};

test('ticks report upcoming fixed time and agree across 30, 60 and 144 Hz render schedules', () => {
  const results = [30, 60, 144].map((rate) => {
    const session = new GameSession(definition());
    const ticks = [];
    session.registerTickHandler((context) => {
      ticks.push({ ...context });
      assert.equal(session.view.tick, context.tick - 1);
      session.setMovement({ x: 0, z: 1 });
    });
    for (let frame = 0; frame < rate; frame++) session.advance(1 / rate);
    assert.deepEqual(
      ticks,
      Array.from({ length: 20 }, (_, index) => ({ tick: index + 1, deltaSeconds: 0.05 })),
    );
    return session.view;
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], results[2]);
  assert.ok(Math.abs(results[0].player.position.z - 2.5) < 1e-10);
});

test('zero-step frames preserve a discrete command and a long frame consumes it once in five ticks', () => {
  const session = new GameSession(definition(), { developerFixture: true });
  const ticks = [];
  session.registerTickHandler(({ tick }) => ticks.push(tick));
  session.enqueue(placement);
  for (const delta of [0, -1, NaN, Infinity, 0.01, 0.01]) session.advance(delta);
  assert.deepEqual(ticks, []);
  assert.equal(session.view.buildings.length, 0);
  session.advance(60);
  assert.deepEqual(ticks, [1, 2, 3, 4, 5]);
  assert.equal(session.view.buildings.length, 1);
  assert.deepEqual(session.view.lastCommandResult, { accepted: true, reason: null });
  session.advance(0.01);
  assert.equal(session.view.tick, 5);
});

test('handlers run by numeric order then attachment order; newly added handlers wait for the next tick', () => {
  const session = new GameSession(definition());
  const calls = [];
  session.registerTickHandler(({ tick }) => calls.push(`later:${tick}`), 10);
  session.registerTickHandler(({ tick }) => {
    calls.push(`first:${tick}`);
    if (tick === 1)
      session.registerTickHandler(({ tick: next }) => calls.push(`added:${next}`), -20);
  }, -10);
  session.registerTickHandler(({ tick }) => calls.push(`second:${tick}`), -10);
  session.advance(0.1);
  assert.deepEqual(calls, [
    'first:1',
    'second:1',
    'later:1',
    'added:2',
    'first:2',
    'second:2',
    'later:2',
  ]);
});

test('removing a handler skips it immediately and unsubscribe is idempotent', () => {
  const session = new GameSession(definition());
  const calls = [];
  const stopFirst = session.registerTickHandler(() => {
    calls.push('first');
    stopFirst();
    stopLater();
  }, -1);
  const stopLater = session.registerTickHandler(() => calls.push('removed'));
  session.registerTickHandler(() => calls.push('last'));
  session.advance(0.1);
  stopFirst();
  stopLater();
  assert.deepEqual(calls, ['first', 'last', 'last']);
});

test('a handler can queue a command for this tick before movement is applied', () => {
  const session = new GameSession(definition(), { developerFixture: true });
  session.registerTickHandler(({ tick }) => {
    if (tick === 1) session.enqueue(placement);
    session.setMovement({ x: 1, z: 0 });
    assert.equal(session.view.buildings.length, 0);
  });
  session.advance(0.05);
  assert.equal(session.view.tick, 1);
  assert.equal(session.view.buildings.length, 1);
  assert.ok(Math.abs(session.view.player.position.x - 1.075) < 1e-10);
});

test('pause inside a handler aborts that tick and catch-up even if immediately resumed', () => {
  for (const resumeInHandler of [false, true]) {
    const session = new GameSession(definition(), { developerFixture: true });
    const later = [];
    session.setMovement({ x: 0, z: 1 }, true);
    session.enqueue(placement);
    const stop = session.registerTickHandler(() => {
      session.pause();
      if (resumeInHandler) session.pause(false);
    });
    session.registerTickHandler(({ tick }) => later.push(tick));
    session.advance(0.25);
    assert.equal(session.view.tick, 0);
    assert.deepEqual(later, []);
    assert.deepEqual(session.view.player.position, definition().spawn);
    assert.equal(session.view.buildings.length, 0);
    assert.equal(session.failed, false);
    stop();
    session.pause(false);
    session.advance(0.025);
    assert.equal(session.view.tick, 0);
    session.advance(0.025);
    assert.equal(session.view.tick, 1);
    assert.deepEqual(later, [1]);
    assert.deepEqual(session.view.player.position, definition().spawn);
  }
});

test('handler failure retains the last completed view and permanently stops advancing', () => {
  const session = new GameSession(definition(), { developerFixture: true });
  session.setMovement({ x: 0, z: 1 });
  session.advance(0.05);
  const completed = session.view;
  const failure = new Error('Tick script failed');
  const later = [];
  const stop = session.registerTickHandler(() => {
    session.enqueue(placement);
    throw failure;
  });
  session.registerTickHandler(({ tick }) => later.push(tick));
  assert.throws(
    () => session.advance(0.25),
    (error) => error === failure,
  );
  assert.equal(session.failed, true);
  assert.deepEqual(later, []);
  assert.deepEqual(session.view, completed);
  stop();
  session.pause();
  session.advance(60);
  session.clearInput();
  session.resetTiming();
  assert.deepEqual(session.current, completed);
  session.pause(false);
  session.advance(0);
  assert.throws(
    () => session.advance(0.05),
    (error) => error === failure,
  );
  assert.deepEqual(session.view, completed);
});

test('a motor exception after mutation cannot publish commands or partial movement', (t) => {
  const session = new GameSession(definition(), { developerFixture: true });
  session.setMovement({ x: 1, z: 0 });
  session.advance(0.05);
  const completed = session.view;
  const originalStep = PlayerMotor.prototype.step;
  const failure = new Error('Motor failed after moving');
  t.mock.method(PlayerMotor.prototype, 'step', function (movement) {
    originalStep.call(this, movement);
    throw failure;
  });
  session.enqueue(placement);
  assert.throws(
    () => session.advance(0.1),
    (error) => error === failure,
  );
  assert.equal(session.failed, true);
  assert.deepEqual(session.view, completed);
  session.pause();
  assert.deepEqual(session.view, completed);
});

test('session views are detached from the cached completed state, including after failure', () => {
  const session = new GameSession(definition());
  const failure = new Error('failure');
  const expected = session.view;
  const exposed = session.view;
  exposed.player.position.x = 200;
  exposed.deposits[0].quantity = 0;
  assert.deepEqual(session.view, expected);
  session.registerTickHandler(() => {
    throw failure;
  });
  assert.throws(
    () => session.advance(0.05),
    (error) => error === failure,
  );
  session.view.player.position.x = -200;
  assert.deepEqual(session.view, expected);
});

test('recursive advancement fails instead of dispatching the same tick again', () => {
  const session = new GameSession(definition());
  session.registerTickHandler(() => session.advance(0.05));
  assert.throws(() => session.advance(0.05), /recursively advance/);
  assert.equal(session.failed, true);
  assert.equal(session.view.tick, 0);
});
