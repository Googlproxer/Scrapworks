import type { Job, DiagnosticProfile } from './jobs.ts';
import type { trial } from './experiment.ts';

export interface Manifest {
  label: string;
  createdAt: string;
  revision: string;
  sourceHash: string;
  lockHash: string;
  runtime: Record<string, string>;
  hardware: { cpu: string; memoryBytes: number; os: string };
  protocol: { observableProjectionConsumer: boolean; exactPublicationCounts: boolean };
}

export interface MemoryPoint {
  heapUsed?: number;
  external?: number;
  usedSize?: number;
  backingStorageSize?: number;
}

/** Report enrichment of a successful profiling job. Raw artifacts stay separate. */
export interface Profile extends DiagnosticProfile<MemoryPoint> {
  gcTraceSummary?: unknown;
  gcTraceUnavailable?: string;
  gcSummary?: unknown;
  cpuTopSelf?: unknown;
  cpuAnalysisUnavailable?: string;
  allocationSummary?: unknown;
  allocationAnalysisUnavailable?: string;
  memoryAttribution?: {
    metric: string;
    imported: number | null;
    empty: number | null;
    populated: number | null;
    steady: number | null;
    disposed: number | null;
    lifecycle: (number | null)[];
    note: string;
  };
}

/** Fields are consumed only after selecting the corresponding job mode. */
export interface ResultJob extends Job {
  status: string;
  error?: string;
  rawDirectory?: string;
  result: Awaited<ReturnType<typeof trial>> &
    Profile & {
      assertions?: string[];
      frameSamples?: number[];
      advancementSamples?: number[];
    };
}

export interface Bundle {
  file: string;
  bytes: number;
  gzipBytes: number;
  imports: string[];
  modules: string[];
}

export interface Trace {
  traceEvents: { ph: string; name: string; dur?: number }[];
}

export interface AllocationNode {
  callFrame: { functionName: string; url: string };
  selfSize: number;
  children?: AllocationNode[];
}
