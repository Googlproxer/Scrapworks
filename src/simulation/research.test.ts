import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import {
  OPENING_RECIPES,
  OPENING_TECHNOLOGIES,
  validateOpeningCatalogue,
} from '../content/opening';
import {
  canFabricate,
  EQUIPMENT_BLUEPRINTS,
  RESEARCH_LAB_RULES,
  supportsFabrication,
} from '../content/first-factory';
import type { OpeningCommand } from '../contracts/opening';
import type { InventoryData, WorldResources } from '../contracts/simulation';
import { worldFixture } from '../../tests/support/world-fixture';
import { Simulation } from './ecs-runtime';
import { available, emptyInventory } from './domain/inventory';
import { advanceResearch, type ResearchSource } from './domain/research';
import { preparePlayerSave } from './player-save';

const still = { x: 0, z: 0, sprint: false };
const owned: Simulation[] = [];
afterEach(() => {
  for (const sim of owned.splice(0)) sim.dispose();
});

const own = (sim: Simulation) => {
  owned.push(sim);
  return sim;
};

const act = (sim: Simulation, ...commands: OpeningCommand[]) =>
  sim.step(still, commands).commandResults;

const run = (sim: Simulation, seconds: number) => {
  for (let n = 0; n < Math.round(seconds * 20); n++) sim.step(still);
};

const queue = (technology: string): OpeningCommand => ({
  type: 'research-queue',
  action: 'add',
  technology,
});

const ledgers = (): WorldResources['research'] => ({});

const stocked = (items: Record<string, number>): InventoryData => {
  const inventory = emptyInventory(RESEARCH_LAB_RULES.inputSlots);
  Object.entries(items).forEach(
    ([item, quantity], index) => (inventory.slots[index] = { item, quantity }),
  );
  return inventory;
};

const worker = (
  id: string,
  inventory: InventoryData,
  kind: 'field' | 'lab' = 'lab',
): ResearchSource => ({ id, inventory, kind, rate: kind === 'lab' ? RESEARCH_LAB_RULES.rate : 1 });

function prepared(bootstrap = false): Simulation {
  const first = own(new Simulation(worldFixture())),
    snapshot = first.capture();
  const player = snapshot.entities.find((entity) => entity.kind === 'player')!;
  player.inventory!.slots[0] = { item: 'scrap', quantity: 100 };
  snapshot.resources.extractionTotals['scrap'] = 100;
  if (bootstrap) {
    for (const technology of OPENING_TECHNOLOGIES.slice(0, 5))
      snapshot.resources.research[technology.id] = {
        consumed: Object.fromEntries(technology.costs.map((cost) => [cost.item, cost.quantity])),
        work: technology.seconds,
        unlocked: true,
      };
    for (const [index, item] of ['plate', 'wire', 'mechanical-part', 'electrical-part'].entries()) {
      player.inventory!.slots[index + 1] = { item, quantity: 100 };
      snapshot.resources.productionTotals[item] = 100;
    }
  }
  return own(new Simulation(snapshot.definition, { snapshot }));
}

test('queue edits include the current task and retain partial investment through removal, re-addition and save/load', () => {
  const sim = prepared();
  act(sim, queue('improvised-tools'), queue('material-recovery'), {
    type: 'research',
    enabled: true,
  });
  run(sim, 2);
  act(sim, { type: 'research', enabled: false });
  const invested = structuredClone(sim.view.opening!.ledgers['improvised-tools']);
  assert(invested.work > 0 && invested.consumed['scrap'] > 0);
  assert(
    act(sim, {
      type: 'research-queue',
      action: 'move',
      technology: 'material-recovery',
      index: 0,
    })[0].accepted,
  );
  act(sim, { type: 'research', enabled: true });
  run(sim, 10); // The blocked head does not silently skip or advance the unfinished prerequisite.
  assert.deepEqual(sim.view.opening!.ledgers['improvised-tools'], invested);
  assert.equal(sim.view.opening!.ledgers['material-recovery'].work, 0);
  act(
    sim,
    { type: 'research', enabled: false },
    { type: 'research-queue', action: 'remove', technology: 'material-recovery' },
    { type: 'research-queue', action: 'remove', technology: 'improvised-tools' },
  );
  const saved = preparePlayerSave(sim.capture()),
    restored = own(new Simulation(saved.definition, { snapshot: saved }));
  assert.deepEqual(restored.view.opening!.state.researchQueue, []);
  assert.deepEqual(restored.view.opening!.ledgers['improvised-tools'], invested);
  act(restored, queue('improvised-tools'), queue('material-recovery'));
  assert.deepEqual(restored.view.opening!.ledgers['improvised-tools'], invested);
  act(restored, { type: 'research', enabled: true });
  run(restored, 20);
  assert.deepEqual(restored.view.opening!.state.researchQueue, []);
  assert.equal(restored.view.inventory['scrap'], 88);
  assert.equal(restored.view.opening!.ledgers['improvised-tools'].work, 6);
  assert.equal(restored.view.opening!.ledgers['material-recovery'].work, 12);
});

test('duplicate, unknown, completed and invalid move requests cannot mutate research or spend stock', () => {
  const sim = prepared();
  assert(act(sim, queue('improvised-tools'))[0].accepted);
  const before = structuredClone(sim.view.opening);
  for (const command of [
    queue('improvised-tools'),
    queue('unknown'),
    { type: 'research-queue', action: 'move', technology: 'improvised-tools', index: 8 },
    { type: 'research-queue', action: 'remove', technology: 'material-recovery' },
  ] satisfies OpeningCommand[]) {
    assert.equal(act(sim, command)[0].accepted, false);
    assert.deepEqual(sim.view.opening, before);
  }
  act(sim, { type: 'research', enabled: true });
  run(sim, 7);
  const bag = sim.view.inventory;
  assert.equal(act(sim, queue('improvised-tools'))[0].reason, 'locked');
  assert.deepEqual(sim.view.inventory, bag);
  const malformed = sim.capture();
  malformed.entities.find((e) => e.kind === 'player')!.opening!.researchQueue = [
    'material-recovery',
    'material-recovery',
  ];
  assert.throws(() => preparePlayerSave(malformed), /research queue/);
});

test('locally supplied labs scale throughput, use deterministic order and cannot advance a second task in the completion step', () => {
  const finish = (count: number, field = false) => {
    const workers = Array.from({ length: count }, (_, index) =>
      worker(`lab-${index}`, stocked({ scrap: 10 })),
    );
    if (field) workers.push(worker('field', stocked({ scrap: 10 }), 'field'));
    const state = ledgers(),
      tasks = ['improvised-tools', 'material-recovery'];
    let ticks = 0;
    while (!state['improvised-tools']?.unlocked && ticks++ < 200)
      advanceResearch(tasks, state, workers, () => 100, 0.05);
    assert.equal(state['improvised-tools'].work, 6);
    assert.equal(
      workers.reduce((sum, source) => sum + available(source.inventory, 'scrap'), 0),
      workers.length * 10 - 4,
    );
    assert.equal(state['material-recovery'], undefined);
    assert.deepEqual(tasks, ['material-recovery']);
    return { ticks, state, workers };
  };

  assert(finish(2).ticks < finish(1).ticks);
  assert(finish(1, true).ticks < finish(1).ticks);
  const a = worker('a', stocked({ scrap: 10 })),
    b = worker('b', stocked({ scrap: 10 }));
  const forward = ledgers(),
    reverse = ledgers();
  advanceResearch(['improvised-tools'], forward, [a, b], () => 100, 1);
  const a2 = worker('a', stocked({ scrap: 10 })),
    b2 = worker('b', stocked({ scrap: 10 }));
  advanceResearch(['improvised-tools'], reverse, [b2, a2], () => 100, 1);
  assert.deepEqual([forward, a.inventory, b.inventory], [reverse, a2.inventory, b2.inventory]);
});

test('workers cannot pool incomplete bundles, accrue shortage debt or overwrite retained partial work', () => {
  const state = ledgers();
  const prerequisite = OPENING_TECHNOLOGIES.find((tech) => tech.id === 'material-recovery')!;
  state[prerequisite.id] = { consumed: { scrap: 8 }, work: prerequisite.seconds, unlocked: true };
  const sources = [worker('plates', stocked({ plate: 4 })), worker('wire', stocked({ wire: 6 }))];
  const before = structuredClone(sources);
  for (let n = 0; n < 100; n++)
    advanceResearch(['electrical-assembly'], state, sources, () => 100, 1);
  assert.equal(Object.hasOwn(state, 'electrical-assembly'), false);
  assert.deepEqual(sources, before);
  const supplied = worker('full', stocked({ plate: 1, wire: 1 }), 'field');
  advanceResearch(['electrical-assembly'], state, [supplied], () => 100, 10);
  assert.deepEqual(state['electrical-assembly'].consumed, { plate: 1, wire: 1 });
  const work = state['electrical-assembly'].work;
  advanceResearch(['electrical-assembly'], state, [], () => 100, 100);
  assert.equal(state['electrical-assembly'].work, work);
  supplied.inventory.slots = stocked({ plate: 1, wire: 1 }).slots;
  advanceResearch(['electrical-assembly'], state, [supplied], () => 100, 0.05);
  assert(Math.abs(state['electrical-assembly'].work - work - 0.05) < 1e-8);
  assert.throws(() =>
    advanceResearch(['electrical-assembly'], state, [supplied, supplied], () => 100, 1),
  );
});

test('catalogue reaches paid renewable/factory research and handcraftable kits without any physical machine or coal', () => {
  validateOpeningCatalogue();
  const sim = prepared(true);
  assert.equal(
    act(
      sim,
      { type: 'handcraft-ui', visible: true },
      { type: 'craft', recipe: 'basic-research-kit', quantity: 1 },
    )[1].reason,
    'locked',
  );
  act(sim, ...OPENING_TECHNOLOGIES.slice(5, 14).map((tech) => queue(tech.id)), {
    type: 'research',
    enabled: true,
  });
  run(sim, 310);
  assert(sim.view.research.includes('solar-power') && sim.view.research.includes('wind-power'));
  assert(sim.view.research.includes('laboratory-research'));
  assert.deepEqual(sim.view.opening!.state.researchQueue, ['sorting-logistics']);
  assert.equal(sim.view.opening!.ledgers['sorting-logistics'].work, 0);
  assert(act(sim, { type: 'craft', recipe: 'basic-research-kit', quantity: 4 })[0].accepted);
  run(sim, 100);
  assert(sim.view.research.includes('sorting-logistics'));
  assert.equal(sim.view.productionTotals['research-kit'], 4);
  assert.equal(sim.view.inventory['research-kit'] ?? 0, 0);
  assert.equal(
    sim.capture().entities.some((entity) => entity.kind === 'building'),
    false,
  );
  assert.equal(sim.view.research.includes('coal-power'), false);
  const saved = preparePlayerSave(sim.capture());
  assert.deepEqual(own(new Simulation(saved.definition, { snapshot: saved })).capture(), saved);
  for (const blueprint of EQUIPMENT_BLUEPRINTS)
    assert(blueprint.inputs.every((input) => input.item !== 'research-kit'));
});

test('kit crafting works through power-free MiniFab precursors and factory fixtures enforce exact arity and unlocks', () => {
  const sim = prepared(true),
    snapshot = sim.capture();
  for (const technology of OPENING_TECHNOLOGIES.slice(5, 13))
    snapshot.resources.research[technology.id] = {
      consumed: Object.fromEntries(technology.costs.map((cost) => [cost.item, cost.quantity])),
      work: technology.seconds,
      unlocked: true,
    };
  const player = snapshot.entities.find((entity) => entity.kind === 'player')!;
  player.opening!.minifab.owned = true;
  player.inventory!.slots = emptyInventory().slots;
  player.inventory!.slots[0] = { item: 'scrap', quantity: 100 };
  const mini = own(new Simulation(snapshot.definition, { snapshot }));
  assert(act(mini, { type: 'minifab', recipe: 'basic-research-kit', quantity: 2 })[0].accepted);
  run(mini, 80);
  assert.equal(mini.view.inventory['research-kit'], 2);
  assert.equal(mini.view.productionTotals['research-kit'], 2);
  assert.equal(mini.view.opening!.state.minifab.charge, 0);
  const kit = OPENING_RECIPES.find((recipe) => recipe.id === 'basic-research-kit')!;
  assert(canFabricate(kit, 'medium', ['laboratory-research']));
  assert(!canFabricate(kit, 'advanced', ['laboratory-research']));
  assert(!canFabricate(kit, 'medium', []));
  for (const recipe of OPENING_RECIPES.filter((recipe) =>
    ['metal-plate', 'recovered-wire'].includes(recipe.id),
  ))
    assert(!canFabricate(recipe, 'basic', ['material-recovery']));
  assert(supportsFabrication([{ item: 'plate', quantity: 4 }], 'basic'));
  assert(
    supportsFabrication(
      [
        { item: 'plate', quantity: 4 },
        { item: 'wire', quantity: 1 },
        { item: 'mechanical-part', quantity: 1 },
      ],
      'advanced',
    ),
  );
});

test('saving concurrent partial kit jobs and queued kit-funded research preserves exact continued work and payment', () => {
  const sim = prepared(true),
    snapshot = sim.capture();
  for (const technology of OPENING_TECHNOLOGIES.slice(5, 13))
    snapshot.resources.research[technology.id] = {
      consumed: Object.fromEntries(technology.costs.map((cost) => [cost.item, cost.quantity])),
      work: technology.seconds,
      unlocked: true,
    };
  snapshot.entities.find((entity) => entity.kind === 'player')!.opening!.minifab.owned = true;
  const original = own(new Simulation(snapshot.definition, { snapshot }));
  assert(
    act(
      original,
      { type: 'handcraft-ui', visible: true },
      { type: 'craft', recipe: 'basic-research-kit', quantity: 2 },
      { type: 'minifab', recipe: 'basic-research-kit', quantity: 2 },
      queue('sorting-logistics'),
      { type: 'research', enabled: true },
    ).every((result) => result.accepted),
  );
  run(original, 1);
  const saved = preparePlayerSave(original.capture());
  assert(
    saved.entities.find((entity) => entity.kind === 'player')!.opening!.handcraft!.remaining > 0,
  );
  const restored = own(new Simulation(saved.definition, { snapshot: saved }));
  for (let n = 0; n < 2300; n++) {
    original.step(still);
    restored.step(still);
  }
  assert.deepEqual(restored.capture(), original.capture());
  assert.equal(restored.view.productionTotals['research-kit'], 4);
  assert.equal(restored.view.inventory['research-kit'] ?? 0, 0);
  assert.equal(restored.view.inventory['mechanical-part'], 96);
  assert.equal(restored.view.inventory['electrical-part'], 96);
  assert.equal(restored.view.opening!.ledgers['sorting-logistics'].consumed['research-kit'], 4);
  assert(restored.view.research.includes('sorting-logistics'));
});
