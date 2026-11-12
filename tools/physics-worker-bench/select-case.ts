import fs from 'node:fs/promises';
import path from 'node:path';
import type { WorkloadSpec } from './fixtures.ts';
import type { Distribution } from './statistics.ts';
import { requireLocal } from './protocol.ts';
requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11');
interface MatrixCase { variant: string; key: string; spec: WorkloadSpec; fixtureSha256: string; counts: unknown; repetitions: { endToEndTickMs: Distribution; droppedSeconds: number }[] }
interface Event { kind: string; data: MatrixCase; at: string; preparation: string; harnessSha256: string }
const events = (await fs.readFile(path.join(directory, 'matrix-events.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Event);
const start = events.map(event => event.kind).lastIndexOf('suite-start');
if (start < 0) throw new Error('Matrix start receipt is missing');
const run = events.slice(start), baseline = run.filter(event => event.kind === 'matrix-case' && event.data.variant === 'B0').map(event => event.data);
if (!run.some(event => event.kind === 'suite-complete')) throw new Error('Matrix has not completed');
const eligible = baseline.filter(row => ['awake', 'mixed', 'contacts'].includes(row.spec.profile) && row.repetitions.length === 3 && row.repetitions.every(repeat => repeat.droppedSeconds === 0 && repeat.endToEndTickMs.count === 200 && repeat.endToEndTickMs.p95 !== null && repeat.endToEndTickMs.p95 <= 35 && repeat.endToEndTickMs.p99 !== null && repeat.endToEndTickMs.p99 <= 50));
const priority: Record<string, number> = { contacts: 3, mixed: 2, awake: 1 };
eligible.sort((a, b) => b.spec.level - a.spec.level || b.spec.count - a.spec.count || priority[b.spec.profile] - priority[a.spec.profile]);
const selected = eligible[0] ?? { key: 'S1-mixed-10', spec: { level: 1, profile: 'mixed', count: 10 } as WorkloadSpec, fixtureSha256: null, counts: null };
const medianP95 = (row: MatrixCase) => row.repetitions.map(repeat => repeat.endToEndTickMs.p95!).sort((a, b) => a - b)[1];
const soakEligible = eligible.filter(row => row.spec.level > 0).sort((a, b) => medianP95(b) - medianP95(a) || b.spec.level - a.spec.level || b.spec.count - a.spec.count);
const soakSelected = soakEligible[0] ?? selected;
const browser = JSON.stringify(events[start].data).includes('Firefox/') ? 'firefox' : 'bundled';
const result = { browser, selected, soakSelected, computeQualified: eligible.length > 0, matrix: { at: events[start].at, preparation: events[start].preparation, harnessSha256: events[start].harnessSha256 }, eligibleKeys: eligible.map(row => row.key), selectionSource: 'B0 only; no B1/C1 performance data used.', rule: 'Three successful 200-tick repetitions; no dropped time; p95 <=35 ms and p99 <=50 ms; highest S level, highest added-body count, contacts then mixed then awake. Fallback is the unqualified S1 mixed-10 diagnostic.', soakRule: 'Among compute-qualified S1-S3 awake/mixed/contact cases, select the greatest median repetition p95 (nearest the screen budget); ties prefer highest S then body count. Defined before the first C1 matrix measurement; uses B0 only. The largest-tier latency case remains unchanged.', qualification: 'Provisional compute screen only. Playable capacity still requires the complete response comparison against normal B0; failure there cannot be normalized away.' };
await fs.writeFile(path.join(directory, 'run-selection.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
await fs.writeFile(path.join(directory, `${browser}-run-selection.json`), JSON.stringify(result, null, 2));
await fs.writeFile(path.join(directory, `run-selection-${browser}-${Date.now()}.json`), JSON.stringify(result, null, 2));
