import fs from 'node:fs/promises';
import path from 'node:path';
import type { WorkloadSpec } from './fixtures.ts';
import { requireLocal } from './protocol.ts';
requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11');
const matrix = JSON.parse(await fs.readFile(path.join(directory, 'matrix-summary-bundled.json'), 'utf8')) as { source: unknown; rows: { variant: string; key: string; spec: WorkloadSpec; screenPass: boolean; medianRunPercentiles: { p95: number } }[] };
const events = (await fs.readFile(path.join(directory, 'isolation-events.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as { kind: string; data: { key: string; liveContacts?: { afterWarmup: { activeBodies: number }; final: { activeBodies: number } } } });
const native = new Map(events.filter(event => event.kind === 'isolation-native').map(event => [event.data.key, event.data.liveContacts]));
const eligible = matrix.rows.filter(row => {
  if (row.variant !== 'B0' || !row.screenPass || row.spec.level === 0 || !['awake', 'mixed', 'contacts'].includes(row.spec.profile)) return false;
  const control = native.get(`S0-${row.spec.profile}-${row.spec.count}`), expected = row.spec.profile === 'mixed' ? Math.ceil(row.spec.count / 2) : row.spec.count;
  return !!control && control.afterWarmup.activeBodies >= expected * .9 && control.final.activeBodies >= expected * .9;
}).sort((a, b) => b.medianRunPercentiles.p95 - a.medianRunPercentiles.p95 || b.spec.level - a.spec.level || b.spec.count - a.spec.count);
if (!eligible.length) throw new Error('No persistently active B0-qualified mixed case is available');
const result = { at: new Date().toISOString(), selected: eligible[0], nativeControl: native.get(`S0-${eligible[0].spec.profile}-${eligible[0].spec.count}`), matrix: matrix.source, originalProvisionalSelection: 'bundled-run-selection.json / soakSelected', rule: 'B0 only: retain three-repetition screen qualification, then require native-control activity after warm-up and after 2,200 steps to remain at least 90% of the intended awake population. Greatest median repetition p95, then S and body count. Mixed expects half its population awake.', refinement: 'Defined after the short matrix, before any timed soak. The original contact stack settles almost entirely, so it cannot represent a steady near-capacity run. Primary latency selection and budgets are unchanged; no C1 measurement is used to select this replacement. Original selection remains retained.', qualification: 'Thirty-minute activity telemetry and final native counts must still establish that the selected load stayed active. Research and factory stock changes remain separately reported.' };
await fs.writeFile(path.join(directory, 'steady-soak-selection.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
