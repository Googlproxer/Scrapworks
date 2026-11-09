import { saveFixture } from '../../tests/support/save-fixture.ts';
import { SCRAP_RETURN_ROUTE, TRANSPORT_CONVEYOR_COUNT } from '../../tests/support/transport-layout';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  OPENING_CONTENT,
  OPENING_RECIPES,
  OPENING_TECHNOLOGIES,
  validateOpeningCatalogue,
} from '../content/opening';
import { MACHINE_COLLISION } from '../content/factory';
import { emptyTransport, facingPorts, materialPorts } from '../content/transport';
import type { PlaceableKind, MachineKind } from '../contracts/factory';
import type { MaterialPort } from '../contracts/transport';
import type { WorldResources, SimulationSnapshot } from '../contracts/simulation';
import { validWorldCommand } from '../contracts/world-command';
import { worldFixture } from '../../tests/support/world-fixture';
import { cellCenter } from '../core/world-grid';
import { emptyInventory, transact, quantity } from './domain/inventory';
import { newMachine, FactorySystem, type FactoryContext } from './factory';
import { newOpening } from './opening';
import type { SimulationEntity } from './opening-context';
import { materialConnectionValid, TransportSystem } from './transport';
import { Simulation } from './ecs-runtime';
import { preparePlayerSave } from './player-save';
import { assertSnapshot } from './capture';
import { decodeSave } from '../persistence/save-codec';

function fixture() {
  const definition = { ...worldFixture(), blockers: [], deposits: [] };
  const resources: WorldResources = {
    worldId: definition.id,
    playerId: 'player',
    tick: 0,
    stepSeconds: 0.05,
    nextEntityId: 1,
    research: Object.fromEntries(
      OPENING_TECHNOLOGIES.map((t) => [
        t.id,
        {
          unlocked: true,
          work: t.seconds,
          consumed: Object.fromEntries(t.costs.map((s) => [s.item, s.quantity])),
        },
      ]),
    ),
    productionTotals: {},
    extractionTotals: {},
    factory: { connections: [] },
  };
  const player: SimulationEntity = {
    id: 'player',
    kind: 'player',
    slot: 0,
    generation: 0,
    dirty: 0,
    inventory: emptyInventory(),
    equipment: { tool: null },
    opening: newOpening(),
    transform: { position: { ...definition.spawn }, facing: 0, moving: false, sprinting: false },
  };
  const entities: SimulationEntity[] = [];
  const context: FactoryContext = {
    player,
    definition,
    resources,
    machines: entities,
    piles: [],
    get: (id) => (id === 'player' ? player : entities.find((e) => e.id === id)),
    mark: () => undefined,
    allocateId: (prefix) => `${prefix}:${resources.nextEntityId++}`,
    add: (data) => entities.push({ ...data, slot: entities.length + 1, generation: 0, dirty: 0 }),
    remove: (id) => {
      const i = entities.findIndex((e) => e.id === id);
      if (i >= 0) entities.splice(i, 1);
    },
    deposits: () => [],
  };
  const factory = new FactorySystem(context),
    transport = new TransportSystem(context);

  const add = (kind: PlaceableKind, column: number, row: number, rotation: 0 | 1 | 2 | 3 = 0) => {
    const id = context.allocateId('building'),
      cell = { column, row },
      position = cellCenter(definition.grid, cell);
    const e: SimulationEntity = {
      id,
      kind: 'building',
      slot: entities.length + 1,
      generation: 0,
      dirty: 0,
      transform: { position: { ...position }, facing: 0, moving: false, sprinting: false },
      building: {
        id,
        buildingId: kind,
        position,
        cell,
        rotation,
        footprint: { width: 1, depth: 1 },
        ...(kind === 'conveyor' ? {} : { collision: { ...MACHINE_COLLISION } }),
      },
      ...(['conveyor', 'sorter'].includes(kind)
        ? { transport: emptyTransport() }
        : { machine: newMachine(kind as MachineKind, id, null) }),
    };
    entities.push(e);
    return e;
  };

  const connect = (
    a: SimulationEntity,
    b: SimulationEntity,
    output: MaterialPort = 'front',
    input: MaterialPort = 'back',
  ) => {
    player.transform!.position = { ...a.building!.position };
    assert(
      transport.command({ type: 'transport-connect', from: a.id, output, to: b.id, input })
        .accepted,
    );
    // Most fixtures examine an established network; startup/reconnect timing has its own test.
    resources.factory!.transport!.connections.at(-1)!.cooldown = 0;
  };

  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      transport.step();
      resources.tick++;
    }
  };

  const stock = (e: SimulationEntity, item: string, count: number) =>
    assert(transact(e.machine!.output, [], [{ item, quantity: count }], OPENING_CONTENT));

  return {
    definition,
    resources,
    player,
    entities,
    context,
    factory,
    transport,
    add,
    connect,
    tick,
    stock,
  };
}

test('transport catalogue conserves paid assembly value and validates direction/commands', () => {
  validateOpeningCatalogue();
  for (const kind of ['conveyor', 'sorter']) {
    const recipe = OPENING_RECIPES.find((r) => r.id === `assemble-${kind}`)!;
    assert.equal(recipe.technology, 'sorting-logistics');
    assert.equal(
      recipe.inputs.reduce((v, s) => v + OPENING_CONTENT.items[s.item].solidValue * s.quantity, 0),
      OPENING_CONTENT.items[kind].solidValue,
    );
  }
  const f = fixture(),
    a = f.add('conveyor', 5, 5),
    b = f.add('conveyor', 5, 6);
  assert(facingPorts(a.building!, 'front', b.building!, 'back'));
  assert(!materialConnectionValid(f.entities, [], a.id, 'right', b.id, 'back'));
  assert(
    validWorldCommand({
      type: 'transport-connect',
      from: a.id,
      output: 'front',
      to: b.id,
      input: 'back',
    }),
  );
  assert(
    !validWorldCommand({
      type: 'transport-connect',
      from: a.id,
      output: 'diagonal',
      to: b.id,
      input: 'back',
    }),
  );
  assert(
    !validWorldCommand({
      type: 'transport-configure',
      target: a.id,
      turn: 'straight',
      filters: ['plate'],
    }),
  );
  assert.deepEqual(materialPorts('medium-fabricator').input, ['back', 'left', 'right']);
});

test('new and repeatedly reconnected edges cannot bypass the transfer interval', () => {
  const f = fixture(),
    source = f.add('extractor', 5, 4),
    target = f.add('recycler', 5, 5);
  f.stock(source, 'scrap', 20);
  f.player.transform!.position = { ...source.building!.position };

  const connect = () =>
    assert(
      f.transport.command({
        type: 'transport-connect',
        from: source.id,
        output: 'front',
        to: target.id,
        input: 'back',
      }).accepted,
    );

  const disconnect = () =>
    assert(
      f.transport.command({
        type: 'transport-disconnect',
        connection: f.resources.factory!.transport!.connections[0].id,
      }).accepted,
    );

  for (let n = 0; n < 20; n++) {
    connect();
    f.tick();
    disconnect();
  }
  assert.equal(quantity(target.machine!.input, 'scrap'), 0);
  for (let n = 0; n < 3; n++) {
    connect();
    f.tick(9);
    assert.equal(quantity(target.machine!.input, 'scrap'), n);
    f.tick();
    assert.equal(quantity(target.machine!.input, 'scrap'), n + 1);
    disconnect();
  }
  assert.equal(quantity(source.machine!.output, 'scrap'), 17);
  assert.deepEqual(f.resources.extractionTotals, {});
});

test('long chain uses phase-start stock, finite travel and one edge per tick', () => {
  const f = fixture(),
    a = f.add('conveyor', 5, 4),
    b = f.add('conveyor', 5, 5),
    c = f.add('conveyor', 5, 6);
  f.connect(a, b);
  f.connect(b, c);
  a.transport!.units = [{ item: 'plate', progress: 9, lane: 0 }];
  f.tick();
  assert.equal(a.transport!.units.length, 0);
  assert.equal(b.transport!.units[0].progress, 0);
  assert.equal(c.transport!.units.length, 0);
  f.tick(9);
  assert.equal(c.transport!.units.length, 0);
  f.tick();
  assert.equal(c.transport!.units.length, 1);
  f.tick(1000);
  assert.equal(c.transport!.units[0].progress, 10);
  assert.equal(c.transport!.status, 'disconnected');
});

test('strict blocked sorter lanes let wire and residual scrap continue; no fallback/history', () => {
  const f = fixture(),
    source = f.add('recycler', 5, 3),
    sorter = f.add('sorter', 5, 4),
    left = f.add('conveyor', 4, 4, 3),
    right = f.add('conveyor', 6, 4, 1),
    front = f.add('conveyor', 5, 5);
  sorter.transport!.filters = ['plate', 'wire'];
  f.connect(source, sorter);
  f.connect(sorter, left, 'left');
  f.connect(sorter, right, 'right');
  f.connect(sorter, front);
  left.transport!.units = Array.from({ length: 4 }, () => ({
    item: 'plate',
    progress: 10,
    lane: 0,
  }));
  sorter.transport!.units = Array.from({ length: 4 }, () => ({
    item: 'plate',
    progress: 10,
    lane: 0,
  }));
  f.stock(source, 'plate', 3);
  f.stock(source, 'wire', 2);
  f.stock(source, 'scrap', 2);
  f.tick(60);
  assert.equal(quantity(source.machine!.output, 'plate'), 3);
  assert.equal(sorter.transport!.units.filter((u) => u.item === 'plate').length, 4);
  assert.equal(right.transport!.units.filter((u) => u.item === 'wire').length, 2);
  assert.equal(front.transport!.units.filter((u) => u.item === 'scrap').length, 2);
  assert.deepEqual(f.resources.productionTotals, {});
  assert.deepEqual(f.resources.extractionTotals, {});
  left.transport!.units = [];
  f.tick(11);
  assert(left.transport!.units.length > 0);
});

test('destination reservations merge fairly and do not depend on entity/edge iteration', () => {
  const create = () => {
    const f = fixture(),
      sink = f.add('recycler', 5, 5),
      a = f.add('extractor', 4, 5, 1),
      b = f.add('extractor', 5, 4);
    f.connect(a, sink, 'front', 'left');
    f.connect(b, sink);
    f.stock(a, 'scrap', 20);
    f.stock(b, 'scrap', 20);
    sink.machine!.input.slots = [
      { item: 'scrap', quantity: 100 },
      { item: 'scrap', quantity: 99 },
    ];
    return { ...f, sink, a, b };
  };

  const a = create(),
    b = create();
  b.entities.reverse();
  b.resources.factory!.transport!.connections.reverse();
  const winners: string[] = [];
  for (let i = 0; i < 12; i++) {
    for (const f of [a, b]) {
      f.sink.machine!.input.slots[1] = { item: 'scrap', quantity: 99 };
      f.tick(10);
      assert.equal(quantity(f.sink.machine!.input, 'scrap'), 200);
    }
    winners.push(a.resources.factory!.transport!.cursors[a.sink.id]);
  }
  assert.equal(new Set(winners).size, 2);
  assert.equal(quantity(a.a.machine!.output, 'scrap'), 14);
  assert.equal(quantity(a.b.machine!.output, 'scrap'), 14);
  b.resources.factory!.transport!.connections.sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(a.resources.factory, b.resources.factory);
  assert.deepEqual(
    a.entities.map((e) => [e.id, e.machine]).sort(),
    b.entities.map((e) => [e.id, e.machine]).sort(),
  );
});

test('filter edits, disconnected contents and full-bag dismantling are atomic', () => {
  const f = fixture(),
    s = f.add('sorter', 5, 5);
  s.transport!.filters = ['plate', 'wire'];
  s.transport!.units = [{ item: 'plate', progress: 7, lane: 0 }];
  const before = structuredClone(s.transport);
  assert.equal(
    f.transport.command({
      type: 'transport-configure',
      target: s.id,
      turn: 'straight',
      filters: ['scrap', 'wire'],
    }).reason,
    'busy',
  );
  assert.deepEqual(s.transport, before);
  f.player.inventory!.slots = Array.from({ length: 24 }, () => ({ item: 'wire', quantity: 100 }));
  assert.equal(f.factory.command({ type: 'factory-dismantle', target: s.id }).reason, 'capacity');
  assert.deepEqual(s.transport, before);
  f.player.inventory = emptyInventory();
  assert(f.transport.command({ type: 'transport-collect', target: s.id }).accepted);
  assert.equal(quantity(f.player.inventory, 'plate'), 1);
  assert(f.factory.command({ type: 'factory-dismantle', target: s.id }).accepted);
  assert.equal(quantity(f.player.inventory, 'scrap'), 12);
  assert(!f.entities.includes(s));
});

test('packed cycles keep exact stock until a real vacancy appears; turns never cross the phase twice', () => {
  const f = fixture(),
    a = f.add('conveyor', 4, 4, 0),
    b = f.add('conveyor', 5, 4, 1),
    c = f.add('conveyor', 5, 3, 2),
    d = f.add('conveyor', 4, 3, 3);
  for (const e of [a, b, c, d]) {
    e.transport!.turn = 'right';
    e.transport!.units = Array.from({ length: 4 }, () => ({ item: 'wire', lane: 0, progress: 10 }));
  }
  // A clockwise square: each right-turn output faces the next belt's back input.
  f.connect(a, b, 'right');
  f.connect(b, c, 'right');
  f.connect(c, d, 'right');
  f.connect(d, a, 'right');
  f.tick(50);
  assert.deepEqual(
    [a, b, c, d].map((e) => e.transport!.units.length),
    [4, 4, 4, 4],
  );
  d.transport!.units.pop();
  f.tick();
  assert.deepEqual(
    [a, b, c, d].map((e) => e.transport!.units.length),
    [4, 4, 3, 4],
  );
  assert.equal(
    [a, b, c, d].reduce((n, e) => n + e.transport!.units.length, 0),
    15,
  );
});

test('new production waits for the next phase and direct transfers never credit it twice', () => {
  const f = fixture(),
    wind = f.add('wind-turbine', 4, 4),
    recycler = f.add('recycler', 5, 4),
    sink = f.add('basic-fabricator', 5, 5);
  sink.machine!.enabled = false;
  sink.machine!.recipe = 'mechanical-part';
  f.resources.factory!.connections.push({ id: 'power', from: wind.id, to: recycler.id });
  f.connect(recycler, sink);
  recycler.machine!.job = {
    recipe: 'recycle-scrap',
    remaining: 0.05,
    inputs: [{ item: 'scrap', quantity: 8 }],
    outputs: [
      { item: 'plate', quantity: 3 },
      { item: 'wire', quantity: 1 },
      { item: 'scrap', quantity: 1 },
    ],
    outputCommitted: false,
  };
  f.factory.step(0.05);
  assert.equal(quantity(sink.machine!.input, 'plate'), 0);
  assert.equal(f.resources.productionTotals['plate'], 3);
  f.factory.step(0.05);
  assert.equal(quantity(sink.machine!.input, 'plate'), 1);
  assert.equal(f.resources.productionTotals['plate'], 3);
  assert.equal(f.resources.productionTotals['scrap'], undefined);
  f.player.transform!.position = { ...sink.building!.position };
  assert(
    f.factory.command({
      type: 'factory-transfer',
      target: sink.id,
      buffer: 'input',
      direction: 'unload',
      item: 'plate',
      quantity: 1,
    }).accepted,
  );
  assert.equal(f.resources.productionTotals['plate'], 3);
});

test('source reservations cannot duplicate units and a changed recipe visibly retains incompatible transit', () => {
  const f = fixture(),
    belt = f.add('conveyor', 5, 4),
    sink = f.add('basic-fabricator', 5, 5);
  sink.machine!.recipe = 'mechanical-part';
  f.connect(belt, sink);
  belt.transport!.units = [{ item: 'plate', lane: 0, progress: 10 }];
  sink.machine!.recipe = null;
  f.tick(20);
  assert.equal(belt.transport!.units.length, 1);
  assert.equal(belt.transport!.status, 'incompatible');
  sink.machine!.recipe = 'mechanical-part';
  f.tick();
  assert.equal(belt.transport!.units.length, 0);
  assert.equal(quantity(sink.machine!.input, 'plate'), 1);
  assert.equal(
    f.transport.command({
      type: 'transport-connect',
      from: belt.id,
      output: 'front',
      to: sink.id,
      input: 'back',
    }).reason,
    'invalid-request',
  );
  f.tick(100);
  assert.equal(quantity(sink.machine!.input, 'plate'), 1);
});

test('disconnection/teardown retains transit, cleans cursors and prevents ghost transfers', () => {
  const f = fixture(),
    a = f.add('conveyor', 5, 4),
    b = f.add('conveyor', 5, 5);
  f.connect(a, b);
  a.transport!.units = [{ item: 'scrap', lane: 0, progress: 10 }];
  f.tick();
  const edge = f.resources.factory!.transport!.connections[0];
  assert.equal(f.resources.factory!.transport!.cursors[b.id], edge.id);
  f.player.transform!.position = { ...b.building!.position };
  assert(f.transport.command({ type: 'transport-disconnect', connection: edge.id }).accepted);
  assert.deepEqual(f.resources.factory!.transport!.cursors, {});
  f.tick(100);
  assert.equal(b.transport!.units.length, 1);
  assert.equal(b.transport!.status, 'disconnected');
  assert(f.factory.command({ type: 'factory-dismantle', target: b.id }).accepted);
  assert.equal(quantity(f.player.inventory!, 'scrap'), 7);
  f.tick();
  assert(!f.entities.includes(b));
});

test('the authored ten-by-ten factory has an explicit nineteen-belt return route and distinct fabrication/merge ports', () => {
  const f = fixture();
  f.add('wind-turbine', 4, 4, 1);
  f.add('solar-panel', 2, 4);
  const extractor = f.add('extractor', 3, 5),
    recycler = f.add('recycler', 4, 6);
  f.add('basic-fabricator', 5, 6);
  f.add('medium-fabricator', 6, 6);
  f.add('laboratory', 7, 6);
  f.add('laboratory', 8, 6);
  const sorter = f.add('sorter', 4, 7),
    basic = f.add('basic-fabricator', 3, 7),
    medium = f.add('medium-fabricator', 5, 7),
    feed = f.add('conveyor', 3, 6);
  basic.machine!.recipe = 'mechanical-part';
  medium.machine!.recipe = 'electrical-part';
  sorter.transport!.filters = ['plate', 'wire'];
  feed.transport!.turn = 'right';
  f.connect(extractor, feed);
  f.connect(feed, recycler, 'right', 'left');
  f.connect(recycler, sorter);
  f.connect(sorter, basic, 'left', 'right');
  f.connect(sorter, medium, 'right', 'left');
  const route = SCRAP_RETURN_ROUTE;
  let last = sorter,
    output: MaterialPort = 'front';
  for (const [col, row, rotation, turn] of route) {
    const next = f.add('conveyor', col, row, rotation);
    next.transport!.turn = turn;
    f.connect(last, next, output);
    last = next;
    output = turn === 'straight' ? 'front' : turn;
  }
  f.connect(last, recycler, output, 'back');
  assert.equal(
    new Set(f.entities.map((e) => `${e.building!.cell.column},${e.building!.cell.row}`)).size,
    f.entities.length,
  );
  assert(!f.entities.some((e) => e.building!.cell.column === 6 && e.building!.cell.row === 4));
  assert.equal(
    f.entities.filter((e) => e.building!.buildingId === 'conveyor').length,
    TRANSPORT_CONVEYOR_COUNT,
  );
  assert.equal(
    f.resources.factory!.transport!.connections.filter((c) => c.to === recycler.id).length,
    2,
  );
});

test('the solid ownership ledger includes retained research, committed/pending work and full recovery exactly once', () => {
  const f = fixture(),
    source = f.add('recycler', 5, 4),
    sorter = f.add('sorter', 5, 5),
    sink = f.add('basic-fabricator', 4, 5, 3);
  sorter.transport!.filters = ['plate', 'wire'];
  sink.machine!.recipe = 'mechanical-part';
  f.connect(source, sorter);
  f.connect(sorter, sink, 'left');
  f.stock(source, 'plate', 20);
  f.stock(source, 'wire', 10);
  f.stock(source, 'scrap', 5);
  sink.machine!.job = {
    recipe: 'mechanical-part',
    remaining: 0,
    inputs: [{ item: 'plate', quantity: 2 }],
    outputs: [{ item: 'mechanical-part', quantity: 1 }],
    outputCommitted: true,
  };
  f.player.equipment!.tool = 'prybar';
  const mini = f.player.opening!.minifab;
  mini.owned = true;
  mini.input = [{ item: 'plate', quantity: 2 }];
  mini.job = { id: 'mini-job', recipe: 'mechanical-part', remaining: 1 };
  mini.output = [{ item: 'wire', quantity: 3 }];
  f.entities.push(
    {
      id: 'ground',
      kind: 'pile',
      slot: 90,
      generation: 0,
      dirty: 0,
      pile: { item: 'scrap', quantity: 7 },
    },
    {
      id: 'deposit',
      kind: 'deposit',
      slot: 91,
      generation: 0,
      dirty: 0,
      deposit: { kind: 'scrap', quantity: 83 },
    },
  );

  const value = (items: readonly { item: string; quantity: number }[]) =>
    items.reduce((n, s) => n + OPENING_CONTENT.items[s.item].solidValue * s.quantity, 0);

  const inventory = (bag: typeof f.player.inventory) =>
    value(bag?.slots.flatMap((s) => (s ? [s] : [])) ?? []);

  const owned = () =>
    inventory(f.player.inventory) +
    (f.player.equipment?.tool ? OPENING_CONTENT.items[f.player.equipment.tool].solidValue : 0) +
    (mini.owned ? value(OPENING_RECIPES.find((r) => r.id === 'base-minifab')!.inputs) : 0) +
    value(mini.input) +
    value(mini.output) +
    value(f.player.opening!.handcraft?.inputs ?? []) +
    f.resources.factory!.connections.length * OPENING_CONTENT.items['power-connection'].solidValue +
    Object.values(f.resources.research).reduce(
      (n, l) =>
        n + value(Object.entries(l.consumed).map(([item, quantity]) => ({ item, quantity }))),
      0,
    ) +
    f.entities.reduce(
      (n, e) =>
        n +
        (e.building ? OPENING_CONTENT.items[e.building.buildingId].solidValue : 0) +
        (e.deposit?.quantity ?? 0) +
        value(e.pile ? [e.pile] : []) +
        inventory(e.machine?.input) +
        inventory(e.machine?.output) +
        value(e.transport?.units.map((u) => ({ item: u.item, quantity: 1 })) ?? []) +
        value(
          e.machine?.job && e.building!.buildingId !== 'extractor'
            ? e.machine.job.remaining > 0
              ? e.machine.job.inputs
              : e.machine.job.outputs
            : [],
        ),
      0,
    );

  const before = owned();
  f.tick(400);
  assert.equal(owned(), before);
  const intact = quantity(sink.machine!.input, 'plate');
  f.player.transform!.position = { ...sink.building!.position };
  assert(f.factory.command({ type: 'factory-dismantle', target: sink.id }).accepted);
  assert.equal(owned(), before);
  assert.equal(quantity(f.player.inventory!, 'mechanical-part'), 1);
  assert.equal(quantity(f.player.inventory!, 'plate'), intact);
  assert.deepEqual(f.resources.productionTotals, {});
  assert.deepEqual(f.resources.extractionTotals, {});
});

test('native capture/codec/Continue preserve partial transit and reject corrupt ownership/topology', () => {
  const f = fixture();
  const seed = new Simulation(f.definition);
  const start = seed.capture();
  seed.dispose();
  start.resources.research = f.resources.research;
  const p = start.entities.find((e) => e.id === 'player')!;
  assert(
    transact(
      p.inventory!,
      [],
      [
        { item: 'conveyor', quantity: 1 },
        { item: 'sorter', quantity: 1 },
      ],
      OPENING_CONTENT,
    ),
  );
  const sim = new Simulation(f.definition, { snapshot: start });
  try {
    assert(
      sim.step({ x: 0, z: 0, sprint: false }, [
        { type: 'factory-place', equipment: 'conveyor', cell: { column: 5, row: 5 }, rotation: 0 },
      ]).commandResults[0].accepted,
    );
    assert(
      sim.step({ x: 0, z: 0, sprint: false }, [
        { type: 'factory-place', equipment: 'sorter', cell: { column: 5, row: 6 }, rotation: 0 },
      ]).commandResults[0].accepted,
    );
    const capture = sim.capture(),
      segments = capture.entities.filter((e) => e.transport);
    assert.equal(segments.length, 2);
    capture.resources.factory!.transport!.connections = [
      {
        id: 'material:3',
        from: segments[0].id,
        output: 'front',
        to: segments[1].id,
        input: 'back',
        cooldown: 4,
        lastItem: 'plate',
      },
    ];
    capture.resources.nextEntityId = 4;
    segments[0].transport!.units = [
      { item: 'plate', progress: 4, lane: 0 },
      { item: 'wire', progress: 2, lane: 0 },
    ];
    segments[1].transport!.filters = ['plate', 'wire'];
    segments[1].transport!.units = Array.from({ length: 4 }, () => ({
      item: 'plate',
      progress: 10,
      lane: 0,
    }));
    capture.resources.factory!.transport!.cursors[segments[1].id] = 'material:3';

    const durable = (world: SimulationSnapshot) =>
      decodeSave(saveFixture(world, 'transport-test', 'token', '2026-11-09T00:00:00.000Z')).world;

    const prepared = preparePlayerSave(durable(capture)),
      a = new Simulation(f.definition, { snapshot: prepared });
    let b: Simulation | undefined;
    try {
      for (let n = 0; n < 7; n++) a.step({ x: 0, z: 0, sprint: false });
      b = new Simulation(f.definition, { snapshot: preparePlayerSave(durable(a.capture())) });
      for (let n = 0; n < 40; n++) {
        a.step({ x: 0, z: 0, sprint: false });
        b.step({ x: 0, z: 0, sprint: false });
      }
      assert.deepEqual(a.capture(), b.capture());
      for (const branch of [a, b])
        branch.step({ x: 0, z: 0, sprint: false }, [
          { type: 'transport-collect', target: segments[1].id },
        ]);
      for (let n = 0; n < 20; n++) {
        a.step({ x: 0, z: 0, sprint: false });
        b.step({ x: 0, z: 0, sprint: false });
      }
      assert.deepEqual(a.capture(), b.capture());
    } finally {
      a.dispose();
      b?.dispose();
    }
    for (const corrupt of [
      (s: SimulationSnapshot) => {
        s.entities.find((e) => e.transport)!.transport!.units[0].progress = 11;
      },
      (s: SimulationSnapshot) => {
        s.resources.factory!.transport!.connections[0].input = 'left';
      },
      (s: SimulationSnapshot) => {
        s.resources.factory!.transport!.connections.push({
          ...s.resources.factory!.transport!.connections[0],
          id: 'material:99',
        });
      },
      (s: SimulationSnapshot) => {
        s.entities.find((e) => e.building?.buildingId === 'sorter')!.transport!.filters = [
          'plate',
          'plate',
        ];
      },
      (s: SimulationSnapshot) => {
        s.resources.factory!.transport!.cursors.noSuchTarget = 'missing';
      },
      (s: SimulationSnapshot) => {
        const belt = s.entities.find((e) => e.building?.buildingId === 'conveyor')!;
        belt.transport!.units = Array.from({ length: 5 }, () => ({
          item: 'plate',
          progress: 2,
          lane: 0,
        }));
      },
      (s: SimulationSnapshot) => {
        s.entities.find((e) => e.transport)!.transport!.units[0].item = 'missing-material';
      },
      (s: SimulationSnapshot) => {
        s.resources.factory!.transport!.connections[0].to = 'missing-destination';
      },
      (s: SimulationSnapshot) => {
        const belt = s.entities.find((e) => e.building?.buildingId === 'conveyor')!;
        belt.building!.cell.column = s.definition.grid.columns;
      },
      (s: SimulationSnapshot) => {
        const [a, b] = s.entities.filter((e) => e.transport);
        b.building!.cell = structuredClone(a.building!.cell);
        b.building!.position = structuredClone(a.building!.position);
        b.transform!.position = structuredClone(a.transform!.position);
      },
    ]) {
      const invalid = structuredClone(capture);
      corrupt(invalid);
      assert.throws(() => preparePlayerSave(durable(invalid)));
    }
    const old = structuredClone(start);
    old.contentVersion = 'factory-1';
    old.entities.find((e) => e.id === 'player')!.inventory = emptyInventory();
    delete old.resources.factory!.transport;
    old.definition.id = 'sorter'; // Authored identifiers are not equipment/content references.
    old.resources.worldId = old.definition.id;
    const migrated = preparePlayerSave(durable(old));
    assert.equal(migrated.contentVersion, OPENING_CONTENT.version);
    assert.equal(old.contentVersion, 'factory-1');
    old.entities.find((e) => e.id === 'player')!.inventory!.slots[0] = {
      item: 'conveyor',
      quantity: 1,
    };
    assert.throws(() => preparePlayerSave(durable(old)), /M6 transport/);
    assertSnapshot(prepared, OPENING_CONTENT);
  } finally {
    sim.dispose();
  }
});
