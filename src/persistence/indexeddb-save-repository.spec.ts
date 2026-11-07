import { Dexie } from 'dexie';
import { Simulation } from '@simulation/ecs-runtime';
import { worldFixture } from '../../tests/support/world-fixture';
import { MANUAL_SLOT, type SaveSnapshot } from '@contracts/save';
import { IndexedDbSaveRepository } from './indexeddb-save-repository';
import { SaveConflictError } from './memory-save-repository';
import { expectConsoleMessage } from '../testing/console-policy';

describe('Gameplay IndexedDB transactions', () => {
  const names: string[] = [],
    adapters: IndexedDbSaveRepository[] = [];

  function repository(name = 'gameplay-save-test-' + crypto.randomUUID()) {
    names.push(name);
    const adapter = new IndexedDbSaveRepository(name);
    adapters.push(adapter);
    return { name, adapter };
  }

  function snapshot(): SaveSnapshot {
    const sim = new Simulation(worldFixture());
    try {
      const world = sim.capture();
      return {
        slot: MANUAL_SLOT,
        schema: 1,
        runId: 'run-a',
        token: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        worldId: world.resources.worldId,
        contentVersion: world.contentVersion,
        tick: world.resources.tick,
        world,
      };
    } finally {
      sim.dispose();
    }
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const adapter of adapters.splice(0)) adapter.close();
    for (const name of new Set(names.splice(0))) await Dexie.delete(name);
  });

  it('commits payload and metadata together, reopens through a new connection and deletes durably', async () => {
    const { name, adapter } = repository(),
      save = snapshot();
    await adapter.save(save, null);
    expect((await adapter.list())[0].token).toBe(save.token);
    adapter.close();
    const reopened = repository(name).adapter;
    expect(await reopened.load()).toEqual(save);
    await reopened.delete(save.token);
    expect(await reopened.list()).toEqual([]);
    expect(await reopened.load()).toBeUndefined();
  });
  it('rolls back an aborted replacement and rejects stale overwrites from another tab', async () => {
    expectConsoleMessage(
      'trace',
      expect.objectContaining({
        name: 'QuotaExceededError',
        message: expect.stringContaining('Injected quota failure'),
      }),
    );
    const { name, adapter } = repository(),
      previous = snapshot();
    await adapter.save(previous, null);
    const changed = snapshot();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Injected quota failure', 'QuotaExceededError');
    });
    await expect(adapter.save(changed, previous.token)).rejects.toThrow();
    expect(await adapter.load()).toEqual(previous);
    const other = repository(name).adapter;
    await other.save(changed, previous.token);
    await expect(adapter.save(previous, previous.token)).rejects.toBeInstanceOf(SaveConflictError);
    expect(await adapter.load()).toEqual(changed);
  });
  it('reports damaged payloads while preserving independently committed slot metadata for deletion', async () => {
    const { name, adapter } = repository(),
      save = snapshot();
    await adapter.save(save, null);
    const raw = new Dexie(name);
    await raw.open();
    try {
      await raw.table('slots').update(MANUAL_SLOT, { payload: { schema: 999 } });
    } finally {
      raw.close();
    }
    expect((await adapter.list())[0].token).toBe(save.token);
    await expect(adapter.load()).rejects.toThrow();
    await adapter.delete(save.token);
    expect(await adapter.list()).toEqual([]);
  });
  it('reports denied storage access and rejects work after lifecycle close', async () => {
    const { adapter } = repository();
    vi.spyOn(IDBFactory.prototype, 'open').mockImplementationOnce(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    await expect(adapter.list()).rejects.toThrow();
    adapter.close();
    await expect(adapter.load()).rejects.toThrow(/closed/);
  });
});
