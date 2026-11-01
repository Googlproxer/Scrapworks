import type { Job } from './jobs.ts';

export interface Manifest {
  source: { hash: string; files: Record<string, string> };
  primaryHotPathHash?: string;
  packages: Record<string, string>;
  protocol: { gates: Record<string, number> };
  label: string;
  hardware: unknown;
  node: Record<string, string>;
  qualification?: { warmupContext: string; frameMetric: string };
}

/** The report preserves every result field while reading only its summary metrics. */
export interface ResultJob extends Job {
  file: string;
  status: string;
  error?: string;
  engine?: unknown;
  context?: unknown;
  loadedMs?: number;
  result?: {
    [field: string]: unknown;
    status?: string;
    measuredTicks?: number;
    hash?: string;
    statistics: Record<string, Record<string, number>>;
    samples?: unknown;
  };
}
