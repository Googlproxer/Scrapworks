import { describe, expect, it } from 'vitest';
import {
  defaultGraphicsSettings,
  graphicsPresets,
  resolveGraphicsSettings,
  validateGraphicsSettings,
} from './graphics';

describe('graphics preference boundary', () => {
  it('rejects malformed/versioned data and inconsistent presets', () => {
    for (const value of [
      null,
      {},
      { ...defaultGraphicsSettings, version: 2 },
      { ...defaultGraphicsSettings, shadows: 'ultra' },
      { ...defaultGraphicsSettings, renderScale: '75' },
      { ...defaultGraphicsSettings, renderScale: 25 },
      { ...defaultGraphicsSettings, shadows: 'off' },
    ])
      expect(() => validateGraphicsSettings(value)).toThrow();
    expect(
      validateGraphicsSettings({
        ...defaultGraphicsSettings,
        preset: 'custom',
        shadows: 'off',
        renderScale: 50,
      }),
    ).toEqual({ version: 1, preset: 'custom', shadows: 'off', renderScale: 50 });
  });

  it('retains the request while resolving a device fallback', () => {
    const requested = { ...graphicsPresets.high };
    expect(resolveGraphicsSettings(requested, 1024)).toEqual({
      shadows: 'medium',
      renderScale: 100,
      notice: expect.any(String),
    });
    expect(resolveGraphicsSettings(requested, 256).shadows).toBe('off');
    expect(requested).toEqual(graphicsPresets.high);
    expect(resolveGraphicsSettings(graphicsPresets.low, 4096).shadows).toBe('off');
  });
});
