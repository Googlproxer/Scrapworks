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
  public readonly profile = signal<BindingProfile>(structuredClone(defaultProfile));
  public readonly error = signal<string | null>(null);
  public readonly ready: Promise<void>;

  public constructor() {
    this.database.version(1).stores({ preferences: 'key' });
    this.table = this.database.table('preferences');
    this.ready = this.load();
    inject(DestroyRef).onDestroy(() => this.database.close());
  }

  private async load(): Promise<void> {
    const revision = this.revision;
    try {
      const record = await this.table.get('controls');
      if (record && revision === this.revision)
        this.profile.set(validateBindingProfile(record.profile));
    } catch {
      this.error.set('Saved controls could not be read. Default controls are available.');
    }
  }

  public async save(value: unknown): Promise<boolean> {
    ++this.revision;
    try {
      const profile = validateBindingProfile(value);
      await this.table.put({ key: 'controls', profile });
      this.profile.set(profile);
      this.error.set(null);
      return true;
    } catch (error) {
      this.error.set(
        `Controls were not saved: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
