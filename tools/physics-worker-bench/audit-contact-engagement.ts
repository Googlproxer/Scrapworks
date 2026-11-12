import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { ContactEngagement } from './contact-engagement.ts';
import type { ProbeBuffer, TraceEvent } from './browser-probe.ts';
import { requireLocal } from './protocol.ts';
requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11');
const results: (ReturnType<ContactEngagement['report']> & { job: string; contactProtocolVersion: number })[] = [];
for (const file of (await fs.readdir(directory)).filter(name => /^contacts-.+-(B0|C1)-contact-\d+\.json$/.test(name))) {
  const row = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')) as { job: string; case: string; contactProtocolVersion?: number };
  const audit = new ContactEngagement(row.case);
  const startup = JSON.parse(await fs.readFile(path.join(directory, row.job + '-startup.json'), 'utf8')) as ProbeBuffer;
  audit.startup(startup.events);
  let batch: TraceEvent[] = [];
  for await (const line of createInterface({ input: createReadStream(path.join(directory, row.job + '-trace.jsonl')), crlfDelay: Infinity })) {
    if (!line.trim()) continue; batch.push(JSON.parse(line) as TraceEvent);
    if (batch.length >= 5000) { audit.observe(batch); batch = batch.slice(-100); }
  }
  audit.observe(batch);
  results.push({ job: row.job, contactProtocolVersion: row.contactProtocolVersion ?? 1, ...audit.report() });
}
const result = { at: new Date().toISOString(), results, qualification: 'Replays engagement checks over retained traces. Completed movement probes alone do not establish the intended physical course. Version 1 misdirected contact pilots remain retained and do not qualify coupling.' };
const output = `contact-engagement-audit-${Date.now()}.json`;
await fs.writeFile(path.join(directory, output), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, jobs: results.length, passed: results.filter(row => row.pass).length, failed: results.filter(row => !row.pass).length, byCourse: Object.fromEntries([...new Set(results.map(row => row.course))].map(course => [course, { passed: results.filter(row => row.course === course && row.pass).length, failed: results.filter(row => row.course === course && !row.pass).length }])) }));
