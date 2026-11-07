import { Dexie, type Table } from 'dexie';
import { fromEventPattern, Subject, Subscription } from 'rxjs';
import {
  MANUAL_SLOT,
  type SaveRepository,
  type SaveSnapshot,
  type SaveMetadata,
} from '@contracts/save';
import { decodeSave, saveMetadata, decodeMetadata } from './save-codec';
import { SaveConflictError } from './memory-save-repository';

export class IndexedDbSaveRepository implements SaveRepository {
  private readonly db: Dexie;
  private readonly slots: Table<{ slot: string; metadata: SaveMetadata; payload: unknown }, string>;
  private readonly lifetime = new Subscription();
  private readonly blocked = new Subject<never>();
  private closed = false;

  public constructor(name = 'ScrapworksGameplaySaves') {
    this.db = new Dexie(name);
    this.db.version(1).stores({ slots: '&slot' });
    this.slots = this.db.table('slots');
    this.lifetime.add(
      fromEventPattern<IDBVersionChangeEvent>(
        (handler) => this.db.on('blocked', handler),
        (handler) => this.db.on('blocked').unsubscribe(handler),
      ).subscribe(() => {
        this.blocked.error(
          new Error('Save storage upgrade is blocked. Close other Scrapworks tabs and retry.'),
        );
        this.db.close();
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
    return this.access(async () => {
      const row = await this.db.transaction('r', this.slots, () => this.slots.get(MANUAL_SLOT));
      return row ? [decodeMetadata(row.metadata)] : [];
    });
  }

  public async load(): Promise<SaveSnapshot | undefined> {
    return this.access(async () => {
      const row = await this.db.transaction('r', this.slots, () => this.slots.get(MANUAL_SLOT));
      if (!row) return undefined;
      const save = decodeSave(row.payload);
      if (JSON.stringify(saveMetadata(save)) !== JSON.stringify(decodeMetadata(row.metadata)))
        throw new Error('Save metadata disagrees with its payload.');
      return save;
    });
  }

  public async save(snapshot: SaveSnapshot, expectedToken: string | null): Promise<void> {
    const next = decodeSave(snapshot);
    await this.access(() =>
      this.db.transaction('rw', this.slots, async () => {
        const row = await this.slots.get(MANUAL_SLOT);
        const token = row ? decodeMetadata(row.metadata).token : null;
        if (token !== expectedToken) throw new SaveConflictError();
        await this.slots.put({ slot: MANUAL_SLOT, metadata: saveMetadata(next), payload: next });
      }),
    );
  }

  public async delete(expectedToken: string): Promise<void> {
    await this.access(() =>
      this.db.transaction('rw', this.slots, async () => {
        const row = await this.slots.get(MANUAL_SLOT);
        if (!row || decodeMetadata(row.metadata).token !== expectedToken)
          throw new SaveConflictError();
        await this.slots.delete(MANUAL_SLOT);
      }),
    );
  }

  public close(): void {
    this.closed = true;
    this.lifetime.unsubscribe();
    this.blocked.complete();
    this.db.close();
  }
}
