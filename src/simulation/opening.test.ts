const { rebuildPhysics } = await import('../../tools/testing/rebuild-physics.ts');
import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { SimulationSnapshot } from '../contracts/simulation.ts';
import type { WorldCommand, WorldDefinition } from '../contracts/world.ts';
const { Simulation } = await import('./ecs-runtime.ts');
const {
  OPENING_CONTENT,
  OPENING_RECIPES,
  OPENING_TECHNOLOGIES,
  validateOpeningCatalogue,
  chargeCapacity,
  turnsToFull,
  upgradeCostMultiplier,
} = await import('../content/opening.ts');
const { assertSnapshot } = await import('./capture.ts');
const { quantity } = await import('./domain/inventory.ts');
const still = { x: 0, z: 0, sprint: false };
const definition: WorldDefinition = {
  version: 1,
  id: 'opening-tests',
  grid: { origin: { x: 0, z: 0 }, columns: 10, rows: 10, metresPerCell: 2 },
  terrain: Array.from({ length: 100 }, () => 'soil'),
  spawn: { x: 1, y: 0, z: 1 },
  deposits: [
    {
      id: 'scrap',
      kind: 'scrap',
      quantity: 250000,
      position: { x: 3, y: 0, z: 1 },
      footprint: { width: 1, depth: 1 },
      rotation: 0,
    },
  ],
  blockers: [],
};

type Sim = InstanceType<typeof Simulation>;

function setup(edit?: (snapshot: SimulationSnapshot) => void): Sim {
  const initial = new Simulation(definition);
  if (!edit) return initial;
  const snapshot = initial.capture();
  initial.dispose();
  edit(snapshot);
  rebuildPhysics(snapshot); // Physical edits define a new initial world, not a continuation.
  return new Simulation(definition, { snapshot });
}

const player = (snapshot: SimulationSnapshot) =>
  snapshot.entities.find((entity) => entity.kind === 'player')!;

const run = (sim: Sim, seconds: number) => {
  for (let n = 0; n < Math.round(seconds / 0.05); n++) sim.step(still);
};

const command = (sim: Sim, value: WorldCommand) => {
  return sim.step(still, [value]).commandResults[0];
};

function unlock(snapshot: SimulationSnapshot): void {
  for (const technology of OPENING_TECHNOLOGIES)
    snapshot.resources.research[technology.id] = {
      consumed: Object.fromEntries(technology.costs.map((cost) => [cost.item, cost.quantity])),
      work: technology.seconds,
      unlocked: true,
    };
}

const state = (sim: Sim) => sim.view.opening!.state;

test('one fixed step retains simultaneous handcraft, research and MiniFab completion events', () => {
  const prepared = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).inventory!.slots[0] = { item: 'scrap', quantity: 100 };
    player(snapshot).opening!.minifab.owned = true;
    player(snapshot).opening!.minifab.charge = 60;
  });
  command(prepared, { type: 'minifab', recipe: 'metal-plate', quantity: 1 });
  command(prepared, { type: 'handcraft-ui', visible: true });
  command(prepared, { type: 'craft', recipe: 'metal-plate', quantity: 1 });
  const snapshot = prepared.capture();
  prepared.dispose();
  const opening = player(snapshot).opening!;
  opening.handcraft!.remaining = 0.01;
  opening.minifab.job!.remaining = 0.01;
  const technology = OPENING_TECHNOLOGIES[0];
  snapshot.resources.research[technology.id].unlocked = false;
  snapshot.resources.research[technology.id].work = technology.seconds - 0.01;
  snapshot.resources.research[technology.id].consumed = Object.fromEntries(
    technology.costs.map((cost) => [cost.item, cost.quantity - 1]),
  );
  opening.researchQueue = [technology.id];
  opening.fieldEnabled = true;
  snapshot.resources.extractionTotals['scrap'] = 100;
  const simulation = new Simulation(definition, { snapshot });
  const result = simulation.step(still);
  assert(
    result.events.some((event) => event.kind === 'handcraft-ended' && event.reason === 'completed'),
  );
  assert(
    result.events.some(
      (event) => event.kind === 'research-completed' && event.technology === technology.id,
    ),
  );
  assert(
    result.events.some((event) => event.kind === 'minifab-status' && event.status === 'completed'),
  );
  simulation.dispose();
});

test('opening catalogue is conserving, acyclic, explicit and excludes future free content', () => {
  assert.doesNotThrow(validateOpeningCatalogue);
  assert.equal(Object.keys(OPENING_CONTENT.recipes).length, 27);
  assert.equal(OPENING_CONTENT.technologies.length, 19);
  assert.equal(OPENING_CONTENT.recipes['recipe.charge_storage'], undefined);
  assert.equal(chargeCapacity(2), 135);
  assert.equal(turnsToFull(100), 1);
  assert.equal(upgradeCostMultiplier(3), 4);
  assert.throws(
    () =>
      validateOpeningCatalogue(
        OPENING_RECIPES,
        OPENING_TECHNOLOGIES.map((technology, index) =>
          index === 0 ? { ...technology, requires: [technology.id] } : technology,
        ),
      ),
    /Cyclic/,
  );
  assert.throws(
    () =>
      validateOpeningCatalogue(
        OPENING_RECIPES.map((recipe) =>
          recipe.id === 'metal-plate'
            ? { ...recipe, inputs: [{ item: 'plate', quantity: 1 }] }
            : recipe,
        ),
      ),
    /Cyclic/,
  );
});

test('unaffordable, locked and over-stack requests never partially spend; multi-output preflight is all-or-nothing', async () => {
  const locked = setup();
  command(locked, { type: 'handcraft-ui', visible: true });
  assert.equal(
    command(locked, { type: 'craft', recipe: 'metal-plate', quantity: 1 }).reason,
    'locked',
  );
  const sim = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).inventory!.slots[0] = { item: 'scrap', quantity: 1 };
  });
  command(sim, { type: 'handcraft-ui', visible: true });
  for (const count of [1, 1, 0, 101])
    assert.equal(
      command(sim, { type: 'craft', recipe: 'metal-plate', quantity: count }).accepted,
      false,
    );
  assert.equal(sim.view.inventory['scrap'], 1);
  assert.deepEqual(sim.view.productionTotals, {});
  const { emptyInventory, transact } = await import('./domain/inventory.ts');
  const bag = emptyInventory(2);
  bag.slots[0] = { item: 'scrap', quantity: 1 };
  const before = structuredClone(bag);
  assert.equal(
    transact(
      bag,
      [{ item: 'scrap', quantity: 1 }],
      [
        { item: 'plate', quantity: 101 },
        { item: 'wire', quantity: 1 },
      ],
      OPENING_CONTENT,
    ),
    false,
  );
  assert.deepEqual(bag, before);
  assert(
    transact(
      bag,
      [{ item: 'scrap', quantity: 1 }],
      [
        { item: 'plate', quantity: 100 },
        { item: 'wire', quantity: 1 },
      ],
      OPENING_CONTENT,
    ),
  );
});

test('completion splits charge precisely and concurrent winding still pays actual processing drain', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    const mini = player(snapshot).opening!.minifab;
    mini.owned = true;
    mini.charge = 0.03;
    mini.request = { recipe: 'metal-plate', left: 1 };
    mini.job = { id: 'partial-unit', recipe: 'metal-plate', remaining: 0.02 };
    mini.input = [{ item: 'scrap', quantity: 2 }];
  });
  sim.step(still);
  assert(Math.abs(state(sim).minifab.charge - 0.02) < 1e-8);
  assert.equal(sim.view.productionTotals['plate'], 1);
  run(sim, 5);
  assert(Math.abs(state(sim).minifab.charge - 0.02) < 1e-8);
  const simultaneous = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).opening!.minifab.owned = true;
    player(snapshot).inventory!.slots[0] = { item: 'scrap', quantity: 2 };
  });

  simultaneous.step(still, [
    { type: 'wind', degrees: 90 },
    { type: 'minifab', recipe: 'metal-plate', quantity: 1 },
  ]);
  assert(Math.abs(state(simultaneous).minifab.charge - 2.95) < 1e-8);
  assert(Math.abs(state(simultaneous).minifab.job!.remaining - 1.9) < 1e-8);
});

test('solid recovery does not erase research/history and a genuinely completed re-craft counts again', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).inventory!.slots[0] = { item: 'scrap', quantity: 4 };
  });

  const craftPrybar = () => {
    command(sim, { type: 'handcraft-ui', visible: true });
    command(sim, { type: 'craft', recipe: 'scrap-prybar', quantity: 1 });
    run(sim, 3.95);
  };

  craftPrybar();
  command(sim, { type: 'dismantle', item: 'prybar' });
  assert.equal(sim.view.inventory['scrap'], 4);
  assert.equal(sim.view.productionTotals['prybar'], 1);
  assert.equal(sim.view.research.length, OPENING_TECHNOLOGIES.length);
  craftPrybar();
  assert.equal(sim.view.productionTotals['prybar'], 2);
});

test('salvage reaches at 2m, counts extraction once and stops on range loss or depletion', () => {
  const sim = setup();
  assert(command(sim, { type: 'salvage', target: 'scrap' }).accepted);
  run(sim, 2.95);
  assert.equal(sim.view.inventory['scrap'], 1);
  assert.equal(sim.view.opening!.extracted['scrap'], 1);
  assert.deepEqual(sim.view.productionTotals, {});
  sim.step({ x: -1, z: 0, sprint: true });
  assert.equal(state(sim).salvage, null);
  const before = sim.capture();
  assert.equal(command(sim, { type: 'salvage', target: 'scrap' }).reason, 'out-of-reach');
  assert.equal(
    sim.view.deposits[0].quantity,
    before.entities.find((entity) => entity.deposit)!.deposit!.quantity,
  );
  const depleted = setup((snapshot) => {
    snapshot.entities.find((entity) => entity.deposit)!.deposit!.quantity = 0;
  });
  assert.equal(command(depleted, { type: 'salvage', target: 'scrap' }).reason, 'depleted');
});

test('full bags overflow losslessly to stable merging piles; pickup is deliberate and never recredits extraction', () => {
  const sim = setup((snapshot) => {
    player(snapshot).inventory!.slots.fill(null);
    for (let n = 0; n < 24; n++)
      player(snapshot).inventory!.slots[n] = { item: 'prybar', quantity: 1 };
    player(snapshot).equipment!.tool = 'prybar';
  });
  command(sim, { type: 'salvage', target: 'scrap' });
  run(sim, 1.95);
  assert.equal(sim.view.ground!.length, 1);
  const pile = sim.view.ground![0];
  assert.equal(pile.quantity, 2);
  assert.equal(sim.view.opening!.extracted['scrap'], 2);
  assert.equal(command(sim, { type: 'pickup', target: pile.id }).reason, 'capacity');
  const snapshot = sim.capture();
  player(snapshot).inventory!.slots[0] = null;
  const restored = new Simulation(definition, { snapshot });
  command(restored, { type: 'salvage', target: null });
  assert(command(restored, { type: 'pickup', target: pile.id }).accepted);
  assert.equal(restored.view.inventory['scrap'], 2);
  assert.equal(restored.view.ground!.length, 0);
  assert.equal(restored.view.opening!.extracted['scrap'], 2);
});

test('handcraft preserves ten finished plates and refunds only plate eleven exactly once', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).inventory!.slots[0] = { item: 'scrap', quantity: 24 };
  });
  command(sim, { type: 'handcraft-ui', visible: true });
  command(sim, { type: 'craft', recipe: 'metal-plate', quantity: 11 });
  run(sim, 20.1);
  assert.equal(sim.view.productionTotals['plate'], 10);
  assert(state(sim).handcraft);
  assert.equal(command(sim, { type: 'craft', recipe: 'metal-plate', quantity: 1 }).reason, 'busy');
  assert.equal(command(sim, { type: 'equip', item: 'prybar' }).reason, 'busy');
  command(sim, { type: 'handcraft-ui', visible: true, suspended: true });
  run(sim, 3);
  assert.equal(sim.view.productionTotals['plate'], 10);
  command(sim, { type: 'handcraft-ui', visible: false });
  command(sim, { type: 'handcraft-ui', visible: false });
  assert.equal(sim.view.inventory['plate'], 10);
  assert.equal(sim.view.inventory['scrap'], 4);
  assert.equal(state(sim).handcraft, null);
});

test('handcraft checks capacity after consuming inputs, auto-equips first prybar and refunds on activity loss', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).inventory!.slots = Array.from({ length: 24 }, (_, n) =>
      n === 0 ? { item: 'scrap', quantity: 4 } : { item: 'prybar', quantity: 1 },
    );
  });
  command(sim, { type: 'handcraft-ui', visible: true });
  assert(command(sim, { type: 'craft', recipe: 'scrap-prybar', quantity: 1 }).accepted);
  run(sim, 3.95);
  assert.equal(sim.view.equipment[0], 'prybar');
  assert.equal(sim.view.productionTotals['prybar'], 1);
  const refund = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).inventory!.slots[0] = { item: 'scrap', quantity: 4 };
  });
  command(refund, { type: 'handcraft-ui', visible: true });
  command(refund, { type: 'craft', recipe: 'metal-plate', quantity: 1 });
  refund.clearInput();
  refund.clearInput();
  assert.equal(refund.view.inventory['scrap'], 4);
  assert.deepEqual(refund.view.productionTotals, {});
});

test('an empty tool slot accepts the first prybar even when input consumption leaves every bag slot occupied', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).inventory!.slots = Array.from({ length: 24 }, (_, index) =>
      index === 0 ? { item: 'scrap', quantity: 100 } : { item: 'prybar', quantity: 1 },
    );
  });
  command(sim, { type: 'handcraft-ui', visible: true });
  assert(command(sim, { type: 'craft', recipe: 'scrap-prybar', quantity: 1 }).accepted);
  const restored = new Simulation(definition, { snapshot: sim.capture() });
  run(restored, 3.95);
  assert.equal(restored.view.equipment[0], 'prybar');
  assert.equal(restored.view.inventory['scrap'], 96);
  assert.equal(restored.view.opening!.bag.slots.filter(Boolean).length, 24);
  assert.equal(restored.view.productionTotals['prybar'], 1);
});

test('research consumes synchronized remaining-cost bundles, waits without debt, retains switch/pause progress', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    delete snapshot.resources.research['electrical-assembly'];
    snapshot.resources.productionTotals = { plate: 4, wire: 6 };
    player(snapshot).inventory!.slots[0] = { item: 'plate', quantity: 4 };
  });
  command(sim, { type: 'research-queue', action: 'add', technology: 'electrical-assembly' });
  command(sim, { type: 'research', enabled: true });
  run(sim, 30);
  assert.equal(sim.view.inventory['plate'], 4);
  assert.equal(sim.view.opening!.ledgers['electrical-assembly'].work, 0);
  const snapshot = sim.capture();
  player(snapshot).inventory!.slots[1] = { item: 'wire', quantity: 6 };
  const supplied = new Simulation(definition, { snapshot });
  run(supplied, 4);
  const ledger = supplied.view.opening!.ledgers['electrical-assembly'];
  assert.deepEqual(ledger.consumed, { plate: 1, wire: 1 });
  command(supplied, { type: 'research', enabled: false });
  const stopped = supplied.view.opening!.ledgers['electrical-assembly'];
  run(supplied, 30);
  assert.deepEqual(supplied.view.opening!.ledgers['electrical-assembly'], stopped);
  command(supplied, {
    type: 'research-queue',
    action: 'remove',
    technology: 'electrical-assembly',
  });
  command(supplied, { type: 'research-queue', action: 'add', technology: 'electrical-assembly' });
  command(supplied, { type: 'research', enabled: true });
  run(supplied, 16);
  assert(supplied.view.research.includes('electrical-assembly'));
  assert.equal(supplied.view.inventory['plate'], undefined);
  assert.equal(supplied.view.inventory['wire'], undefined);
  assert.deepEqual(supplied.view.productionTotals, { plate: 4, wire: 6 });
  assert.equal(
    command(supplied, { type: 'research-queue', action: 'add', technology: 'electrical-assembly' })
      .reason,
    'locked',
  );
});

test('manual craft commits before MiniFab and research; handcraft protects capacity while research may consume', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    delete snapshot.resources.research['mini-fabrication'];
    player(snapshot).inventory!.slots[0] = { item: 'scrap', quantity: 2 };
    player(snapshot).opening!.minifab.owned = true;
  });

  sim.step(still, [
    { type: 'handcraft-ui', visible: true },
    { type: 'minifab', recipe: 'metal-plate', quantity: 1 },
    { type: 'craft', recipe: 'metal-plate', quantity: 1 },
  ]);
  assert(state(sim).handcraft);
  assert.equal(state(sim).minifab.job, null);
  assert.equal(sim.view.inventory['scrap'], undefined);
  run(sim, 1.95);
  assert.equal(sim.view.inventory['plate'], 1);
  assert.equal(sim.view.productionTotals['plate'], 1);
});

test('MiniFab builds multiple precursor levels, waits for scarce stock and never grants upgrade recipes', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).opening!.minifab.owned = true;
    player(snapshot).inventory!.slots[0] = { item: 'scrap', quantity: 4 };
  });
  command(sim, { type: 'minifab', recipe: 'electrical-part', quantity: 1 });
  run(sim, 12);
  assert.equal(sim.view.inventory['electrical-part'], 1);
  assert.equal(sim.view.productionTotals['plate'], 1);
  assert.equal(sim.view.productionTotals['wire'], 2);
  assert.equal(sim.view.productionTotals['electrical-part'], 1);
  assert.equal(state(sim).minifab.request, null);
  assert.equal(
    command(sim, { type: 'craft', recipe: 'recipe.charge_storage', quantity: 1 }).reason,
    'invalid-request',
  );
  command(sim, { type: 'minifab', recipe: 'electrical-part', quantity: 1 });
  run(sim, 10);
  assert.equal(state(sim).minifab.job, null);
  assert(state(sim).minifab.request);
});

test('MiniFab cancellation preserves original inputs, full buffers and recipe restrictions across restore', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).opening!.minifab.owned = true;
    player(snapshot).inventory!.slots = Array.from({ length: 24 }, (_, n) =>
      n === 0 ? { item: 'scrap', quantity: 100 } : { item: 'prybar', quantity: 1 },
    );
  });
  command(sim, { type: 'minifab', recipe: 'metal-plate', quantity: 2 });
  // Use the remaining scrap stack space so cancellation cannot return it.
  const snapshot = sim.capture();
  player(snapshot).inventory!.slots[0]!.quantity = 100;
  const blocked = new Simulation(definition, { snapshot });
  command(blocked, { type: 'minifab', recipe: null, quantity: 0 });
  assert.equal(state(blocked).minifab.input[0].quantity, 2);
  assert.equal(state(blocked).minifab.job, null);
  assert.equal(
    command(blocked, { type: 'minifab', recipe: 'electrical-part', quantity: 1 }).reason,
    'capacity',
  );
  assert(command(blocked, { type: 'minifab', recipe: 'recovered-wire', quantity: 2 }).accepted);
  run(blocked, 2);
  const final = new Simulation(definition, { snapshot: blocked.capture() });
  assert.equal(final.view.productionTotals['wire'], 1); // Full one-operation output buffer blocks a second result.
  assert.equal(state(final).minifab.input[0].quantity, 1);
  assert.equal(state(final).minifab.output[0].quantity, 1);
});

test('winding is proportional and reversible, caps rate/charge, and charge expires within a step without excess drain', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).opening!.minifab.owned = true;
  });
  for (let n = 0; n < 20; n++) {
    command(sim, { type: 'wind', degrees: n % 2 ? -90 : 90 });
    run(sim, 0.1);
  }
  assert(Math.abs(state(sim).minifab.charge - 60) < 1e-8);
  run(sim, 100);
  assert.equal(state(sim).minifab.charge, 60);
  assert.equal(command(sim, { type: 'wind', degrees: 200 }).reason, 'invalid-request');
  const snapshot = sim.capture();
  player(snapshot).opening!.minifab.charge = 0.02;
  player(snapshot).inventory!.slots[0] = { item: 'scrap', quantity: 2 };
  const split = new Simulation(definition, { snapshot });
  command(split, { type: 'minifab', recipe: 'metal-plate', quantity: 1 });
  assert(Math.abs(state(split).minifab.job!.remaining - 1.93) < 1e-8);
  assert.equal(state(split).minifab.charge, 0);
  split.clearInput();
  run(split, 1.95);
  assert.equal(split.view.inventory['plate'], 1); // MiniFab survives UI/input interruption.
});

test('full-return dismantling is atomic, includes buffers and preserves research/history on retries', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).opening!.minifab.owned = true;
    player(snapshot).inventory!.slots = Array.from({ length: 24 }, () => ({
      item: 'prybar',
      quantity: 1,
    }));
    player(snapshot).opening!.minifab.input = [{ item: 'scrap', quantity: 2 }];
  });
  const before = sim.capture();
  assert.equal(command(sim, { type: 'dismantle', item: 'minifab' }).reason, 'capacity');
  assert.deepEqual(state(sim).minifab, player(before).opening!.minifab);
  const snapshot = sim.capture();
  player(snapshot).inventory!.slots[0] = null;
  const roomy = new Simulation(definition, { snapshot });
  assert(command(roomy, { type: 'dismantle', item: 'minifab' }).accepted);
  assert.equal(roomy.view.inventory['scrap'], 16);
  assert.equal(state(roomy).minifab.owned, false);
  assert.equal(command(roomy, { type: 'dismantle', item: 'minifab' }).reason, 'invalid-request');
  assert.equal(roomy.view.inventory['scrap'], 16);
  assert.equal(roomy.view.research.length, OPENING_TECHNOLOGIES.length);
});

test('detached opening views, active work and rate budget survive capture/rebuild; malformed state is rejected', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    player(snapshot).opening!.minifab.owned = true;
    player(snapshot).inventory!.slots[0] = { item: 'scrap', quantity: 20 };
  });
  command(sim, { type: 'minifab', recipe: 'electrical-part', quantity: 2 });
  run(sim, 2.2);
  const restored = new Simulation(definition, {
    snapshot: JSON.parse(JSON.stringify(sim.capture())) as SimulationSnapshot,
  });
  run(sim, 15);
  run(restored, 15);
  assert.deepEqual(restored.capture(), sim.capture());
  const detached = sim.view.opening!;
  Reflect.set(detached.bag, 'slots', []);
  Reflect.set(detached.state.minifab, 'charge', 59);
  assert.notEqual(state(sim).minifab.charge, 59);
  const malformed = sim.capture();
  player(malformed).opening!.minifab.charge = Infinity;
  assert.throws(() => assertSnapshot(malformed, OPENING_CONTENT));
  assert(quantity(player(sim.capture()).inventory!, 'scrap') >= 0);
});

test('requested MiniFab stock precedes research while consume-only field work runs during protected handcraft', () => {
  const priority = setup((snapshot) => {
    unlock(snapshot);
    delete snapshot.resources.research['mechanical-assembly'];
    snapshot.resources.productionTotals['plate'] = 4;
    const p = player(snapshot);
    p.opening!.minifab.owned = true;
    p.inventory!.slots[0] = { item: 'plate', quantity: 1 };
    p.inventory!.slots[1] = { item: 'wire', quantity: 2 };
  });

  priority.step(still, [
    { type: 'research-queue', action: 'add', technology: 'mechanical-assembly' },
    { type: 'research', enabled: true },
    { type: 'minifab', recipe: 'electrical-part', quantity: 1 },
  ]);
  assert(state(priority).minifab.job);
  assert.equal(priority.view.opening!.ledgers['mechanical-assembly'].work, 0);
  assert.equal(priority.view.inventory['plate'], undefined);

  const protectedWork = setup((snapshot) => {
    unlock(snapshot);
    delete snapshot.resources.research['mechanical-assembly'];
    snapshot.resources.productionTotals['plate'] = 4;
    const p = player(snapshot);
    p.opening!.minifab.owned = true;
    p.inventory!.slots[0] = { item: 'scrap', quantity: 6 };
    p.inventory!.slots[1] = { item: 'plate', quantity: 4 };
  });

  protectedWork.step(still, [
    { type: 'handcraft-ui', visible: true },
    { type: 'craft', recipe: 'scrap-prybar', quantity: 1 },
    { type: 'minifab', recipe: 'metal-plate', quantity: 1 },
    { type: 'research-queue', action: 'add', technology: 'mechanical-assembly' },
    { type: 'research', enabled: true },
  ]);
  run(protectedWork, 3.75);
  assert(state(protectedWork).handcraft);
  assert.equal(protectedWork.view.inventory['scrap'], 2);
  assert.equal(state(protectedWork).minifab.job, null);
  assert.equal(protectedWork.view.opening!.ledgers['mechanical-assembly'].consumed['plate'], 1);
  command(protectedWork, { type: 'handcraft-ui', visible: false });
  assert.equal(protectedWork.view.inventory['scrap'], 4); // Original four returned, next MiniFab operation then pays two.
});

test('only actual next-input removals free held-output space; blocked and missing-stock work spends no charge', () => {
  const make = (scrap: number) =>
    setup((snapshot) => {
      unlock(snapshot);
      const p = player(snapshot),
        mini = p.opening!.minifab;
      mini.owned = true;
      mini.charge = 20;
      mini.output = [{ item: 'plate', quantity: 1 }];
      mini.outputRecipe = 'metal-plate';
      p.inventory!.slots = Array.from({ length: 24 }, (_, index) =>
        index === 0 ? { item: 'scrap', quantity: scrap } : { item: 'prybar', quantity: 1 },
      );
    });

  const partial = make(4);
  command(partial, { type: 'minifab', recipe: 'metal-plate', quantity: 1 });
  // A new request is blocked by uncleared output. Restore a legitimate ongoing batch instead.
  const snapshot = partial.capture();
  player(snapshot).opening!.minifab.request = { recipe: 'metal-plate', left: 1 };
  const blocked = new Simulation(definition, { snapshot });
  run(blocked, 10);
  assert.equal(blocked.view.inventory['scrap'], 4);
  assert.equal(state(blocked).minifab.job, null);
  assert.equal(state(blocked).minifab.charge, 20);
  const freedSnapshot = make(2).capture();
  player(freedSnapshot).opening!.minifab.request = { recipe: 'metal-plate', left: 1 };
  const freed = new Simulation(definition, { snapshot: freedSnapshot });
  run(freed, 1);
  assert.equal(freed.view.inventory['plate'], 2);
  assert.equal(freed.view.productionTotals['plate'], 1);
  assert(Math.abs(state(freed).minifab.charge - 19) < 1e-8);
  command(freed, { type: 'minifab', recipe: 'electrical-part', quantity: 1 });
  const held = state(freed).minifab.charge;
  run(freed, 10);
  assert.equal(state(freed).minifab.charge, held);
});

test('MiniFab routes complete precursor inputs directly without requiring an intermediate bag slot', () => {
  const sim = setup((snapshot) => {
    unlock(snapshot);
    const p = player(snapshot),
      mini = p.opening!.minifab;
    mini.owned = true;
    mini.output = [{ item: 'wire', quantity: 1 }];
    mini.outputRecipe = 'recovered-wire';
    mini.request = { recipe: 'electrical-part', left: 1 };
    p.inventory!.slots = Array.from({ length: 24 }, (_, index) =>
      index === 0
        ? { item: 'plate', quantity: 1 }
        : index === 1
          ? { item: 'wire', quantity: 1 }
          : { item: 'prybar', quantity: 1 },
    );
  });
  sim.step(still);
  assert.equal(state(sim).minifab.job?.recipe, 'electrical-part');
  assert.deepEqual(state(sim).minifab.output, []);
  run(sim, 5.95);
  assert.equal(sim.view.inventory['electrical-part'], 1);
  assert.equal(sim.view.productionTotals['wire'], undefined);
  assert.equal(sim.view.productionTotals['electrical-part'], 1);
});

test('a completely empty world reaches the first unpowered automatic craft using only real gameplay commands', () => {
  const sim = setup();

  const until = (predicate: () => boolean, label: string) => {
    for (let step = 0; step < 6000; step++) {
      if (predicate()) return;
      sim.step(still);
    }
    assert.fail(`Opening stalled: ${label}`);
  };

  const gather = (count: number) => {
    command(sim, { type: 'handcraft-ui', visible: false });
    assert(command(sim, { type: 'salvage', target: 'scrap' }).accepted);
    until(() => (sim.view.inventory['scrap'] ?? 0) >= count, 'gathering');
    command(sim, { type: 'salvage', target: null });
  };

  const research = (technology: string) => {
    assert(command(sim, { type: 'research-queue', action: 'add', technology }).accepted);
    assert(command(sim, { type: 'research', enabled: true }).accepted);
    until(() => sim.view.research.includes(technology), technology);
  };

  const craft = (recipe: string, count: number) => {
    command(sim, { type: 'handcraft-ui', visible: true });
    assert(command(sim, { type: 'craft', recipe, quantity: count }).accepted);
    until(() => !state(sim).handcraft, recipe);
  };

  gather(8);
  research('improvised-tools');
  craft('scrap-prybar', 1);
  assert.equal(sim.view.equipment[0], 'prybar');
  gather(54);
  research('material-recovery');
  craft('metal-plate', 16);
  craft('recovered-wire', 12);
  research('mechanical-assembly');
  research('electrical-assembly');
  craft('mechanical-part', 1);
  craft('mechanical-part', 1);
  craft('electrical-part', 1);
  craft('electrical-part', 1);
  research('mini-fabrication');
  craft('base-minifab', 1);
  assert(state(sim).minifab.owned);
  command(sim, { type: 'handcraft-ui', visible: false });
  const before = sim.view.productionTotals['plate'];
  assert(command(sim, { type: 'minifab', recipe: 'metal-plate', quantity: 1 }).accepted);
  until(() => sim.view.productionTotals['plate'] === before + 1, 'first automatic craft');
  assert(sim.tick * 0.05 < 300);
  assert.equal(state(sim).minifab.charge, 0);
  assert.equal(sim.view.opening!.extracted['scrap'], 62);
  assert.equal(sim.view.inventory['plate'], 1);
  assert.equal(sim.view.research.length, 5);
});
