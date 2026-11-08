import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { Simulation } from '../simulation/ecs-runtime';
import { preparePlayerSave } from '../simulation/player-save';
import { GameSession } from '../session/game-session';
import { InlineSimulationPort } from '../../tools/testing/inline-simulation-port';
import { worldFixture } from '../../tests/support/world-fixture';
import { OPENING_TECHNOLOGIES } from '../content/opening';
import { MANUAL_SLOT, type SaveSnapshot } from '../contracts/save';
import { decodeSave } from './save-codec';
import { MemorySaveRepository, SaveConflictError } from './memory-save-repository';
import { SaveCoordinator, type SaveBinding, type SaveHost } from './save-coordinator';

const still = { x: 0, z: 0, sprint: false };
const owned: { dispose(): void }[] = [];
afterEach(() => {
  for (const item of owned.splice(0)) item.dispose();
  vi.restoreAllMocks();
});

function simulation(work = false): Simulation {
  const initial = new Simulation(worldFixture());
  owned.push(initial);
  if (!work) return initial;
  const snapshot = initial.capture(),
    player = snapshot.entities.find((entity) => entity.kind === 'player')!;
  for (const technology of OPENING_TECHNOLOGIES)
    snapshot.resources.research[technology.id] = {
      consumed: Object.fromEntries(technology.costs.map((cost) => [cost.item, cost.quantity])),
      work: technology.seconds,
      unlocked: true,
    };
  player.inventory!.slots[0] = { item: 'scrap', quantity: 80 };
  player.opening!.minifab.owned = true;
  const next = new Simulation(snapshot.definition, { snapshot });
  owned.push(next);
  next.step(still, [
    { type: 'minifab', recipe: 'mechanical-part', quantity: 2 },
    { type: 'handcraft-ui', visible: true },
    { type: 'craft', recipe: 'metal-plate', quantity: 3 },
  ]);
  return next;
}

function envelope(sim: Simulation, runId = 'run-a', token = 'token-a'): SaveSnapshot {
  const world = sim.capture();
  return {
    slot: MANUAL_SLOT,
    schema: 1,
    runId,
    token,
    savedAt: '2026-11-08T00:00:00.000Z',
    worldId: world.resources.worldId,
    contentVersion: world.contentVersion,
    tick: world.resources.tick,
    world,
  };
}

function harness(repository = new MemorySaveRepository(), approve = true) {
  let sim = simulation(true),
    generation = 1,
    version = 1,
    runId = 'run-a',
    holds = 0;
  const confirm = vi.fn(async () => approve);
  const host: SaveHost = {
    binding: (): SaveBinding => ({ runId, generation, version, pending: false }),
    hold: () => {
      holds++;
      return () => {
        holds--;
      };
    },
    capture: async () => sim.capture(),
    replace: async (save) => {
      const snapshot = save ? preparePlayerSave(save.world) : undefined;
      const candidate = new Simulation(sim.definition, { snapshot });
      owned.push(candidate);
      sim = candidate;
      generation++;
      version = 1;
      runId = save?.runId ?? 'run-new';
    },
  };
  let serial = 0;
  const coordinator = new SaveCoordinator(
    repository,
    host,
    confirm,
    () => `token-${++serial}`,
    () => '2026-11-08T00:00:00.000Z',
  );
  owned.push(coordinator);
  return {
    coordinator,
    repository,
    confirm,
    host,
    current: () => sim,
    tick: () => {
      sim.step(still);
      version++;
    },
    holds: () => holds,
  };
}

test('durable codec preserves active handcraft/precursor work and native continuation without aliasing', () => {
  const original = simulation(true),
    save = decodeSave(JSON.parse(JSON.stringify(envelope(original))));
  const detached = structuredClone(save);
  const restored = new Simulation(save.world.definition, {
    snapshot: preparePlayerSave(save.world),
  });
  owned.push(restored);
  for (let i = 0; i < 160; i++) {
    original.step(still);
    restored.step(still);
  }
  assert.deepEqual(restored.capture(), original.capture());
  assert.deepEqual(save, detached);
  assert.equal(restored.view.productionTotals['plate'], 3);
  restored.clearInput();
  restored.clearInput();
  assert.equal(restored.view.opening!.state.handcraft, null);
});

test('player restore resets intent/UI suspension but retains invested research, charge, rate budget and physics', () => {
  const source = simulation(true),
    saved = envelope(source);
  const player = saved.world.entities.find((entity) => entity.kind === 'player')!;
  player.opening!.handcraftSuspended = true;
  player.opening!.minifab.charge = 12.5;
  player.opening!.minifab.windBudget = 0;
  player.opening!.salvage = { target: 'scrap', remaining: 1 };
  player.transform!.moving = true;
  const normalized = preparePlayerSave(saved.world),
    next = normalized.entities.find((entity) => entity.kind === 'player')!;
  assert.equal(next.opening!.handcraftSuspended, false);
  assert.equal(next.opening!.handcraftVisible, true);
  assert.equal(next.opening!.salvage, null);
  assert.equal(next.transform!.moving, false);
  assert.deepEqual(normalized.physics, saved.world.physics);
  assert.deepEqual(normalized.resources, saved.world.resources);
  assert.equal(next.opening!.minifab.charge, 12.5);
  assert.equal(next.opening!.minifab.windBudget, 0);
});

test('durable restores preserve exact falling, stacked and moving-body continuation', () => {
  const definition = worldFixture();
  const source = new Simulation({
    ...definition,
    bodies: [
      {
        id: 'crate',
        motion: 'dynamic',
        mass: 2,
        rotation: 0,
        position: { x: -6, y: 3, z: -6 },
        collision: { shape: 'box', width: 1, height: 1, depth: 1 },
      },
      {
        id: 'mover',
        motion: 'kinematic',
        mass: 50,
        rotation: 0,
        position: { x: -6, y: 0.5, z: -6 },
        collision: { shape: 'box', width: 2, height: 1, depth: 2 },
        travel: { axis: 'x', distance: 4, periodTicks: 60 },
      },
    ],
  });
  owned.push(source);
  for (let i = 0; i < 13; i++) source.step(still);
  const save = decodeSave(JSON.parse(JSON.stringify(envelope(source))));
  const restored = new Simulation(save.world.definition, {
    snapshot: preparePlayerSave(save.world),
  });
  owned.push(restored);
  for (let i = 0; i < 400; i++) {
    source.step(still);
    restored.step(still);
    assert.deepEqual(restored.view, source.view);
  }
  assert.deepEqual(restored.capture().physics, source.capture().physics);
});

test('a saved research material wait and ground pickup continue without repayment or extraction credit', () => {
  const initial = simulation(),
    snapshot = initial.capture(),
    player = snapshot.entities.find((e) => e.kind === 'player')!;
  snapshot.resources.research['improvised-tools'] = {
    consumed: { scrap: 2 },
    work: 3,
    unlocked: false,
  };
  player.opening!.researchQueue = ['improvised-tools'];
  snapshot.resources.extractionTotals['scrap'] = 4;
  player.opening!.fieldEnabled = true;
  snapshot.entities.push({
    id: 'pile:1',
    kind: 'pile',
    transform: structuredClone(player.transform!),
    pile: { item: 'scrap', quantity: 2 },
  });
  snapshot.resources.nextEntityId = 2;
  const source = new Simulation(snapshot.definition, { snapshot });
  owned.push(source);
  for (let i = 0; i < 50; i++) source.step(still);
  assert.equal(source.capture().resources.research['improvised-tools'].work, 3);
  const save = decodeSave(envelope(source)),
    restored = new Simulation(save.world.definition, { snapshot: preparePlayerSave(save.world) });
  owned.push(restored);
  for (const sim of [source, restored]) {
    sim.step(still, [{ type: 'pickup', target: 'pile:1' }]);
    for (let i = 0; i < 100; i++) sim.step(still);
  }
  assert.deepEqual(restored.capture(), source.capture());
  assert(restored.view.research.includes('improvised-tools'));
  assert.deepEqual(restored.capture().resources.extractionTotals, { scrap: 4 });
  assert.equal(restored.view.inventory['scrap'] ?? 0, 0);
});

test('canceling a restored unfinished unit refunds its exact inputs only once and retains history', () => {
  const source = simulation(true),
    save = decodeSave(envelope(source));
  const restored = new Simulation(save.world.definition, {
    snapshot: preparePlayerSave(save.world),
  });
  owned.push(restored);
  const inputs = restored.view.inventory['scrap'] ?? 0,
    history = restored.view.productionTotals;
  restored.clearInput();
  restored.clearInput();
  assert.equal(restored.view.inventory['scrap'], inputs + 2);
  assert.equal(restored.view.opening!.state.handcraft, null);
  assert.deepEqual(restored.view.productionTotals, history);
});

test('fresh player sessions exclude queued commands and load pause/resume does not refund saved handcraft', async () => {
  const save = envelope(simulation(true));
  const session = new GameSession(save.world.definition, {
    portFactory: () => new InlineSimulationPort(),
    playerSave: true,
    capture: {
      world: save.world,
      ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 },
      pending: [],
    },
  });
  owned.push(session);
  await session.ready;
  session.pause();
  await session.settled();
  assert(session.view.opening!.state.handcraft);
  session.pause(false);
  session.advance(0.05);
  await session.settled();
  const before = (await session.capture()).world;
  const release = session.hold();
  session.pause();
  session.clearInput();
  session.advance(20);
  await session.settled();
  assert.deepEqual((await session.capture()).world, before);
  release();
  session.enqueue({ type: 'handcraft-ui', visible: false });
  const capture = await session.capture();
  assert.equal(capture.pending.length, 1);
  const playerLoad = new GameSession(capture.world.definition, {
    portFactory: () => new InlineSimulationPort(),
    playerSave: true,
    capture: {
      world: capture.world,
      ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 },
      pending: [],
    },
  });
  owned.push(playerLoad);
  await playerLoad.ready;
  playerLoad.advance(0.05);
  await playerLoad.settled();
  assert(playerLoad.view.opening!.state.handcraft);
  assert.equal((await playerLoad.capture()).ledger.accepted, 0);
});

test('malformed durable versions, cycles, numbers and cross-field state are rejected', () => {
  const save = envelope(simulation(true));
  for (const change of [
    (s: SaveSnapshot) => {
      s.world.physics = { ...s.world.physics, engineVersion: 'future' };
    },
    (s: SaveSnapshot) => {
      s.world.entities[0].transform!.position.x = Infinity;
    },
  ]) {
    const copy = structuredClone(save);
    change(copy);
    assert.throws(() => decodeSave(copy));
  }
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;
  assert.throws(() => decodeSave(cyclic), /acyclic/);
  for (const change of [
    (s: SaveSnapshot) => {
      s.world.resources.research['improvised-tools'].consumed['scrap'] = 999;
    },
    (s: SaveSnapshot) => {
      s.world.entities.find((e) => e.kind === 'player')!.opening!.handcraft!.id =
        s.world.resources.playerId;
    },
    (s: SaveSnapshot) => {
      s.world.entities.find((e) => e.kind === 'player')!.equipment!.tool = 'scrap';
    },
    (s: SaveSnapshot) => {
      s.world.entities.find((e) => e.kind === 'player')!.transform!.position.x = 10000;
    },
  ]) {
    const copy = structuredClone(save);
    change(copy);
    assert.throws(() => preparePlayerSave(copy.world));
  }
  const damaged = structuredClone(save);
  damaged.world.physics = { ...damaged.world.physics, bytes: [1, 2, 3] };
  assert.throws(
    () => new Simulation(damaged.world.definition, { snapshot: preparePlayerSave(damaged.world) }),
  );
});

test('committed save status belongs to the captured boundary, not later progress during a write', async () => {
  const h = harness();
  let finish!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const save = h.repository.save.bind(h.repository);
  vi.spyOn(h.repository, 'save').mockImplementation(async (...args) => {
    entered();
    await gate;
    return save(...args);
  });
  const operation = h.coordinator.save();
  await writing;
  h.tick();
  finish();
  await operation;
  assert(h.coordinator.dirty);
  assert.equal(h.coordinator.status.message, 'Game saved.');
  assert.equal((await h.repository.load())!.tick, h.current().tick - 1);
  await h.coordinator.save();
  assert.equal(h.coordinator.dirty, false);
});

test('failed candidate/read/write keeps current handcraft and last committed save; all guards release', async () => {
  const h = harness();
  await h.coordinator.save();
  const good = await h.repository.load(),
    before = h.current().capture();
  vi.spyOn(h.repository, 'save').mockRejectedValueOnce(new Error('Quota exceeded.'));
  h.tick();
  await h.coordinator.save();
  assert.equal(h.coordinator.status.phase, 'error');
  assert.deepEqual(await h.repository.load(), good);
  vi.spyOn(h.repository, 'load').mockImplementationOnce(async () => {
    const bad = structuredClone(good!);
    bad.world.physics = { ...bad.world.physics, bytes: [1] };
    return bad;
  });
  const active = h.current().capture();
  await h.coordinator.load();
  assert.equal(h.coordinator.status.phase, 'error');
  assert.deepEqual(h.current().capture(), active);
  assert(h.current().view.opening!.state.handcraft);
  assert.equal(h.holds(), 0);
  assert.equal(before.resources.tick + 1, active.resources.tick);
});

test('stale queued save cannot overwrite the slot after New Game, and New Game retains the old slot', async () => {
  const h = harness();
  await h.coordinator.save();
  const old = await h.repository.load();
  const next = h.coordinator.newGame(),
    stale = h.coordinator.save();
  await Promise.all([next, stale]);
  assert.equal(h.host.binding()!.runId, 'run-new');
  assert.deepEqual(await h.repository.load(), old);
  assert.match(h.coordinator.status.message, /earlier game session/);
  assert(h.coordinator.dirty);
  assert.equal(h.holds(), 0);
});

test('confirmation cancel preserves unsaved world; overwrite and delete require current committed token', async () => {
  const h = harness(new MemorySaveRepository(), false);
  await h.coordinator.save();
  h.tick();
  const active = h.current().capture();
  await h.coordinator.newGame();
  assert.deepEqual(h.current().capture(), active);
  assert(h.coordinator.dirty);
  await h.coordinator.delete();
  assert(await h.repository.load());
  assert.equal(h.confirm.mock.calls.length, 2);
  const newer = envelope(h.current(), 'other-run', 'other-token');
  await h.repository.save(newer, (await h.repository.load())!.token);
  await h.coordinator.save();
  assert.equal((await h.repository.load())!.runId, 'other-run');
  assert.equal(h.confirm.mock.calls.length, 3);
  await assert.rejects(h.repository.save(newer, 'obsolete'), SaveConflictError);
});

test('disposal suppresses queued operations and late results without rebinding a new session', async () => {
  const h = harness();
  h.coordinator.dispose();
  await h.coordinator.save();
  assert.equal(h.coordinator.status.phase, 'checking');
});

test('an already detached late write stays bound to the old run without marking a replacement saved', async () => {
  const h = harness();
  let finish!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
      finish = resolve;
    }),
    writing = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const save = h.repository.save.bind(h.repository);
  vi.spyOn(h.repository, 'save').mockImplementation(async (...args) => {
    entered();
    await gate;
    return save(...args);
  });
  const operation = h.coordinator.save();
  await writing;
  await h.host.replace(null);
  finish();
  await operation;
  assert.equal((await h.repository.load())!.runId, 'run-a');
  assert.equal(h.host.binding()!.runId, 'run-new');
  assert(h.coordinator.dirty);
  assert.match(h.coordinator.status.message, /Previous game saved/);
});

test('read/delete failures and an externally removed slot preserve the active job and report the real slot state', async () => {
  const h = harness();
  await h.coordinator.save();
  const saved = await h.repository.load(),
    active = h.current().capture();
  vi.spyOn(h.repository, 'load').mockRejectedValueOnce(new Error('Read failed.'));
  await h.coordinator.load();
  assert.equal(h.coordinator.status.message, 'Read failed.');
  assert.deepEqual(h.current().capture(), active);
  vi.spyOn(h.repository, 'delete').mockRejectedValueOnce(new Error('Delete transaction aborted.'));
  await h.coordinator.delete();
  assert.equal(h.coordinator.status.message, 'Delete transaction aborted.');
  assert.deepEqual(await h.repository.load(), saved);
  await h.repository.delete(saved!.token);
  await h.coordinator.load();
  assert.equal(h.coordinator.status.slot, null);
  assert(h.coordinator.dirty);
  assert.match(h.coordinator.status.message, /empty/);
  assert.deepEqual(h.current().capture(), active);
  assert.equal(h.holds(), 0);
});

test('observing an externally replaced slot invalidates the current saved marker without changing the world', async () => {
  const h = harness(new MemorySaveRepository(), false);
  await h.coordinator.save();
  assert.equal(h.coordinator.dirty, false);
  const old = (await h.repository.load())!;
  await h.repository.save(envelope(h.current(), 'another-run', 'another-token'), old.token);
  const active = h.current().capture();
  await h.coordinator.save();
  assert(h.coordinator.dirty);
  assert.equal(h.coordinator.status.slot!.runId, 'another-run');
  assert.deepEqual(h.current().capture(), active);
});

function legacyEnvelope(source: Simulation, target: string | null = null) {
  const current = envelope(source),
    old = current.world;
  const ids = new Set(OPENING_TECHNOLOGIES.slice(0, 5).map((technology) => technology.id));
  old.resources.research = Object.fromEntries(
    Object.entries(old.resources.research).filter(([id]) => ids.has(id)),
  );
  return {
    ...current,
    contentVersion: 'opening-1',
    world: {
      ...old,
      contentVersion: 'opening-1',
      entities: old.entities.map((entity) => {
        if (!entity.opening) return entity;
        const { researchQueue, ...opening } = entity.opening;
        assert.equal(researchQueue.length, 0);
        return { ...entity, opening: { ...opening, fieldTechnology: target } };
      }),
    },
  };
}

test('compatible M4 saves preserve committed handcraft, MiniFab buffers, native state and identity without mutating storage', () => {
  const source = simulation(true),
    legacy = legacyEnvelope(source),
    before = structuredClone(legacy);
  const decoded = decodeSave(legacy),
    migrated = preparePlayerSave(decoded.world);
  assert.equal(migrated.contentVersion, 'research-1');
  assert.deepEqual(migrated.physics, legacy.world.physics);
  const player = migrated.entities.find((entity) => entity.kind === 'player')!;
  assert.deepEqual(player.opening!.researchQueue, []);
  assert.deepEqual(
    player.opening!.handcraft,
    legacy.world.entities.find((entity) => entity.kind === 'player')!.opening!.handcraft,
  );
  assert.equal(decoded.runId, legacy.runId);
  assert.equal(decoded.token, legacy.token);
  const restored = new Simulation(migrated.definition, { snapshot: migrated });
  owned.push(restored);
  for (let n = 0; n < 100; n++) {
    source.step(still);
    restored.step(still);
  }
  assert.deepEqual(restored.view.inventory, source.view.inventory);
  assert.deepEqual(restored.capture().physics, source.capture().physics);
  assert.deepEqual(legacy, before);
});

test('M4 active research becomes the sole queue head and continues partial paid work without repayment', () => {
  const source = simulation(),
    legacy = legacyEnvelope(source, 'improvised-tools');
  legacy.world.resources.research['improvised-tools'] = {
    consumed: { scrap: 2 },
    work: 3.5,
    unlocked: false,
  };
  legacy.world.resources.extractionTotals['scrap'] = 100;
  const player = legacy.world.entities.find((entity) => entity.kind === 'player')!;
  player.inventory!.slots[0] = { item: 'scrap', quantity: 2 };
  player.opening!.fieldEnabled = true;
  const before = structuredClone(legacy),
    migrated = preparePlayerSave(decodeSave(legacy).world);
  const restored = new Simulation(migrated.definition, { snapshot: migrated });
  owned.push(restored);
  assert.deepEqual(restored.view.opening!.state.researchQueue, ['improvised-tools']);
  assert.equal(restored.view.opening!.ledgers['improvised-tools'].work, 3.5);
  for (let n = 0; n < 60; n++) restored.step(still);
  assert(restored.view.research.includes('improvised-tools'));
  assert.equal(restored.view.inventory['scrap'] ?? 0, 0);
  assert.equal(restored.view.opening!.ledgers['improvised-tools'].consumed['scrap'], 4);
  assert.deepEqual(legacy, before);
});

test('legacy content cannot smuggle new technologies, kit stock or ambiguous queue state into the compatibility path', () => {
  const source = simulation();
  const newer = legacyEnvelope(source);
  newer.world.resources.research['solar-power'] = { consumed: {}, work: 0, unlocked: false };
  assert.throws(() => preparePlayerSave(decodeSave(newer).world), /legacy technology/);
  const kit = legacyEnvelope(source);
  kit.world.entities.find((entity) => entity.kind === 'player')!.inventory!.slots[0] = {
    item: 'research-kit',
    quantity: 1,
  };
  assert.throws(() => preparePlayerSave(decodeSave(kit).world), /legacy item/);
  const malformed = legacyEnvelope(source);
  const player = malformed.world.entities.find((entity) => entity.kind === 'player')!;
  Object.assign(player.opening!, { researchQueue: [] });
  assert.throws(() => preparePlayerSave(decodeSave(malformed).world), /legacy research state/);
});
