import { DestroyRef, inject, Service, signal } from '@angular/core';
import { defaultProfile, validateBindingProfile, type BindingProfile } from '@contracts/input';
import { Dexie, type Table } from 'dexie';

interface ControlsRecord {
  key: 'controls';
  profile: BindingProfile;
}

/** Preferences have their own database and never migrate or clear game saves. */
@Service()
export class ControlSettingsService {
  private readonly database = new Dexie('ScrapworksSettings');
  private readonly table: Table<ControlsRecord, string>;
  private revision = 0;
  private disposed = false;
  private pendingOperations = 0;
  public readonly profile = signal<BindingProfile>(structuredClone(defaultProfile));
  public readonly error = signal<string | null>(null);
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
      const record = await this.accessDatabase(() => this.table.get('controls'));
      if (!this.disposed && record && revision === this.revision)
        this.profile.set(validateBindingProfile(record.profile));
    } catch {
      if (!this.disposed)
        this.error.set('Saved controls could not be read. Default controls are available.');
    }
  }

  public async save(value: unknown): Promise<boolean> {
    if (this.disposed) return false;
    ++this.revision;
    try {
      const profile = validateBindingProfile(value);
      await this.accessDatabase(() => this.table.put({ key: 'controls', profile }));
      if (!this.disposed) {
        this.profile.set(profile);
        this.error.set(null);
      }
      return true;
    } catch (error) {
      if (!this.disposed)
        this.error.set(
          `Controls were not saved: ${error instanceof Error ? error.message : String(error)}`,
        );
      return false;
    }
  }

  private async accessDatabase<T>(operation: () => PromiseLike<T>): Promise<T> {
    ++this.pendingOperations;
    try {
      return await operation();
    } finally {
      --this.pendingOperations;
      this.closeIfIdle();
    }
  }

  private closeIfIdle(): void {
    if (this.disposed && this.pendingOperations === 0) this.database.close();
  }
}
