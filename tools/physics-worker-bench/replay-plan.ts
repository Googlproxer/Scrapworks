import type { SimulationInput, SimulationSnapshot } from '../../src/contracts/simulation.ts';
export interface AcceptedReplayPlan {
  job: string;
  browser: 'bundled' | 'firefox';
  initial: SimulationSnapshot | null;
  inputs: { tick: number; input: SimulationInput }[];
  expected: SimulationSnapshot;
  generation: number;
  traceSha256: string;
  startupSha256: string;
  expectedSha256: string;
}
export function canonicalJson(value: unknown): string {
  const ordered = (item: unknown): unknown => Array.isArray(item) ? item.map(ordered) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item as Record<string, unknown>).filter(([, value]) => value !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [key, ordered(value)])) : item;
  return JSON.stringify(ordered(value));
}
