import { mutable } from '../../tools/shared.ts';
import type { WorldCommand } from '../../src/contracts/world.ts';
import type { SimulationPort } from '../../src/session/port.ts';
import type { RuntimeReply, SimulationCapture } from '../../src/contracts/simulation.ts';
import type {
  PlayerMotor as PlayerMotorInstance,
  MovementIntent,
} from '../../src/simulation/player-motor.ts';
import '../../tools/testing/register-typescript.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
const { GameSession } = await import('../../src/session/inline-game-session.ts');
const { GameSession: HostSession } = await import('../../src/session/game-session.ts');
const { PlayerMotor } = await import('../../src/simulation/player-motor.ts');
const { SimulationRuntime } = await import('../../src/session/runtime.ts');
import { worldFixture as definition } from '../support/world-fixture.ts';

const placement: WorldCommand = {
  type: 'place',
  buildingId: 'test-building',
  cell: { column: 4, row: 6 },
  rotation: 0,
};

test('completed presentation ticks agree across render schedules and observe completed authority', () => {
  const results = [30, 60, 144].map((rate) => {
    const session = new GameSession(definition());
    session.setMovement({ x: 0, z: 1 });
    const ticks: number[] = [];
    session.registerCompletedTickHandler((context) => {
      ticks.push(context.tick);
      assert.equal(context.phase, 'completed');
      assert.equal(context.deltaSeconds, 0.05);
      assert.ok(context.publishedTick >= context.tick);
      assert.equal(session.view.tick, context.publishedTick);
    });
    for (let frame = 0; frame < rate; frame++) session.advance(1 / rate);
    assert.deepEqual(
      ticks,
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    const view = session.view;
    session.dispose();
    return view;
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], results[2]);
  assert.ok(Math.abs(results[0].player.position.z - 2.5) < 1e-10);
});
test('zero-step frames retain commands; catch-up commits at most five steps and applies a command once', () => {
  const session = new GameSession(definition(), { developerFixture: true });
  const ticks: number[] = [];
  session.registerCompletedTickHandler(({ tick }) => ticks.push(tick));
  session.enqueue(placement);
  for (const delta of [0, -1, NaN, Infinity, 0.01, 0.01]) session.advance(delta);
  assert.deepEqual(ticks, []);
  session.advance(60);
  assert.deepEqual(ticks, [1, 2, 3, 4, 5]);
  assert.equal(session.view.buildings.length, 1);
  assert.equal(session.acknowledgements.length, 1);
  session.advance(0.01);
  assert.equal(session.view.tick, 5);
  session.dispose();
});
test('ordered callbacks unsubscribe immediately; new registrations do not replay already committed catch-up', () => {
  const session = new GameSession(definition());
  const calls: string[] = [];
  const removeLater = session.registerCompletedTickHandler(
    ({ tick }) => calls.push(`later:${tick}`),
    10,
  );
  session.registerCompletedTickHandler(({ tick }) => {
    calls.push(`first:${tick}`);
    if (tick === 1) {
      session.registerCompletedTickHandler(({ tick: n }) => calls.push(`new:${n}`), -20);
      removeLater();
      removeLater();
    }
  }, -10);
  session.registerCompletedTickHandler(({ tick }) => calls.push(`second:${tick}`), -10);
  session.advance(0.1);
  assert.deepEqual(calls, ['first:1', 'second:1', 'first:2', 'second:2']);
  session.advance(0.05);
  assert.deepEqual(calls.slice(-3), ['new:3', 'first:3', 'second:3']);
  session.dispose();
});
test('presentation commands and movement affect a future tick', () => {
  const session = new GameSession(definition(), { developerFixture: true });
  session.registerCompletedTickHandler(({ tick }) => {
    if (tick === 1) {
      session.enqueue(placement);
      session.setMovement({ x: 1, z: 0 });
    }
  });
  session.advance(0.05);
  assert.equal(session.view.buildings.length, 0);
  assert.equal(session.view.player.position.x, 1);
  session.advance(0.05);
  assert.equal(session.view.buildings.length, 1);
  assert.ok(Math.abs(session.view.player.position.x - 1.075) < 1e-10);
  session.dispose();
});
test('pause in a completed hook stops notifications and future input without rolling back completed work', () => {
  for (const resume of [false, true]) {
    const session = new GameSession(definition(), { developerFixture: true });
    const later: number[] = [];
    session.setMovement({ x: 0, z: 1 }, true);
    const stop = session.registerCompletedTickHandler(() => {
      session.enqueue(placement);
      session.pause();
      if (resume) session.pause(false);
    });
    session.registerCompletedTickHandler(({ tick }) => later.push(tick));
    session.advance(0.25);
    assert.equal(session.view.tick, 5);
    assert.deepEqual(later, []);
    assert.equal(session.view.buildings.length, 0);
    const position = session.view.player.position;
    stop();
    session.pause(false);
    session.advance(0.025);
    assert.equal(session.view.tick, 5);
    session.advance(0.025);
    assert.equal(session.view.tick, 6);
    assert.deepEqual(session.view.player.position, position);
    assert.equal(session.view.buildings.length, 0);
    assert.deepEqual(later, [6]);
    session.dispose();
  }
});
test('presentation failure retains the newly completed view, terminates dispatch and requires a fresh session', () => {
  const session = new GameSession(definition());
  session.setMovement({ x: 0, z: 1 });
  session.advance(0.05);
  const failure = new Error('Presentation failed');
  session.registerCompletedTickHandler(() => {
    throw failure;
  });
  assert.throws(
    () => session.advance(0.25),
    (error) => error === failure,
  );
  const completed = session.view;
  assert.equal(completed.tick, 6);
  assert.equal(session.failed, true);
  assert.throws(() => session.advance(0.05), /Presentation failed/);
  session.pause();
  session.clearInput();
  mutable(session.view).player.position.x = -200;
  assert.deepEqual(session.current, completed);
  session.dispose();
  const fresh = new GameSession(definition());
  assert.equal(fresh.view.tick, 0);
  assert.deepEqual(fresh.view.player.position, definition().spawn);
  fresh.dispose();
});
test('a motor exception after mutation cannot expose partial state across the serialized boundary', (t) => {
  const session = new GameSession(definition(), { developerFixture: true });
  session.setMovement({ x: 1, z: 0 });
  session.advance(0.05);
  const completed = session.view;
  const step = PlayerMotor.prototype.step;
  t.mock.method(
    PlayerMotor.prototype,
    'step',
    function (this: PlayerMotorInstance, input: MovementIntent) {
      step.call(this, input);
      throw new Error('Motor failed after mutation');
    },
  );
  session.enqueue(placement);
  assert.throws(() => session.advance(0.1), /Motor failed after mutation/);
  assert.equal(session.failed, true);
  assert.deepEqual(session.view, completed);
  session.dispose();
});
test('recursive advancement from a presentation hook fails after the reported tick is completed', () => {
  const session = new GameSession(definition());
  session.registerCompletedTickHandler(() => session.advance(0.05));
  assert.throws(() => session.advance(0.05), /recursively advance/);
  assert.equal(session.view.tick, 1);
  assert.equal(session.failed, true);
  session.dispose();
});
test('in-flight work and elapsed time share five credits; pause acknowledgement stops further advancement', async () => {
  const runtime = new SimulationRuntime();
  let queue = Promise.resolve();
  const port: SimulationPort = {
    send(request) {
      const reply = queue.then(
        () =>
          new Promise<RuntimeReply>((resolve) =>
            setTimeout(() => resolve(runtime.handle(request)), 2),
          ),
      );
      queue = reply.then(() => undefined);
      return reply;
    },
    dispose() {
      runtime.dispose();
    },
  };
  const session = new GameSession(definition(), { portFactory: () => port });
  await session.ready;
  session.advance(60);
  for (let i = 0; i < 20; i++) session.advance(1);
  assert.ok(session.maxPendingSteps <= 5);
  session.pause();
  await session.settled();
  const tick = session.view.tick;
  assert.equal(tick, 5);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(session.view.tick, tick);
  session.pause(false);
  await session.settled();
  session.advance(0.025);
  await session.settled();
  assert.equal(session.view.tick, tick);
  session.advance(0.025);
  await session.settled();
  assert.equal(session.view.tick, tick + 1);
  session.dispose();
});
test('capture retains accepted pending commands and continuation sequence, without retaining continuous input', async () => {
  const a = new GameSession(definition(), { developerFixture: true });
  a.enqueue(placement);
  const captured = await a.capture();
  assert.equal(captured.pending.length, 1);
  assert.equal(captured.world.resources.tick, 0);
  const b = new GameSession(definition(), { developerFixture: true, capture: captured });
  a.advance(0.05);
  b.advance(0.05);
  assert.deepEqual((await a.capture()).world, (await b.capture()).world);
  assert.equal(a.view.buildings.length, 1);
  a.enqueue(placement);
  b.enqueue(placement);
  a.advance(0.05);
  b.advance(0.05);
  assert.deepEqual(await a.capture(), await b.capture());
  a.dispose();
  b.dispose();
});

function delayedRestoration(capture: SimulationCapture) {
  const runtime = new SimulationRuntime();
  let initialize!: () => void;
  let queue = new Promise<void>((resolve) => {
    initialize = resolve;
  });
  const port: SimulationPort = {
    send(request) {
      const reply = queue.then(() => runtime.handle(request));
      queue = reply.then(
        () => undefined,
        () => undefined,
      );
      return reply;
    },
    dispose: () => runtime.dispose(),
  };
  const session = new HostSession(definition(), {
    developerFixture: true,
    capture,
    portFactory: () => port,
  });
  return { session, initialize };
}

const continuationPlacements: WorldCommand[] = [
  placement,
  { ...placement, cell: { column: 6, row: 5 } },
  { ...placement, cell: { column: 4, row: 4 } },
  { ...placement, cell: { column: 6, row: 6 } },
];

test('delayed restoration preserves pending commands and commands queued before and after readiness exactly once', async () => {
  const source = new GameSession(definition(), { developerFixture: true });
  source.enqueue(continuationPlacements[0]);
  const capture = await source.capture();
  source.dispose();
  assert.equal(capture.pending.length, 1);
  const { session, initialize } = delayedRestoration(capture);
  try {
    const beforeReady = continuationPlacements
      .slice(1, 3)
      .map((command) => session.enqueue(command));
    assert.equal(session.isReady, false);
    initialize();
    await session.ready;
    const afterReady = session.enqueue(continuationPlacements[3]);
    session.advance(0.05);
    await session.settled();
    assert.equal(session.failed, false);
    assert.equal(session.readView().buildings.length, 4);
    assert.deepEqual([...beforeReady, afterReady], [2, 3, 4]);
    assert.deepEqual(
      session.acknowledgements.map((ack) => ack.sequence),
      [1, 2, 3, 4],
    );
    assert(
      session.acknowledgements.every((ack) => ack.result !== 'cancelled' && ack.result.accepted),
    );
    const continued = await session.capture();
    assert.deepEqual(continued.ledger, { accepted: 4, applied: 4, cancelled: 0, lastApplied: 4 });
    assert.deepEqual(continued.pending, []);
    session.flushCompleted();
    session.advance(0.05);
    await session.settled();
    assert.equal(session.readView().buildings.length, 4);
    assert.equal(session.acknowledgements.length, 4);
  } finally {
    initialize();
    await session.ready.catch(() => undefined);
    session.dispose();
  }
});

for (const history of ['applied', 'cancelled'] as const)
  test(`delayed restoration allocates after ${history} command history with no pending commands`, async () => {
    const source = new GameSession(definition(), { developerFixture: true });
    for (const command of continuationPlacements.slice(0, 3)) source.enqueue(command);
    if (history === 'applied') source.advance(0.05);
    else source.pause();
    const capture = await source.capture();
    source.dispose();
    assert.equal(capture.ledger.accepted, 3);
    assert.equal(capture.ledger[history], 3);
    assert.deepEqual(capture.pending, []);
    const { session, initialize } = delayedRestoration(capture);
    try {
      const sequence = session.enqueue(continuationPlacements[3]);
      initialize();
      await session.ready;
      session.advance(0.05);
      await session.settled();
      assert.equal(session.failed, false);
      assert.equal(session.readView().buildings.length, history === 'applied' ? 4 : 1);
      assert.equal(sequence, 4);
      assert.deepEqual(
        session.acknowledgements.map((ack) => ack.sequence),
        [4],
      );
      const continued = await session.capture();
      assert.deepEqual(continued.ledger, {
        accepted: 4,
        applied: history === 'applied' ? 4 : 1,
        cancelled: history === 'cancelled' ? 3 : 0,
        lastApplied: 4,
      });
      assert.deepEqual(continued.pending, []);
    } finally {
      initialize();
      await session.ready.catch(() => undefined);
      session.dispose();
    }
  });

test('pausing delayed restoration cancels captured and newly queued commands with distinct acknowledgements', async () => {
  const source = new GameSession(definition(), { developerFixture: true });
  source.enqueue(continuationPlacements[0]);
  const capture = await source.capture();
  source.dispose();
  const { session, initialize } = delayedRestoration(capture);
  try {
    const cancelled = session.enqueue(continuationPlacements[1]);
    session.pause();
    initialize();
    await session.settled();
    assert.equal(session.readView().buildings.length, 0);
    assert.equal(cancelled, 2);
    assert.deepEqual(
      session.acknowledgements.map((ack) => [ack.sequence, ack.result]),
      [
        [1, 'cancelled'],
        [2, 'cancelled'],
      ],
    );
    session.pause(false);
    const sequence = session.enqueue(continuationPlacements[2]);
    session.advance(0.05);
    await session.settled();
    assert.equal(sequence, 3);
    assert.equal(session.failed, false);
    assert.equal(session.readView().buildings.length, 1);
    assert.deepEqual(
      session.acknowledgements.map((ack) => ack.sequence),
      [1, 2, 3],
    );
    assert.deepEqual((await session.capture()).ledger, {
      accepted: 3,
      applied: 1,
      cancelled: 2,
      lastApplied: 3,
    });
  } finally {
    initialize();
    await session.ready.catch(() => undefined);
    session.dispose();
  }
});
