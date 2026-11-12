export interface Distribution {
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

export function quantile(values: readonly number[], probability: number): number | null {
  if (probability < 0 || probability > 1 || values.some((value) => !Number.isFinite(value)))
    throw new Error('Invalid quantile input');
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * probability) - 1)];
}

export function distribution(values: readonly number[]): Distribution {
  return {
    count: values.length,
    p50: quantile(values, 0.5),
    p95: quantile(values, 0.95),
    p99: quantile(values, 0.99),
    max: quantile(values, 1),
  };
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export interface PairedRun {
  /** Blocks are contiguous observations; pairing is the predeclared run/case, not individual latency values. */
  baseline: readonly (readonly number[])[];
  candidate: readonly (readonly number[])[];
}

/** Resample paired runs, then contiguous blocks independently within each architecture. */
export function pairedQuantileDifference(
  runs: readonly PairedRun[],
  probability: number,
  budget: number,
  options: {
    replicates?: number;
    seed?: number;
    minimumRuns?: number;
    minimumSamples?: number;
  } = {},
) {
  const baseline = runs.flatMap((run) => run.baseline.flat());
  const candidate = runs.flatMap((run) => run.candidate.flat());
  const minimumRuns = options.minimumRuns ?? 5;
  const minimumSamples = options.minimumSamples ?? 1000;
  if (
    runs.length < minimumRuns ||
    baseline.length < minimumSamples ||
    candidate.length < minimumSamples
  )
    return { verdict: 'incomplete' as const, difference: null, lower95: null, upper95: null };
  if (
    runs.some(
      (run) =>
        !run.baseline.length ||
        !run.candidate.length ||
        [...run.baseline, ...run.candidate].some((block) => !block.length),
    )
  )
    throw new Error('Empty bootstrap run/block');
  const random = seededRandom(options.seed ?? 0x5ca1ab1e);
  const sample = (blocks: readonly (readonly number[])[]) =>
    blocks.flatMap(() => blocks[Math.floor(random() * blocks.length)]);
  const differences: number[] = [];
  for (let i = 0; i < (options.replicates ?? 10000); ++i) {
    const a: number[] = [],
      b: number[] = [];
    for (let n = 0; n < runs.length; ++n) {
      const run = runs[Math.floor(random() * runs.length)];
      a.push(...sample(run.baseline));
      b.push(...sample(run.candidate));
    }
    differences.push(quantile(b, probability)! - quantile(a, probability)!);
  }
  const difference = quantile(candidate, probability)! - quantile(baseline, probability)!;
  const lower95 = quantile(differences, 0.05)!;
  const upper95 = quantile(differences, 0.95)!;
  return {
    verdict:
      upper95 <= budget
        ? ('pass' as const)
        : lower95 > budget
          ? ('fail' as const)
          : ('inconclusive' as const),
    difference,
    lower95,
    upper95,
  };
}
