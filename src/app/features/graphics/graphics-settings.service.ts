import { DestroyRef, inject, Service, signal } from '@angular/core';
import { Dexie, type Table } from 'dexie';
import {
  defaultGraphicsSettings,
  validateGraphicsSettings,
  type GraphicsSettings,
} from '@contracts/graphics';

interface GraphicsRecord {
  key: 'graphics';
  settings: GraphicsSettings;
}

/** Shares the preference store, never the gameplay-save database or controls key. */
@Service()
export class GraphicsSettingsService {
  private readonly database = new Dexie('ScrapworksSettings');
  private readonly table: Table<GraphicsRecord, string>;
  private revision = 0;
  private disposed = false;
  private pending = 0;
  private writes: Promise<void> = Promise.resolve();
  private readonly settingsValue = signal<GraphicsSettings>({ ...defaultGraphicsSettings });
  public readonly settings = this.settingsValue.asReadonly();
  private readonly errorValue = signal<string | null>(null);
  public readonly error = this.errorValue.asReadonly();
  public readonly ready: Promise<void>;

  public constructor() {
    this.database.version(1).stores({ preferences: 'key' });
    this.table = this.database.table('preferences');
    this.ready = this.load();
    inject(DestroyRef).onDestroy(() => {
      this.disposed = true;
      this.closeIfIdle();
    });
  }

  private async load(): Promise<void> {
    const revision = this.revision;
    try {
      const record = await this.access(() => this.table.get('graphics'));
      if (!this.disposed && revision === this.revision && record)
        this.settingsValue.set(validateGraphicsSettings(record.settings));
    } catch {
      if (!this.disposed && revision === this.revision)
        this.errorValue.set(
          'Saved graphics settings could not be read. Default settings are available.',
        );
    }
  }

  public async save(value: unknown): Promise<boolean> {
    if (this.disposed) return false;
    const revision = ++this.revision;
    try {
      const settings = validateGraphicsSettings(value);
      const previous = this.writes;
      const write = this.access(async () => {
        await previous;
        return this.table.put({ key: 'graphics', settings });
      });
      this.writes = write.then(
        () => undefined,
        () => undefined,
      );
      await write;
      if (!this.disposed && revision === this.revision) {
        this.settingsValue.set(settings);
        this.errorValue.set(null);
      }
      return true;
    } catch {
      if (!this.disposed && revision === this.revision)
        this.errorValue.set(
          'Graphics settings could not be saved. Your previous settings are still active.',
        );
      return false;
    }
  }

  private async access<T>(operation: () => PromiseLike<T>): Promise<T> {
    ++this.pending;
    try {
      return await operation();
    } finally {
      --this.pending;
      this.closeIfIdle();
    }
  }

  private closeIfIdle(): void {
    if (this.disposed && this.pending === 0) this.database.close();
  }
}
