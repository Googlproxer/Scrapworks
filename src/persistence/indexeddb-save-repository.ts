import { Dexie, type Table } from 'dexie';
import { fromEventPattern, Subject, Subscription } from 'rxjs';
import {
  type SaveRepository,
  type SaveSnapshot,
  type SaveMetadata,
  type SaveCatalog,
  type SaveCatalogIssue,
} from '@contracts/save';
import { sameData } from '@core/data-equality';
import { decodeSave, saveMetadata, decodeMetadata } from './save-codec';
import { SaveConflictError } from './memory-save-repository';
import {
  assertAppend,
  assertDelete,
  orderedRevisions,
  prunedTokens,
  type RunHead,
} from './revision-policy';

export class IndexedDbSaveRepository implements SaveRepository {
  private readonly db: Dexie;
  private readonly slots: Table<{ slot: string }, string>;
  private readonly revisions: Table<SaveMetadata, string>;
  private readonly payloads: Table<{ token: string; payload: unknown }, string>;
  private readonly runs: Table<RunHead, string>;
  private readonly lifetime = new Subscription();
  private readonly blocked = new Subject<never>();
  private closed = false;
  private issueSerial = 0;
  private damaged = new Map<string, IDBValidKey>();

  private metadata(value: unknown): SaveMetadata | undefined {
    try {
      return decodeMetadata(value);
    } catch {
      return undefined;
    }
  }

  public constructor(name = 'ScrapworksGameplaySaves') {
    this.db = new Dexie(name);
    this.db.version(1).stores({ slots: '&slot' });
    // Keep legacy rows until deliberate deletion. M9 has an independent durable baseline.
    this.db.version(2).stores({
      slots: '&slot',
      revisions: '&token,runId,slot',
      payloads: '&token',
      runs: '&runId',
    });
    this.slots = this.db.table('slots');
    this.revisions = this.db.table('revisions');
    this.payloads = this.db.table('payloads');
    this.runs = this.db.table('runs');
    this.lifetime.add(
      fromEventPattern<IDBVersionChangeEvent>(
        (handler) => this.db.on('blocked', handler),
        (handler) => this.db.on('blocked').unsubscribe(handler),
      ).subscribe(() => {
        this.blocked.error(
          new Error(
            'Save storage upgrade is blocked. Close other Scrapworks tabs, then reload this page to reconnect.',
          ),
        );
        this.close();
      }),
    );
    this.lifetime.add(
      fromEventPattern<IDBVersionChangeEvent>(
        (handler) => this.db.on('versionchange', handler),
        (handler) => this.db.on('versionchange').unsubscribe(handler),
      ).subscribe(() => this.close()),
    );
  }

  private access<T>(operation: () => PromiseLike<T>): Promise<T> {
    if (this.closed)
      return Promise.reject(new Error('Save storage is closed. Reload this page to reconnect.'));
    return new Promise<T>((resolve, reject) => {
      const subscription = this.blocked.subscribe({ error: reject });
      Promise.resolve()
        .then(operation)
        .then(resolve, reject)
        .finally(() => subscription.unsubscribe());
    });
  }

  public async list() {
    return (await this.catalog()).revisions;
  }

  public async catalog(): Promise<SaveCatalog> {
    // Standalone Dexie readonly queries resolve on request success, before transaction completion.
    // Keep lifecycle close/delete safe by settling only after the native read has finished.
    const revisions: SaveMetadata[] = [],
      issues: SaveCatalogIssue[] = [];
    const damaged = new Map<string, IDBValidKey>();
    await this.access(() =>
      this.db.transaction('r', this.revisions, async () => {
        await this.db.table<unknown, IDBValidKey>('revisions').each((row, cursor) => {
          try {
            revisions.push(decodeMetadata(row));
          } catch (error) {
            const id =
              [...this.damaged].find(
                ([, key]) => indexedDB.cmp(key, cursor.primaryKey) === 0,
              )?.[0] ?? `damaged-${++this.issueSerial}`;
            damaged.set(id, cursor.primaryKey);
            issues.push({
              id,
              label:
                typeof cursor.primaryKey === 'string'
                  ? `Revision ${cursor.primaryKey.slice(0, 80)}`
                  : 'Unreadable revision',
              message: error instanceof Error ? error.message : 'This revision cannot be read.',
            });
          }
        });
      }),
    );
    this.damaged = damaged;
    return { revisions: orderedRevisions(revisions), issues };
  }

  public async deleteDamaged(id: string): Promise<void> {
    const key = this.damaged.get(id);
    if (key === undefined) throw new SaveConflictError();
    await this.access(() =>
      this.db.transaction('rw', this.revisions, this.payloads, this.runs, async () => {
        const raw = this.db.table<unknown, IDBValidKey>('revisions');
        const current = await raw.get(key);
        // A concurrent repair/commit must never be erased by an old damaged-row prompt.
        if (current === undefined || this.metadata(current)) throw new SaveConflictError();
        await raw.delete(key);
        await this.db.table<unknown, IDBValidKey>('payloads').delete(key);
        for (const head of await this.runs.toArray()) {
          if (head.token !== key) continue;
          const retained = orderedRevisions(
            (await this.revisions.where('runId').equals(head.runId).toArray()).flatMap((row) => {
              const valid = this.metadata(row);
              return valid ? [valid] : [];
            }),
          )[0];
          if (retained)
            await this.runs.put({
              runId: head.runId,
              token: retained.token,
              sequence: retained.sequence,
            });
          else await this.runs.delete(head.runId);
        }
      }),
    );
    this.damaged.delete(id);
  }

  public async load(token?: string): Promise<SaveSnapshot | undefined> {
    const selected = token ?? (await this.list())[0]?.token;
    if (!selected) return undefined;
    return this.access(async () => {
      const rows = await this.db.transaction('r', this.revisions, this.payloads, async () => ({
        metadata: await this.revisions.get(selected),
        data: await this.payloads.get(selected),
      }));
      if (!rows.metadata) return undefined;
      if (!rows.data)
        throw new Error(
          'This revision payload is missing. Choose a previous revision for recovery.',
        );
      const save = decodeSave(rows.data.payload);
      if (!sameData(saveMetadata(save), decodeMetadata(rows.metadata)))
        throw new Error('Save metadata disagrees with its payload. Choose a previous revision.');
      return save;
    });
  }

  public async save(snapshot: SaveSnapshot, expectedToken: string | null): Promise<void> {
    const next = decodeSave(snapshot);
    await this.access(() =>
      this.db.transaction('rw', this.revisions, this.payloads, this.runs, async () => {
        assertAppend(next, await this.runs.get(next.runId), expectedToken);
        if (await this.revisions.get(next.token)) throw new SaveConflictError();
        await this.revisions.add(saveMetadata(next));
        await this.payloads.add({ token: next.token, payload: next });
        await this.runs.put({ runId: next.runId, token: next.token, sequence: next.sequence });
        const prune = prunedTokens(
          (await this.revisions.where('slot').equals(next.slot).toArray()).flatMap((row) => {
            const valid = this.metadata(row);
            return valid ? [valid] : [];
          }),
          next,
        );
        await this.revisions.bulkDelete(prune);
        await this.payloads.bulkDelete(prune);
      }),
    );
  }

  public async delete(
    token: string,
    scope: 'run' | 'revision' = 'run',
    expectedTokens?: readonly string[],
  ): Promise<void> {
    await this.access(() =>
      this.db.transaction('rw', this.revisions, this.payloads, this.runs, async () => {
        const selected = await this.revisions.get(token);
        if (!selected) throw new SaveConflictError();
        const run = await this.revisions.where('runId').equals(selected.runId).toArray();
        assertDelete(run, expectedTokens);
        if (
          scope === 'revision' &&
          !run.some((r) => r.kind === selected.kind && r.sequence > selected.sequence)
        )
          throw new Error('Delete the run to remove its latest manual or autosave revision.');
        const tokens = scope === 'run' ? run.map((r) => r.token) : [token];
        await this.revisions.bulkDelete(tokens);
        await this.payloads.bulkDelete(tokens);
        if (scope === 'run') await this.runs.delete(selected.runId);
      }),
    );
  }

  public async legacy(): Promise<boolean> {
    return this.access(() =>
      this.db.transaction('r', this.slots, async () => (await this.slots.count()) > 0),
    );
  }

  public async deleteLegacy(): Promise<void> {
    await this.access(() => this.db.transaction('rw', this.slots, () => this.slots.clear()));
  }

  public close(): void {
    this.closed = true;
    this.lifetime.unsubscribe();
    this.blocked.complete();
    this.db.close();
  }
}
