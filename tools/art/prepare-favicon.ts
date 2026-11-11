import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '../..');
const source = path.join(root, 'art/branding/favicon-v1.png');
const original = await fs.readFile(source);
const metadata = await sharp(original).metadata();
if (!metadata.hasAlpha) throw new Error('Favicon source must have a transparent background.');
const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let left = info.width, top = info.height, right = -1, bottom = -1;
for (let y = 0; y < info.height; y++)
  for (let x = 0; x < info.width; x++)
    if (data[(y * info.width + x) * info.channels + 3] > 8) {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
if (right < left || bottom < top) throw new Error('Favicon source is empty.');
const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
const outputs: { file: string; size: number; bytes: number; sha256: string }[] = [];
for (const [size, file] of [[16, 'favicon-16.png'], [32, 'favicon.png'], [64, 'favicon-64.png']] as const) {
  const padding = size / 16;
  const bytes = await sharp(original)
    .extract(bounds)
    .resize(size - padding * 2, size - padding * 2, { fit: 'contain', background: '#00000000' })
    .extend({ top: padding, right: padding, bottom: padding, left: padding, background: '#00000000' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const result = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== size || result.info.height !== size || result.data[3] !== 0)
    throw new Error(`Invalid favicon dimensions/transparency: ${file}`);
  await fs.writeFile(path.join(root, 'public', file), bytes);
  outputs.push({ file, size, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const recordPath = path.join(root, 'art/branding/favicon.json');
const record = JSON.parse(await fs.readFile(recordPath, 'utf8')) as Record<string, unknown>;
await fs.writeFile(recordPath, JSON.stringify({ ...record, sourceDimensions: [info.width, info.height], sourceSha256: createHash('sha256').update(original).digest('hex'), cropBounds: bounds, outputs }, null, 2) + '\n');
console.log(JSON.stringify(outputs, null, 2));
