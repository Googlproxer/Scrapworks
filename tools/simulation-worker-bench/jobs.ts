import type { Options } from './protocol.ts';

export interface RunOptions extends Options {
  ticks?: number;
  warmupMs?: number;
  warmupTicks?: number;
  batch?: number;
  yielding?: boolean;
  durationMs?: number;
  pressureMs?: number;
  hz?: number;
}

export interface Job {
  mode: 'check' | 'trial' | 'paced' | 'ancillary' | 'payloads' | 'profile';
  options: RunOptions;
  repetition?: number;
  diagnostic?: boolean;
  soakTicks?: number;
  cycles?: number;
  cpuTicks?: number;
  url: string;
  output: string;
}
