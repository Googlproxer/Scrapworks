import fs from 'node:fs/promises';
import path from 'node:path';
import { pairedQuantileDifference } from './statistics.ts';
import { requireLocal } from './protocol.ts';
requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11'), suffix = process.argv[2] ?? '1794334509667';
interface Overhead { job: string; rawFramesMs: number[]; rawRoundTripMs: number[]; focused: boolean; hidden: boolean }
const pairs = [];
for (let run = 1; run <= 5; ++run) {
  const read = async (variant: string) => JSON.parse(await fs.readFile(path.join(directory, `overhead-${variant}-${run}-${suffix}.json`), 'utf8')) as Overhead;
  const baseline = await read('B0-plain'), candidate = await read('B0');
  if (!baseline.focused || baseline.hidden || !candidate.focused || candidate.hidden) throw new Error('Invalid overhead foreground state');
  pairs.push({ baseline, candidate });
}
const results: Record<string, unknown> = {};
const blocks = (values: number[]) => Array.from({ length: Math.ceil(values.length / 20) }, (_, index) => values.slice(index * 20, index * 20 + 20));
for (const metric of ['rawFramesMs', 'rawRoundTripMs'] as const) for (const probability of [.5, .95, .99]) {
  const runs = pairs.map(pair => ({ baseline: blocks(pair.baseline[metric]), candidate: blocks(pair.candidate[metric]) }));
  results[`${metric}-p${probability * 100}`] = pairedQuantileDifference(runs, probability, 2);
  console.log(JSON.stringify({ metric, probability, result: results[`${metric}-p${probability * 100}`] }));
}
await fs.writeFile(path.join(directory, 'overhead-analysis.json'), JSON.stringify({ suffix, results, comparisonMs: 2, interpretation: 'Idle RAF/worker-round-trip control compared with the smallest primary regression budget. Shared bundled-browser process; it does not measure full trace serialization overhead or qualify physical response. The earlier summary-only pilot remains separate and shows temporal cadence variation.' }, null, 2));
