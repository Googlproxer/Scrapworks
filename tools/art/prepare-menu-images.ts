import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, 'public/assets');
const results: { file: string; bytes: number }[] = [];
for (const width of [320, 640, 1024]) {
  const file = `logo-${width}.webp`;
  const result = await sharp(path.join(root, 'art/branding/title-logo-prepared.png'))
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(path.join(output, file));
  results.push({ file, bytes: result.size });
}
const background = await sharp(path.join(root, 'art/ui/menu-backdrop-v2.png'))
  .resize({ width: 1920, withoutEnlargement: true })
  .webp({ quality: 85, alphaQuality: 100, effort: 6 })
  .toFile(path.join(output, 'bg.webp'));
results.push({ file: 'bg.webp', bytes: background.size });
// Verify every derivative can be decoded before reporting success.
for (const result of results)
  await sharp(await fs.readFile(path.join(output, result.file))).metadata();
console.log(JSON.stringify(results, null, 2));
