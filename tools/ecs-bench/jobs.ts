import type { Trial } from './experiment.ts';

/** Driver-owned job envelope; unused fields are omitted when serialized. */
export interface Job extends Trial {
  mode: 'check' | 'trial' | 'ancillary' | 'profile' | 'paced';
  environment: 'node' | 'browser';
  output: string;
  url: string;
  repetition: number;
  count: number;
  durationMs: number;
  cpuTicks?: number;
  soakTicks?: number;
  cycles?: number;
}

export interface DiagnosticProfile<Memory> {
  importMs?: number;
  checkpoints: Record<string, Memory>;
  cycles: Memory[];
  unavailable?: { metric: string; error: string }[];
  gc?: { startTime: number; duration: number; detail: unknown; forced: boolean }[];
  soakRange?: { start: number; end: number | null };
  cpuProfile?: string;
  allocationProfile?: string;
  heapSnapshot?: string;
  disposedHeapSnapshot?: string;
  gcTrace?: string;
  dirtyTracking?: unknown;
  checksum?: string;
}
