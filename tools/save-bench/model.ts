import type { WorldDefinition } from '../../src/contracts/world';

export interface BenchOptions {
  readonly populations: readonly number[];
  readonly physicsBodies: number;
  readonly samples: number;
  readonly warmups: number;
  readonly seed: number;
}

export interface BrowserOptions extends BenchOptions {
  readonly definition: WorldDefinition;
}

export interface Distribution {
  readonly count: number;
  readonly min: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

export function distribution(values: readonly number[]): Distribution {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error('Expected nonempty, finite, nonnegative samples.');
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return {
    count: sorted.length,
    min: sorted[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted[sorted.length - 1],
  };
}

/** Seeded shuffling balances order effects without changing the fixture. */
export function shuffled<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  let state = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface StageSample {
  readonly encodeMs: number;
  readonly writeMs: number;
  readonly readMs: number;
  readonly decodeMs: number;
}

export interface PipelineSample {
  readonly captureMs: number;
  readonly saveRepositoryMs: number;
  readonly saveTotalMs: number;
  readonly loadRepositoryMs: number;
  readonly restoreWorkerMs: number;
  readonly loadTotalMs: number;
}

export interface FormatResult {
  readonly format: string;
  readonly label: string;
  readonly wireBytes: number | null;
  readonly storage: {
    readonly beforeBytes: number;
    readonly afterBytes: number;
    readonly deltaBytes: number;
    readonly source: string;
  };
  readonly correctness: { readonly exactRoundTrip: true; readonly continuedTicks: number };
  readonly stages: readonly StageSample[];
  /** Null means the current production host gate rejected this fixture. */
  readonly pipeline: readonly PipelineSample[] | null;
}

export interface FixtureResult {
  readonly name: string;
  readonly synthetic: boolean;
  readonly population: number;
  readonly kinds: Readonly<Record<string, number>>;
  readonly physicsBytes: number;
  readonly jsonUtf8Bytes: number;
  readonly sha256: string;
  readonly hostGate: { readonly accepted: boolean; readonly error?: string };
  readonly common: {
    readonly captureMs: readonly number[];
    readonly validateAndCloneMs: readonly number[];
    readonly cloneOnlyMs: readonly number[];
  };
  readonly order: readonly (readonly string[])[];
  readonly formats: readonly FormatResult[];
}

export interface BrowserResult {
  readonly fixtures: readonly FixtureResult[];
  readonly userAgent: string;
  readonly hardwareConcurrency: number;
}
