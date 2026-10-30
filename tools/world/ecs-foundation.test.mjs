import './register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { Simulation } = await import('../../src/simulation/ecs-runtime.ts');
const { SimulationRuntime } = await import('../../src/session/runtime.ts');
const { PresentationCache } = await import('../../src/session/presentation-cache.ts');
const { GameSession } = await import('../../src/session/game-session.ts');
const { InlineSimulationPort } = await import('../../src/session/inline-port.ts');
const rules = await import('../../src/simulation/domain/inventory.ts');
const { advanceWork } = await import('../../src/simulation/domain/work.ts');
const { fixture, content, definition, system } =
  await import('../simulation-worker-bench/production-fixture.ts');
const still = { x: 0, z: 0, sprint: false };

test('inventory preflight is atomic, capacity and reservations prevent double spending', () => {
  const source = rules.emptyInventory(1),
    destination = rules.emptyInventory(1);
  assert(rules.transact(source, [], [{ item: 'ore', quantity: 10 }], content));
  assert(
    rules.reserve(source, { id: 'job', owner: 'machine', items: [{ item: 'ore', quantity: 7 }] }),
  );
  assert.equal(rules.available(source, 'ore'), 3);
  const before = structuredClone(source);
  assert.equal(rules.transact(source, [{ item: 'ore', quantity: 4 }], [], content), false);
  assert.equal(rules.transfer(source, destination, [{ item: 'ore', quantity: 4 }], content), false);
  assert.deepEqual(source, before);
  assert(rules.commitReservation(source, 'job', content));
  assert.equal(rules.commitReservation(source, 'job', content), false);
  assert.equal(rules.quantity(source, 'ore'), 3);
  assert(rules.transfer(source, destination, [{ item: 'ore', quantity: 3 }], content));
  assert.equal(rules.quantity(source, 'ore') + rules.quantity(destination, 'ore'), 3);
  assert.equal(rules.transact(destination, [], [{ item: 'plate', quantity: 1 }], content), false);
  assert.equal(
    rules.transact(destination, [], [{ item: 'toString', quantity: 1 }], content),
    false,
  );
  assert.throws(() => rules.transact(source, [], [{ item: 'ore', quantity: Infinity }], content));
  assert.equal(rules.eligible(source, 'toString', content), false);
});

test('reservation renewal is atomic and never spends the next operation twice', () => {
  const bag = rules.emptyInventory(1);
  bag.slots[0] = { item: 'ore', quantity: 2 };
  assert(
    rules.reserve(bag, { id: 'repeat', owner: 'processor', items: [{ item: 'ore', quantity: 1 }] }),
  );
  assert(rules.commitReservationAndRenew(bag, 'repeat', content));
  assert.equal(rules.quantity(bag, 'ore'), 1);
  assert.equal(rules.available(bag, 'ore'), 0);
  const before = structuredClone(bag);
  assert.equal(rules.commitReservationAndRenew(bag, 'repeat', content), false);
  assert.deepEqual(bag, before);
  assert(rules.commitReservation(bag, 'repeat', content));
  assert.equal(rules.quantity(bag, 'ore'), 0);
  assert.equal(bag.reservations.length, 0);
});

test('stock priority is invariant under request order and work blocks without duplicate credit', () => {
  const requests = ['research', 'minifab', 'manual'].map((priority) => ({
    priority,
    id: priority,
    items: [{ item: 'ore', quantity: 2 }],
  }));
  for (const order of [requests, [...requests].reverse()]) {
    const inventory = rules.emptyInventory();
    inventory.slots[0] = { item: 'ore', quantity: 3 };
    assert.deepEqual(rules.spendByPriority(inventory, order, content), ['manual']);
  }
  const work = fixture(1000).world.entities[0].work;
  work.remaining = 0.05;
  let credits = 0;
  advanceWork(work, 0.05, () => false);
  assert.equal(work.status, 'blocked');
  assert.equal(work.completed, 0);
  assert.equal(work.remaining, 0);
  for (let n = 0; n < 100; n++)
    advanceWork(work, 0.05, () => {
      credits++;
      return true;
    });
  assert.equal(credits, 0);
  work.status = 'active';
  advanceWork(work, 0.05, () => {
    credits++;
    return true;
  });
  assert.equal(credits, 1);
  assert.equal(work.completed, 1);
});

test('actual populated schemas survive fresh-runtime JSON restoration and 1000 subsequent steps', () => {
  for (const workload of ['normal', 'idle', 'active', 'churn']) {
    const initial = fixture(1000, workload);
    const a = new Simulation(definition, {
      content,
      snapshot: initial.world,
      system: system(workload),
    });
    for (let tick = 0; tick < 37; tick++) a.step(still);
    const captured = JSON.parse(JSON.stringify(a.capture()));
    const b = new Simulation(definition, { content, snapshot: captured, system: system(workload) });
    for (let tick = 0; tick < 1000; tick++) {
      a.step(still);
      b.step(still);
    }
    assert.deepEqual(b.capture(), a.capture(), workload);
    assert(a.resources.counters.completed > 0);
    assert(a.resources.counters.transfers > 0);
    assert(a.resources.productionTotals.plate > 0);
    if (workload !== 'churn') {
      const final = a.capture();
      const stored = final.entities.reduce(
        (sum, entity) =>
          sum +
          (entity.work?.held.reduce((n, stack) => n + stack.quantity, 0) ?? 0) +
          (entity.work?.output.slots.reduce((n, stack) => n + (stack?.quantity ?? 0), 0) ?? 0),
        0,
      );
      assert.equal(
        stored + final.resources.counters.shipped,
        final.resources.productionTotals.plate,
      );
      assert.equal(final.resources.counters.completed, final.resources.productionTotals.plate);
      assert.equal(final.resources.counters.injected, final.resources.counters.completed);
      for (const entity of final.entities)
        if (entity.work) assert.equal(entity.work.input.slots[0].quantity, 200);
    }
    captured.entities[0].work.input.slots[0].quantity = 0;
    assert(a.inspect(['e0r0'])[0]?.entity.work?.input.slots[0]?.quantity !== 0);
    a.dispose();
    b.dispose();
  }
});

test('malformed captures fail before replacing a healthy runtime', () => {
  const runtime = new SimulationRuntime({ content });
  let id = 0;
  const request = (operation, extra = {}) =>
    runtime.handle({ protocol: 1, id: ++id, generation: 1, revision: 0, operation, ...extra });
  assert(request('initialize', { definition, capture: fixture(1000) }).ok);
  for (const mutate of [
    (c) => c.world.entities.push(c.world.entities[0]),
    (c) => (c.world.entities[0].owner = 'missing'),
    (c) => (c.world.entities[0].work.recipe = 'unknown'),
    (c) => (c.world.entities[0].work.input.slots[0].quantity = 0),
    (c) => (c.world.entities[0].slot = 1),
    (c) => (c.world.resources.tick = NaN),
    (c) => (c.world.contentVersion = 'future'),
    (c) => (c.ledger.accepted = 9),
  ]) {
    const capture = fixture(1000);
    mutate(capture);
    const result = request('initialize', { generation: 2, definition, capture });
    assert.equal(result.ok, false);
    assert(request('capture').capture.world.entities.length === 1000);
  }
  runtime.dispose();
});

test('structural mutation boundaries, native membership, stale handles and reused slots', () => {
  let held, context;
  const world = new Simulation(definition, {
    content,
    snapshot: fixture(1000).world,
    system: (ctx) => {
      context = ctx;
      if (ctx.resources.tick === 0) {
        held = ctx.get('e0r0');
        assert([...ctx.active].includes(held));
        ctx.membership(held, false);
        assert(![...ctx.active].includes(held));
        const replacement = structuredClone(fixture(1000).world.entities[0]);
        replacement.id = 'replacement';
        replacement.work.input.reservations[0].owner = replacement.id;
        ctx.replace(held.id, replacement);
        assert.equal(ctx.get('replacement'), undefined);
      }
    },
  });
  const initial = world.publish(new Set(['player']), true);
  const cache = new PresentationCache();
  cache.apply(initial, 1);
  world.step(still);
  const delta = world.publish(new Set(['player', 'replacement']));
  const old = initial.mappings.find((m) => m.id === 'e0r0'),
    next = delta.mappings.find((m) => m.id === 'replacement');
  assert.equal(old.slot, next.slot);
  assert.equal(next.generation, old.generation + 1);
  assert.throws(() => context.mark(held), /Stale/);
  assert.throws(
    () => context.add({ id: 'outside', kind: 'owner', inventory: rules.emptyInventory() }),
    /outside/,
  );
  assert.equal(world.inspect(['e0r0']).length, 0);
  cache.apply(delta, 1);
  assert.equal(cache.size, 1000);
  const detail = delta.details.find((d) => d.id === 'replacement');
  detail.entity.work.held.push({ item: 'ore', quantity: 10 });
  assert.equal(world.inspect(['replacement'])[0].entity.work.held.length, 0);
  assert.equal(cache.apply(delta, 1), false);
  assert.throws(() => cache.apply({ ...delta, version: 4, base: 3 }, 1), /gap/);
  cache.apply(world.publish(new Set(['player']), true), 1);
  assert.equal(cache.size, 1000);
  world.dispose();
  cache.dispose();
  assert.equal(cache.size, 0);
});

test('independent sessions deduplicate live detail subscriptions, detached inspection and teardown', async () => {
  const create = () =>
    new GameSession(definition, {
      capture: fixture(1000),
      portFactory: () => new InlineSimulationPort({ content, system: system('normal') }),
    });
  const a = create(),
    b = create();
  await Promise.all([a.ready, b.ready]);
  const values = [];
  const one = a.subscribeDetails('e0r0', (value) => values.push(value));
  const two = a.subscribeDetails('e0r0', () => undefined);
  const inspection = await a.inspect('e1r0');
  inspection.entity.work.input.slots[0].quantity = 0;
  a.advance(0.05);
  a.flushCompleted();
  assert.equal(a.readView().tick, 1);
  assert.equal(b.readView().tick, 0);
  assert(values.at(-1).entity.charge.value > 0);
  assert.equal((await a.inspect('e1r0')).entity.work.input.slots[0].quantity, 200);
  one();
  two();
  await a.settled();
  assert.equal(a.cache.details.has('e0r0'), false);
  a.dispose();
  b.dispose();
});

test('suspension during a capture barrier cancels its command batch without losing sequence acknowledgements', async () => {
  const runtime = new SimulationRuntime();
  const port = {
    send: (request) =>
      new Promise((resolve) => setTimeout(() => resolve(runtime.handle(request)), 2)),
    dispose: () => runtime.dispose(),
  };
  const session = new GameSession(definition, { portFactory: () => port });
  await session.ready;
  const sequence = session.enqueue({
    type: 'place',
    buildingId: 'test-building',
    cell: { column: 52, row: 52 },
    rotation: 0,
  });
  const capturing = session.capture();
  session.setPaused(true);
  const captured = await capturing;
  assert.equal(captured.ledger.accepted, sequence);
  assert.equal(captured.ledger.cancelled, 1);
  assert.deepEqual(captured.pending, []);
  assert.deepEqual(
    session.acknowledgements.map((ack) => [ack.sequence, ack.result]),
    [[sequence, 'cancelled']],
  );
  session.dispose();
});

test('growth from 1000 to 100000 exercises ECS and host cache storage expansion', () => {
  const initial = fixture(1000);
  let added = false;
  const world = new Simulation(definition, {
    content,
    snapshot: initial.world,
    system: (ctx) => {
      if (added) return;
      for (let n = 1000; n < 100000; n++)
        ctx.add({ id: `growth-${n}`, kind: 'owner', inventory: rules.emptyInventory() });
      added = true;
    },
  });
  const cache = new PresentationCache();
  cache.apply(world.publish(new Set(['player']), true), 1);
  world.step(still);
  cache.apply(world.publish(new Set(['player'])), 1);
  assert.equal(cache.size, 100000);
  cache.verify(world.capture().entities);
  world.dispose();
  cache.dispose();
});

test('numeric decoding preserves asymmetric coordinates, facing, flags and nested authority detachment', () => {
  const world = new Simulation(definition, {
    system: (ctx) => {
      ctx.get('player').transform.position = { x: 1.234567890123, y: 0, z: 3.987654321098 };
    },
  });
  const cache = new PresentationCache();
  cache.apply(world.publish(new Set(['player']), true), 1);
  world.step({ x: 1, z: -0.5, sprint: true });
  const packet = world.publish(new Set(['player']));
  cache.apply(packet, 1);
  cache.verify(world.capture().entities);
  assert.deepEqual(cache.read().player, world.view.player);
  assert.equal(cache.read().player.moving, true);
  assert.equal(cache.read().player.sprinting, true);
  new Float64Array(packet.rows).fill(0);
  assert.notEqual(world.view.player.position.x, 0);
  world.dispose();
  cache.dispose();
});

test('one missing delta triggers a bounded full resynchronization without replaying tick notifications', async () => {
  const runtime = new SimulationRuntime();
  let advances = 0,
    resyncs = 0;
  const session = new GameSession(definition, {
    portFactory: () => ({
      dispose: () => runtime.dispose(),
      send(request) {
        const reply = runtime.handle(request);
        if (request.operation === 'advance' && ++advances === 1) {
          reply.packet.version++;
          reply.packet.base++;
        }
        if (request.operation === 'resync') resyncs++;
        return reply;
      },
    }),
  });
  await session.ready;
  const notifications = [];
  session.registerCompletedTickHandler((context) => notifications.push(context.tick));
  session.advance(0.05);
  await session.settled();
  session.flushCompleted();
  assert.equal(session.failed, false);
  assert.equal(resyncs, 1);
  assert.equal(session.readView().tick, 1);
  assert.deepEqual(notifications, []);
  session.advance(0.05);
  session.flushCompleted();
  assert.deepEqual(notifications, [2]);
  session.dispose();
});
