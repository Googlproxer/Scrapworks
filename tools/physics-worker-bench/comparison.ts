import type { ProbeResult } from './detector.ts';
import { pairedQuantileDifference } from './statistics.ts';

export interface ResponseRun {
  job: string;
  results: Pick<ProbeResult, 'id' | 'operation' | 'status' | 'latencyMs'>[];
}

/** A sufficient completed sample count cannot override unresolved normal attempts. */
export function compareRunEvidence(baseline: ResponseRun[], candidate: ResponseRun[], operation: ProbeResult['operation'], probability: number, budget: number, acquisitionFailures = 0) {
  const failed = [...baseline, ...candidate].flatMap(run => run.results.filter(result => result.operation === operation && result.status !== 'completed').map(result => ({ job: run.job, ...result })));
  if (failed.length) return { verdict: 'fail' as const, reason: 'Unresolved normal probes prevent a pass', failed, difference: null, lower95: null, upper95: null };
  if (acquisitionFailures) return { verdict: 'incomplete' as const, reason: 'Failed acquisitions prevent a pass', acquisitionFailures, difference: null, lower95: null, upper95: null };
  const blocks = (run: ResponseRun) => {
    const samples = run.results.filter(result => result.operation === operation && result.status === 'completed' && result.latencyMs !== null).sort((a, b) => a.id - b.id).map(result => result.latencyMs!);
    return Array.from({ length: Math.ceil(samples.length / 20) }, (_, index) => samples.slice(index * 20, index * 20 + 20));
  };
  const pairs = [];
  for (let run = 1; run <= 5; ++run) {
    const a = baseline.find(value => value.job.includes(`-run${run}-`)), b = candidate.find(value => value.job.includes(`-run${run}-`));
    if (a && b) pairs.push({ baseline: blocks(a), candidate: blocks(b) });
  }
  return pairedQuantileDifference(pairs, probability, budget);
}
