import { TestBed } from '@angular/core/testing';
import { defaultProfile, type BindingProfile } from '@contracts/input';
import { Dexie } from 'dexie';
import { ControlSettingsService } from './control-settings.service';

describe('ControlSettingsService persistence', () => {
  let settingsDatabase: Dexie;
  let savesDatabase: Dexie;

  beforeEach(async () => {
    settingsDatabase = new Dexie('ScrapworksSettings');
    settingsDatabase.version(1).stores({ preferences: 'key' });
    await settingsDatabase.table('preferences').clear();
    savesDatabase = new Dexie('GameSaveDatabase');
    savesDatabase.version(1).stores({ testData: '++id, name, value' });
    await savesDatabase
      .table('testData')
      .put({ id: 98123, name: 'control-settings-isolation', value: 42 });
    TestBed.configureTestingModule({ providers: [ControlSettingsService] });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    await settingsDatabase.table('preferences').clear();
    await savesDatabase.table('testData').delete(98123);
    settingsDatabase.close();
    savesDatabase.close();
  });

  function changedProfile(): BindingProfile {
    return {
      ...defaultProfile,
      contexts: {
        ...defaultProfile.contexts,
        gameplay: {
          ...defaultProfile.contexts.gameplay,
          interact: [{ device: 'keyboard', code: 'KeyF' }],
        },
      },
    };
  }

  it('writes controls, reloads them through a fresh service and preserves legacy save records', async () => {
    const first = TestBed.inject(ControlSettingsService);
    await first.ready;
    expect(await first.save(changedProfile())).toBe(true);
    expect(await savesDatabase.table('testData').get(98123)).toMatchObject({
      name: 'control-settings-isolation',
      value: 42,
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ControlSettingsService] });
    const reloaded = TestBed.inject(ControlSettingsService);
    await reloaded.ready;
    expect(reloaded.profile()).toEqual(changedProfile());
    expect(reloaded.error()).toBeNull();
  });

  it('starts with independent defaults when no saved profile exists', async () => {
    const service = TestBed.inject(ControlSettingsService);
    await service.ready;
    expect(service.profile()).toEqual(defaultProfile);
    expect(service.profile()).not.toBe(defaultProfile);
  });

  it('retains defaults and reports malformed persisted data', async () => {
    await settingsDatabase
      .table('preferences')
      .put({ key: 'controls', profile: { schemaVersion: 999 } });
    const service = TestBed.inject(ControlSettingsService);
    await service.ready;
    expect(service.profile()).toEqual(defaultProfile);
    expect(service.error()).toContain('could not be read');
  });

  it('reports an IndexedDB read failure while keeping defaults usable', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementationOnce(() => {
      throw new DOMException('Storage unavailable', 'UnknownError');
    });
    const service = TestBed.inject(ControlSettingsService);
    await service.ready;
    expect(service.profile()).toEqual(defaultProfile);
    expect(service.error()).toContain('could not be read');
  });

  it('keeps the previous active and persisted controls after a failed write', async () => {
    const service = TestBed.inject(ControlSettingsService);
    await service.ready;
    expect(await service.save(defaultProfile)).toBe(true);
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Quota exhausted', 'QuotaExceededError');
    });
    expect(await service.save(changedProfile())).toBe(false);
    expect(service.profile()).toEqual(defaultProfile);
    expect(service.error()).toContain('not saved');
    expect((await settingsDatabase.table('preferences').get('controls')).profile).toEqual(
      defaultProfile,
    );
    expect(await service.save(changedProfile())).toBe(true);
    expect(service.error()).toBeNull();
  });

  it('rejects invalid changes before writing and does not let an initial read overwrite a newer save', async () => {
    await settingsDatabase.table('preferences').put({ key: 'controls', profile: defaultProfile });
    const service = TestBed.inject(ControlSettingsService);
    const save = service.save(changedProfile());
    await Promise.all([service.ready, save]);
    expect(service.profile()).toEqual(changedProfile());
    expect(await service.save({ schemaVersion: 2 })).toBe(false);
    expect(service.profile()).toEqual(changedProfile());
  });
});
