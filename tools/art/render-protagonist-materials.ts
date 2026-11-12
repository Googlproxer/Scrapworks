/** Local-only real WebGL visual comparisons. Never run as a CI gameplay route. */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { variants, bandVariants } from '../../art/shaders/protagonist-builtins/presets.ts';
import type {
  RenderRequest,
  RenderResult,
  Variant,
  View,
  VariantDescription,
} from '../../art/shaders/protagonist-builtins/presets.ts';

const root = path.resolve(import.meta.dirname, '../..');
const { values } = parseArgs({
  options: {
    output: { type: 'string' },
    bands: { type: 'boolean' },
    serve: { type: 'boolean' },
    help: { type: 'boolean' },
  },
});
if (values.help) {
  console.log(
    'node tools/art/render-protagonist-materials.ts [--bands] [--output <local directory>] [--serve]',
  );
  process.exit(0);
}
const output = path.resolve(
  root,
  values.output ??
    `docs/reports/rendering/2026-11-12/protagonist-builtins${values.bands ? '/band-softening' : ''}`,
);
const candidates: readonly VariantDescription[] = values.bands ? bandVariants : variants;
await fs.mkdir(path.join(output, 'fixture'), { recursive: true });
await fs.mkdir(path.join(output, 'renders'), { recursive: true });
await build({
  entryPoints: [path.join(root, 'art/shaders/protagonist-builtins/fixture.ts')],
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outdir: path.join(output, 'fixture'),
  entryNames: 'main',
  chunkNames: 'chunks/[name]-[hash]',
  minify: true,
  sourcemap: false,
  logLevel: 'warning',
});
await fs.writeFile(
  path.join(output, 'fixture/index.html'),
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>Protagonist material fixture</title><link rel="icon" href="data:,"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#e7d8c1}canvas{display:block;width:100%;height:100%}</style><canvas aria-label="Actual Babylon protagonist material render"></canvas><script type="module" src="./main.js"></script></html>`,
);
const modelPath = path.join(root, 'public/assets/models/protagonist-v3.glb');
const modelBytes = await fs.readFile(modelPath);
interface GltfAlbedo {
  materials: { pbrMetallicRoughness: { baseColorTexture: { index: number } } }[];
  textures: { source?: number; extensions?: { EXT_texture_webp?: { source: number } } }[];
  images: { bufferView: number; mimeType: string }[];
  bufferViews: { byteOffset?: number; byteLength: number }[];
}
if (
  modelBytes.readUInt32LE(0) !== 0x46546c67 ||
  modelBytes.readUInt32LE(4) !== 2 ||
  modelBytes.readUInt32LE(16) !== 0x4e4f534a
)
  throw new Error('Expected GLB 2 with JSON first');
const jsonEnd = 20 + modelBytes.readUInt32LE(12);
const gltf = JSON.parse(modelBytes.subarray(20, jsonEnd).toString('utf8')) as GltfAlbedo;
const baseTexture = gltf.textures[gltf.materials[0].pbrMetallicRoughness.baseColorTexture.index];
const imageIndex = baseTexture.extensions?.EXT_texture_webp?.source ?? baseTexture.source;
if (imageIndex === undefined || modelBytes.readUInt32LE(jsonEnd + 4) !== 0x004e4942)
  throw new Error('Missing embedded base-colour image or BIN chunk');
const image = gltf.images[imageIndex];
if (image.mimeType !== 'image/webp') throw new Error('Expected original WebP albedo');
const imageView = gltf.bufferViews[image.bufferView];
const imageStart = jsonEnd + 8 + (imageView.byteOffset ?? 0);
const albedoBytes = modelBytes.subarray(imageStart, imageStart + imageView.byteLength);
await fs.writeFile(path.join(output, 'fixture/base-color.webp'), albedoBytes);
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/model.glb') {
      response.setHeader('Content-Type', 'model/gltf-binary');
      response.end(modelBytes);
      return;
    }
    const target = path.resolve(
      output,
      '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
    );
    if (!target.startsWith(output + path.sep)) throw new Error('Path outside report');
    const mime: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.json': 'application/json',
    };
    response.setHeader('Content-Type', mime[path.extname(target)] ?? 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(await fs.readFile(target));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing preview port');
const baseUrl = `http://127.0.0.1:${address.port}`;
const errors: string[] = [];
const shots: { file: string; result: RenderResult }[] = [];

function observe(page: Page, browserName: string): void {
  page.on('pageerror', (error) => errors.push(`${browserName}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${browserName}: ${message.text()}`);
  });
}
async function ready(page: Page): Promise<void> {
  await page.goto(baseUrl + '/fixture/index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => window.protagonistTest || window.protagonistTestError,
    undefined,
    { timeout: 90000 },
  );
  const error = await page.evaluate(() => window.protagonistTestError);
  if (error) throw new Error(error);
}
async function render(page: Page, request: RenderRequest): Promise<RenderResult> {
  return page.evaluate(async (value) => {
    if (!window.protagonistTest)
      throw new Error(window.protagonistTestError ?? 'Fixture not ready');
    return window.protagonistTest.render(value);
  }, request);
}
async function shot(page: Page, request: RenderRequest, suffix = ''): Promise<void> {
  const overhead = request.view.startsWith('overhead');
  await page.setViewportSize(overhead ? { width: 1280, height: 800 } : { width: 640, height: 900 });
  const result = await render(page, request);
  if (
    result.triangles !== 104972 ||
    result.skinInfluences[0] !== 8 ||
    result.albedoSize.width !== 2048 ||
    result.albedoSize.height !== 2048
  )
    throw new Error(`Full mesh/skinning contract changed: ${JSON.stringify(result)}`);
  const file = `${request.variant}-${request.view}${request.shadows ? '' : '-no-shadow'}${suffix}.png`;
  await page.locator('canvas').screenshot({ path: path.join(output, 'renders', file) });
  shots.push({ file, result });
  console.log(`Rendered ${file}`);
}

let completed = false;
try {
  const browser = await chromium.launch({ headless: true });
  let crossBrowser: RenderResult[] = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 640, height: 900 },
      deviceScaleFactor: 1,
    });
    observe(page, 'Chromium');
    await ready(page);
    for (const variant of candidates) {
      for (const view of [
        'front',
        'three-quarter',
        'back',
        'overhead-near',
        'overhead-default',
      ] as const)
        await shot(page, { variant: variant.id, view, shadows: variant.id !== 'current' });
    }
    if (values.bands)
      for (const view of ['front', 'three-quarter', 'overhead-near'] as const)
        await shot(page, { variant: 'cell-feather-zero', view, shadows: true });
    const detailVariants: readonly Variant[] = values.bands
      ? ['cell-feather-subtle']
      : ['cell-high', 'cell-soft'];
    for (const variant of detailVariants) {
      await shot(page, { variant, view: 'three-quarter', shadows: false });
      await shot(page, { variant, view: 'overhead-near', shadows: false });
      for (const pose of ['Walk', 'Run'] as const)
        await shot(
          page,
          { variant, view: 'three-quarter', shadows: true, pose, phase: 0.3 },
          `-${pose.toLowerCase()}`,
        );
    }
    await page.evaluate(() => window.protagonistTest?.dispose());
  } finally {
    await browser.close();
  }

  const zeroWidthChecks: {
    view: View;
    meanAbsoluteRgbError: number;
    changedPixelsOver8: number;
  }[] = [];
  if (values.bands) {
    for (const view of ['front', 'three-quarter', 'overhead-near'] as const) {
      const reference = await sharp(path.join(output, 'renders', `cell-soft-${view}.png`))
        .removeAlpha()
        .raw()
        .toBuffer();
      const control = await sharp(path.join(output, 'renders', `cell-feather-zero-${view}.png`))
        .removeAlpha()
        .raw()
        .toBuffer();
      if (reference.length !== control.length) throw new Error('Control image sizes differ');
      let error = 0,
        changedPixels = 0;
      for (let index = 0; index < reference.length; index += 3) {
        let max = 0;
        for (let channel = 0; channel < 3; channel++) {
          const difference = Math.abs(reference[index + channel] - control[index + channel]);
          error += difference;
          max = Math.max(max, difference);
        }
        if (max > 8) changedPixels++;
      }
      zeroWidthChecks.push({
        view,
        meanAbsoluteRgbError: error / reference.length,
        changedPixelsOver8: changedPixels,
      });
    }
    console.log(JSON.stringify({ zeroWidthChecks }));
  }

  // A small independent WebGL compatibility check, not a second gameplay route.
  const other = await firefox.launch({ headless: true });
  try {
    const page = await other.newPage({
      viewport: { width: 640, height: 900 },
      deviceScaleFactor: 1,
    });
    observe(page, 'Firefox');
    await ready(page);
    const checks: readonly Variant[] = values.bands
      ? ['cell-soft', 'cell-feather-zero', 'cell-feather-subtle']
      : ['pbr-matte', 'cell-high', 'cell-basic'];
    for (const variant of checks)
      crossBrowser.push(await render(page, { variant, view: 'three-quarter', shadows: true }));
    await page.locator('canvas').screenshot({
      path: path.join(
        output,
        values.bands ? 'renders/firefox-blend-check.png' : 'renders/firefox-cell-basic-check.png',
      ),
    });
    crossBrowser.push(
      await render(page, { variant: 'cell-soft', view: 'three-quarter', shadows: true }),
    );
    await page
      .locator('canvas')
      .screenshot({ path: path.join(output, 'renders/firefox-cell-soft-check.png') });
    await page.evaluate(() => window.protagonistTest?.dispose());
  } finally {
    await other.close();
  }

  const esc = (value: string): string =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const imageFor = (variant: Variant, view: View, shadows = variant !== 'current'): string => {
    const found = shots.find(
      (item) =>
        item.result.request.variant === variant &&
        item.result.request.view === view &&
        item.result.request.shadows === shadows &&
        !item.result.request.pose,
    );
    if (!found) throw new Error(`Missing render ${variant}/${view}`);
    return `renders/${found.file}`;
  };
  const styles = `*{box-sizing:border-box}body{margin:0;padding:28px;background:#f3eadb;color:#18313e;font-family:'Segoe UI',sans-serif}h1{font-size:30px;margin:0 0 8px}h2{font-size:24px;margin:28px 0 12px}p{font-size:17px;line-height:1.5;max-width:1100px;margin:6px 0 18px}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}figure{margin:0;border:1px solid #c1ae91;background:#e7d8c1;overflow:hidden}figcaption{padding:12px;background:#fff8ec;min-height:82px}strong{display:block;font-size:20px;margin-bottom:4px}small{font-size:15px;line-height:1.4;display:block}img{width:100%;height:auto;display:block}a{color:#075d7a}select{font:inherit;margin:0 8px 12px;padding:8px}label{font-weight:600}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.note{padding:14px;border-left:4px solid #c85837;background:#fff8ec}@media(max-width:900px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:550px){.cards,.pair{grid-template-columns:1fr}}`;
  function cards(view: View, selected: readonly VariantDescription[] = candidates): string {
    return selected
      .map(
        (item) =>
          `<figure><a href="${imageFor(item.id, view)}"><img alt="${esc(item.label)} ${view}" src="${imageFor(item.id, view)}"></a><figcaption><strong>${esc(item.label)}</strong><small>${esc(item.detail)}</small></figcaption></figure>`,
      )
      .join('');
  }
  const detailVariant: Variant = values.bands ? 'cell-feather-subtle' : 'cell-soft';
  const header = values.bands
    ? `<header><h1>Scrapworks · softened lighting bands</h1><p>G is the unchanged stock Cell baseline. H/I/J retain G's lighting, original five thresholds and tone values, and blend only near band edges. Half-widths are measured in the normal/light dot product: 0.01, 0.025 and 0.05. Positive widths include a small screen-pixel antialiasing floor when derivatives are supported. No image blur, texture repaint or geometry changes.</p><p><a href="comparison-detail.png">Compare face, shoulder and clothing details</a></p><p class="note">The blended material uses Babylon CustomMaterial with a small lighting extension. The zero-width control is compared against stock G in <a href="manifest.json">the manifest</a>. Production rendering is unchanged.</p></header>`
    : `<header><h1>Scrapworks · protagonist material tests</h1><p>Actual Babylon.js 9.35 WebGL renders of the unchanged runtime GLB. Identical base-colour image bytes and frozen pose throughout, with an appropriate GPU texture upload for each material family. A reproduces the existing hemispheric rig; B–F share one sun, weak fill and 2048 PCF shadows. G uses the same Cell shader with brighter warm fill and gentler sunlight/shadows. No texture repaint, custom shader, geometry edits, outline or post-process filter.</p><p class="note">E/F/G use stock CellMaterial, including the installed basic-path defect in F. These are visual candidates, not production selections. Overhead views use a 2 m grid and plain scale blocks, not the authored game world. Browser backend/GPU and exact settings are in <a href="manifest.json">the manifest</a>.</p></header>`;
  const main = `${header}<main><h2>Matched three-quarter views</h2><div class="cards">${cards('three-quarter')}</div><h2>Front</h2><div class="cards">${cards('front')}</div><h2>Back</h2><div class="cards">${cards('back')}</div><h2>Overhead · nearest gameplay zoom (6 m)</h2><div class="cards">${cards('overhead-near')}</div><h2>Overhead · default gameplay zoom (12 m)</h2><div class="cards">${cards('overhead-default')}</div><h2>Shadows on / off</h2><div class="pair"><figure><img alt="Shadows on" src="${imageFor(detailVariant, 'overhead-near', true)}"><figcaption>Real-time shadows on</figcaption></figure><figure><img alt="Shadows off" src="${imageFor(detailVariant, 'overhead-near', false)}"><figcaption>Real-time shadows off · surface lighting retained</figcaption></figure></div><h2>Animated skinning</h2><div class="pair">${shots
    .filter((item) => item.result.request.pose)
    .map(
      (item) =>
        `<figure><img alt="${item.result.request.variant}: ${item.result.request.pose}" src="renders/${item.file}"><figcaption>${item.result.request.variant} · ${item.result.request.pose} · frozen phase 0.3 · all eight skin influences retained</figcaption></figure>`,
    )
    .join('')}</div></main>`;
  await fs.writeFile(
    path.join(output, 'index.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scrapworks protagonist material tests</title><style>${styles}</style>${main}</html>`,
  );

  // Use the browser for labelled contact sheets; images are only resized/composited.
  const galleryBrowser = await chromium.launch({ headless: true });
  try {
    const page = await galleryBrowser.newPage({
      viewport: { width: 1800, height: 100 },
      deviceScaleFactor: 1,
    });
    for (const [view, title, file] of [
      ['three-quarter', 'Matched material comparison · close view', 'comparison-close.png'],
      [
        'overhead-near',
        'Matched material comparison · 6 m gameplay camera',
        'comparison-overhead.png',
      ],
    ] as const) {
      await page.setContent(
        `<!doctype html><html lang="en"><meta charset="utf-8"><style>${styles}body{width:1800px}.cards{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}h1{font-size:30px}figcaption{min-height:105px;padding:10px}strong{font-size:22px}small{font-size:17px}</style><h1>${values.bands ? title.replace('material', 'band blend') : title}</h1><p>${values.bands ? 'G baseline · H/I/J progressively wider edge blending · same lighting, texture, pose and tone levels' : 'Actual unchanged GLB · same base-colour image · stock Babylon materials · G tests softer lighting'}</p><div class="cards">${cards(
          view,
          values.bands
            ? bandVariants
            : variants.filter((item) =>
                ['current', 'pbr-matte', 'cell-high', 'cell-soft'].includes(item.id),
              ),
        ).replaceAll(
          'src="renders/',
          `src="${baseUrl}/renders/`,
        )}</div><p>Front/back views, 12 m camera, shadows off and animation poses are in the full gallery.</p></html>`,
      );
      await page.waitForFunction(() =>
        [...document.images].every((item) => item.complete && item.naturalWidth > 0),
      );
      await page.screenshot({ path: path.join(output, file), fullPage: true });
    }
    if (values.bands) {
      await page.setContent(
        `<!doctype html><html lang="en"><meta charset="utf-8"><style>${styles}body{width:1800px}.cards{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.crop{aspect-ratio:3/4;overflow:hidden}.crop img{width:160%;max-width:none;transform:translate(-20%,-10%)}figcaption{min-height:100px}</style><h1>G lighting · progressively softer band edges</h1><p>Matched render details · original tone levels, colour texture, geometry, pose and cast shadows retained</p><div class="cards">${bandVariants.map((item) => `<figure><div class="crop"><img alt="${item.label}: face, arm and clothing detail" src="${baseUrl}/${imageFor(item.id, 'three-quarter')}"></div><figcaption><strong>${item.label}</strong><small>${item.detail}</small></figcaption></figure>`).join('')}</div><p>H barely feathers the edge. I retains the steps with a softer boundary. J shows the wider end of this comparison.</p></html>`,
      );
      await page.waitForFunction(() =>
        [...document.images].every((item) => item.complete && item.naturalWidth > 0),
      );
      await page.screenshot({ path: path.join(output, 'comparison-detail.png'), fullPage: true });
    }
    // Larger candidate panels remain readable in an inline chat preview.
    await page.setViewportSize({ width: 1440, height: 100 });
    const panelVariants: readonly Variant[] = values.bands
      ? ['cell-feather-subtle']
      : ['pbr-matte', 'cell-high', 'cell-soft'];
    for (const variant of panelVariants) {
      const descriptor = candidates.find((item) => item.id === variant)!;
      await page.setContent(
        `<!doctype html><html lang="en"><meta charset="utf-8"><style>${styles}body{width:1440px}.pair{grid-template-columns:640px 1fr;align-items:start}strong{font-size:22px}</style><h1>${descriptor.label} · actual Babylon render</h1><p>${descriptor.detail} · same source texture, unchanged mesh${values.bands ? ' · lighting-band extension' : ', no custom shader'}</p><div class="pair"><img alt="${descriptor.label}: close view" src="${baseUrl}/${imageFor(variant, 'three-quarter')}"><div><img alt="${descriptor.label}: 6 m camera" src="${baseUrl}/${imageFor(variant, 'overhead-near')}"><p>6 m overhead camera · 2 m grid · scale blocks</p><img alt="${descriptor.label}: 12 m camera" src="${baseUrl}/${imageFor(variant, 'overhead-default')}"><p>12 m default camera</p></div></div></html>`,
      );
      await page.waitForFunction(() =>
        [...document.images].every((item) => item.complete && item.naturalWidth > 0),
      );
      await page.screenshot({
        path: path.join(output, `candidate-${variant}.png`),
        fullPage: true,
      });
    }
  } finally {
    await galleryBrowser.close();
  }

  const files = await fs.readdir(path.join(output, 'renders'));
  const integrity = await Promise.all(
    files.map(async (file) => {
      const bytes = await fs.readFile(path.join(output, 'renders', file));
      const meta = await sharp(bytes).metadata();
      return {
        file,
        width: meta.width,
        height: meta.height,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    }),
  );
  await fs.writeFile(
    path.join(output, 'manifest.json'),
    JSON.stringify(
      {
        created: new Date().toISOString(),
        babylon: '9.35.0',
        suite: values.bands ? 'band-softening' : 'built-ins',
        bandTransitions: values.bands
          ? {
              thresholds: [0.03, 0.2, 0.5, 0.95],
              levels: [0.2, 0.35, 0.6, 0.8, 1],
              halfWidths: [0.01, 0.025, 0.05],
              interpolation: 'smoothstep',
              pixelAntialiasing: '0.5 fwidth where supported',
              maximumHalfWidth: 0.075,
            }
          : undefined,
        source: 'public/assets/models/protagonist-v3.glb',
        sourceSha256: createHash('sha256').update(modelBytes).digest('hex'),
        baseColourImageSha256: createHash('sha256').update(albedoBytes).digest('hex'),
        textureUpload:
          'Original PBR uses glTF sRGB GPU buffer; Standard/Cell use identical embedded image bytes uploaded without hardware sRGB decoding',
        fixture: 'art/shaders/protagonist-builtins/fixture.ts',
        sourceHashes: await Promise.all(
          [
            'art/shaders/protagonist-builtins/fixture.ts',
            'art/shaders/protagonist-builtins/presets.ts',
            'art/shaders/protagonist-builtins/feathered-cell.ts',
            'tools/art/render-protagonist-materials.ts',
            'node_modules/@babylonjs/materials/cell/cell.fragment.js',
          ].map(async (file) => ({
            file,
            sha256: createHash('sha256')
              .update(await fs.readFile(path.join(root, file)))
              .digest('hex'),
          })),
        ),
        shadows: { size: 2048, filter: 'PCF medium', biasMetres: 0.001, normalBiasMetres: 0.012 },
        sun: { direction: [0.5, -1, -0.6], intensity: 1, diffuse: [1, 0.96, 0.9] },
        fill: { intensity: 0.3, diffuse: [0.84, 0.9, 1], ground: [0.24, 0.21, 0.2] },
        softerFillVariant: {
          sun: 0.85,
          fill: 0.75,
          diffuse: [1, 0.98, 0.94],
          ground: [0.6, 0.55, 0.5],
          shadowDarkness: 0.25,
        },
        limitations: [
          'Local visual fixture, not production integration or performance qualification',
          'Current baseline uses the runtime light/material configuration in this isolated fixture',
          values.bands
            ? 'CustomMaterial lighting-band extension; no texture/geometry edits'
            : 'No custom shader or texture/geometry edits',
          'All test coordinates are metres; production Editor coordinates are centimetres',
        ],
        shots,
        zeroWidthChecks,
        crossBrowser,
        integrity,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ output, renders: shots.length, errors, preview: baseUrl }, null, 2));
  if (zeroWidthChecks.some((check) => check.meanAbsoluteRgbError > 0.25))
    throw new Error(
      'Zero-width lighting control differs materially from stock G; inspect manifest',
    );
  completed = true;
  if (errors.length) process.exitCode = 1;
} finally {
  if (!values.serve || !completed || errors.length)
    await new Promise<void>((resolve) => server.close(() => resolve()));
}
