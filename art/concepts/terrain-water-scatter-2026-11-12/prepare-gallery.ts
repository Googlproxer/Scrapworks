/** Rebuild concept review artifacts only; does not generate or repaint artwork. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp, { type OverlayOptions } from 'sharp';

interface Concept {
  id: string;
  title: string;
  file: string;
  prompt: string;
  sha256: string;
  references: { file: string; sha256: string }[];
  referencedImagePaths: string[];
  generatedOriginal: string;
}
interface AssetPrompt {
  id: string;
  name: string;
  group: string;
  concept: string;
  size: string;
  triangles: string;
  priority: string;
  prompt: string;
}
interface ExistingAsset {
  name: string;
  author: string;
  url: string;
  licence: string;
  cost: string;
  formats: string;
  use: string;
  notes: string;
  counts: string;
}
const root = import.meta.dirname;
const sources = JSON.parse(await fs.readFile(path.join(root, 'existing-assets.json'), 'utf8')) as {
  candidates: ExistingAsset[];
};
const manifest = JSON.parse(await fs.readFile(path.join(root, 'generation.json'), 'utf8')) as {
  outputs: Concept[];
};
const prompts = JSON.parse(await fs.readFile(path.join(root, 'meshy-prompts.json'), 'utf8')) as {
  assets: AssetPrompt[];
};
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const integrity: {
  id: string;
  file: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  promptSha256: string;
  references: { file: string; sha256: string }[];
}[] = [];
const layers: OverlayOptions[] = [];
await fs.mkdir(path.join(root, 'previews'), { recursive: true });
for (const [index, concept] of manifest.outputs.entries()) {
  const source = path.join(root, concept.file);
  const bytes = await fs.readFile(source);
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height || metadata.format !== 'png')
    throw new Error(`Invalid original PNG: ${source}`);
  if (hash(bytes) !== concept.sha256) throw new Error(`Original was modified: ${source}`);
  const references = await Promise.all(
    concept.references.map(async (reference) => {
      const sha256 = hash(await fs.readFile(path.resolve(root, reference.file)));
      if (sha256 !== reference.sha256) throw new Error(`Reference was modified: ${reference.file}`);
      return { file: reference.file, sha256 };
    }),
  );
  integrity.push({
    id: concept.id,
    file: concept.file,
    bytes: bytes.length,
    sha256: hash(bytes),
    width: metadata.width,
    height: metadata.height,
    promptSha256: hash(concept.prompt),
    references,
  });
  await sharp(bytes)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 86 })
    .toFile(path.join(root, 'previews', concept.id + '.webp'));
  const tile = await sharp(bytes)
    .resize(700, 470, { fit: 'contain', background: '#f5e6ce' })
    .png()
    .toBuffer();
  const label = Buffer.from(
    `<svg width="700" height="50"><rect width="700" height="50" fill="#142e3f"/><text x="16" y="32" fill="#f5e6ce" font-family="sans-serif" font-size="20">${escape(concept.title)}</text></svg>`,
  );
  const left = (index % 2) * 700,
    top = Math.floor(index / 2) * 520;
  layers.push({ input: tile, left, top }, { input: label, left, top: top + 470 });
}
await sharp({ create: { width: 1400, height: 1560, channels: 3, background: '#f5e6ce' } })
  .composite(layers)
  .png()
  .toFile(path.join(root, 'overview.png'));
await fs.writeFile(
  path.join(root, 'image-integrity.json'),
  JSON.stringify(integrity, null, 2) + '\n',
);

for (const asset of prompts.assets) {
  if (asset.prompt.length > 800) throw new Error(`Prompt exceeds 800 characters: ${asset.id}`);
  if (!manifest.outputs.some((concept) => concept.id === asset.concept))
    throw new Error(`Missing concept for ${asset.id}`);
}
const figure = (concept: Concept, hero = false) => {
  const item = integrity.find((record) => record.id === concept.id)!;
  return `<figure${hero ? ' class="hero"' : ''}><a href="${concept.file}"><img src="${hero ? concept.file : `previews/${concept.id}.webp`}" width="${item.width}" height="${item.height}" alt="${escape(concept.title)} concept board"${hero ? '' : ' loading="lazy"'}></a><figcaption><strong>${escape(concept.title)}</strong><a href="${concept.file}">Full-size PNG</a></figcaption></figure>`;
};
const hero = manifest.outputs.find((concept) => concept.id === '06-gameplay-proposal');
if (!hero) throw new Error('Missing gameplay proposal');
const groups = [...new Set(prompts.assets.map((asset) => asset.group))];
const promptGroups = groups
  .map(
    (group) =>
      `<section><h3>${escape(group)}</h3>${prompts.assets
        .filter((asset) => asset.group === group)
        .map(
          (asset) =>
            `<details><summary><strong>${asset.id} · ${escape(asset.name)}</strong><span>${escape(asset.priority)}</span></summary><p>${escape(asset.size)} · Final Blender target: ${escape(asset.triangles)} triangles.</p><p><a href="images/${asset.concept}.png">Concept reference</a></p><label for="prompt-${asset.id}">Copyable ${asset.id} prompt</label><textarea id="prompt-${asset.id}" readonly spellcheck="false" rows="8">${escape(asset.prompt)}</textarea></details>`,
        )
        .join('')}</section>`,
  )
  .join('');
const existingCards = sources.candidates
  .map(
    (asset) =>
      `<article><h3><a href="${escape(asset.url)}">${escape(asset.name)}</a></h3><p>${escape(asset.author)} · ${escape(asset.cost)} · ${escape(asset.licence)}</p><p><strong>${escape(asset.use)}</strong></p><p>${escape(asset.formats)}. ${escape(asset.counts)}</p><p>${escape(asset.notes)}</p></article>`,
  )
  .join('');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scrapworks terrain water and small scatter concepts</title><link rel="icon" href="data:,"><style>
:root{color-scheme:dark;font:16px/1.55 system-ui,sans-serif;background:#10232c;color:#f4e7cf}*{box-sizing:border-box}body{margin:0}main{max-width:1600px;margin:auto;padding:24px}header{max-width:1000px;margin:16px 0 30px}h1{font-size:clamp(2rem,5vw,3.8rem);line-height:1.1;margin:12px 0 22px}h2{font-size:1.8rem;padding-top:20px}h3{font-size:1.3rem}.eyebrow{font-size:.85rem;letter-spacing:.12em;text-transform:uppercase;color:#ffbda3}p{max-width:90ch}a{color:#ffcfb9;text-underline-offset:.2em}a:focus-visible,summary:focus-visible,textarea:focus-visible{outline:3px solid #83e5cc;outline-offset:4px}nav{display:flex;flex-wrap:wrap;gap:12px 24px;padding:16px 0;border-block:1px solid #69847f;margin-bottom:26px}.note{border-left:4px solid #ffad89;padding:8px 20px;color:#e5e5d7}.boards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,540px),1fr));gap:24px}figure{margin:0;background:#233e48}figure>a{display:block;background:#f5e6ce}img{width:100%;height:auto;display:block}figcaption{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:14px 18px;flex-wrap:wrap}.hero{margin-bottom:26px}details{padding:14px 18px;background:#1d363e;border:1px solid #718d85;border-radius:5px;margin:12px 0}summary{cursor:pointer;display:list-item}summary span{display:inline-block;margin-left:18px;color:#d1ded6;font-size:.9rem}label{display:block;font-weight:600;margin-bottom:8px}textarea{display:block;width:100%;resize:vertical;color:#f2ede0;background:#10252e;border:1px solid #8ba79d;border-radius:3px;font:15px/1.6 ui-monospace,monospace;padding:14px;min-height:200px}footer{padding:28px 0 10px;color:#c8d6d0}@media(max-width:600px){main{padding:14px}summary span{display:block;margin:4px 0 0 20px}figcaption{padding:12px}}
</style></head><body><main><header><p class="eyebrow">Scrapworks · 12 November 2026 · Concept review</p><h1>Terrain, water and small scatter</h1><p>Six concepts explore layered ground variation, shaped water banks and small real 3D rocks and plants. The approved protagonist remains the finish reference.</p><p class="note">Imagegen concept art, not implemented gameplay. Texture seams, exact modular joins, mesh budgets and runtime performance still need asset preparation and in-game validation.</p></header>
<nav aria-label="Review navigation"><a href="#existing">Existing asset packs</a><a href="#concepts">Concept boards</a><a href="#prompts">15 Meshy prompts</a><a href="overview.png">All-board overview</a><a href="meshy-prompts.md">Prompt pack</a><a href="meshy-prompts.json" download>Prompt JSON</a><a href="README.md">Design notes and provenance</a></nav>
<section id="existing"><h2>Existing assets to review first</h2><p>To reduce AI generation, start with KayKit's free nature tier. The other packs provide alternative shapes and useful published geometry budgets. These are potential sources; no models have been downloaded or imported. Triangle counts are creator-published.</p><div class="boards">${existingCards}</div><p><a href="existing-assets.md">Full shortlist and suggested sample</a></p></section>
${figure(hero, true)}
<section id="concepts"><h2>Ground, shoreline and scatter studies</h2><div class="boards">${manifest.outputs
  .filter((concept) => concept !== hero)
  .map((concept) => figure(concept))
  .join('')}</div></section>
<section id="prompts"><h2>Copyable Meshy prompts for remaining gaps</h2><p>Review existing models first; retain these prompts for missing silhouettes. The initial sample IDs are R1, R2, R3, P1, P2, P5 and P6. Open an asset, focus its text field, then select all and copy. Submit one asset at a time. Use one clean concept view for image-to-3D rather than a complete catalogue sheet.</p><p class="note">Counts below are proposed final triangulated Blender budgets. They are not guaranteed Meshy generation counts. S1–S3 are optional bank shape studies: fit their joins in Blender, keep the water plane separate and use the authored water outline for final coverage.</p>${promptGroups}</section>
<footer><a href="generation.json">Exact image prompts and references</a> · <a href="image-integrity.json">Image and input hashes</a><p>Built-in imagegen generated the concept artwork. No Meshy request was submitted and no runtime code or CI workflow was changed.</p></footer></main></body></html>`;
await fs.writeFile(path.join(root, 'index.html'), html);
console.log(
  JSON.stringify({
    concepts: manifest.outputs.length,
    prompts: prompts.assets.length,
    originalsVerified: integrity.length,
    output: root,
  }),
);
