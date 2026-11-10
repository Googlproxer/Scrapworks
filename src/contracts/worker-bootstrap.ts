/** Bootstrap warms the runtime without constructing or advancing a gameplay world. */
export const SIMULATION_WARMUP = { kind: 'simulation-warmup', version: 1 } as const;

export const SIMULATION_READY = { kind: 'simulation-ready', version: 1 } as const;

export function isBootstrapMessage(value: unknown, kind: string): boolean {
  return !!value && typeof value === 'object' && 'kind' in value && value.kind === kind;
}

export function isBootstrapVersion(value: unknown): boolean {
  return !!value && typeof value === 'object' && 'version' in value && value.version === 1;
}
