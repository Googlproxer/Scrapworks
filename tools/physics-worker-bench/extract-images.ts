import fs from 'node:fs/promises';
import path from 'node:path';
import type { TraceEvent } from './browser-probe.ts';
import { requireLocal } from './protocol.ts';
requireLocal();
const directory = path.resolve('docs/reports/split-physics-worker/2026-11-11');
const records: { job: string; label: string; frame: number; now: number; pose?: TraceEvent; camera?: TraceEvent; file: string; bytes: number }[] = [];
for (const name of (await fs.readdir(directory)).filter(name => /^contacts-[\w-]+-images\.json$/.test(name))) {
  const receipt = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')) as { job: string; images: { label: string; frame: number; now: number; pose?: TraceEvent; camera?: TraceEvent; png: string }[] };
  if (!/^[\w-]+$/.test(receipt.job)) throw new Error('Unsafe image receipt name');
  for (const [index, image] of receipt.images.entries()) {
    if (!image.png.startsWith('data:image/png;base64,')) throw new Error('Unexpected image format');
    const bytes = Buffer.from(image.png.slice('data:image/png;base64,'.length), 'base64');
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG');
    const file = `${receipt.job}-image-${index + 1}.png`;
    await fs.writeFile(path.join(directory, file), bytes);
    records.push({ job: receipt.job, label: image.label, frame: image.frame, now: image.now, pose: image.pose, camera: image.camera, file, bytes: bytes.length });
  }
}
await fs.writeFile(path.join(directory, 'image-manifest.json'), JSON.stringify(records, null, 2));
console.log(JSON.stringify({ images: records.length, jobs: new Set(records.map(row => row.job)).size, manifest: path.join(directory, 'image-manifest.json') }));
