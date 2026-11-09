import { saveFixture } from '../../tests/support/save-fixture.ts';
import { Dexie } from 'dexie';
import { fromEvent, Subscription, take } from 'rxjs';
import { Simulation } from '@simulation/ecs-runtime';
import { worldFixture } from '../../tests/support/world-fixture';
import type { SaveSnapshot } from '@contracts/save';
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
      return saveFixture(world, 'run-a', crypto.randomUUID(), new Date().toISOString());
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

  it.each(['list', 'legacy'] as const)(
    'waits for the native %s read transaction to complete before allowing lifecycle close',
    async (method) => {
      const { name, adapter } = repository();
      const transactions: IDBTransaction[] = [];
      const completed = new Set<IDBTransaction>();
      const lifetime = new Subscription();
      const original = IDBDatabase.prototype.transaction;
      vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
        this: IDBDatabase,
        ...args: Parameters<IDBDatabase['transaction']>
      ) {
        const transaction = original.apply(this, args);
        if (this.name === name && transaction.mode === 'readonly') {
          transactions.push(transaction);
          lifetime.add(
            fromEvent(transaction, 'complete')
              .pipe(take(1))
              .subscribe(() => completed.add(transaction)),
          );
        }
        return transaction;
      });
      try {
        await adapter.save(snapshot(), null);
        transactions.length = 0;
        completed.clear();
        await adapter[method]();
        expect(transactions).toHaveLength(1);
        expect(completed.has(transactions[0])).toBe(true);
      } finally {
        lifetime.unsubscribe();
      }
      adapter.close();
    },
  );

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
    const changed = { ...snapshot(), sequence: 2, previousToken: previous.token };
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(() => {
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
      await raw.table('payloads').update(save.token, { payload: { schema: 999 } });
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
    await expect(adapter.list()).rejects.toThrow(/Denied/);
    adapter.close();
    await expect(adapter.load()).rejects.toThrow(/closed/);
  });

  it('rolls back appended payload, metadata, head and retention deletion together', async () => {
    const { adapter } = repository();
    let previous: SaveSnapshot | undefined;
    for (let n = 1; n <= 3; n++) {
      const next = { ...snapshot(), sequence: n, previousToken: previous?.token ?? null };
      await adapter.save(next, previous?.token ?? null);
      previous = next;
    }
    const before = await adapter.list();
    const next = { ...snapshot(), sequence: 4, previousToken: previous!.token };
    expectConsoleMessage(
      'trace',
      expect.objectContaining({
        name: 'AbortError',
        message: expect.stringContaining('Injected prune abort'),
      }),
    );
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementationOnce(() => {
      throw new DOMException('Injected prune abort', 'AbortError');
    });
    await expect(adapter.save(next, previous!.token)).rejects.toThrow();
    expect(await adapter.list()).toEqual(before);
    expect(await adapter.load(next.token)).toBeUndefined();
    for (const revision of before)
      expect((await adapter.load(revision.token))?.token).toBe(revision.token);
    await adapter.save(next, previous!.token);
    expect((await adapter.list()).map((m) => m.sequence)).toEqual([4, 3, 2]);
  });

  it('retains independent per-run histories and detects a stale run deletion', async () => {
    const { name, adapter } = repository();
    const world = snapshot().world;
    let previous: SaveSnapshot | undefined;
    for (let n = 1; n <= 12; n++) {
      const kind = n % 2 ? ('auto' as const) : ('manual' as const);
      const next = {
        ...saveFixture(world, 'run-a', `revision-${n}`),
        kind,
        slot: `run-a/${kind}`,
        sequence: n,
        previousToken: previous?.token ?? null,
      };
      await adapter.save(next, previous?.token ?? null);
      previous = next;
    }
    const before = await adapter.list();
    expect(before.filter((m) => m.kind === 'auto')).toHaveLength(5);
    expect(before.filter((m) => m.kind === 'manual')).toHaveLength(3);
    const other = repository(name).adapter;
    const next = {
      ...saveFixture(world, 'run-a', 'racing-revision'),
      sequence: 13,
      previousToken: previous!.token,
    };
    await other.save(next, previous!.token);
    await expect(
      adapter.delete(
        previous!.token,
        'run',
        before.map((m) => m.token),
      ),
    ).rejects.toBeInstanceOf(SaveConflictError);
    await adapter.save(saveFixture(world, 'run-b', 'another-run'), null);
    expect(new Set((await adapter.list()).map((m) => m.runId)).size).toBe(2);
    await expect(adapter.delete(next.token, 'revision')).rejects.toThrow(/latest/);
  });

  it('upgrades the database without deleting or claiming support for pre-M9 payloads', async () => {
    const name = 'gameplay-save-test-' + crypto.randomUUID();
    const old = new Dexie(name);
    old.version(1).stores({ slots: '&slot' });
    await old
      .table('slots')
      .put({ slot: 'manual-1', payload: { schema: 1 }, metadata: { token: 'legacy' } });
    old.close();
    const { adapter } = repository(name);
    expect(await adapter.legacy()).toBe(true);
    expect(await adapter.list()).toEqual([]);
    await adapter.save(snapshot(), null);
    await adapter.deleteLegacy();
    expect(await adapter.legacy()).toBe(false);
    expect(await adapter.list()).toHaveLength(1);
  });

  it('closes a blocked upgrade boundary so a rejected operation cannot later perform a write', async () => {
    expectConsoleMessage(
      'warn',
      expect.stringContaining('blocked by other connection holding version'),
    );
    expectConsoleMessage(
      'warn',
      expect.stringContaining('Closing db now to resume the delete request.'),
    );
    const name = 'gameplay-save-test-' + crypto.randomUUID();
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('slots', { keyPath: 'slot' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const { adapter } = repository(name);
    try {
      await expect(adapter.save(snapshot(), null)).rejects.toThrow(/blocked/);
      old.close();
      await expect(adapter.save(snapshot(), null)).rejects.toThrow(/closed/);
    } finally {
      old.close();
    }
  });
});
