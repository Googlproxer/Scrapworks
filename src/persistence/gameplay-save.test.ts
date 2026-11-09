import { saveFixture } from '../../tests/support/save-fixture.ts';
import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { Simulation } from '../simulation/ecs-runtime';
import { preparePlayerSave } from '../simulation/player-save';
import { GameSession } from '../session/game-session';
import { InlineSimulationPort } from '../../tools/testing/inline-simulation-port';
import { worldFixture } from '../../tests/support/world-fixture';
import { OPENING_CONTENT, OPENING_TECHNOLOGIES } from '../content/opening';
import type { SaveSnapshot } from '../contracts/save';
import { decodeSave } from './save-codec';
import { MemorySaveRepository, SaveConflictError } from './memory-save-repository';
import { SaveCoordinator, type SaveBinding, type SaveHost } from './save-coordinator';
import { migrateEnvelope } from './save-migrations';
import { parseBackup } from './save-codec';

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
  return saveFixture(world, runId, token, '2026-11-08T00:00:00.000Z');
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
    validate: async (save) => {
      const candidate = new Simulation(sim.definition, { snapshot: preparePlayerSave(save.world) });
      candidate.dispose();
    },
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

test('confirmation cancel preserves unsaved world; different named runs never overwrite each other', async () => {
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
  await h.repository.save(newer, null);
  await h.coordinator.save();
  assert.equal((await h.repository.load(newer.token))!.runId, 'other-run');
  assert.equal(h.confirm.mock.calls.length, 2);
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
  assert.match(h.coordinator.status.message, /no longer available/);
  assert.deepEqual(h.current().capture(), active);
  assert.equal(h.holds(), 0);
});

test('observing a cross-tab run commit invalidates the saved marker and blocks obsolete captures', async () => {
  const h = harness(new MemorySaveRepository(), false);
  await h.coordinator.save();
  assert.equal(h.coordinator.dirty, false);
  const old = (await h.repository.load())!;
  await h.repository.save(
    {
      ...envelope(h.current(), old.runId, 'another-token'),
      sequence: old.sequence + 1,
      previousToken: old.token,
    },
    old.token,
  );
  const active = h.current().capture();
  await h.coordinator.save();
  assert(h.coordinator.dirty);
  assert.match(h.coordinator.status.message, /another tab/);
  assert.equal((await h.repository.load())!.token, 'another-token');
  assert.deepEqual(h.current().capture(), active);
});

test('first autosave needs no manual checkpoint and histories independently retain five autosaves and three manual revisions', async () => {
  const h = harness();
  h.coordinator.name = 'Waterworks';
  h.coordinator.advanceActive(119);
  await h.coordinator.refresh();
  assert.equal((await h.repository.list()).length, 0);
  h.coordinator.advanceActive(1);
  await h.coordinator.refresh();
  await h.coordinator.settled();
  assert.equal((await h.repository.load())!.kind, 'auto');
  for (let n = 0; n < 9; n++) {
    h.tick();
    await h.coordinator.save();
    h.tick();
    h.coordinator.advanceActive(120);
    await h.coordinator.refresh();
    await h.coordinator.settled();
  }
  const revisions = await h.repository.list();
  assert.equal(revisions.filter((r) => r.kind === 'manual').length, 3);
  assert.equal(revisions.filter((r) => r.kind === 'auto').length, 5);
  assert(revisions.every((r) => r.name === 'Waterworks'));
  const tokens = revisions.map((r) => r.token);
  h.coordinator.advanceActive(120);
  await h.coordinator.refresh();
  await h.coordinator.settled();
  assert.deepEqual(
    (await h.repository.list()).map((r) => r.token),
    tokens,
  );
});

test('recovery inspects without writing then appends from the latest head with the selected source recorded', async () => {
  const h = harness();
  await h.coordinator.save();
  const first = (await h.repository.load())!;
  h.tick();
  await h.coordinator.save();
  const newest = (await h.repository.load())!;
  h.coordinator.select(first.token);
  assert.equal((await h.repository.list()).length, 2);
  await h.coordinator.load();
  assert.deepEqual(await h.repository.load(first.token), first);
  assert.equal((await h.repository.list()).length, 2);
  h.tick();
  await h.coordinator.save();
  const recovered = (await h.repository.load())!;
  assert.equal(recovered.previousToken, newest.token);
  assert.equal(recovered.recoveredFrom, first.token);
  assert.equal(recovered.sequence, newest.sequence + 1);
  assert.deepEqual(await h.repository.load(newest.token), newest);
});

test('deleting the revision currently represented by a paused recovered session clears its saved marker', async () => {
  const h = harness();
  await h.coordinator.save();
  const first = (await h.repository.load())!;
  h.tick();
  await h.coordinator.save();
  await h.coordinator.load(first.token);
  assert.equal(h.coordinator.dirty, false);
  await h.coordinator.delete('revision');
  assert(h.coordinator.dirty);
  assert.equal((await h.repository.list()).length, 1);
});

test('automatic requests coalesce behind a slow write and New Game cancels them before capture', async () => {
  const h = harness();
  let finish!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => {
    finish = r;
  });
  const writing = new Promise<void>((r) => {
    entered = r;
  });
  const write = h.repository.save.bind(h.repository);
  vi.spyOn(h.repository, 'save').mockImplementationOnce(async (...args) => {
    entered();
    await gate;
    await write(...args);
  });
  const capture = vi.spyOn(h.host, 'capture');
  const saving = h.coordinator.save();
  await writing;
  for (let n = 0; n < 10; n++) {
    h.tick();
    h.coordinator.advanceActive(120);
  }
  const replacing = h.coordinator.newGame();
  finish();
  await Promise.all([saving, replacing]);
  assert.equal(capture.mock.calls.length, 1);
  assert.equal((await h.repository.list()).length, 1);
  assert.equal(h.host.binding()!.runId, 'run-new');
  h.coordinator.advanceActive(120);
  await h.coordinator.refresh();
  await h.coordinator.settled();
  assert.equal(new Set((await h.repository.list()).map((m) => m.runId)).size, 2);
});

test('JSON inspection and repeated imports preserve play, create distinct runs and retain exact native state', async () => {
  const h = harness();
  await h.coordinator.save();
  const source = (await h.repository.load())!,
    active = h.current().capture();
  const backup = JSON.stringify(source);
  const replace = vi.spyOn(h.host, 'replace');
  await h.coordinator.inspect(backup);
  assert.equal((await h.repository.list()).length, 1);
  assert.equal(replace.mock.calls.length, 0);
  await h.coordinator.import('Imported waterworks');
  const first = h.coordinator.status.slot!;
  await h.coordinator.inspect(backup);
  await h.coordinator.import('Second copy');
  const second = h.coordinator.status.slot!;
  assert.notEqual(first.runId, second.runId);
  assert.notEqual(source.runId, first.runId);
  assert.deepEqual(h.current().capture(), active);
  const imported = (await h.repository.load(second.token))!;
  assert.deepEqual(imported.origin, { runId: source.runId, token: source.token });
  assert.deepEqual(imported.world, source.world);
  h.tick();
  h.coordinator.advanceActive(120);
  await h.coordinator.settled();
  assert.equal(h.coordinator.status.slot!.token, second.token);
  await h.coordinator.load(second.token);
  assert.equal(h.host.binding()!.runId, second.runId);
});

test('invalid backups clear the previous inspection and preserve active state and all committed revisions', async () => {
  const h = harness();
  await h.coordinator.save();
  const saved = (await h.repository.load())!,
    active = h.current().capture();
  await h.coordinator.inspect(JSON.stringify(saved));
  for (const bad of [
    '{',
    JSON.stringify({ ...saved, schema: 999 }),
    JSON.stringify({ ...saved, schema: 1 }),
    JSON.stringify({
      ...saved,
      world: { ...saved.world, physics: { ...saved.world.physics, bytes: [1] } },
    }),
  ]) {
    await h.coordinator.inspect(bad);
    assert.equal(h.coordinator.status.phase, 'error');
    assert.equal(h.coordinator.status.inspected, null);
    await h.coordinator.import('Invalid');
    assert.deepEqual(await h.repository.load(), saved);
    assert.deepEqual(h.current().capture(), active);
  }
});

test('emergency backups work with denied storage without marking current progress committed', async () => {
  const h = harness();
  h.coordinator.name = '   ';
  vi.spyOn(h.repository, 'list').mockRejectedValue(new Error('Storage denied'));
  await h.coordinator.refresh();
  const before = h.current().capture();
  const backup = await h.coordinator.backup();
  assert(backup);
  assert.deepEqual(parseBackup(JSON.stringify(backup)).world, before);
  assert.deepEqual(h.current().capture(), before);
  assert(h.coordinator.dirty);
  assert.equal(h.coordinator.status.slot, null);
  await h.coordinator.newGame();
  assert.equal(h.host.binding()!.runId, 'run-new');
  assert.equal(h.coordinator.status.message, 'New game started.');
});

test('a conflict while deleting another run does not block saving the active run', async () => {
  const h = harness();
  await h.coordinator.save();
  const other = envelope(h.current(), 'other-run', 'other-1');
  await h.repository.save(other, null);
  await h.coordinator.refresh();
  h.coordinator.select(other.token);
  await h.repository.save(
    { ...other, token: 'other-2', sequence: 2, previousToken: other.token },
    other.token,
  );
  await h.coordinator.delete();
  assert.equal(h.coordinator.status.phase, 'error');
  h.tick();
  await h.coordinator.save();
  assert.equal(h.coordinator.status.message, 'Game saved.');
});

test('candidate staging and world replacement cannot schedule a stale-session autosave', async () => {
  const h = harness();
  await h.coordinator.save();
  h.tick();
  const replace = h.host.replace.bind(h.host);
  vi.spyOn(h.host, 'replace').mockImplementationOnce(async (save) => {
    h.coordinator.advanceActive(10000);
    await replace(save);
  });
  await h.coordinator.load();
  await h.coordinator.settled();
  assert.equal(h.coordinator.status.message, 'Game loaded.');
  assert.equal((await h.repository.list()).length, 1);
});

test('deleting an active run does not recreate it automatically until a deliberate manual save', async () => {
  const h = harness();
  await h.coordinator.save();
  await h.coordinator.delete();
  h.tick();
  h.coordinator.advanceActive(120);
  await h.coordinator.refresh();
  assert.equal((await h.repository.list()).length, 0);
  await h.coordinator.save();
  assert.equal((await h.repository.load())!.sequence, 1);
});

test('synthetic migration contracts are sequential, detached and never promise pre-M9 compatibility', () => {
  const source = { schema: 2, work: 5 };
  const migrated = migrateEnvelope(source, 2, 4, [
    { from: 2, to: 3, migrate: (value) => ({ ...(value as object), schema: 3, marker: true }) },
    { from: 3, to: 4, migrate: (value) => ({ ...(value as object), schema: 4 }) },
  ]);
  assert.deepEqual(migrated, { schema: 4, work: 5, marker: true });
  assert.deepEqual(source, { schema: 2, work: 5 });
  assert.throws(() => migrateEnvelope(source, 2, 4, []), /sequential/);
  assert.throws(
    () => migrateEnvelope(source, 2, 3, [{ from: 2, to: 3, migrate: () => ({ schema: 9 }) }]),
    /invalid version/,
  );
  assert.throws(() => migrateEnvelope({ schema: 1 }), /pre-M9/);
  assert.throws(() => migrateEnvelope({ schema: 999 }), /newer unsupported/);
});

function legacyEnvelope(source: Simulation, target: string | null = null) {
  const current = envelope(source),
    old = current.world;
  const ids = new Set(OPENING_TECHNOLOGIES.slice(0, 5).map((technology) => technology.id));
  delete old.resources.factory;
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
  assert.equal(migrated.contentVersion, OPENING_CONTENT.version);
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
