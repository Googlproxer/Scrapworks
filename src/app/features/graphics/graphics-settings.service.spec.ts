import { TestBed } from '@angular/core/testing';
import { Dexie } from 'dexie';
import { defaultGraphicsSettings, graphicsPresets } from '@contracts/graphics';
import { GraphicsSettingsService } from './graphics-settings.service';

describe('GraphicsSettingsService', () => {
  let database: Dexie;
  beforeEach(async () => {
    database = new Dexie('ScrapworksSettings');
    database.version(1).stores({ preferences: 'key' });
    await database.table('preferences').delete('graphics');
  });
  afterEach(async () => {
    TestBed.resetTestingModule();
    await database.table('preferences').delete('graphics');
    await database.table('preferences').delete('graphics-test-sentinel');
    database.close();
  });

  it('persists independently and reloads through a fresh owner', async () => {
    await database.table('preferences').put({ key: 'graphics-test-sentinel', untouched: true });
    const settings = TestBed.inject(GraphicsSettingsService);
    await settings.ready;
    expect(await settings.save(graphicsPresets.high)).toBe(true);
    TestBed.resetTestingModule();
    const next = TestBed.inject(GraphicsSettingsService);
    await next.ready;
    expect(next.settings()).toEqual(graphicsPresets.high);
    expect(await database.table('preferences').get('graphics-test-sentinel')).toEqual({
      key: 'graphics-test-sentinel',
      untouched: true,
    });
  });

  it('keeps defaults for malformed records and rejects invalid writes', async () => {
    await database.table('preferences').put({ key: 'graphics', settings: { version: 99 } });
    const settings = TestBed.inject(GraphicsSettingsService);
    await settings.ready;
    expect(settings.settings()).toEqual(defaultGraphicsSettings);
    expect(settings.error()).toContain('could not be read');
    expect(await settings.save({ ...graphicsPresets.high, renderScale: 3 })).toBe(false);
    expect(settings.settings()).toEqual(defaultGraphicsSettings);
  });

  it('serialises writes so the most recent request wins on disk and in memory', async () => {
    const settings = TestBed.inject(GraphicsSettingsService);
    await settings.ready;
    const writes = await Promise.all([
      settings.save(graphicsPresets.high),
      settings.save(graphicsPresets.low),
    ]);
    expect(writes).toEqual([true, true]);
    expect(settings.settings()).toEqual(graphicsPresets.low);
    expect((await database.table('preferences').get('graphics')).settings).toEqual(
      graphicsPresets.low,
    );
  });
});
