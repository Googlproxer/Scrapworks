import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { FACTORY_SETTINGS, RECYCLER_OUTCOMES } from '../content/factory';
import {
  OPENING_CONTENT,
  OPENING_RECIPES,
  OPENING_TECHNOLOGIES,
  validateOpeningCatalogue,
} from '../content/opening';
import type { MachineKind } from '../contracts/factory';
import type { WorldResources } from '../contracts/simulation';
import type { WorldCommand } from '../contracts/world';
import { validWorldCommand } from '../contracts/world-command';
import { worldFixture } from '../../tests/support/world-fixture';
import { emptyInventory, quantity, transact } from './domain/inventory';
import { advanceResearch } from './domain/research';
import { FactorySystem, newMachine, type FactoryContext } from './factory';
import { newOpening } from './opening';
import type { SimulationEntity } from './opening-context';
import { Simulation } from './ecs-runtime';
import { preparePlayerSave } from './player-save';
import { PresentationCache } from '../session/presentation-cache';
import { decodeSave } from '../persistence/save-codec';
import type { SimulationSnapshot } from '../contracts/simulation';
import { validateFactoryPlacement } from './factory-placement';
import { emptyToolbar } from '../contracts/toolbar';
import { validatePowerConnection } from './power-connection';

const durableWorld = (world: SimulationSnapshot) =>
  decodeSave({
    slot: 'manual-1',
    schema: 1,
    runId: 'factory-test',
    token: 'factory-test-token',
    savedAt: '2026-11-08T00:00:00.000Z',
    worldId: world.resources.worldId,
    contentVersion: world.contentVersion,
    tick: world.resources.tick,
    world,
  }).world;

test('factory reach uses the nearest footprint and player overlap uses the real collision radius', () => {
  const definition = { ...worldFixture(), blockers: [], deposits: [] },
    view = {
      buildings: [],
      deposits: [],
      player: { position: { x: -1.9, y: 0, z: 1 }, facing: 0, moving: false, sprinting: false },
    },
    cell = { column: 5, row: 5 };

  const preview = (x: number, z: number) =>
    validateFactoryPlacement(
      definition,
      {
        ...view,
        player: { ...view.player, position: { x, y: 0, z } },
      },
      'solar-panel',
      cell,
      0,
    );

  assert(preview(-1.9, 1).valid); // The centre is 2.9 m away; the footprint is 1.9 m away.
  assert(preview(-1.4, -1.4).valid); // A corner of the footprint intersects the reach circle.
  assert.equal(preview(-2.01, 1).reason, 'out-of-reach');
  assert(preview(-0.36, 1).valid); // Entire capsule is outside the cell.
  assert(preview(-0.01, 1).valid); // Inside the cell margin, outside the 1.2 m body.
  assert(preview(0.05, 1).valid); // Tangency is not penetration.
  assert.equal(preview(0.051, 1).reason, 'player-overlap');
});

test('toolbar assignments reference bag items, build uses the sequenced active slot, and depleted assignments survive saves', () => {
  const initial = realFactory(),
    snapshot = initial.capture(),
    player = snapshot.entities.find((e) => e.kind === 'player')!;
  assert(transact(player.inventory!, [], [{ item: 'solar-panel', quantity: 1 }], OPENING_CONTENT));
  const sim = own(new Simulation(snapshot.definition, { snapshot }));
  const results = sim.step(still, [
    { type: 'toolbar-assign', slot: 2, item: 'solar-panel' },
    { type: 'toolbar-select', slot: 2 },
    { type: 'factory-place-active', cell: { column: 6, row: 5 }, rotation: 1 },
  ]).commandResults;
  assert(results.every((r) => r.accepted));
  assert.equal(sim.view.inventory['solar-panel'] ?? 0, 0);
  assert.equal(sim.view.buildings.find((b) => b.buildingId === 'solar-panel')!.rotation, 1);
  assert.equal(sim.view.opening!.state.toolbar!.slots[2], 'solar-panel');
  assert.equal(
    sim.step(still, [{ type: 'factory-place-active', cell: { column: 6, row: 6 }, rotation: 0 }])
      .commandResults[0].reason,
    'missing-input',
  );
  const saved = preparePlayerSave(durableWorld(sim.capture())),
    restored = own(new Simulation(saved.definition, { snapshot: saved }));
  assert.deepEqual(restored.view.opening!.state.toolbar, {
    ...emptyToolbar(),
    active: 2,
    slots: [null, null, 'solar-panel', null, null, null, null, null],
  });
  assert(!validWorldCommand({ type: 'toolbar-assign', slot: 0, item: 'prybar' }));
  assert(!validWorldCommand({ type: 'toolbar-select', slot: 8 }));
  const invalid = structuredClone(saved);
  const toolbar = invalid.entities.find((e) => e.opening)!.opening!.toolbar!;
  Object.assign(toolbar, { slots: ['prybar', ...Array<null>(7).fill(null)] });
  assert.throws(() => preparePlayerSave(invalid), /toolbar/);
  const bag = structuredClone(sim.view.inventory);
  assert(
    sim.step(still, [{ type: 'toolbar-assign', slot: 2, item: null }]).commandResults[0].accepted,
  );
  assert.deepEqual(sim.view.inventory, bag);
});

test('connector toolbar assignments and sequenced two-endpoint commands survive native saves', () => {
  const snapshot = realFactory().capture();
  snapshot.resources.factory!.connections = [];
  const player = snapshot.entities.find((e) => e.kind === 'player')!;
  assert(
    transact(player.inventory!, [], [{ item: 'power-connection', quantity: 2 }], OPENING_CONTENT),
  );
  const sim = own(new Simulation(snapshot.definition, { snapshot }));
  const connect = { type: 'factory-connect-active', from: 'building-1', to: 'building-2' } as const;
  assert(validWorldCommand(connect));
  assert(!validWorldCommand({ ...connect, from: '' }));
  const results = sim.step(still, [
    { type: 'toolbar-assign', slot: 7, item: 'power-connection' },
    { type: 'toolbar-select', slot: 7 },
    connect,
  ]).commandResults;
  assert(results.every((r) => r.accepted));
  assert.equal(sim.view.inventory['power-connection'], 1);
  const saved = preparePlayerSave(durableWorld(sim.capture()));
  const restored = own(new Simulation(saved.definition, { snapshot: saved }));
  assert.equal(restored.view.opening!.state.toolbar!.slots[7], 'power-connection');
  assert.equal(restored.view.opening!.state.toolbar!.active, 7);
  assert.equal(restored.view.factory!.connections.length, 1);
  const rejected = restored.step(still, [
    { type: 'toolbar-select', slot: 0 },
    connect,
  ]).commandResults;
  assert.equal(rejected[1].reason, 'invalid-request');
  assert.equal(restored.view.inventory['power-connection'], 1);
  assert.equal(restored.view.factory!.connections.length, 1);
});

test('power connection preview and execution validate endpoints, length, either-end reach and duplicate spending', () => {
  const f = fixture(['wind-turbine', 'recycler']);
  const from = f.machines[0].id,
    to = f.machines[1].id;
  f.give('power-connection', 2);
  f.player.opening!.toolbar!.slots[0] = 'power-connection';

  const view = () => ({
    player: f.player.transform!,
    buildings: f.machines.map((m) => m.building!),
    factory: { connections: f.resources.factory!.connections },
  });

  const preview = (anchor: string | null, target: string) =>
    validatePowerConnection(f.context.definition, view(), anchor, target);

  assert(preview(null, from).valid);
  assert.equal(preview(null, 'missing').reason, 'machine-required');
  assert.equal(preview(from, from).reason, 'same-machine');
  const command = { type: 'factory-connect-active', from, to } as const;
  assert(!f.factory.command({ ...command, to: from }).accepted);
  assert.equal(quantity(f.player.inventory!, 'power-connection'), 2);
  const target = f.machines[1].building!;
  target.position.x = 17;
  assert.equal(preview(from, to).reason, 'cable-too-long');
  assert(!f.factory.command(command).accepted);
  assert.equal(quantity(f.player.inventory!, 'power-connection'), 2);
  target.position.x = 3;
  f.player.transform!.position = { x: 5, y: 0, z: 3 }; // In reach of the second endpoint only.
  assert(preview(from, to).valid);
  assert(f.factory.command(command).accepted);
  assert.equal(quantity(f.player.inventory!, 'power-connection'), 1);
  assert.equal(preview(from, to).reason, 'already-connected');
  assert.equal(f.factory.command({ ...command, from: to, to: from }).reason, 'busy');
  f.context.remove(to);
  assert.equal(preview(from, to).reason, 'machine-required');
  assert(!f.factory.command(command).accepted);
  assert.equal(quantity(f.player.inventory!, 'power-connection'), 1);
});

test('pre-toolbar factory-1 saves default detached assignments while retaining machine/native state', () => {
  const sim = realFactory(),
    old = sim.capture();
  delete old.entities.find((e) => e.opening)!.opening!.toolbar;
  const before = structuredClone(old),
    upgraded = preparePlayerSave(durableWorld(old));
  assert.deepEqual(old, before);
  assert.deepEqual(upgraded.entities.find((e) => e.opening)!.opening!.toolbar, emptyToolbar());
  assert.deepEqual(upgraded.physics, old.physics);
  assert.deepEqual(
    upgraded.entities.filter((e) => e.machine),
    old.entities.filter((e) => e.machine),
  );
});

const still = { x: 0, z: 0, sprint: false };
const owned: Simulation[] = [];
afterEach(() => {
  for (const sim of owned.splice(0)) sim.dispose();
});

const own = (sim: Simulation) => {
  owned.push(sim);
  return sim;
};

const run = (sim: Simulation, seconds: number) => {
  for (let n = 0; n < seconds * 20; n++) sim.step(still);
};

function fixture(kinds: readonly MachineKind[]) {
  const definition = worldFixture();
  const resources: WorldResources = {
    worldId: definition.id,
    playerId: 'player',
    tick: 0,
    stepSeconds: 0.05,
    nextEntityId: 100,
    research: {},
    productionTotals: {},
    extractionTotals: {},
    factory: { connections: [] },
  };
  for (const t of OPENING_TECHNOLOGIES.filter((t) => t.id !== 'sorting-logistics'))
    resources.research[t.id] = {
      consumed: Object.fromEntries(t.costs.map((c) => [c.item, c.quantity])),
      work: t.seconds,
      unlocked: true,
    };
  const player: SimulationEntity = {
    id: 'player',
    kind: 'player',
    slot: 0,
    generation: 0,
    dirty: 0,
    transform: { position: { x: 1, y: 0, z: 1 }, facing: 0, moving: false, sprinting: false },
    inventory: emptyInventory(),
    equipment: { tool: null },
    opening: newOpening(),
  };
  const entities = new Map<string, SimulationEntity>([[player.id, player]]);
  entities.set('scrap', {
    id: 'scrap',
    kind: 'deposit',
    slot: 99,
    generation: 0,
    dirty: 0,
    deposit: { kind: 'scrap', quantity: 100 },
    transform: { position: { x: -3, y: 0, z: 1 }, facing: 0, moving: false, sprinting: false },
  });
  const machines = kinds.map((kind, i): SimulationEntity => {
    const position = kind === 'extractor' ? { x: -3, y: 0, z: 1 } : { x: 1 + i * 2, y: 0, z: 3 };
    const id = `building:${i + 1}`;
    const entity: SimulationEntity = {
      id,
      kind: 'building',
      slot: i + 1,
      generation: 0,
      dirty: 0,
      building: {
        id,
        buildingId: kind,
        position,
        footprint: { width: 1, depth: 1 },
        rotation: 0,
        cell: kind === 'extractor' ? { column: 3, row: 5 } : { column: 5 + i, row: 6 },
      },
      machine: newMachine(kind, id, kind === 'extractor' ? 'scrap' : null),
    };
    entities.set(id, entity);
    return entity;
  });
  const context: FactoryContext = {
    player,
    resources,
    definition,
    machines,
    piles: [],
    get: (id) => entities.get(id),
    mark: () => undefined,
    allocateId: (prefix) => `${prefix}:${resources.nextEntityId++}`,
    add: (e) => {
      const entity = { ...e, slot: entities.size, generation: 0, dirty: 0 };
      entities.set(e.id, entity);
      if (entity.machine) machines.push(entity);
    },
    remove: (id) => {
      entities.delete(id);
      const index = machines.findIndex((e) => e.id === id);
      if (index >= 0) machines.splice(index, 1);
    },
    deposits: () => [
      { ...definition.deposits[0], quantity: entities.get('scrap')!.deposit!.quantity },
    ],
  };
  const factory = new FactorySystem(context);

  const connect = (a = 0, b = 1) =>
    resources.factory!.connections.push({
      id: `connection:${resources.nextEntityId++}`,
      from: machines[a].id,
      to: machines[b].id,
    });

  const give = (item: string, n: number) =>
    assert(transact(player.inventory!, [], [{ item, quantity: n }], OPENING_CONTENT));

  const feed = (i: number, item: string, n: number) =>
    assert(transact(machines[i].machine!.input, [], [{ item, quantity: n }], OPENING_CONTENT));

  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const labs = factory.step(0.05);
      advanceResearch(
        player.opening!.researchQueue,
        resources.research,
        labs,
        (item) => resources.productionTotals[item] ?? 0,
        0.05,
      );
      resources.tick++;
    }
  };

  return { factory, context, resources, player, machines, entities, connect, give, feed, tick };
}

test('equipment catalogue bootstraps all ten paid assemblies and every random outcome conserves value', () => {
  validateOpeningCatalogue();
  assert.equal(OPENING_RECIPES.filter((r) => r.id.startsWith('assemble-')).length, 10);
  const researchValue = OPENING_TECHNOLOGIES.reduce(
    (n, t) =>
      n + t.costs.reduce((n, c) => n + OPENING_CONTENT.items[c.item].solidValue * c.quantity, 0),
    0,
  );
  assert.equal(researchValue, 246);
  const equipmentValue =
    Object.entries(OPENING_CONTENT.items)
      .filter(([id]) =>
        [
          'solar-panel',
          'wind-turbine',
          'recycler',
          'basic-fabricator',
          'medium-fabricator',
          'extractor',
          'laboratory',
        ].includes(id),
      )
      .reduce((n, [, item]) => n + item.solidValue, 0) +
    OPENING_CONTENT.items.laboratory.solidValue +
    8 * OPENING_CONTENT.items['power-connection'].solidValue;
  assert.equal(equipmentValue, 230);
  assert.equal(researchValue + equipmentValue + 18, 494);
  for (const outcome of RECYCLER_OUTCOMES)
    assert.equal(
      outcome.reduce((n, s) => n + OPENING_CONTENT.items[s.item].solidValue * s.quantity, 0),
      8,
    );
});

test('100 mixed batches preserve exact value, bounded availability and residual-scrap history', () => {
  const f = fixture(['wind-turbine', 'recycler']);
  f.connect();
  const outcomes: Set<string>[] = [];
  for (let batch = 0; batch < 100; batch++) {
    f.feed(1, 'scrap', 8);
    f.tick(161);
    const output = f.machines[1].machine!.output;
    const contents = output.slots.flatMap((s) => (s ? [s] : []));
    assert.equal(
      contents.reduce((n, s) => n + OPENING_CONTENT.items[s.item].solidValue * s.quantity, 0),
      8,
    );
    outcomes.push(new Set(contents.map((s) => s.item)));
    output.slots = output.slots.map(() => null);
    if (batch >= 2)
      for (const item of ['plate', 'wire']) assert(outcomes.slice(-3).some((s) => s.has(item)));
  }
  assert.equal(f.resources.extractionTotals['scrap'], undefined);
  assert.equal(f.resources.productionTotals['scrap'], undefined);
});

test('power sharing is proportional, isolated supply is not global and blocked/idle consumers draw nothing', () => {
  const f = fixture(['wind-turbine', 'recycler', 'recycler', 'recycler']);
  f.connect(0, 1);
  f.connect(1, 2);
  f.feed(1, 'scrap', 8);
  f.feed(2, 'scrap', 8);
  f.feed(3, 'scrap', 8);
  f.tick();
  assert.equal(f.machines[1].machine!.allocated, 120);
  assert.equal(f.machines[3].machine!.allocated, 0);
  f.resources.tick = 3000;
  // Add a fourth connected runnable consumer to force demand above the wind supply.
  f.connect(2, 3);
  f.tick();
  const fractions = f.machines.slice(1).map((e) => e.machine!.allocated / e.machine!.requested);
  assert(fractions.every((n) => Math.abs(n - fractions[0]) < 1e-12));
  assert(f.factory.summary().used <= f.factory.summary().available + 1e-8);
  const blocked = f.machines[2].machine!;
  blocked.output.slots = blocked.output.slots.map(() => ({ item: 'prybar', quantity: 1 }));
  f.tick(500);
  assert.equal(blocked.requested, 0);
  assert.equal(blocked.status, 'blocked');
});

test('cyclic power edges never duplicate generation and zero-power work resumes', () => {
  const f = fixture(['solar-panel', 'recycler', 'basic-fabricator']);
  f.connect(0, 1);
  f.connect(1, 2);
  f.connect(2, 0);
  f.feed(1, 'scrap', 8);
  f.resources.tick = 2400;
  f.tick();
  assert.equal(f.machines[1].machine!.allocated, 0);
  const remaining = f.machines[1].machine!.job!.remaining;
  f.resources.tick = 0;
  f.tick();
  assert(f.machines[1].machine!.job!.remaining < remaining);
  assert(f.factory.summary().available <= FACTORY_SETTINGS.solarWatts);
});

test('manual transfers combine stacks, accept more than one stack and preserve stock on whole-transfer rejection', () => {
  const f = fixture(['recycler']),
    target = f.machines[0].id;
  f.player.inventory!.slots[0] = { item: 'scrap', quantity: 60 };
  f.player.inventory!.slots[1] = { item: 'scrap', quantity: 90 };
  f.player.inventory!.slots[2] = { item: 'wire', quantity: 5 };
  const transfer = {
    type: 'factory-transfer',
    target,
    buffer: 'input',
    direction: 'load',
    item: 'scrap',
    quantity: 150,
  } as const;
  assert(validWorldCommand(transfer));
  assert(!validWorldCommand({ ...transfer, quantity: Number.MAX_SAFE_INTEGER + 1 }));
  assert(!validWorldCommand({ ...transfer, quantity: 1.5 }));
  const before = structuredClone({ bag: f.player.inventory, input: f.machines[0].machine!.input });
  assert.equal(f.factory.command({ ...transfer, quantity: 151 }).reason, 'missing-input');
  assert.deepEqual({ bag: f.player.inventory, input: f.machines[0].machine!.input }, before);
  assert(f.factory.command(transfer).accepted);
  assert.equal(quantity(f.player.inventory!, 'scrap'), 0);
  assert.equal(quantity(f.player.inventory!, 'wire'), 5);
  assert.equal(quantity(f.machines[0].machine!.input, 'scrap'), 150);
  assert(f.factory.command({ ...transfer, direction: 'unload', quantity: 120 }).accepted);
  assert.equal(quantity(f.player.inventory!, 'scrap'), 120);
  assert.equal(quantity(f.machines[0].machine!.input, 'scrap'), 30);
  f.give('scrap', 200);
  const full = structuredClone({ bag: f.player.inventory, input: f.machines[0].machine!.input });
  assert.equal(f.factory.command({ ...transfer, quantity: 180 }).reason, 'capacity');
  assert.deepEqual({ bag: f.player.inventory, input: f.machines[0].machine!.input }, full);
  assert(f.factory.command({ ...transfer, quantity: 170 }).accepted);
  assert.equal(quantity(f.player.inventory!, 'scrap'), 150);
  assert.equal(quantity(f.machines[0].machine!.input, 'scrap'), 200);
  assert.deepEqual(f.resources.productionTotals, {});
  assert.deepEqual(f.resources.extractionTotals, {});
});

test('collect all output combines every stack atomically without taking input or pending work or crediting history', () => {
  const f = fixture(['recycler']),
    machine = f.machines[0].machine!,
    command = { type: 'factory-collect-output', target: f.machines[0].id } as const;
  assert(validWorldCommand(command));
  assert(!validWorldCommand({ ...command, target: '' }));
  machine.output.slots = [
    { item: 'plate', quantity: 50 },
    { item: 'plate', quantity: 60 },
    { item: 'wire', quantity: 7 },
    { item: 'scrap', quantity: 3 },
    null,
    null,
  ];
  f.give('plate', 90);
  f.feed(0, 'scrap', 8);
  machine.job = {
    recipe: 'recycle-scrap',
    remaining: 0,
    inputs: [{ item: 'scrap', quantity: 8 }],
    outputs: [
      { item: 'plate', quantity: 3 },
      { item: 'wire', quantity: 2 },
    ],
    outputCommitted: true,
  };
  f.resources.productionTotals.plate = 110;
  const untouched = structuredClone({
    input: machine.input,
    job: machine.job,
    history: f.resources.productionTotals,
  });
  assert(f.factory.command(command).accepted);
  assert.equal(quantity(f.player.inventory!, 'plate'), 200);
  assert.equal(quantity(f.player.inventory!, 'wire'), 7);
  assert.equal(quantity(f.player.inventory!, 'scrap'), 3);
  assert(machine.output.slots.every((slot) => slot === null));
  assert.deepEqual(
    { input: machine.input, job: machine.job, history: f.resources.productionTotals },
    untouched,
  );
  const bag = structuredClone(f.player.inventory);
  assert.equal(f.factory.command(command).reason, 'missing-input');
  assert.deepEqual(f.player.inventory, bag);
});

test('collect all output preserves all stock on capacity, reach or handcraft rejection', () => {
  const f = fixture(['recycler']),
    machine = f.machines[0].machine!,
    command = { type: 'factory-collect-output', target: f.machines[0].id } as const;
  machine.output.slots[0] = { item: 'plate', quantity: 1 };
  machine.output.slots[1] = { item: 'wire', quantity: 1 };
  f.player.inventory!.slots = [{ item: 'plate', quantity: 99 }];
  const before = structuredClone({ bag: f.player.inventory, output: machine.output });
  assert.equal(f.factory.command(command).reason, 'capacity');
  assert.deepEqual({ bag: f.player.inventory, output: machine.output }, before);
  f.player.transform!.position.x = -100;
  assert.equal(f.factory.command(command).reason, 'out-of-reach');
  assert.deepEqual({ bag: f.player.inventory, output: machine.output }, before);
  f.player.transform!.position.x = 1;
  f.player.opening!.handcraft = {
    id: 'opening-job:2',
    recipe: 'metal-plate',
    remaining: 1,
    inputs: [{ item: 'scrap', quantity: 2 }],
    unitsLeft: 1,
  };
  assert.equal(f.factory.command(command).reason, 'busy');
  assert.deepEqual({ bag: f.player.inventory, output: machine.output }, before);
  assert.equal(f.factory.command({ ...command, target: 'missing' }).reason, 'busy');
  f.player.opening!.handcraft = null;
  assert.equal(f.factory.command({ ...command, target: 'missing' }).reason, 'out-of-reach');
});

test('fabricator loading follows its applied recipe while old input and output remain collectable', () => {
  const f = fixture(['medium-fabricator']),
    machine = f.machines[0].machine!,
    target = f.machines[0].id;
  f.give('scrap', 10);
  f.give('plate', 10);
  f.give('wire', 10);
  f.give('mechanical-part', 10);
  f.give('electrical-part', 10);
  const load = {
    type: 'factory-transfer',
    target,
    buffer: 'input',
    direction: 'load',
    item: 'plate',
    quantity: 2,
  } as const;
  assert.equal(f.factory.command(load).reason, 'invalid-request');
  assert(
    f.factory.command({
      type: 'factory-configure',
      target,
      enabled: true,
      recipe: 'electrical-part',
    }).accepted,
  );
  assert(f.factory.command(load).accepted);
  assert(f.factory.command({ ...load, item: 'wire' }).accepted);
  assert.equal(f.factory.command({ ...load, item: 'scrap' }).reason, 'invalid-request');
  assert(transact(machine.output, [], [{ item: 'electrical-part', quantity: 1 }], OPENING_CONTENT));
  assert(
    f.factory.command({
      type: 'factory-configure',
      target,
      enabled: true,
      recipe: 'basic-research-kit',
    }).accepted,
  );
  const before = structuredClone({ bag: f.player.inventory, machine });
  assert.equal(f.factory.command(load).reason, 'invalid-request');
  assert.equal(f.factory.command({ ...load, item: 'wire' }).reason, 'invalid-request');
  assert.deepEqual({ bag: f.player.inventory, machine }, before);
  assert(f.factory.command({ ...load, item: 'mechanical-part' }).accepted);
  assert(f.factory.command({ ...load, item: 'electrical-part' }).accepted);
  assert(f.factory.command({ ...load, direction: 'unload' }).accepted);
  assert(
    f.factory.command({
      ...load,
      buffer: 'output',
      direction: 'unload',
      item: 'electrical-part',
      quantity: 1,
    }).accepted,
  );
  assert.equal(quantity(machine.input, 'plate'), 0);
  assert.equal(quantity(machine.output, 'electrical-part'), 0);
  assert.deepEqual(f.resources.productionTotals, {});
});

test('manual transfers validate compatibility, capacity, reach and active handcraft before any mutation', () => {
  const f = fixture(['recycler']);
  f.give('scrap', 20);
  f.give('wire', 5);
  const target = f.machines[0].id;
  assert.equal(
    f.factory.command({
      type: 'factory-transfer',
      target,
      buffer: 'input',
      direction: 'load',
      item: 'wire',
      quantity: 1,
    }).accepted,
    false,
  );
  assert(
    f.factory.command({
      type: 'factory-transfer',
      target,
      buffer: 'input',
      direction: 'load',
      item: 'scrap',
      quantity: 8,
    }).accepted,
  );
  assert.equal(quantity(f.player.inventory!, 'scrap'), 12);
  f.player.opening!.handcraft = {
    id: 'opening-job:2',
    recipe: 'metal-plate',
    remaining: 1,
    inputs: [{ item: 'scrap', quantity: 2 }],
    unitsLeft: 1,
  };
  const before = structuredClone(f.machines[0]);
  assert.equal(
    f.factory.command({
      type: 'factory-transfer',
      target,
      buffer: 'input',
      direction: 'unload',
      item: 'scrap',
      quantity: 1,
    }).reason,
    'busy',
  );
  assert.deepEqual(f.machines[0], before);
});

test('whole dismantling rejects full bags without cancelling work or wires, then recovers value once', () => {
  const f = fixture(['wind-turbine', 'recycler']);
  f.connect();
  f.feed(1, 'scrap', 8);
  f.tick(4);
  const target = f.machines[1];
  f.player.transform!.position = { ...target.building!.position };
  f.player.inventory!.slots = f.player.inventory!.slots.map(() => ({
    item: 'prybar',
    quantity: 1,
  }));
  const before = structuredClone(target.machine),
    edges = structuredClone(f.resources.factory!.connections);
  assert.equal(
    f.factory.command({ type: 'factory-dismantle', target: target.id }).reason,
    'capacity',
  );
  assert.deepEqual(target.machine, before);
  assert.deepEqual(f.resources.factory!.connections, edges);
  f.player.inventory!.slots = f.player.inventory!.slots.map(() => null);
  assert(f.factory.command({ type: 'factory-dismantle', target: target.id }).accepted);
  assert.equal(
    quantity(f.player.inventory!, 'scrap'),
    OPENING_CONTENT.items.recycler.solidValue + 4 + 8,
  );
  assert.equal(f.factory.command({ type: 'factory-dismantle', target: target.id }).accepted, false);
  assert.equal(f.resources.factory!.connections.length, 0);
});

test('scrap extraction commits finite deposit/output/history once and prospective results cannot be recovered twice', () => {
  const f = fixture(['wind-turbine', 'extractor']);
  f.connect();
  f.tick(41);
  assert.equal(f.entities.get('scrap')!.deposit!.quantity, 96);
  assert.equal(f.resources.extractionTotals['scrap'], 4);
  assert.equal(f.resources.productionTotals['scrap'], undefined);
  const machine = f.machines[1];
  machine.machine!.job = {
    recipe: 'extract-scrap',
    remaining: 0,
    inputs: [],
    outputCommitted: false,
    outputs: [{ item: 'scrap', quantity: 4 }],
  };
  f.player.transform!.position = { ...machine.building!.position };
  assert(f.factory.command({ type: 'factory-dismantle', target: machine.id }).accepted);
  assert.equal(f.entities.get('scrap')!.deposit!.quantity, 96);
  assert.equal(
    quantity(f.player.inventory!, 'scrap'),
    OPENING_CONTENT.items.extractor.solidValue + 4 + 4,
  );
});

test('two physical supplied labs share one ledger, use local bundles and retain work on queue edits', () => {
  const f = fixture(['wind-turbine', 'laboratory', 'laboratory']);
  f.connect(0, 1);
  f.connect(0, 2);
  f.feed(1, 'research-kit', 2);
  f.feed(2, 'research-kit', 2);
  f.resources.productionTotals['research-kit'] = 4;
  f.player.opening!.researchQueue = ['sorting-logistics'];
  f.tick(20);
  assert(Math.abs(f.resources.research['sorting-logistics'].work - 8) < 1e-8);
  f.player.opening!.researchQueue = [];
  f.tick(20);
  assert(Math.abs(f.resources.research['sorting-logistics'].work - 8) < 1e-8);
  f.player.opening!.researchQueue = ['sorting-logistics'];
  f.tick(200);
  assert(f.resources.research['sorting-logistics'].unlocked);
  assert.equal(f.resources.research['sorting-logistics'].consumed['research-kit'], 4);
  assert.equal(
    quantity(f.machines[1].machine!.input, 'research-kit') +
      quantity(f.machines[2].machine!.input, 'research-kit'),
    0,
  );
});

test('Basic/Medium enforce arity and locked recipes; active work cannot be reinterpreted', () => {
  const f = fixture(['wind-turbine', 'basic-fabricator', 'medium-fabricator']);
  f.connect(0, 1);
  f.connect(0, 2);
  for (const [index, recipe] of [
    [1, 'electrical-part'],
    [2, 'mechanical-part'],
    [1, 'metal-plate'],
  ] as const)
    assert.equal(
      f.factory.command({
        type: 'factory-configure',
        target: f.machines[index].id,
        enabled: true,
        recipe,
      }).accepted,
      false,
    );
  f.player.transform!.position = { ...f.machines[1].building!.position };
  assert(
    f.factory.command({
      type: 'factory-configure',
      target: f.machines[1].id,
      enabled: true,
      recipe: 'mechanical-part',
    }).accepted,
  );
  f.feed(1, 'plate', 2);
  f.tick();
  assert.equal(
    f.factory.command({
      type: 'factory-configure',
      target: f.machines[1].id,
      enabled: true,
      recipe: 'scrap-prybar',
    }).reason,
    'busy',
  );
});

function realFactory(): Simulation {
  const initial = own(new Simulation(worldFixture())),
    snapshot = initial.capture();
  for (const t of OPENING_TECHNOLOGIES)
    snapshot.resources.research[t.id] = {
      consumed: Object.fromEntries(t.costs.map((c) => [c.item, c.quantity])),
      work: t.seconds,
      unlocked: true,
    };
  const bag = snapshot.entities.find((e) => e.kind === 'player')!.inventory!;
  for (const [item, n] of [
    ['wind-turbine', 1],
    ['recycler', 1],
    ['power-connection', 1],
    ['scrap', 100],
  ] as const)
    assert(transact(bag, [], [{ item, quantity: n }], OPENING_CONTENT));
  const sim = own(new Simulation(snapshot.definition, { snapshot }));
  for (const command of [
    { type: 'factory-place', equipment: 'wind-turbine', cell: { column: 5, row: 4 }, rotation: 0 },
    { type: 'factory-place', equipment: 'recycler', cell: { column: 4, row: 5 }, rotation: 0 },
    { type: 'factory-connect', from: 'building-2', to: 'building-1' },
    {
      type: 'factory-transfer',
      target: 'building-2',
      buffer: 'input',
      direction: 'load',
      item: 'scrap',
      quantity: 32,
    },
  ] satisfies WorldCommand[]) {
    const outcome = sim.step(still, [command]).commandResults[0];
    assert(
      outcome.accepted,
      JSON.stringify({ command, outcome, position: sim.view.player.position }),
    );
  }
  return sim;
}

test('real worker capture, bounded details, native collision and durable continuation retain pending random jobs', () => {
  const a = realFactory();
  run(a, 3);
  const snapshot = a.capture(),
    saved = preparePlayerSave(durableWorld(snapshot));
  assert.deepEqual(saved, snapshot);
  const b = own(new Simulation(saved.definition, { snapshot: saved }));
  for (let n = 0; n < 500; n++) {
    a.step(still);
    b.step(still);
  }
  assert.deepEqual(a.capture(), b.capture());
  const cache = new PresentationCache();
  cache.apply(a.publish(new Set(['building-2']), true), 1);
  assert(cache.detail('building-2')!.entity.machine);
  assert(cache.read().factory!.connections.length === 1);
  assert.equal(cache.read().buildings.length, 2);
});

test('factory save validation rejects altered random results, duplicate graph edges and component ownership', () => {
  const sim = realFactory();
  run(sim, 1);
  const snapshot = sim.capture();
  const corrupt = structuredClone(snapshot);
  corrupt.entities.find((e) => e.machine?.job)!.machine!.job!.outputs[0].quantity += 1;
  assert.throws(() => preparePlayerSave(corrupt));
  const duplicate = structuredClone(snapshot);
  duplicate.resources.factory!.connections.push({
    ...duplicate.resources.factory!.connections[0],
    id: 'connection:50',
  });
  assert.throws(() => preparePlayerSave(duplicate));
  const missing = structuredClone(snapshot);
  delete missing.entities.find((e) => e.machine)!.machine;
  assert.throws(() => preparePlayerSave(missing));
});

test('known M5 saves upgrade detached and reject invented new equipment in the historical namespace', () => {
  const sim = own(new Simulation(worldFixture())),
    snapshot = sim.capture();
  snapshot.contentVersion = 'research-1';
  delete snapshot.resources.factory;
  const before = structuredClone(snapshot),
    upgraded = preparePlayerSave(durableWorld(snapshot));
  assert.equal(upgraded.contentVersion, OPENING_CONTENT.version);
  assert.deepEqual(snapshot, before);
  assert.deepEqual(upgraded.physics, snapshot.physics);
  snapshot.entities.find((e) => e.inventory)!.inventory!.slots[0] = {
    item: 'recycler',
    quantity: 1,
  };
  assert.throws(() => preparePlayerSave(snapshot));
});

test('blocked manufactured output retains its result and history through the durable save boundary', () => {
  const initial = realFactory(),
    snapshot = initial.capture(),
    recycler = snapshot.entities.find((e) => e.building?.buildingId === 'recycler')!;
  recycler.machine!.output.slots = recycler.machine!.output.slots.map(() => ({
    item: 'wire',
    quantity: 100,
  }));
  const a = own(new Simulation(snapshot.definition, { snapshot }));
  run(a, 9);
  const saved = preparePlayerSave(durableWorld(a.capture())),
    pending = saved.entities.find((e) => e.id === recycler.id)!.machine!.job!;
  assert.equal(pending.remaining, 0);
  assert.equal(pending.outputCommitted, true);
  const history = structuredClone(saved.resources.productionTotals),
    b = own(new Simulation(saved.definition, { snapshot: saved }));
  for (let n = 0; n < 40; n++) {
    a.step(still);
    b.step(still);
  }
  assert.deepEqual(a.capture(), b.capture());
  assert.deepEqual(b.capture().resources.productionTotals, history);
  const dismantle = { type: 'factory-dismantle', target: recycler.id } as const;
  assert(b.step(still, [dismantle]).commandResults[0].accepted);
  assert.deepEqual(b.capture().resources.productionTotals, history);
  durableWorld(b.capture());
});

test('factory worker input rejects invalid quantities, equipment and cells before touching state', () => {
  assert(
    !validWorldCommand({
      type: 'factory-place',
      equipment: 'coal',
      cell: { column: 0, row: 0 },
      rotation: 0,
    }),
  );
  assert(
    !validWorldCommand({
      type: 'factory-transfer',
      target: 'building:1',
      buffer: 'input',
      direction: 'load',
      item: 'scrap',
      quantity: NaN,
    }),
  );
  assert(
    !validWorldCommand({
      type: 'factory-transfer',
      target: 'building:1',
      buffer: 'input',
      direction: 'load',
      item: 'scrap',
      quantity: -1,
    }),
  );
});

test('extractor placement requires its live deposit and claims it atomically without charging rejected duplicates', () => {
  const f = fixture([]);
  f.give('extractor', 2);
  f.give('solar-panel', 1);
  f.player.transform!.position = { x: -1, y: 0, z: 1 };
  assert.equal(
    f.factory.command({
      type: 'factory-place',
      equipment: 'extractor',
      cell: { column: 4, row: 4 },
      rotation: 0,
    }).reason,
    'unavailable',
  );
  assert.equal(quantity(f.player.inventory!, 'extractor'), 2);
  const command = {
    type: 'factory-place',
    equipment: 'extractor',
    cell: { column: 3, row: 5 },
    rotation: 0,
  } as const;
  assert(f.factory.command(command).accepted);
  assert.equal(f.machines[0].machine!.deposit, 'scrap');
  assert.equal(f.factory.command(command).reason, 'occupied');
  assert.equal(quantity(f.player.inventory!, 'extractor'), 1);
  assert.equal(f.factory.command({ ...command, equipment: 'solar-panel' }).reason, 'occupied');
  assert.equal(quantity(f.player.inventory!, 'solar-panel'), 1);
});

test('wire validation and full-bag disconnection preserve the graph and spend only accepted connection items', () => {
  const f = fixture(['wind-turbine', 'recycler']);
  f.give('power-connection', 2);
  const from = f.machines[0].id,
    to = f.machines[1].id;
  assert.equal(f.factory.command({ type: 'factory-connect', from, to: from }).accepted, false);
  assert(f.factory.command({ type: 'factory-connect', from, to }).accepted);
  assert.equal(quantity(f.player.inventory!, 'power-connection'), 1);
  f.player.transform!.position = { x: 2, y: 0, z: 3 };
  assert.equal(f.factory.command({ type: 'factory-connect', from: to, to: from }).reason, 'busy');
  assert.equal(quantity(f.player.inventory!, 'power-connection'), 1);
  const connection = f.resources.factory!.connections[0].id;
  f.player.inventory!.slots = f.player.inventory!.slots.map(() => ({
    item: 'prybar',
    quantity: 1,
  }));
  assert.equal(f.factory.command({ type: 'factory-disconnect', connection }).reason, 'capacity');
  assert.equal(f.resources.factory!.connections.length, 1);
  f.player.inventory!.slots = f.player.inventory!.slots.map(() => null);
  assert(f.factory.command({ type: 'factory-disconnect', connection }).accepted);
  assert.equal(quantity(f.player.inventory!, 'scrap'), 4);
});

test('every machine recovers its complete paid solid value once, including space freed by placement', () => {
  const kinds: readonly MachineKind[] = [
    'solar-panel',
    'wind-turbine',
    'recycler',
    'basic-fabricator',
    'medium-fabricator',
    'extractor',
    'laboratory',
  ];
  for (const equipment of kinds) {
    const f = fixture([]);
    f.player.transform!.position = { x: -1, y: 0, z: 1 };
    f.player.inventory!.slots = f.player.inventory!.slots.map(() => ({
      item: 'prybar',
      quantity: 1,
    }));
    f.player.inventory!.slots[0] = { item: equipment, quantity: 1 };
    const cell = equipment === 'extractor' ? { column: 3, row: 5 } : { column: 4, row: 4 };
    assert(f.factory.command({ type: 'factory-place', equipment, cell, rotation: 0 }).accepted);
    assert.equal(f.player.inventory!.slots[0], null);
    const target = f.machines[0].id;
    assert(f.factory.command({ type: 'factory-dismantle', target }).accepted);
    assert.equal(
      quantity(f.player.inventory!, 'scrap'),
      OPENING_CONTENT.items[equipment].solidValue,
    );
    assert.equal(f.factory.command({ type: 'factory-dismantle', target }).accepted, false);
    assert.deepEqual(f.resources.productionTotals, {});
  }
});

test('finished blocked output is credited in its bounded pending buffer once, survives waiting and recovers without extra history', () => {
  const f = fixture(['wind-turbine', 'recycler']);
  f.connect();
  f.feed(1, 'scrap', 8);
  const machine = f.machines[1].machine!;
  machine.output.slots = machine.output.slots.map(() => ({ item: 'wire', quantity: 100 }));
  f.tick(161);
  assert.equal(machine.job!.remaining, 0);
  assert.equal(machine.job!.outputCommitted, true);
  const history = structuredClone(f.resources.productionTotals),
    output = structuredClone(machine.job!.outputs);
  f.tick(100);
  assert.equal(machine.requested, 0);
  assert.equal(machine.status, 'blocked');
  assert.deepEqual(f.resources.productionTotals, history);
  f.player.transform!.position = { ...f.machines[1].building!.position };
  assert(f.factory.command({ type: 'factory-dismantle', target: f.machines[1].id }).accepted);
  assert.deepEqual(f.resources.productionTotals, history);
  for (const s of output)
    if (s.item !== 'wire')
      assert.equal(
        quantity(f.player.inventory!, s.item),
        s.quantity + (s.item === 'scrap' ? OPENING_CONTENT.items.recycler.solidValue + 4 : 0),
      );
});

test('simultaneous native factory jobs, extraction and partial shared lab work continue identically after durable restore', async () => {
  const { rebuildPhysics } = await import('../../tools/testing/rebuild-physics');
  const initial = own(new Simulation(worldFixture())),
    snapshot = initial.capture();
  for (const t of OPENING_TECHNOLOGIES.filter((t) => t.id !== 'sorting-logistics'))
    snapshot.resources.research[t.id] = {
      consumed: Object.fromEntries(t.costs.map((c) => [c.item, c.quantity])),
      work: t.seconds,
      unlocked: true,
    };
  snapshot.resources.nextEntityId = 100;
  snapshot.resources.tick = 2400; // Middle of the saved night: the turbine alone shares demand.
  snapshot.resources.productionTotals['research-kit'] = 4;
  const player = snapshot.entities.find((e) => e.kind === 'player')!;
  player.opening!.fieldEnabled = false;
  const placements = [
    ['wind-turbine', -1, -1],
    ['solar-panel', -5, -1],
    ['extractor', -3, 1],
    ['recycler', -1, 3],
    ['basic-fabricator', 1, 3],
    ['medium-fabricator', 3, 3],
    ['laboratory', 5, 3],
    ['laboratory', 7, 3],
  ] as const;
  placements.forEach(([kind, x, z], i) => {
    const id = `building-${i + 1}`,
      position = { x, y: 0, z },
      machine = newMachine(kind, id, kind === 'extractor' ? 'scrap' : null);
    if (kind === 'recycler')
      transact(machine.input, [], [{ item: 'scrap', quantity: 80 }], OPENING_CONTENT);
    if (kind === 'basic-fabricator') {
      machine.recipe = 'mechanical-part';
      transact(machine.input, [], [{ item: 'plate', quantity: 20 }], OPENING_CONTENT);
    }
    if (kind === 'medium-fabricator') {
      machine.recipe = 'basic-research-kit';
      transact(
        machine.input,
        [],
        [
          { item: 'mechanical-part', quantity: 10 },
          { item: 'electrical-part', quantity: 10 },
        ],
        OPENING_CONTENT,
      );
    }
    if (kind === 'laboratory')
      transact(machine.input, [], [{ item: 'research-kit', quantity: 2 }], OPENING_CONTENT);
    snapshot.entities.push({
      id,
      kind: 'building',
      transform: { position, facing: 0, moving: false, sprinting: false },
      building: {
        id,
        buildingId: kind,
        position,
        cell: { column: (x + 9) / 2, row: (z + 9) / 2 },
        rotation: 0,
        footprint: { width: 1, depth: 1 },
        collision: { shape: 'box', width: 1.2, depth: 1.2, height: 1.5 },
      },
      machine,
    });
    if (i)
      snapshot.resources.factory!.connections.push({
        id: `connection-${i + 20}`,
        from: 'building-1',
        to: id,
      });
  });
  rebuildPhysics(snapshot);
  const a = own(new Simulation(snapshot.definition, { snapshot }));
  run(a, 6.5);
  a.step(still, [{ type: 'research-queue', action: 'add', technology: 'sorting-logistics' }]);
  run(a, 0.5);
  const saved = preparePlayerSave(a.capture());
  assert.equal(a.view.factory!.daylight, 0);
  assert(
    saved.entities.find((e) => e.building?.buildingId === 'recycler')!.machine!.allocated < 120,
  );
  assert(saved.resources.research['sorting-logistics'].work > 0);
  assert(!saved.resources.research['sorting-logistics'].unlocked);
  assert.equal(saved.entities.filter((e) => e.machine?.job).length, 4);
  const b = own(new Simulation(saved.definition, { snapshot: saved }));
  for (let i = 0; i < 600; i++) {
    a.step(still);
    b.step(still);
  }
  assert.deepEqual(a.capture(), b.capture());
  assert(a.view.research.includes('sorting-logistics'));
});

test('manual salvage wins the final scrap unit before an extractor commits in the same native tick', async () => {
  const { rebuildPhysics } = await import('../../tools/testing/rebuild-physics');
  const initial = own(new Simulation(worldFixture())),
    snapshot = initial.capture(),
    player = snapshot.entities.find((e) => e.kind === 'player')!,
    deposit = snapshot.entities.find((e) => e.id === 'scrap')!;
  for (const t of OPENING_TECHNOLOGIES)
    snapshot.resources.research[t.id] = {
      consumed: Object.fromEntries(t.costs.map((c) => [c.item, c.quantity])),
      work: t.seconds,
      unlocked: true,
    };
  snapshot.resources.nextEntityId = 10;
  deposit.deposit!.quantity = 1;
  player.transform!.position = { x: -1, y: 0, z: 1 };
  player.opening!.fieldEnabled = false;
  player.opening!.salvage = { target: deposit.id, remaining: 0.05 };
  const position = { ...deposit.transform!.position },
    machine = newMachine('extractor', 'building-1', deposit.id);
  machine.job = {
    recipe: 'extract-scrap',
    remaining: 0,
    inputs: [],
    outputs: [{ item: 'scrap', quantity: 1 }],
    outputCommitted: false,
  };
  snapshot.entities.push({
    id: 'building-1',
    kind: 'building',
    transform: { position: { ...position }, facing: 0, moving: false, sprinting: false },
    building: {
      id: 'building-1',
      buildingId: 'extractor',
      position,
      cell: { column: 3, row: 5 },
      rotation: 0,
      footprint: { width: 1, depth: 1 },
      collision: { shape: 'box', width: 1.2, depth: 1.2, height: 1.5 },
    },
    machine,
  });
  rebuildPhysics(snapshot);
  const sim = own(new Simulation(snapshot.definition, { snapshot }));
  sim.step(still);
  const after = sim.capture();
  assert.equal(after.entities.find((e) => e.id === 'scrap')!.deposit!.quantity, 0);
  assert.equal(after.resources.extractionTotals['scrap'], 1);
  assert.equal(quantity(after.entities.find((e) => e.inventory)!.inventory!, 'scrap'), 1);
  assert.equal(quantity(after.entities.find((e) => e.machine)!.machine!.output, 'scrap'), 0);
});
