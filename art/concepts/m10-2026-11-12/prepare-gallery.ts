import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp, { type OverlayOptions } from 'sharp';

interface Concept {
  id: string;
  title: string;
  group: string;
  file: string;
}
interface Manifest { outputs: Concept[] }
const root = import.meta.dirname;
const partial = process.argv.includes('--partial');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'generation.json'), 'utf8')) as Manifest;
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const existing: Concept[] = [];
const integrity: { id: string; file: string; bytes: number; sha256: string; width: number; height: number }[] = [];
await fs.mkdir(path.join(root, 'previews'), { recursive: true });
for (const concept of manifest.outputs) {
  const source = path.join(root, concept.file);
  let bytes: Buffer;
  try { bytes = await fs.readFile(source); }
  catch (error) { if (partial && (error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) throw new Error(`Invalid image: ${source}`);
  await sharp(bytes).resize({ width: 640, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(root, 'previews', concept.id + '.webp'));
  integrity.push({ id: concept.id, file: concept.file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), width: metadata.width, height: metadata.height });
  existing.push(concept);
}

async function board(name: string, concepts: Concept[], columns: number, width: number, height: number) {
  const layers: OverlayOptions[] = [];
  for (const [i, concept] of concepts.entries()) {
    const tile = await sharp(path.join(root, concept.file)).resize(width, height - 38, { fit: 'contain', background: '#f4e7cf' }).png().toBuffer();
    const label = Buffer.from(`<svg width="${width}" height="38"><rect width="${width}" height="38" fill="#142c40"/><text x="12" y="25" fill="#f1e1bd" font-family="sans-serif" font-size="17">${escape(concept.title)}</text></svg>`);
    layers.push({ input: tile, left: (i % columns) * width, top: Math.floor(i / columns) * height });
    layers.push({ input: label, left: (i % columns) * width, top: Math.floor(i / columns) * height + height - 38 });
  }
  await sharp({ create: { width: columns * width, height: Math.ceil(concepts.length / columns) * height, channels: 3, background: '#f4e7cf' } }).composite(layers).png().toFile(path.join(root, name));
}
await board('machinery-overview.png', existing.filter((c) => c.group === 'machines'), 5, 320, 350);
await board('world-overview.png', existing.filter((c) => c.group !== 'machines' && c.group !== 'gameplay'), 4, 400, 330);
const gameplay = existing.filter((c) => c.group === 'gameplay');
if (gameplay.length) await board('gameplay-overview.png', gameplay, 2, 800, 538);

const groups = [
  ['gameplay', 'Gameplay concepts'], ['machines', 'All 19 placeable kinds'],
  ['environment', 'Terrain, water and deposits'], ['character', 'Character finish'],
  ['feedback', 'Ports and placement'], ['props', 'Movable props'], ['branding', 'Favicon proposal'],
];
const sections = groups.map(([id, title]) => `<section id="${id}"><h2>${title}</h2><div class="cards ${id === 'gameplay' ? 'screens' : ''}">${existing.filter((c) => c.group === id).map((c) => `<figure><a href="${c.file}" aria-label="Open full-size ${escape(c.title)}"><img src="previews/${c.id}.webp" alt="${escape(c.title)} concept" width="640" height="480" loading="lazy"></a><figcaption><strong>${escape(c.title)}</strong><a href="${c.file}">Full-size PNG</a></figcaption></figure>`).join('')}</div></section>`).join('\n');
await fs.writeFile(path.join(root, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scrapworks — M10 visual concepts</title><style>
:root{color-scheme:dark;font:16px/1.55 system-ui,sans-serif;background:#101f2b;color:#f1e1bd}*{box-sizing:border-box}body{margin:0}main{max-width:1720px;margin:auto;padding:24px}header{max-width:1000px;margin:12px 0 32px}h1{font-size:clamp(2rem,5vw,4rem);line-height:1.05;margin:12px 0 24px;color:#fff1cf}h2{font-size:1.6rem;padding-top:24px}p{max-width:85ch}a{color:#ffd4b5;text-underline-offset:.2em}a:focus-visible{outline:3px solid #f08a65;outline-offset:5px}.tag{font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#f08a65}nav{display:flex;flex-wrap:wrap;gap:12px 24px;padding:16px 0;border-block:1px solid #627587}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:24px}.screens{grid-template-columns:repeat(auto-fit,minmax(min(100%,600px),1fr))}figure{margin:0;background:#243b4b}figure>a{display:block;background:#f4e7cf}img{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:contain}figcaption{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:14px;flex-wrap:wrap}figcaption a{font-size:.85rem}.note{border-left:4px solid #f08a65;padding-left:16px;color:#d3dedb}footer{margin:48px 0 16px}
</style></head><body><main><header><span class="tag">Scrapworks / Visual development / 12 November 2026</span><h1>A repaired world.<br>A clearer working factory.</h1><p>Four gameplay proposals and 32 individual asset/group concept sheets, based on the M10 audit and the existing cream, navy and coral direction. Open any image for its full-resolution original.</p><p class="note">These are generated concept illustrations, not runtime screenshots or validated 3D designs. The flat finish requires renderer/shader work alongside geometry, textures and lighting. Diagram dimensions, port arrows and depicted connections are illustrative; implementation must follow the current simulation contracts.</p><nav aria-label="Concept groups">${groups.map(([id, title]) => `<a href="#${id}">${title}</a>`).join('')}</nav></header>${sections}<footer><a href="README.md">Read the scope and review notes</a> · <a href="generation.json">Exact prompts and provenance</a> · <a href="image-integrity.json">Image inventory and hashes</a></footer></main></body></html>`);
await fs.writeFile(path.join(root, 'image-integrity.json'), JSON.stringify({ generatedAt: new Date().toISOString(), complete: !partial, images: integrity }, null, 2) + '\n');
console.log({ images: existing.length, machinery: existing.filter((c) => c.group === 'machines').length, gameplay: gameplay.length, partial });
