import '../../tools/testing/register-typescript.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeReply } from '../../src/contracts/simulation.ts';
import type { SessionEvent } from '../../src/contracts/session-event.ts';
import type { SimulationPort } from '../../src/session/port.ts';
const { Simulation } = await import('../../src/simulation/simulation.ts');
const { SimulationRuntime } = await import('../../src/session/runtime.ts');
const { PresentationCache } = await import('../../src/session/presentation-cache.ts');
const { GameSession } = await import('../../src/session/game-session.ts');
const { InlineSimulationPort } = await import('../../tools/testing/inline-simulation-port.ts');
const { worldFixture } = await import('../support/world-fixture.ts');
const still = { x: 0, z: 0, sprint: false };

function session(port?: SimulationPort) {
  return new GameSession(worldFixture(), { portFactory: () => port ?? new InlineSimulationPort() });
}

test('every command outcome survives one publication, repeated rejection and pause cancellation', async () => {
  const s = session();
  const events: SessionEvent[] = [];
  s.events$.subscribe((event) => events.push(event));
  await s.ready;
  s.enqueue({ type: 'craft', recipe: 'metal-plate', quantity: 1 });
  s.enqueue({ type: 'handcraft-ui', visible: true });
  s.advance(0.05);
  s.flushCompleted();
  assert.deepEqual(
    events.map((e) => (e.event.kind === 'command-result' ? e.event.acknowledgement.result : null)),
    [
      { accepted: false, reason: 'locked' },
      { accepted: true, reason: null },
    ],
  );
  s.enqueue({ type: 'craft', recipe: 'metal-plate', quantity: 1 });
  s.advance(0.05);
  s.flushCompleted();
  assert.equal(events.length, 3);
  s.enqueue({ type: 'salvage', target: 'scrap' });
  s.setPaused(true);
  assert.equal(events.at(-1)!.event.kind, 'command-result');
  const event = events.at(-1)!.event;
  assert(event.kind === 'command-result' && event.acknowledgement.result === 'cancelled');
  assert.equal(new Set(events.map((event) => event.id)).size, events.length);
  s.dispose();
});

test('opening capture continues deterministically for 1000 steps and inspections are detached', () => {
  const a = new Simulation(worldFixture());
  a.step({ x: -0.5, z: 0.7, sprint: false });
  const b = new Simulation(worldFixture(), { snapshot: JSON.parse(JSON.stringify(a.capture())) });
  for (let i = 0; i < 1000; i++) {
    const input = { x: (i % 3) - 1, z: ((i + 1) % 3) - 1, sprint: i % 5 === 0 };
    a.step(input);
    b.step(input);
  }
  assert.deepEqual(a.capture(), b.capture());
  const detached = structuredClone(a.inspect([a.playerId])[0]);
  Reflect.set(detached.entity.transform!.position, 'x', 123);
  assert.notEqual(a.view.player.position.x, 123);
  a.dispose();
  b.dispose();
});

test('real pickup removal and recycled slots preserve presentation generations', () => {
  const initial = new Simulation(worldFixture());
  const snapshot = initial.capture();
  initial.dispose();
  snapshot.entities.push({
    id: 'pile',
    kind: 'pile',
    pile: { item: 'scrap', quantity: 1 },
    transform: {
      position: { ...snapshot.definition.spawn },
      facing: 0,
      moving: false,
      sprinting: false,
    },
  });
  const player = snapshot.entities.find((entity) => entity.kind === 'player')!;
  player.inventory!.slots = Array.from({ length: 24 }, (_, index) => ({
    item: 'scrap',
    quantity: index === 23 ? 99 : 100,
  }));
  player.transform!.position = {
    ...snapshot.definition.deposits[0].position,
    x: snapshot.definition.deposits[0].position.x + 1.5,
  };
  snapshot.entities.find((entity) => entity.id === 'pile')!.transform!.position = {
    ...player.transform!.position,
  };
  const world = new Simulation(worldFixture(), { snapshot });
  const cache = new PresentationCache();
  const initialPacket = world.publish(new Set(), true);
  cache.apply(initialPacket, 1);
  const oldMapping = initialPacket.mappings.find((mapping) => mapping.id === 'pile')!;
  world.step(still, [{ type: 'pickup', target: 'pile' }]);
  const packet = world.publish(new Set());
  cache.apply(packet, 1);
  assert.equal(world.inspect(['pile']).length, 0);
  assert.equal(cache.size, snapshot.entities.length - 1);
  assert.equal(cache.read().inventory['scrap'], 2400);
  world.step(still, [{ type: 'salvage', target: snapshot.definition.deposits[0].id }]);
  for (let index = 0; index < 60; index++) world.step(still);
  const reused = world.publish(new Set(), true);
  const mapping = reused.mappings.find((entry) => entry.kind === 'pile')!;
  assert.equal(mapping.slot, oldMapping.slot);
  assert(mapping.generation > oldMapping.generation);
  cache.apply(reused, 1);
  assert.equal(cache.read().ground?.length, 1);
  world.dispose();
  cache.dispose();
});

test('full cache replacement grows from 1000 to 100000 real ground entities', () => {
  const seed = new Simulation(worldFixture());
  const snapshot = seed.capture();
  seed.dispose();
  const cache = new PresentationCache();
  for (const count of [1000, 100000]) {
    snapshot.entities = snapshot.entities.filter((e) => e.kind !== 'pile');
    for (let i = 0; i < count; i++)
      snapshot.entities.push({
        id: `pile-${i}`,
        kind: 'pile',
        pile: { item: 'scrap', quantity: 1 },
        transform: { position: { x: 1, y: 0, z: 1 }, facing: 0, moving: false, sprinting: false },
      });
    const world = new Simulation(worldFixture(), { snapshot });
    const full = world.publish(new Set(), true);
    full.version = count;
    full.base = count - 1;
    cache.apply(full, 1);
    assert.equal(cache.size, count + 2);
    world.dispose();
  }
  cache.dispose();
});

test('decoder preserves precision and development views reject nested mutation', () => {
  const world = new Simulation(worldFixture());
  world.step({ x: 0.25, z: 0.75, sprint: true });
  const cache = new PresentationCache(true);
  const packet = world.publish(new Set(), true);
  cache.apply(packet, 1);
  assert.deepEqual(cache.read().player, world.view.player);
  assert.equal(Reflect.set(cache.read().opening!.state, 'moved', false), false);
  new Float64Array(packet.rows).fill(0);
  assert.deepEqual(cache.read().player, world.view.player);
  world.dispose();
  cache.dispose();
});

test('a missing delta resynchronizes once and delivers buffered outcomes once', async () => {
  const runtime = new SimulationRuntime();
  let advances = 0,
    resyncs = 0;
  const s = session({
    dispose: () => runtime.dispose(),
    send(request) {
      const reply = runtime.handle(request);
      if (request.operation === 'advance' && ++advances === 1 && reply.packet) {
        reply.packet.version++;
        reply.packet.base++;
      }
      if (request.operation === 'resync') resyncs++;
      return reply;
    },
  });
  const events: SessionEvent[] = [];
  s.events$.subscribe((e) => events.push(e));
  await s.ready;
  s.enqueue({ type: 'craft', recipe: 'metal-plate', quantity: 1 });
  s.advance(0.05);
  await s.settled();
  s.flushCompleted();
  assert.equal(s.failed, false);
  assert.equal(resyncs, 1);
  assert.equal(events.length, 1);
  assert.equal(s.readView().tick, 1);
  s.dispose();
});

test('event overflow fails visibly and a disposed generation cannot deliver events', async () => {
  const runtime = new SimulationRuntime();
  let overflow = false;
  const s = session({
    dispose: () => runtime.dispose(),
    send(request) {
      const reply = runtime.handle(request);
      if (overflow)
        reply.events = Array.from({ length: 4097 }, (_, i) => ({
          id: i + 1,
          tick: 0,
          event: { kind: 'salvage-attention', reason: 'bag-full' },
        }));
      return reply;
    },
  });
  await s.ready;
  overflow = true;
  assert.throws(() => s.advance(0.05), /overflow/);
  assert(s.failed);
  s.dispose();
});

test('an outstanding reply from a disposed generation cannot notify its replacement', async () => {
  const runtime = new SimulationRuntime();
  let complete!: () => void;
  const previous = session({
    dispose: () => runtime.dispose(),
    send(request) {
      const reply = runtime.handle(request);
      return request.operation === 'advance'
        ? new Promise((resolve) => {
            complete = () => resolve(reply);
          })
        : reply;
    },
  });
  await previous.ready;
  const received: SessionEvent[] = [];
  previous.events$.subscribe((event) => received.push(event));
  previous.enqueue({ type: 'craft', recipe: 'metal-plate', quantity: 1 });
  previous.advance(0.05);
  previous.dispose();
  const replacement = session();
  await replacement.ready;
  replacement.events$.subscribe((event) => received.push(event));
  complete();
  await previous.settled().catch(() => undefined);
  assert.deepEqual(received, []);
  replacement.dispose();
});

test('old versions and operation-specific malformed requests fail before world replacement', () => {
  const runtime = new SimulationRuntime();
  assert.throws(
    () =>
      runtime.handle({
        protocol: 2,
        id: 1,
        generation: 1,
        revision: 0,
        operation: 'capture',
        steps: 1,
      }),
    /payload/,
  );
  assert.throws(
    () =>
      runtime.handle({
        protocol: 1,
        id: 1,
        generation: 1,
        revision: 0,
        operation: 'initialize',
        definition: worldFixture(),
      }),
    /envelope/,
  );
  assert.throws(
    () => runtime.handle({ protocol: 2, id: 1, generation: 1, revision: 0, operation: 'advance' }),
    /credits/,
  );
  const ready = runtime.handle({
    protocol: 2,
    id: 1,
    generation: 1,
    revision: 0,
    operation: 'initialize',
    definition: worldFixture(),
  });
  assert(ready.ok);
  const bad = new Simulation(worldFixture()).capture();
  Reflect.set(bad, 'version', 1);
  const rejected = runtime.handle({
    protocol: 2,
    id: 2,
    generation: 2,
    revision: 0,
    operation: 'initialize',
    definition: worldFixture(),
    capture: {
      world: bad,
      ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 },
      pending: [],
    },
  });
  assert(!rejected.ok);
  const captured = runtime.handle({
    protocol: 2,
    id: 3,
    generation: 1,
    revision: 0,
    operation: 'capture',
  });
  assert(captured.ok && captured.capture);
  runtime.dispose();
});
