import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import type { WorldDefinition, WorldCommand } from '../contracts/world';
import type { WorldResources } from '../contracts/simulation';
import type { MachineKind } from '../contracts/factory';
import {
  OPENING_CONTENT,
  OPENING_TECHNOLOGIES,
  validateOpeningCatalogue,
} from '../content/opening';
import { ENVIRONMENT_SETTINGS as settings, ENVIRONMENT_TECHNOLOGIES } from '../content/environment';
import { emptyInventory, transact } from './domain/inventory';
import { FactorySystem, newMachine, type FactoryContext } from './factory';
import { EnvironmentSystem } from './environment';
import type { SimulationEntity } from './opening-context';
import { newOpening } from './opening';
import { waterVolume, addWater, waterQuality, consumeWater, takeWater } from './water';
import { newWeather, advanceWeather, weatherFactors } from './weather';
import { restoreCells } from './restoration';
import { Simulation } from './ecs-runtime';
import { preparePlayerSave } from './player-save';
import { decodeSave } from '../persistence/save-codec';

const still = { x: 0, z: 0, sprint: false };
const owned: Simulation[] = [];
afterEach(() => {
  for (const sim of owned.splice(0)) sim.dispose();
});

const own = (sim: Simulation) => {
  owned.push(sim);
  return sim;
};

test('authored coal retains its resource identity through salvage, extraction, presentation and native player saves', () => {
  const map = {
    ...definition(),
    deposits: [
      {
        id: 'coal-source',
        kind: 'coal' as const,
        quantity: 100,
        position: { x: 3, y: 0, z: 3 },
        rotation: 0 as const,
        footprint: { width: 1, depth: 1 },
        collision: { shape: 'cylinder' as const, radius: 0.25, height: 1 },
      },
    ],
  };
  const initial = own(new Simulation(map));
  assert.equal(initial.capture().entities.find((e) => e.deposit)!.deposit!.kind, 'coal');
  assert.equal(
    initial.publish(new Set(), true).mappings.find((e) => e.deposit)!.deposit!.kind,
    'coal',
  );
  initial.step(still, [{ type: 'salvage', target: 'coal-source' }]);
  for (let n = 0; n < 60; n++) initial.step(still);
  initial.step(still, [{ type: 'salvage', target: null }]);
  assert.equal(initial.view.inventory['coal'], 1);
  assert.equal(initial.view.productionTotals['coal'] ?? 0, 0);
  const snapshot = initial.capture();
  for (const t of OPENING_TECHNOLOGIES)
    snapshot.resources.research[t.id] = {
      unlocked: true,
      work: t.seconds,
      consumed: Object.fromEntries(t.costs.map((s) => [s.item, s.quantity])),
    };
  const player = snapshot.entities.find((e) => e.kind === 'player')!;
  player.inventory!.slots[1] = { item: 'extractor', quantity: 1 };
  player.inventory!.slots[2] = { item: 'wind-turbine', quantity: 1 };
  player.inventory!.slots[3] = { item: 'power-connection', quantity: 1 };
  const sim = own(new Simulation(snapshot.definition, { snapshot }));
  assert(
    sim
      .step(still, [
        { type: 'factory-place', equipment: 'extractor', cell: { column: 1, row: 1 }, rotation: 0 },
        {
          type: 'factory-place',
          equipment: 'wind-turbine',
          cell: { column: 0, row: 0 },
          rotation: 0,
        },
      ])
      .commandResults.every((r) => r.accepted),
  );
  const buildings = sim.view.buildings;
  sim.step(still, [
    {
      type: 'factory-connect',
      from: buildings.find((b) => b.buildingId === 'wind-turbine')!.id,
      to: buildings.find((b) => b.buildingId === 'extractor')!.id,
    },
  ]);
  for (let n = 0; n < 42; n++) sim.step(still);
  const saved = preparePlayerSave(sim.capture());
  assert.equal(saved.resources.extractionTotals['coal'], 5);
  assert.equal(saved.resources.productionTotals['coal'] ?? 0, 0);
  assert.equal(
    saved.entities.find((e) => e.machine?.deposit)!.machine!.output.slots[0]!.item,
    'coal',
  );
  const restored = own(new Simulation(saved.definition, { snapshot: saved }));
  assert.equal(restored.view.deposits[0].kind, 'coal');
  const invalid = structuredClone(saved);
  invalid.entities.find((e) => e.deposit)!.deposit!.kind = 'scrap';
  assert.throws(() => preparePlayerSave(invalid));
});

function definition(): WorldDefinition {
  const terrain = Array<string>(36).fill('soil');
  for (const i of [12, 13, 34, 35]) terrain[i] = 'water';
  return {
    version: 1,
    id: 'environment-fixture',
    grid: { origin: { x: 0, z: 0 }, columns: 6, rows: 6, metresPerCell: 2 },
    terrain,
    spawn: { x: 3, y: 0, z: 1 },
    deposits: [],
    blockers: [],
  };
}

test('paid connected pipes remain walkable and retain valid topology through native save restoration', () => {
  const initial = own(new Simulation(definition())),
    snapshot = initial.capture();
  for (const t of OPENING_TECHNOLOGIES) {
    snapshot.resources.research[t.id] = {
      unlocked: true,
      work: t.seconds,
      consumed: Object.fromEntries(t.costs.map((s) => [s.item, s.quantity])),
    };
    for (const s of t.eligibility) snapshot.resources.productionTotals[s.item] = 1000;
  }
  snapshot.entities.find((e) => e.kind === 'player')!.inventory!.slots[0] = {
    item: 'pipe',
    quantity: 2,
  };
  const sim = own(new Simulation(snapshot.definition, { snapshot }));
  assert(
    sim
      .step(still, [
        { type: 'factory-place', equipment: 'pipe', cell: { column: 2, row: 0 }, rotation: 0 },
        { type: 'factory-place', equipment: 'pipe', cell: { column: 2, row: 1 }, rotation: 0 },
      ])
      .commandResults.every((r) => r.accepted),
  );
  const a = sim.view.buildings.find((b) => b.cell.row === 0)!,
    b = sim.view.buildings.find((b) => b.cell.row === 1)!;
  assert.equal(sim.view.inventory['pipe'] ?? 0, 0);
  const link = sim.step(still, [
    { type: 'fluid-connect', from: a.id, output: 'front', to: b.id, input: 'back' },
  ]).commandResults[0];
  assert(
    link.accepted,
    JSON.stringify({ link, a: a.cell, b: b.cell, player: sim.view.player.position }),
  );
  for (let n = 0; n < 90; n++) sim.step({ x: 1, z: 0, sprint: false });
  assert(sim.view.player.position.x > 7, 'The native player passes through the pipe cell');
  const saved = preparePlayerSave(sim.capture()),
    restored = own(new Simulation(saved.definition, { snapshot: saved }));
  assert.equal(saved.resources.environment!.connections.length, 1);
  assert.deepEqual(restored.capture(), saved);
});

function fixture() {
  const world = definition(),
    resources: WorldResources = {
      worldId: world.id,
      playerId: 'player',
      tick: 0,
      stepSeconds: 0.05,
      nextEntityId: 100,
      research: {},
      productionTotals: {},
      extractionTotals: {},
      factory: { connections: [] },
    };
  for (const t of OPENING_TECHNOLOGIES)
    resources.research[t.id] = {
      unlocked: true,
      work: t.seconds,
      consumed: Object.fromEntries(t.costs.map((s) => [s.item, s.quantity])),
    };
  const player: SimulationEntity = {
    id: 'player',
    kind: 'player',
    slot: 0,
    generation: 0,
    dirty: 0,
    transform: { position: { ...world.spawn }, moving: false, sprinting: false, facing: 0 },
    inventory: emptyInventory(),
    opening: newOpening(),
    equipment: { tool: null },
  };
  const machines: SimulationEntity[] = [],
    entities = new Map([[player.id, player]]);
  const context: FactoryContext = {
    definition: world,
    resources,
    player,
    machines,
    piles: [],
    get: (id) => entities.get(id),
    mark: () => undefined,
    allocateId: (prefix) => `${prefix}:${resources.nextEntityId++}`,
    add: (data) => {
      const e = { ...data, slot: entities.size, generation: 0, dirty: 0 };
      entities.set(e.id, e);
      machines.push(e);
    },
    remove: (id) => {
      entities.delete(id);
      const i = machines.findIndex((e) => e.id === id);
      if (i >= 0) machines.splice(i, 1);
    },
    deposits: () => [],
  };
  const factory = new FactorySystem(context),
    environment = new EnvironmentSystem(context);

  const add = (kind: MachineKind, x: number, z: number) => {
    const id = `machine:${machines.length}`,
      position = { x: x * 2 + 1, y: 0, z: z * 2 + 1 };
    const entity: SimulationEntity = {
      id,
      kind: 'building',
      slot: machines.length + 1,
      generation: 0,
      dirty: 0,
      building: {
        id,
        buildingId: kind,
        position,
        cell: { column: x, row: z },
        rotation: 0,
        footprint: { width: 1, depth: 1 },
      },
      machine: newMachine(kind, id, null),
    };
    machines.push(entity);
    entities.set(id, entity);
    return entity;
  };

  const fill = (
    entity: SimulationEntity,
    volume: number,
    quality = 100,
    source = resources.environment!.sources[0],
  ) => {
    source.volume -= volume;
    source.extracted += volume;
    addWater(entity.machine!.utility!.water, [{ source: source.id, volume, quality }]);
  };

  const connect = (a: SimulationEntity, b: SimulationEntity) =>
    resources.factory!.connections.push({
      id: `power:${resources.nextEntityId++}`,
      from: a.id,
      to: b.id,
    });

  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) {
      factory.step(0.05);
      factory.finishStep(0.05);
      resources.tick++;
    }
  };

  return {
    world,
    resources,
    player,
    machines,
    context,
    factory,
    environment,
    add,
    fill,
    connect,
    tick,
  };
}

test('paid restoration catalogue is obtainable without coal and every assembly conserves solid value', () => {
  validateOpeningCatalogue();
  assert.equal(ENVIRONMENT_TECHNOLOGIES.length, 5);
  assert.deepEqual(ENVIRONMENT_TECHNOLOGIES.find((t) => t.id === 'greenhouse')!.requires, [
    'water-treatment',
    'storage',
  ]);
  assert.equal(
    ENVIRONMENT_TECHNOLOGIES.filter((t) =>
      ['storage', 'water-treatment', 'greenhouse'].includes(t.id),
    ).reduce((n, t) => n + t.costs[0].quantity, 0),
    18,
  );
  assert.equal(OPENING_CONTENT.items.coal.solidValue, 0);
});
test('frontier saturates nearby cells before spending excess farther out and health persists', () => {
  const health = [99, 0, 0];
  restoreCells(health, 3, [{ id: 'a', cell: 0, positive: 11, negative: 0 }]);
  assert.deepEqual(health, [100, 10, 0]);
  restoreCells(health, 3, []);
  assert.deepEqual(health, [100, 10, 0]);
  const ring = [0, 100, 99, 100, 100, 100, 100, 100, 100];
  restoreCells(ring, 3, [{ id: 'a', cell: 1, positive: 20, negative: 0 }]);
  assert.equal(ring[0], 19);
  assert.equal(ring[2], 100);
});
test('overlapping contributors share capped gaps without minting influence or depending on input order', () => {
  const input = [
      { id: 'a', cell: 1, positive: 8, negative: 0 },
      { id: 'b', cell: 1, positive: 2, negative: 0 },
    ],
    a = [0, 99, 0],
    b = [...a];
  restoreCells(a, 3, input);
  restoreCells(b, 3, [...input].reverse());
  assert.deepEqual(a, b);
  assert(Math.abs(a.reduce((n, h) => n + h, 0) - 109) < 1e-8);
  assert.equal(a[1], 100);
});
test('positive influence fully offsets local negative influence; clamping never creates pollution debt', () => {
  const health = [100];
  restoreCells(health, 1, [
    { id: 'coal', cell: 0, positive: 0, negative: 20 },
    { id: 'green', cell: 0, positive: 20, negative: 0 },
  ]);
  assert.equal(health[0], 100);
  restoreCells(health, 1, [{ id: 'coal', cell: 0, positive: 0, negative: 1000 }]);
  assert.equal(health[0], 0);
  restoreCells(health, 1, [{ id: 'green', cell: 0, positive: 5, negative: 0 }]);
  assert.equal(health[0], 5);
});
test('lake components, source fractions, quality and dismantling preserve exact multi-source ownership', () => {
  const f = fixture(),
    tank = f.add('water-tank', 2, 2),
    pipe = f.add('pipe', 3, 2);
  assert.equal(f.resources.environment!.sources.length, 2);
  f.fill(tank, 12, 20);
  f.fill(tank, 8, 100, f.resources.environment!.sources[1]);
  assert.equal(waterQuality(tank.machine!.utility!.water), 52);
  const consumed = consumeWater(f.resources.environment!.sources, tank.machine!.utility!.water, 5);
  assert.equal(waterVolume(consumed), 5);
  assert.equal(f.resources.environment!.sources[0].consumed, 3);
  assert.equal(f.resources.environment!.sources[1].consumed, 2);
  f.fill(pipe, 4, 75, f.resources.environment!.sources[1]);
  pipe.machine!.enabled = false;
  f.resources.environment!.connections.push({
    id: 'network',
    from: tank.id,
    to: pipe.id,
    output: 'right',
    input: 'left',
  });
  f.environment.detach(tank);
  assert.equal(waterVolume(tank.machine!.utility!.water), 0);
  assert.equal(waterVolume(pipe.machine!.utility!.water), 0);
  assert.equal(f.resources.environment!.sources[0].volume, 1997);
  assert.equal(f.resources.environment!.sources[1].volume, 1998);
});

test('mixing bounds quality pools and repeated microscopic splits preserve every positive litre', () => {
  const bypass: import('../contracts/environment').WaterBatch[] = [];
  addWater(bypass, [
    { source: 'lake', volume: 0.1, quality: 100 },
    { source: 'lake', volume: 0.2, quality: 100 },
  ]);
  assert.equal(
    bypass[0].quality,
    100,
    'Mixing clean water must not create a rounding-only treatment cost',
  );
  const pool: import('../contracts/environment').WaterBatch[] = [],
    received: import('../contracts/environment').WaterBatch[] = [];
  addWater(pool, [
    { source: 'lake', volume: 1, quality: 20 },
    { source: 'lake', volume: 1, quality: 80 },
    { source: 'lake', volume: 0.2, quality: 100 },
  ]);
  for (let n = 0; n < 1000; n++)
    addWater(pool, [{ source: 'lake', volume: 1e-12, quality: n % 100 }]);
  assert.equal(pool.length, 2, 'Clean bypass and mixed untreated pools stay separate');
  const volume = waterVolume(pool),
    quality = waterQuality(pool);
  for (let n = 0; n < 10000; n++) addWater(received, takeWater(pool, 1e-10));
  assert(Math.abs(waterVolume(received) - 1e-6) < 1e-12);
  assert(Math.abs(waterVolume(pool) + waterVolume(received) - volume) < 1e-10);
  addWater(pool, received);
  assert.equal(pool.length, 2);
  assert(Math.abs(waterQuality(pool) - quality) < 1e-9);
});
test('rain-led refill reserves outstanding return space, clamps capacity and has a slow clear-weather floor', () => {
  const f = fixture(),
    tank = f.add('water-tank', 2, 2),
    source = f.resources.environment!.sources[0];
  f.fill(tank, 100);
  f.environment.begin(1);
  assert.equal(source.volume, 1900);
  consumeWater(f.resources.environment!.sources, tank.machine!.utility!.water, 10);
  f.environment.begin(1);
  assert(Math.abs(source.volume - 1900.02) < 1e-8);
  f.resources.environment!.weather.kind = 'rain';
  f.resources.environment!.weather.endTick = 100;
  f.environment.begin(1);
  assert(Math.abs(source.volume - 1902.02) < 1e-8);
  f.environment.detach(tank);
  assert(source.volume <= 2000);
  assert(Math.abs(source.volume - 1992.02) < 1e-8);
});
test('clean water bypasses treatment without power; dirty water waits for actual allocated work', () => {
  const f = fixture(),
    treatment = f.add('water-treatment', 2, 2);
  f.fill(treatment, 4, 100);
  f.environment.begin(1);
  assert.equal(waterVolume(treatment.machine!.utility!.clean), 4);
  assert.equal(f.environment.demand(treatment), 0);
  f.fill(treatment, 4, 0);
  f.environment.begin(1);
  assert.equal(waterVolume(treatment.machine!.utility!.water), 4);
  f.environment.begin(1);
  assert.equal(f.environment.work(treatment, 1), 160);
  assert.equal(waterVolume(treatment.machine!.utility!.clean), 8);
});
test.each([
  { bypass: 0.1, charge: 4, quality: 0, treated: 0.1, spent: 4 },
  { bypass: 0.15, charge: 4, quality: 0, treated: 0.05, spent: 2 },
  { bypass: 0.05, charge: 2, quality: 0, treated: 0.05, spent: 2 },
  { bypass: 0.1, charge: 2, quality: 50, treated: 0.1, spent: 2 },
  { bypass: 0.2, charge: 4, quality: 0, treated: 0, spent: 0 },
  { bypass: 0.1, charge: 0, quality: 0, treated: 0, spent: 0 },
])(
  'mixed treatment with $bypass L bypass, $charge J available and quality $quality treats $treated L',
  ({ bypass, charge, quality, treated, spent }) => {
    const f = fixture(),
      treatment = f.add('water-treatment', 2, 2),
      battery = f.add('battery', 3, 2);
    f.fill(treatment, bypass, 100);
    f.fill(treatment, 1, quality);
    f.connect(treatment, battery);
    battery.machine!.utility!.charge = charge;

    f.tick();

    const data = treatment.machine!.utility!;
    assert(Math.abs(waterVolume(data.clean) - bypass - treated) < 1e-8);
    assert(Math.abs(waterVolume(data.water) - (1 - treated)) < 1e-8);
    assert(Math.abs(battery.machine!.utility!.charge - (charge - spent)) < 1e-8);
    assert(Math.abs(f.factory.summary().used * 0.05 - spent) < 1e-8);
    assert(data.clean.every((batch) => batch.quality === 100));
    assert(Math.abs(waterVolume(data.clean) + waterVolume(data.water) - (1 + bypass)) < 1e-8);
    assert.equal(f.resources.environment!.sources[0].consumed, 0);
  },
);

test('returning improved water restores lake health without rewarding unchanged circulating water', () => {
  const f = fixture(),
    tank = f.add('water-tank', 2, 2),
    source = f.resources.environment!.sources[0];
  f.fill(tank, 2, 0);
  f.environment.returnWater(tank.machine!.utility!.water, 2, true);
  assert.equal(f.resources.environment!.health[source.cells[0]], 0);
  f.fill(tank, 2, 100);
  f.environment.returnWater(tank.machine!.utility!.water, 2, true);
  assert.equal(f.resources.environment!.health[source.cells[0]], 4);
  assert.equal(source.volume, 2000);
});
test('pipes equalize without pressure, overflow waits for normal capacity, and full systems back up', () => {
  const f = fixture(),
    junction = f.add('pipe-junction', 2, 2),
    normal = f.add('water-tank', 2, 3),
    overflow = f.add('water-tank', 3, 2);
  f.fill(junction, 12);
  junction.machine!.utility!.overflow = 'east';
  f.resources.environment!.connections = [
    { id: 'n', from: junction.id, to: normal.id, output: 'front', input: 'back' },
    { id: 'e', from: junction.id, to: overflow.id, output: 'right', input: 'left' },
  ];
  f.environment.begin(1);
  assert.equal(waterVolume(normal.machine!.utility!.water), 8);
  assert.equal(waterVolume(overflow.machine!.utility!.water), 0);
  f.fill(normal, 192);
  f.environment.begin(1);
  assert.equal(waterVolume(overflow.machine!.utility!.water), 4);
  const a = f.add('pipe', 0, 4),
    b = f.add('pipe', 1, 4);
  f.fill(a, 12);
  f.resources.environment!.connections.push({
    id: 'pipe',
    from: a.id,
    to: b.id,
    output: 'right',
    input: 'left',
  });
  f.environment.begin(0.05);
  assert.equal(waterVolume(a.machine!.utility!.water), 6);
  assert.equal(waterVolume(b.machine!.utility!.water), 6);
  const pump = f.add('water-pump', 0, 1),
    solar = f.add('solar-panel', 0, 0);
  f.connect(pump, solar);
  f.fill(pump, 12);
  f.tick();
  assert.equal(pump.machine!.status, 'blocked');
  assert.equal(pump.machine!.requested, 0);
  consumeWater(f.resources.environment!.sources, pump.machine!.utility!.water, 0.1);
  f.tick();
  assert.equal(pump.machine!.status, 'working');
  assert(Math.abs(waterVolume(pump.machine!.utility!.water) - 12) < 1e-8);
});
test('seeded weather forecast, event boundaries and renewable floors continue identically after copy', () => {
  const weather = newWeather(),
    copy = structuredClone(weather);
  for (let tick = 0; tick < 15000; tick++) {
    advanceWeather(weather, tick);
    advanceWeather(copy, tick);
    assert.deepEqual(weather, copy);
  }
  const clear = { ...newWeather(), kind: 'clear' as const };
  assert.equal(weatherFactors(clear, 0).windScale, 1);
  const rain = { ...newWeather(), kind: 'rain' as const, endTick: 1000 };
  assert.equal(weatherFactors(rain, 0).windScale, 1.5);
  assert.equal(weatherFactors(rain, 0).daylight, 0.4);
  const calm = { ...newWeather(), kind: 'dunkelflaute' as const, endTick: 1000 };
  assert.equal(weatherFactors(calm, 0).windScale, 0.05);
});
test('battery charging is bounded, lossy and discharges into actual supplied work only', () => {
  const f = fixture(),
    solar = f.add('solar-panel', 2, 0),
    battery = f.add('battery', 3, 0),
    scrubber = f.add('air-scrubber', 4, 0);
  f.connect(solar, battery);
  f.connect(battery, scrubber);
  f.tick(20);
  const charge = battery.machine!.utility!.charge;
  assert(charge > 0 && charge < 600 * settings.batteryEfficiency);
  assert(f.factory.summary().used > 0);
  f.resources.tick = 2400;
  solar.machine!.enabled = false;
  f.tick(20);
  assert(battery.machine!.utility!.charge < charge);
  assert(f.resources.environment!.health.some((h) => h > 0));
  battery.machine!.utility!.charge = settings.batteryJoules;
  f.tick(100);
  assert(battery.machine!.utility!.charge <= settings.batteryJoules);
});
test('coal ramps, supplies storage, needs water/fuel and raw water causes higher actual emissions', () => {
  const measure = (quality: number) => {
    const f = fixture(),
      coal = f.add('coal-generator', 2, 0),
      battery = f.add('battery', 3, 0);
    f.connect(coal, battery);
    f.fill(coal, 24, quality);
    assert(transact(coal.machine!.input, [], [{ item: 'coal', quantity: 2 }], OPENING_CONTENT));
    f.resources.tick = 2400;
    f.tick(10);
    assert.equal(coal.machine!.utility!.phase, 'starting');
    assert(
      coal.machine!.utility!.generated > 0 && coal.machine!.utility!.generated < settings.coalWatts,
    );
    assert(battery.machine!.utility!.charge > 0);
    assert(coal.machine!.utility!.fuelEnergy > 0);
    return (
      f.resources.environment!.health.reduce((n, h) => n + h, 0) + coal.machine!.utility!.negative
    );
  };

  assert(measure(0) > measure(100));
  const f = fixture(),
    coal = f.add('coal-generator', 2, 0),
    scrubber = f.add('air-scrubber', 3, 0);
  f.connect(coal, scrubber);
  f.tick(30);
  assert.equal(coal.machine!.utility!.generated, 0);
});
test('checkpoint latches once, allows later decline, and influence updates only at its cadence', () => {
  const f = fixture(),
    scrubber = f.add('air-scrubber', 1, 1);
  f.resources.environment!.health.fill(100);
  f.resources.environment!.health[0] = 99;
  scrubber.machine!.utility!.positive = 1;
  f.environment.finish();
  assert.equal(f.resources.environment!.completed, false);
  f.resources.tick = 19;
  f.environment.finish();
  assert.equal(f.resources.environment!.completed, true);
  f.resources.environment!.health[0] = 0;
  f.resources.tick = 39;
  f.environment.finish();
  assert.equal(f.resources.environment!.completed, true);
  assert.equal(f.resources.environment!.completedTick, 20);
});

test.each([false, true])(
  'junctions redistribute small branch gaps repeatedly, reversed connections: %s',
  (reverse) => {
    const f = fixture(),
      junction = f.add('pipe-junction', 3, 3),
      north = f.add('greenhouse', 3, 4),
      east = f.add('greenhouse', 4, 3),
      treatment = f.add('water-treatment', 3, 2);
    treatment.building!.rotation = 1;
    f.fill(junction, 12);
    f.fill(north, 11.99);
    f.fill(east, 11.99);
    f.resources.environment!.connections = [
      { id: 'north', from: junction.id, to: north.id, output: 'front', input: 'back' },
      { id: 'east', from: junction.id, to: east.id, output: 'right', input: 'left' },
      { id: 'south', from: junction.id, to: treatment.id, output: 'back', input: 'left' },
    ];
    if (reverse) f.resources.environment!.connections.reverse();

    for (let tick = 1; tick <= 20; tick++) {
      f.environment.begin(0.05);
      const data = treatment.machine!.utility!;
      assert(Math.abs(waterVolume(data.water) + waterVolume(data.clean) - 0.38 * tick) < 1e-8);
      assert(Math.abs(waterVolume(north.machine!.utility!.water) - 12) < 1e-8);
      assert(Math.abs(waterVolume(east.machine!.utility!.water) - 12) < 1e-8);
      assert(Math.abs(waterVolume(junction.machine!.utility!.water) - (12 - 0.4 * tick)) < 1e-8);
      for (const greenhouse of [north, east])
        consumeWater(f.resources.environment!.sources, greenhouse.machine!.utility!.water, 0.01);
    }
  },
);

test.each([false, true])(
  'competing junctions share receiving capacity and redistribute the remainder, reversed connections: %s',
  (reverse) => {
    const f = fixture(),
      a = f.add('pipe-junction', 1, 3),
      b = f.add('pipe-junction', 3, 3),
      shared = f.add('water-tank', 2, 3),
      fallbackA = f.add('water-tank', 1, 4),
      fallbackB = f.add('water-tank', 3, 4),
      next = f.add('water-tank', 1, 5);
    f.fill(a, 6, 25);
    f.fill(a, 6, 100, f.resources.environment!.sources[1]);
    f.fill(b, 12, 100);
    f.fill(shared, 199.9);
    f.resources.environment!.connections = [
      { id: 'a-shared', from: a.id, to: shared.id, output: 'right', input: 'left' },
      { id: 'a-fallback', from: a.id, to: fallbackA.id, output: 'front', input: 'back' },
      { id: 'b-shared', from: b.id, to: shared.id, output: 'left', input: 'right' },
      { id: 'b-fallback', from: b.id, to: fallbackB.id, output: 'front', input: 'back' },
      { id: 'next', from: fallbackA.id, to: next.id, output: 'front', input: 'back' },
    ];
    if (reverse) f.resources.environment!.connections.reverse();

    f.environment.begin(0.05);

    assert(Math.abs(waterVolume(shared.machine!.utility!.water) - 200) < 1e-8);
    for (const fallback of [fallbackA, fallbackB])
      assert(Math.abs(waterVolume(fallback.machine!.utility!.water) - 0.35) < 1e-8);
    assert(Math.abs(waterQuality(fallbackA.machine!.utility!.water) - 62.5) < 1e-8);
    assert.equal(
      waterVolume(next.machine!.utility!.water),
      0,
      'New arrivals cannot cross a second edge',
    );
    for (const source of f.resources.environment!.sources) {
      const buffered = f.machines.reduce(
        (n, e) =>
          n + waterVolume(e.machine!.utility!.water.filter((batch) => batch.source === source.id)),
        0,
      );
      assert(Math.abs(buffered - (source.extracted - source.consumed - source.returned)) < 1e-8);
    }
  },
);

test.each([1e-12, 0.1, 0.6])(
  'ordinary mixed-quality routes conserve source pools with %s L clean water',
  (clean) => {
    const f = fixture(),
      junction = f.add('pipe-junction', 2, 2),
      greenhouse = f.add('greenhouse', 2, 3),
      tank = f.add('water-tank', 3, 2);
    f.fill(junction, 12 - clean, 0);
    f.fill(junction, clean, 100, f.resources.environment!.sources[1]);
    f.resources.environment!.connections = [
      { id: 'normal', from: junction.id, to: greenhouse.id, output: 'front', input: 'back' },
      { id: 'tank', from: junction.id, to: tank.id, output: 'right', input: 'left' },
    ];

    f.environment.begin(0.05);

    assert.equal(waterQuality(greenhouse.machine!.utility!.water), 100);
    assert(waterVolume(greenhouse.machine!.utility!.water) > 0);
    assert(
      Math.abs(
        waterVolume(greenhouse.machine!.utility!.water) +
          waterVolume(tank.machine!.utility!.water) -
          0.4,
      ) < 1e-8,
    );
    for (const source of f.resources.environment!.sources) {
      const buffered = f.machines.reduce(
        (n, e) =>
          n + waterVolume(e.machine!.utility!.water.filter((batch) => batch.source === source.id)),
        0,
      );
      assert(Math.abs(buffered - source.extracted) <= source.extracted * 1e-10);
    }
  },
);

test('source-limited junctions redistribute without duplicating the remaining water', () => {
  const f = fixture(),
    junction = f.add('pipe-junction', 2, 2),
    nearlyFull = f.add('water-tank', 2, 3),
    empty = f.add('water-tank', 3, 2);
  f.fill(junction, 0.25);
  f.fill(nearlyFull, 199.99);
  f.resources.environment!.connections = [
    { id: 'small-gap', from: junction.id, to: nearlyFull.id, output: 'front', input: 'back' },
    { id: 'space', from: junction.id, to: empty.id, output: 'right', input: 'left' },
  ];

  f.environment.begin(0.05);

  assert.equal(waterVolume(junction.machine!.utility!.water), 0);
  assert(Math.abs(waterVolume(nearlyFull.machine!.utility!.water) - 200) < 1e-8);
  assert(Math.abs(waterVolume(empty.machine!.utility!.water) - 0.24) < 1e-8);
});

test('overflow serves the remainder after filling a small normal gap in the same phase', () => {
  const f = fixture(),
    junction = f.add('pipe-junction', 2, 2),
    normal = f.add('water-tank', 2, 3),
    overflow = f.add('water-tank', 3, 2);
  f.fill(junction, 12);
  f.fill(normal, 199.9);
  junction.machine!.utility!.overflow = 'east';
  f.resources.environment!.connections = [
    { id: 'normal', from: junction.id, to: normal.id, output: 'front', input: 'back' },
    { id: 'overflow', from: junction.id, to: overflow.id, output: 'right', input: 'left' },
  ];
  f.environment.begin(0.05);
  assert(Math.abs(waterVolume(normal.machine!.utility!.water) - 200) < 1e-8);
  assert(Math.abs(waterVolume(overflow.machine!.utility!.water) - 0.3) < 1e-8);
});

test.each([
  { quality: 0, throughPipe: false },
  { quality: 0, throughPipe: true },
  { quality: 100, throughPipe: false },
  { quality: 100, throughPipe: true },
])(
  'overflow respects greenhouse eligibility at quality $quality through a full pipe: $throughPipe',
  ({ quality, throughPipe }) => {
    const f = fixture(),
      junction = f.add('pipe-junction', 2, 2),
      greenhouse = f.add('greenhouse', 2, throughPipe ? 4 : 3),
      overflow = f.add('water-treatment', 3, 2),
      pipe = throughPipe ? f.add('pipe', 2, 3) : null;
    f.fill(junction, 12, quality);
    junction.machine!.utility!.overflow = 'east';
    f.resources.environment!.connections = [
      {
        id: 'normal',
        from: junction.id,
        to: pipe?.id ?? greenhouse.id,
        output: 'front',
        input: 'back',
      },
      { id: 'overflow', from: junction.id, to: overflow.id, output: 'right', input: 'left' },
    ];
    if (pipe) {
      f.fill(pipe, 12, quality);
      f.resources.environment!.connections.push({
        id: 'pipe-out',
        from: pipe.id,
        to: greenhouse.id,
        output: 'front',
        input: 'back',
      });
    }

    f.environment.begin(0.05);

    const normalVolume = waterVolume(greenhouse.machine!.utility!.water),
      overflowVolume = waterVolume(overflow.machine!.utility!.water);
    assert(Math.abs(normalVolume - (quality === 100 ? 0.4 : 0)) < 1e-8);
    assert(Math.abs(overflowVolume - (quality === 100 ? 0 : 0.4)) < 1e-8);
    const buffered = f.machines.reduce(
        (n, e) =>
          n + waterVolume(e.machine!.utility!.water) + waterVolume(e.machine!.utility!.clean),
        0,
      ),
      source = f.resources.environment!.sources[0];
    assert(Math.abs(buffered - (source.extracted - source.consumed - source.returned)) < 1e-8);
  },
);

test('a junction sends residual dirty water to overflow after reserving clean water for a greenhouse', () => {
  const f = fixture(),
    junction = f.add('pipe-junction', 2, 2),
    greenhouse = f.add('greenhouse', 2, 3),
    overflow = f.add('water-treatment', 3, 2);
  f.fill(junction, 0.1, 100);
  f.fill(junction, 0.4, 0);
  junction.machine!.utility!.overflow = 'east';
  f.resources.environment!.connections = [
    { id: 'normal', from: junction.id, to: greenhouse.id, output: 'front', input: 'back' },
    { id: 'overflow', from: junction.id, to: overflow.id, output: 'right', input: 'left' },
  ];

  f.environment.begin(0.05);

  assert(Math.abs(waterVolume(greenhouse.machine!.utility!.water) - 0.1) < 1e-8);
  assert.equal(waterQuality(greenhouse.machine!.utility!.water), 100);
  assert(Math.abs(waterVolume(overflow.machine!.utility!.water) - 0.3) < 1e-8);
  assert.equal(waterQuality(overflow.machine!.utility!.water), 0);
  assert(Math.abs(waterVolume(junction.machine!.utility!.water) - 0.1) < 1e-8);
});

test('reachable treatment keeps normal priority when it can clean water for a downstream greenhouse', () => {
  const f = fixture(),
    junction = f.add('pipe-junction', 2, 2),
    treatment = f.add('water-treatment', 2, 3),
    greenhouse = f.add('greenhouse', 2, 4),
    overflow = f.add('water-tank', 3, 2);
  f.fill(junction, 12, 0);
  f.fill(treatment, 24, 0);
  junction.machine!.utility!.overflow = 'east';
  f.resources.environment!.connections = [
    { id: 'normal', from: junction.id, to: treatment.id, output: 'front', input: 'back' },
    { id: 'treated', from: treatment.id, to: greenhouse.id, output: 'front', input: 'back' },
    { id: 'overflow', from: junction.id, to: overflow.id, output: 'right', input: 'left' },
  ];

  f.environment.begin(0.05);

  assert.equal(waterVolume(overflow.machine!.utility!.water), 0);
  assert.equal(waterVolume(junction.machine!.utility!.water), 12);
});

test('a shoreline return improves the receiving lake and records conservative cross-source transfers', () => {
  const f = fixture(),
    tank = f.add('water-tank', 2, 2),
    sink = f.add('water-tank', 3, 2),
    [a, b] = f.resources.environment!.sources;
  f.fill(tank, 10, 100, a);
  f.fill(sink, 10, 0, b);
  consumeWater(f.resources.environment!.sources, sink.machine!.utility!.water, 10);
  f.environment.returnWater(tank.machine!.utility!.water, 10, true, b.id);
  assert.equal(a.volume, 1990);
  assert.equal(a.returned, 10);
  assert.equal(a.transferredOut, 10);
  assert.equal(b.volume, 2000);
  assert.equal(b.transferredIn, 10);
  assert(f.resources.environment!.health[b.cells[0]] > 0);
});

test('partially clean treatment retains its throughput cap while reducing actual power work', () => {
  const f = fixture(),
    treatment = f.add('water-treatment', 2, 2);
  f.fill(treatment, 20, 99);
  f.environment.begin(0.05);
  const joules = f.environment.work(treatment, 0.05);
  assert(Math.abs(waterVolume(treatment.machine!.utility!.clean) - 0.2) < 1e-8);
  assert(Math.abs(joules - 0.08) < 1e-8);
});

test('coal transition curtails renewables, charges batteries and eventually stops when disabled', () => {
  const f = fixture(),
    coal = f.add('coal-generator', 2, 0),
    battery = f.add('battery', 3, 0),
    solar = f.add('solar-panel', 4, 0);
  f.connect(coal, battery);
  f.connect(battery, solar);
  f.fill(coal, 24);
  assert(transact(coal.machine!.input, [], [{ item: 'coal', quantity: 2 }], OPENING_CONTENT));
  f.tick(20);
  const summary = f.factory.summary().environment!;
  assert(summary.coalUsed > 0);
  assert(summary.renewableUsed < summary.renewableAvailable);
  assert(battery.machine!.utility!.charge > 0);
  coal.machine!.enabled = false;
  f.tick(200);
  assert.equal(coal.machine!.utility!.phase, 'off');
  assert.equal(coal.machine!.utility!.generated, 0);
});

test('coal fuel and water pay exactly for generated joules and storage credits only net efficient charge', () => {
  const f = fixture(),
    coal = f.add('coal-generator', 2, 0),
    battery = f.add('battery', 3, 0);
  f.connect(coal, battery);
  f.fill(coal, 24);
  assert(transact(coal.machine!.input, [], [{ item: 'coal', quantity: 1 }], OPENING_CONTENT));
  let joules = 0;
  for (let n = 0; n < 100; n++) {
    f.tick();
    joules += coal.machine!.utility!.generated * 0.05;
  }
  const unburned =
    coal.machine!.input.slots.reduce((n, s) => n + (s?.item === 'coal' ? s.quantity : 0), 0) *
      settings.coalJoules +
    coal.machine!.utility!.fuelEnergy;
  assert(Math.abs(settings.coalJoules - unburned - joules) < 1e-6);
  assert(
    Math.abs(f.resources.environment!.sources[0].consumed - joules * settings.coalWaterPerJoule) <
      1e-7,
  );
  assert(Math.abs(battery.machine!.utility!.charge - joules * settings.batteryEfficiency) < 1e-6);
});

test('a full battery allows coal to remain off until an announced renewable shortfall requires forecast restart', () => {
  const f = fixture(),
    coal = f.add('coal-generator', 2, 0),
    battery = f.add('battery', 3, 0),
    wind = f.add('wind-turbine', 4, 0),
    scrubber = f.add('air-scrubber', 5, 0);
  for (const e of [coal, wind, scrubber]) f.connect(battery, e);
  f.fill(coal, 24);
  assert(transact(coal.machine!.input, [], [{ item: 'coal', quantity: 1 }], OPENING_CONTENT));
  battery.machine!.utility!.charge = settings.batteryJoules;
  f.tick();
  assert.equal(coal.machine!.utility!.phase, 'off');
  f.resources.environment!.weather.nextTick = 200;
  f.resources.environment!.weather.nextKind = 'dunkelflaute';
  f.tick();
  assert.equal(f.resources.environment!.weather.kind, 'clear');
  assert.equal(coal.machine!.utility!.phase, 'starting');
  assert(f.factory.summary().environment!.forecastRenewable < 120);
  wind.machine!.enabled = false;
  coal.machine!.enabled = false;
  consumeWater(
    f.resources.environment!.sources,
    coal.machine!.utility!.water,
    waterVolume(coal.machine!.utility!.water),
  );
  f.tick(20);
  assert(battery.machine!.utility!.charge < settings.batteryJoules);
  battery.machine!.utility!.charge = 0;
  f.tick(20);
  assert.equal(f.factory.summary().used, 0);
  assert.equal(scrubber.machine!.status, 'no-power');
});
test('native same-map saves retain attributed water, partial weather, batteries, fuel and frontier budgets', () => {
  const sim = own(new Simulation(definition())),
    snapshot = sim.capture();
  for (const t of OPENING_TECHNOLOGIES) {
    snapshot.resources.research[t.id] = {
      unlocked: true,
      work: t.seconds,
      consumed: Object.fromEntries(t.costs.map((s) => [s.item, s.quantity])),
    };
    for (const s of t.eligibility) snapshot.resources.productionTotals[s.item] = 1000;
  }
  const player = snapshot.entities.find((e) => e.kind === 'player')!;
  player.inventory!.slots[0] = { item: 'coal-generator', quantity: 1 };
  player.inventory!.slots[1] = { item: 'battery', quantity: 1 };
  player.inventory!.slots[2] = { item: 'power-connection', quantity: 1 };
  const a = own(new Simulation(snapshot.definition, { snapshot }));
  const commands: WorldCommand[] = [
    {
      type: 'factory-place',
      equipment: 'coal-generator',
      cell: { column: 1, row: 1 },
      rotation: 0,
    },
    { type: 'factory-place', equipment: 'battery', cell: { column: 2, row: 0 }, rotation: 0 },
  ];
  assert(a.step(still, commands).commandResults.every((r) => r.accepted));
  const state = a.capture(),
    coal = state.entities.find((e) => e.building?.buildingId === 'coal-generator')!,
    battery = state.entities.find((e) => e.building?.buildingId === 'battery')!;
  state.resources.factory!.connections = [{ id: 'fixture-wire', from: coal.id, to: battery.id }];
  coal.machine!.input.slots[0] = { item: 'coal', quantity: 2 };
  const source = state.resources.environment!.sources[0];
  source.volume -= 24;
  source.extracted += 24;
  coal.machine!.utility!.water = [{ source: source.id, volume: 24, quality: 40 }];
  const original = own(new Simulation(state.definition, { snapshot: state }));
  for (let n = 0; n < 7; n++) original.step(still);
  const saved = preparePlayerSave(
    decodeSave({
      schema: 1,
      slot: 'manual-1',
      runId: 'm8-fixture',
      token: 'm8-fixture',
      savedAt: '2026-11-09T00:00:00.000Z',
      contentVersion: OPENING_CONTENT.version,
      worldId: state.definition.id,
      tick: original.capture().resources.tick,
      world: original.capture(),
    }).world,
  );
  const restored = own(new Simulation(saved.definition, { snapshot: saved }));
  for (let n = 0; n < 200; n++) {
    original.step(still);
    restored.step(still);
  }
  assert.deepEqual(restored.capture(), original.capture());
  const invalid = structuredClone(saved);
  invalid.entities.find((e) => e.id === coal.id)!.machine!.utility!.water[0].volume++;
  assert.throws(() => preparePlayerSave(invalid), /conservation|water|Water/);
});
