import { TestBed } from '@angular/core/testing';
import { defaultProfile, type BindingProfile } from '@contracts/input';
import { Dexie } from 'dexie';
import { expectConsoleMessage } from '../../../testing/console-policy';
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

  function expectStorageTrace(name: string, message: string): void {
    // Dexie traces handled failures when Chromium's async-task debugger is available.
    if (Dexie.debug && 'createTask' in console && typeof console.createTask === 'function')
      expectConsoleMessage(
        'trace',
        expect.objectContaining({ name, message: expect.stringContaining(message) }),
      );
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
    expectStorageTrace('UnknownError', 'Storage unavailable');
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
    expectStorageTrace('QuotaExceededError', 'Quota exhausted');
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

  it('finishes its initial read before closing on destruction and ignores the late result', async () => {
    await settingsDatabase.table('preferences').put({ key: 'controls', profile: changedProfile() });
    const close = vi.spyOn(Dexie.prototype, 'close');
    const service = TestBed.inject(ControlSettingsService);
    TestBed.resetTestingModule();
    expect(close).not.toHaveBeenCalled();
    await service.ready;
    expect(close).toHaveBeenCalledOnce();
    expect(service.profile()).toEqual(defaultProfile);
    expect(service.error()).toBeNull();
  });

  it('finishes a requested save before closing and rejects writes after destruction', async () => {
    const service = TestBed.inject(ControlSettingsService);
    await service.ready;
    const close = vi.spyOn(Dexie.prototype, 'close');
    const saving = service.save(changedProfile());
    TestBed.resetTestingModule();
    expect(close).not.toHaveBeenCalled();
    await expect(saving).resolves.toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(service.profile()).toEqual(defaultProfile);
    expect(service.error()).toBeNull();
    await expect(service.save(defaultProfile)).resolves.toBe(false);
    expect((await settingsDatabase.table('preferences').get('controls')).profile).toEqual(
      changedProfile(),
    );
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
