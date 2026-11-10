import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

interface Row {
  engine: string;
  operation: string;
  dwell: number;
  clickToPlayableMs: number;
  menu: number;
  errors: string[];
}
interface Report {
  results: Row[];
  buildStatsSha256: string;
}
const [baselineFile, candidateFile] = process.argv.slice(2);
if (!baselineFile || !candidateFile)
  throw new Error('Use analyse.ts <baseline.json> <candidate.json>');
const baseline = JSON.parse(await fs.readFile(baselineFile, 'utf8')) as Report;
const candidate = JSON.parse(await fs.readFile(candidateFile, 'utf8')) as Report;
function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  assert(sorted.length > 0);
  return {
    n: sorted.length,
    median:
      sorted.length % 2
        ? sorted[Math.floor(sorted.length / 2)]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    min: sorted[0],
    max: sorted.at(-1),
  };
}
const groups = [...new Set(baseline.results.map((r) => `${r.engine}|${r.operation}|${r.dwell}`))];
const rows = groups.map((key) => {
  const select = (report: Report) =>
    report.results.filter((r) => `${r.engine}|${r.operation}|${r.dwell}` === key);
  const before = select(baseline),
    after = select(candidate);
  assert.equal(after.length, before.length, `Cohort size changed: ${key}`);
  assert([...before, ...after].every((r) => !r.errors.length));
  const b = stats(before.map((r) => r.clickToPlayableMs));
  const a = stats(after.map((r) => r.clickToPlayableMs));
  return {
    cohort: key,
    baseline: b,
    candidate: a,
    medianReductionPercent: ((b.median - a.median) / b.median) * 100,
    menuBaseline: stats(before.map((r) => r.menu)),
    menuCandidate: stats(after.map((r) => r.menu)),
  };
});
console.log(
  JSON.stringify(
    { baseline: baseline.buildStatsSha256, candidate: candidate.buildStatsSha256, rows },
    null,
    2,
  ),
);
