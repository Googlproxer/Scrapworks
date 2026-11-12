import fs from 'node:fs/promises';
import path from 'node:path';
import type { WorkloadSpec } from './fixtures.ts';
import type { Distribution } from './statistics.ts';
import { requireLocal } from './protocol.ts';
requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11');
interface Repetition { endToEndTickMs: Distribution; droppedSeconds: number; finalSha256: string; deadlineMisses: number; countsAfter: unknown }
interface Row { variant: string; key: string; spec: WorkloadSpec; counts: unknown; fixtureSha256: string; repetitions: Repetition[] }
interface Event { kind: string; data: unknown; at: string; preparation: string; harnessSha256: string }
const events = (await fs.readFile(path.join(directory, 'matrix-events.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Event);
const start = events.map(event => event.kind).lastIndexOf('suite-start');
if (start < 0 || !events.slice(start).some(event => event.kind === 'suite-complete')) throw new Error('Matrix has not completed');
const run = events.slice(start), browser = JSON.stringify(events[start].data).includes('Firefox/') ? 'firefox' : 'bundled';
const cases = run.filter(event => event.kind === 'matrix-case').map(event => event.data as Row);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rows = cases.map(row => ({ key: row.key, variant: row.variant, spec: row.spec, counts: row.counts, fixtureSha256: row.fixtureSha256, countsAfter: row.repetitions.map(repeat => repeat.countsAfter), finalHashes: row.repetitions.map(repeat => repeat.finalSha256), medianRunPercentiles: Object.fromEntries((['p50', 'p95', 'p99', 'max'] as const).map(metric => [metric, median(row.repetitions.map(repeat => repeat.endToEndTickMs[metric]!))])), screenPass: row.repetitions.length === 3 && row.repetitions.every(repeat => repeat.endToEndTickMs.count === 200 && repeat.droppedSeconds === 0 && repeat.endToEndTickMs.p95 !== null && repeat.endToEndTickMs.p95 <= 35 && repeat.endToEndTickMs.p99 !== null && repeat.endToEndTickMs.p99 <= 50), deadlineMisses: row.repetitions.reduce((total, repeat) => total + repeat.deadlineMisses, 0) }));
const keys = [...new Set(rows.map(row => row.key))];
const parity = keys.map(key => {
  const values = rows.filter(row => row.key === key), baseline = values.find(row => row.variant === 'B0');
  return { key, complete: ['B0', 'B1', 'C1'].every(variant => values.some(row => row.variant === variant)), matchingCaptures: !!baseline && values.every(row => JSON.stringify(row.finalHashes) === JSON.stringify(baseline.finalHashes)) };
});
const capacity = ([0, 1, 2, 3] as const).flatMap(level => (['P0', 'static-near', 'static-far', 'awake', 'sleeping', 'mixed', 'contacts'] as const).map(profile => ({ level, profile, variants: Object.fromEntries(['B0', 'B1', 'C1'].map(variant => { const points = rows.filter(row => row.spec.level === level && row.spec.profile === profile && row.variant === variant).sort((a, b) => a.spec.count - b.spec.count); return [variant, { firstFailedAnchor: points.find(row => !row.screenPass)?.spec.count ?? null, largestPassingAnchor: points.filter(row => row.screenPass).at(-1)?.spec.count ?? null, testedAnchors: points.map(row => row.spec.count) }]; })) })));
const result = { browser, source: { at: events[start].at, preparation: events[start].preparation, harnessSha256: events[start].harnessSha256 }, failures: run.filter(event => event.kind.endsWith('-fail') || event.kind === 'suite-fatal'), parity, capacity, rows, qualification: 'Short compute screen only: three 200-tick repetitions after 40 warm-up ticks. Median repetition percentiles describe these repetitions; they do not qualify sustained p99 response or prove a repeatable capacity gain. Counts before/after retain finite research and production changes. A null failed anchor means no failure at tested anchors, not unlimited capacity.' };
await fs.writeFile(path.join(directory, `matrix-summary-${browser}.json`), JSON.stringify(result, null, 2));
const lines = [`# ${browser} compute screen`, '', result.qualification, '', '| S | Profile | First failed B0 anchor | First failed B1 anchor | First failed C1 anchor |', '| --- | --- | ---: | ---: | ---: |'];
for (const row of capacity) lines.push(`| ${row.level} | ${row.profile} | ${['B0', 'B1', 'C1'].map(variant => row.variants[variant].firstFailedAnchor ?? 'none tested').join(' | ')} |`);
lines.push('', 'Zero denotes the existing P0 population; other anchors are added colliders/bodies. Full per-case counts, deadline misses, capture hashes and repetition summaries are in the adjacent JSON; raw timings remain in matrix-events.jsonl.', '');
await fs.writeFile(path.join(directory, `matrix-summary-${browser}.md`), lines.join('\n'));
console.log(JSON.stringify({ browser, cases: rows.length, failures: result.failures.length, parityFailures: parity.filter(row => !row.complete || !row.matchingCaptures).length, report: path.join(directory, `matrix-summary-${browser}.md`) }));
