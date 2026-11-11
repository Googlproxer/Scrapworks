import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import ts from 'typescript';

interface SpriteAsset {
  id: string;
  name: string;
  group: string;
  source: string;
}

const root = path.resolve(import.meta.dirname, '../..');
const directory = path.join(root, 'art/ui/sprites/v1');
const generation = JSON.parse(
  await fs.readFile(path.join(directory, 'generation.json'), 'utf8'),
) as {
  assets: SpriteAsset[];
};
const assets = generation.assets;
if (new Set(assets.map((a) => a.id)).size !== assets.length) throw new Error('Duplicate sprite ID');
for (const asset of assets) {
  if (!/^[a-z][a-z0-9-]*$/.test(asset.id) || asset.source !== 'sources/' + asset.id + '.png')
    throw new Error('Invalid sprite path: ' + asset.id);
}

// Read static catalogue declarations without loading simulation code or running the game.
async function initializer(file: string, name: string): Promise<ts.Expression> {
  const source = ts.createSourceFile(
    file,
    await fs.readFile(path.join(root, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations)
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer
      )
        return declaration.initializer;
  }
  throw new Error('Missing catalogue declaration: ' + name);
}

function key(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  throw new Error('Unexpected computed catalogue key');
}

function property(object: ts.Expression, name: string): ts.Expression {
  if (!ts.isObjectLiteralExpression(object)) throw new Error('Expected catalogue object');
  const entry = object.properties.find((p) => ts.isPropertyAssignment(p) && key(p.name) === name);
  if (!entry || !ts.isPropertyAssignment(entry))
    throw new Error('Missing catalogue property: ' + name);
  return entry.initializer;
}

function blueprintIds(array: ts.Expression): string[] {
  if (!ts.isArrayLiteralExpression(array)) throw new Error('Expected blueprint array');
  return array.elements
    .filter((entry) => !ts.isSpreadElement(entry))
    .map((entry) => {
      const id = property(entry, 'id');
      if (!ts.isStringLiteral(id)) throw new Error('Expected literal blueprint ID');
      return id.text;
    });
}

const itemObject = property(
  await initializer('src/content/opening.ts', 'OPENING_CONTENT'),
  'items',
);
if (!ts.isObjectLiteralExpression(itemObject)) throw new Error('Missing item catalogue');
const currentIds = [
  ...itemObject.properties.filter(ts.isPropertyAssignment).map((p) => key(p.name)),
  ...blueprintIds(await initializer('src/content/first-factory.ts', 'EQUIPMENT_BLUEPRINTS')),
  ...blueprintIds(await initializer('src/content/environment.ts', 'ENVIRONMENT_BLUEPRINTS')),
];
const extras = ['mini-fabricator', 'water-clean', 'water-untreated'];
const expected = new Set([...currentIds, ...extras]);
const missing = [...expected].filter((id) => !assets.some((a) => a.id === id));
const unexpected = assets.filter((a) => !expected.has(a.id)).map((a) => a.id);
if (missing.length || unexpected.length) throw new Error(JSON.stringify({ missing, unexpected }));

const sizes = [64, 128, 256] as const;
for (const size of sizes)
  await fs.mkdir(path.join(directory, 'png', String(size)), { recursive: true });
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const records = [];
const columns = 8;
const cell = 256;
const atlasLayers: { input: string; left: number; top: number }[] = [];
const sheetLayers: { input: string; left: number; top: number }[] = [];
const sheetColumns = 6;
const sheetCellWidth = 240;
const sheetCellHeight = 224;
const sheetWidth = sheetColumns * sheetCellWidth + 64;
const sheetHeight = Math.ceil(assets.length / sheetColumns) * sheetCellHeight + 160;
const xml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
const sheetMarkup = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    sheetWidth +
    '" height="' +
    sheetHeight +
    '">',
  '<rect width="100%" height="100%" fill="#102838"/>',
  '<path d="M32 24 H620 L642 46 V94 H32Z" fill="#F1E1BD"/>',
  '<path d="M620 24 L654 30 V80 L642 94 V46Z" fill="#F08A65"/>',
  '<text x="50" y="68" font-family="Arial,sans-serif" font-size="31" font-weight="800" fill="#142C40">SCRAPWORKS / UI SPRITES</text>',
  '<text x="32" y="120" font-family="Arial,sans-serif" font-size="17" fill="#F1E1BD">31 transparent sprites · first art pass · resources, tools, machines and utilities</text>',
];

for (const [index, asset] of assets.entries()) {
  const source = path.join(directory, asset.source);
  const metadata = await sharp(source).metadata();
  if (!metadata.hasAlpha) throw new Error('Source has no alpha: ' + asset.id);
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width,
    top = info.height,
    right = -1,
    bottom = -1;
  let transparentPixels = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha === 0) transparentPixels++;
      if (alpha > 1) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  if (
    right < left ||
    left === 0 ||
    top === 0 ||
    right === info.width - 1 ||
    bottom === info.height - 1
  )
    throw new Error('Empty or edge-clipped sprite: ' + asset.id);
  const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
  for (const size of sizes) {
    const inner = Math.floor(size * 0.84);
    const { data: scaled, info: scaledInfo } = await sharp(source)
      .extract(bounds)
      .resize(inner, inner, { fit: 'inside', kernel: 'lanczos3' })
      .png()
      .toBuffer({ resolveWithObject: true });
    const output = path.join(directory, 'png', String(size), asset.id + '.png');
    await sharp({ create: { width: size, height: size, channels: 4, background: transparent } })
      .composite([
        {
          input: scaled,
          left: Math.floor((size - scaledInfo.width) / 2),
          top: Math.floor((size - scaledInfo.height) / 2),
        },
      ])
      .png()
      .toFile(output);
    const decoded = await sharp(output).metadata();
    if (decoded.width !== size || decoded.height !== size || !decoded.hasAlpha)
      throw new Error('Invalid export: ' + output);
  }
  const frame = {
    x: (index % columns) * cell,
    y: Math.floor(index / columns) * cell,
    w: cell,
    h: cell,
  };
  atlasLayers.push({
    input: path.join(directory, 'png/256', asset.id + '.png'),
    left: frame.x,
    top: frame.y,
  });
  records.push({
    id: asset.id,
    name: asset.name,
    group: asset.group,
    source: asset.source,
    sourceSha256: createHash('sha256')
      .update(await fs.readFile(source))
      .digest('hex'),
    sourceSize: { width: info.width, height: info.height },
    sourceBounds: bounds,
    transparentFraction: Number((transparentPixels / (info.width * info.height)).toFixed(4)),
    png: Object.fromEntries(sizes.map((size) => [size, 'png/' + size + '/' + asset.id + '.png'])),
    frame,
  });
  const x = 32 + (index % sheetColumns) * sheetCellWidth;
  const y = 144 + Math.floor(index / sheetColumns) * sheetCellHeight;
  sheetMarkup.push(
    '<path d="M' +
      x +
      ' ' +
      (y + 10) +
      ' L' +
      (x + 10) +
      ' ' +
      y +
      ' H' +
      (x + 218) +
      ' L' +
      (x + 228) +
      ' ' +
      (y + 10) +
      ' V' +
      (y + 204) +
      ' H' +
      x +
      'Z" fill="#203C4E" stroke="#496273"/>',
    '<text x="' +
      (x + 114) +
      '" y="' +
      (y + 177) +
      '" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#FFF1CF">' +
      xml(asset.name) +
      '</text>',
    '<text x="' +
      (x + 114) +
      '" y="' +
      (y + 195) +
      '" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#BCD0D7">' +
      xml(asset.id) +
      '</text>',
  );
  sheetLayers.push({
    input: path.join(directory, 'png/128', asset.id + '.png'),
    left: x + 50,
    top: y + 22,
  });
}
sheetMarkup.push('</svg>');
await sharp({
  create: {
    width: columns * cell,
    height: Math.ceil(assets.length / columns) * cell,
    channels: 4,
    background: transparent,
  },
})
  .composite(atlasLayers)
  .png()
  .toFile(path.join(directory, 'atlas.png'));
await sharp(Buffer.from(sheetMarkup.join('')))
  .composite(sheetLayers)
  .png()
  .toFile(path.join(directory, 'contact-sheet.png'));
await fs.writeFile(
  path.join(directory, 'atlas.json'),
  JSON.stringify(
    {
      image: 'atlas.png',
      size: { width: columns * cell, height: Math.ceil(assets.length / columns) * cell },
      cellSize: cell,
      columns,
      normalizedOccupancy: 0.84,
      catalogueCount: currentIds.length,
      supplementalIds: extras,
      preparation:
        'Ignore generator alpha=1 padding noise when finding bounds; crop padding, proportionally resize into 84% of each square and center with real alpha. Pixel colors and in-bound alpha are retained. Generated sources are unchanged.',
      sprites: records,
    },
    null,
    2,
  ) + '\n',
);

const cards = assets
  .map(
    (asset) =>
      '<article><h2>' +
      xml(asset.name) +
      '</h2><code>' +
      xml(asset.id) +
      '</code>' +
      '<a class="large" href="' +
      asset.source +
      '" aria-label="Open original ' +
      xml(asset.name) +
      '">' +
      '<img src="png/128/' +
      asset.id +
      '.png" alt="' +
      xml(asset.name) +
      '" width="128" height="128"></a>' +
      '<div class="samples" aria-label="Size and background comparison">' +
      [32, 48, 64]
        .map(
          (size, i) =>
            '<figure><div class="swatch swatch-' +
            i +
            '"><img src="png/64/' +
            asset.id +
            '.png" alt="" width="' +
            size +
            '" height="' +
            size +
            '"></div><figcaption>' +
            size +
            ' px</figcaption></figure>',
        )
        .join('') +
      '</div></article>',
  )
  .join('\n');
await fs.writeFile(
  path.join(directory, 'index.html'),
  [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Scrapworks UI sprites — first pass</title><style>',
    '*{box-sizing:border-box}body{margin:0;background:#102838;color:#fff1cf;font:16px/1.5 "Segoe UI",Arial,sans-serif}',
    'main{max-width:1600px;margin:auto;padding:32px}h1{font-size:clamp(26px,4vw,46px);line-height:1.15;margin:0 0 12px}header{border-left:8px solid #f08a65;padding-left:24px;margin-bottom:32px}',
    'p{max-width:80ch}a{color:#fff1cf;text-underline-offset:4px}a:focus-visible{outline:3px solid #f08a65;outline-offset:4px}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px}',
    'article{background:#203c4e;border:1px solid #718a98;padding:20px}h2{font-size:20px;line-height:1.3;min-height:52px;margin:0}code{color:#c3d5dc;font-size:14px;overflow-wrap:anywhere}',
    '.large{display:grid;place-items:center;height:156px;margin:12px 0;background:#142c40}.large img{display:block;object-fit:contain}',
    '.samples{display:flex;gap:8px;justify-content:space-between}figure{margin:0;text-align:center;flex:1}.swatch{height:76px;display:grid;place-items:center;border:1px solid #718a98}',
    '.swatch-0{background:#142c40}.swatch-1{background:#f1e1bd}.swatch-2{background:#45634b}figcaption{font-size:14px;margin-top:5px}footer{margin-top:32px}',
    '@media(max-width:480px){main{padding:16px}header{padding-left:16px}.grid{gap:16px}}',
    '</style></head><body><main><header><h1>Scrapworks / UI sprites</h1>',
    '<p>31 transparent sprites. Resources, components, the prybar, all current placeables, the MiniFab, and two water indicators. First art pass for review.</p>',
    '<p><a href="contact-sheet.png">Full contact sheet</a> · <a href="atlas.png">Transparent atlas</a> · <a href="README.md">Asset guide</a></p>',
    '<p>Each card shows 128 px, then 32 px on navy, 48 px on cream, and 64 px on green. Select the large illustration to open its untouched original.</p></header>',
    '<section class="grid" aria-label="Sprite catalogue">' + cards + '</section>',
    '<footer>Generated artwork for UI use. Names and counts stay in UI text. Sources, prompts and preparation instructions are kept with this set.</footer>',
    '</main></body></html>',
  ].join('\n'),
);
console.log(
  JSON.stringify(
    {
      sprites: assets.length,
      currentCatalogue: currentIds.length,
      supplemental: extras,
      sizes,
      atlas: [columns * cell, Math.ceil(assets.length / columns) * cell],
      sourceAlphaAndMargins: 'passed',
    },
    null,
    2,
  ),
);
