/** Local presentation preferences. Independent of gameplay/save schemas. */
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';
export type RenderScale = 50 | 75 | 100;
export type GraphicsPreset = 'low' | 'medium' | 'high' | 'custom';

export interface GraphicsSettings {
  readonly version: 1;
  readonly preset: GraphicsPreset;
  readonly shadows: ShadowQuality;
  readonly renderScale: RenderScale;
}

export const graphicsPresets = {
  low: { version: 1, preset: 'low', shadows: 'off', renderScale: 75 },
  medium: { version: 1, preset: 'medium', shadows: 'medium', renderScale: 100 },
  high: { version: 1, preset: 'high', shadows: 'high', renderScale: 100 },
} as const satisfies Record<Exclude<GraphicsPreset, 'custom'>, GraphicsSettings>;

export const defaultGraphicsSettings: GraphicsSettings = graphicsPresets.medium;

export const shadowMapSizes = { off: 0, low: 512, medium: 1024, high: 2048 } as const;

export interface GraphicsStatus {
  readonly shadows: ShadowQuality;
  readonly renderScale: RenderScale;
  readonly notice: string | null;
}

export function validateGraphicsSettings(value: unknown): GraphicsSettings {
  if (!value || typeof value !== 'object') throw new Error('Invalid graphics settings');
  const record = value as Record<string, unknown>;
  const { version, preset, shadows, renderScale } = record;
  if (
    version !== 1 ||
    typeof preset !== 'string' ||
    !['low', 'medium', 'high', 'custom'].includes(preset) ||
    typeof shadows !== 'string' ||
    !['off', 'low', 'medium', 'high'].includes(shadows) ||
    typeof renderScale !== 'number' ||
    ![50, 75, 100].includes(renderScale)
  )
    throw new Error('Unsupported graphics settings');
  const result = { version, preset, shadows, renderScale } as GraphicsSettings;
  if (result.preset !== 'custom') {
    const expected = graphicsPresets[result.preset];
    if (expected.shadows !== result.shadows || expected.renderScale !== result.renderScale)
      throw new Error('Graphics preset does not match its options');
  }
  return result;
}

export function resolveGraphicsSettings(
  settings: GraphicsSettings,
  maxTextureSize: number,
): GraphicsStatus {
  const available =
    (['high', 'medium', 'low'] as const).find((level) => shadowMapSizes[level] <= maxTextureSize) ??
    'off';
  const shadows =
    shadowMapSizes[settings.shadows] <= shadowMapSizes[available] ? settings.shadows : available;
  return {
    shadows,
    renderScale: settings.renderScale,
    notice:
      shadows === settings.shadows
        ? null
        : `This device is using ${shadows === 'off' ? 'no real-time' : shadows} shadows.`,
  };
}
