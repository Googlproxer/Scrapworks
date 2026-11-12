/** Local, manually invoked prepared-state terrain captures. Never a CI gameplay route. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, firefox, type Page } from 'playwright';
import { createServer } from 'vite';
import sharp from 'sharp';
import type { EngineStore } from '@babylonjs/core/Engines/engineStore';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { WorldDefinition } from '../../src/contracts/world.ts';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
import { saveFixture } from '../support/save-fixture.ts';
import { seedSave } from './manual-save.ts';
import { staticPreview } from '../../tools/portfolio/serve.ts';
import { readJson, type BuildMetadata } from '../../tools/shared.ts';

const root = path.resolve(import.meta.dirname, '../..');
const directory = path.join(root, 'dist/scrapworks/browser');
const output = path.join(root, 'docs/reports/rendering/2026-11-13/layered-terrain');
await fs.mkdir(output, { recursive: true });
const definition = await readJson<WorldDefinition>(path.join(directory, 'scene/worlds/game.json'));
const metadata = await readJson<BuildMetadata>(
  path.join(root, 'dist/scrapworks/browser-stats.json'),
);
const chunk = Object.entries(metadata.outputs).find(([, entry]) =>
  Object.keys(entry.inputs ?? {}).some((file) =>
    file.replaceAll('\\', '/').endsWith('/Engines/engineStore.js'),
  ),
)?.[0];
assert(chunk);
const modules = await createServer({
  configFile: false,
  resolve: { tsconfigPaths: true },
  server: { middlewareMode: true, hmr: false },
  logLevel: 'error',
});
const fixtures = new Map<string, SaveSnapshot>();
try {
  const { Simulation } = (await modules.ssrLoadModule(
    '/src/simulation/ecs-runtime.ts',
  )) as typeof import('../../src/simulation/ecs-runtime.ts');
  const { preparePlayerSave } = (await modules.ssrLoadModule(
    '/src/simulation/player-save.ts',
  )) as typeof import('../../src/simulation/player-save.ts');
  for (const [name, health] of [
    ['damaged', 0],
    ['recovering', 50],
    ['restored', 100],
    ['mixed', -1],
  ] as const) {
    const initial = new Simulation(definition),
      snapshot = initial.capture();
    initial.dispose();
    const environment = snapshot.resources.environment!;
    environment.health = environment.health.map((_, cell) =>
      health < 0
        ? Math.max(
            0,
            Math.min(
              100,
              ((cell % definition.grid.columns) / (definition.grid.columns - 1)) * 130 - 15,
            ),
          )
        : health,
    );
    environment.completed = health === 100;
    environment.completedTick = health === 100 ? snapshot.resources.tick : null;
    preparePlayerSave(snapshot);
    fixtures.set(name, {
      ...saveFixture(snapshot, `terrain-${name}`, `terrain-${name}`, '2026-11-13T00:00:00.000Z'),
      name: `Prepared terrain review: ${name}`,
    });
  }
} finally {
  await modules.close();
}
for (const [name, save] of fixtures)
  await fs.writeFile(path.join(output, `fixture-${name}.json`), JSON.stringify(save));

interface CaptureReport extends Record<string, unknown> {
  browser: string;
  name: string;
}
async function reviewGallery(records: readonly CaptureReport[]): Promise<void> {
  await fs.copyFile(
    path.join(root, 'art/concepts/terrain-water-scatter-2026-11-12/images/01-layered-terrain.png'),
    path.join(output, 'concept-reference.png'),
  );
  const cards = records
    .map(
      ({ browser, name }) =>
        `<figure><a href="${browser}-${name}-world.png"><img src="${browser}-${name}-world.png" width="1440" height="900" alt="${browser} ${name} terrain, actual Babylon render" loading="lazy"></a><figcaption><strong>${browser} · ${name}</strong> · <a href="${browser}-${name}-game.png">Full game UI</a> · <a href="${browser}-${name}-close.png">6 m close view</a> · <a href="${browser}-${name}-far-world.png">24 m distant view</a>${name === 'restored' ? ` · <a href="${browser}-cursor-world.png">Cursor highlight</a>` : ''}</figcaption></figure>`,
    )
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scrapworks layered terrain in game</title><link rel="icon" href="data:,"><style>:root{color-scheme:dark;font:16px/1.55 system-ui,sans-serif;background:#10232c;color:#f4e7cf}*{box-sizing:border-box}body{margin:0}main{max-width:1680px;margin:auto;padding:24px}h1{font-size:clamp(2rem,4vw,3.8rem);line-height:1.1}p{max-width:90ch}a{color:#ffd1b8;text-underline-offset:.2em}a:focus-visible{outline:3px solid #8ee2c8;outline-offset:4px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,590px),1fr));gap:24px}figure{margin:0;background:#233e48}img{display:block;width:100%;height:auto}figcaption{padding:14px 18px}.nav{display:flex;flex-wrap:wrap;gap:12px 24px;margin:24px 0;padding:18px 0;border-block:1px solid #718d85}.note{border-left:4px solid #ef9f7b;padding-left:18px}section{margin:32px 0}</style></head><body><main><header><p>Scrapworks · 13 November 2026 · Local visual review</p><h1>Layered terrain in game</h1><p>Actual production Babylon renders using the supplied KayKit meshes, procedural ground patterns and the approved protagonist I finish. Compare the ground colour, rock scale, foliage silhouettes and density.</p><p class="note">Health states are prepared diagnostic saves. Water geometry and levels are deferred; the existing prototype world objects remain. This is the first visual pass, with hardware performance qualification still open.</p></header><nav class="nav" aria-label="Terrain review"><a href="#comparison">Concept comparison</a><a href="#states">All health states</a><a href="report.json">Browser results</a><a href="fixture-restored.json" download>Download restored review save</a><a href="fixture-recovering.json" download>Download recovering review save</a><a href="fixture-damaged.json" download>Download damaged review save</a></nav><p>To inspect a prepared state live, open the updated game, use Save &amp; load → Import JSON, choose the downloaded fixture, then load the imported run. Import creates a separate run. The fixture name identifies it as prepared review state.</p><section id="comparison"><h2>Concept and first implementation</h2><div class="cards"><figure><a href="concept-reference.png"><img src="concept-reference.png" width="1536" height="1024" alt="Generated layered-terrain concept"></a><figcaption>Original imagegen concept reference</figcaption></figure><figure><a href="chromium-restored-world.png"><img src="chromium-restored-world.png" width="1440" height="900" alt="Actual restored terrain in the production renderer"></a><figcaption>Actual production renderer · restored prepared state · normal 12 m camera</figcaption></figure></div></section><section id="states"><h2>Damaged, recovering, restored and mixed</h2><div class="cards">${cards}</div></section><footer><p>Ground/mesh identity and source provenance are retained under art/world/kaykit-forest-v1. Captures are local diagnostics, not a gameplay playthrough or a qualified hardware performance tier.</p></footer></main></body></html>`;
  await fs.writeFile(path.join(output, 'index.html'), html);
}
if (process.argv.includes('--fixtures-only')) {
  const previous = await readJson<{ reports: CaptureReport[] }>(path.join(output, 'report.json'));
  await reviewGallery(previous.reports);
  console.log(
    JSON.stringify({ fixtures: fixtures.size, gallery: path.join(output, 'index.html') }),
  );
  process.exit(0);
}
const server = staticPreview(directory);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}/`;

async function inspect(page: Page, radius = 1200) {
  return page.evaluate(
    async ({ file, radius }) => {
      const module: Record<string, unknown> = await import(new URL(file, document.baseURI).href);
      const store = Object.values(module).find(
        (value): value is typeof EngineStore =>
          typeof value === 'function' && 'Instances' in value && 'LastCreatedEngine' in value,
      );
      const engine = store?.LastCreatedEngine;
      const scene = engine?.scenes.find((scene) => scene.getMeshByName('environment-cells'));
      if (!engine || !scene) throw Error('Terrain scene missing');
      const camera = scene.activeCamera as ArcRotateCamera;
      camera.alpha = Math.PI / 4;
      camera.beta = Math.PI / 4;
      camera.radius = radius;
      await scene.whenReadyAsync();
      const totals: Record<string, number> = { rock: 0, grass: 0, shrub: 0 };
      let triangles = 0,
        enabledBatches = 0;
      for (const mesh of scene.meshes) {
        const data: unknown = mesh.metadata;
        if (
          !data ||
          typeof data !== 'object' ||
          !('environmentScatter' in data) ||
          !('kind' in data) ||
          typeof data.kind !== 'string'
        )
          continue;
        if (!('thinInstanceCount' in mesh) || typeof mesh.thinInstanceCount !== 'number') continue;
        if (mesh.isEnabled()) {
          totals[data.kind] += mesh.thinInstanceCount;
          triangles += (mesh.getTotalIndices() / 3) * mesh.thinInstanceCount;
          enabledBatches++;
        }
      }
      return {
        totals,
        triangles,
        enabledBatches,
        clumps: { grass: totals['grass'] / 4, shrub: totals['shrub'] / 3 },
        activeBatches: scene
          .getActiveMeshes()
          .data.slice(0, scene.getActiveMeshes().length)
          .filter((mesh) => mesh.name.startsWith('environment-scatter:')).length,
        material: scene.getMeshByName('environment-cells')!.material!.name,
        authoredGridVisible: scene.getMeshByName('ground')?.isVisible,
        cursorVisible: scene.getMeshByName('cell-selection')?.isEnabled(),
        shaderReady: scene.isReady(),
        renderLoops: engine.activeRenderLoops.length,
        shadowSize:
          scene.getLightByName('painted-sun')?.getShadowGenerator()?.getShadowMap()?.getSize()
            .width ?? 0,
        waterVertices: scene.getMeshByName('environment-water')?.getTotalVertices() ?? 0,
        casterCount:
          scene.getLightByName('painted-sun')?.getShadowGenerator()?.getShadowMap()?.renderList
            ?.length ?? 0,
        characterCasts:
          scene
            .getLightByName('painted-sun')
            ?.getShadowGenerator()
            ?.getShadowMap()
            ?.renderList?.some((mesh) => !!mesh.skeleton) ?? false,
      };
    },
    { file: chunk!, radius },
  );
}
async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
/** Read within Babylon's render callback so the PNG contains world pixels, excluding Angular overlays. */
async function worldImage(page: Page, file: string): Promise<Buffer> {
  const png = await page.evaluate(async (chunk) => {
    const module: Record<string, unknown> = await import(new URL(chunk, document.baseURI).href);
    const store = Object.values(module).find(
      (value): value is typeof EngineStore =>
        typeof value === 'function' && 'LastCreatedEngine' in value,
    );
    const engine = store!.LastCreatedEngine!;
    const scene = engine.scenes.find((scene) => scene.getMeshByName('environment-cells'))!;
    return new Promise<string>((resolve) => {
      // Diagnostic instrumentation; not an application-owned runtime observer.
      scene.onAfterRenderObservable.addOnce(() =>
        resolve(engine.getRenderingCanvas()!.toDataURL('image/png')),
      );
    });
  }, chunk!);
  const bytes = Buffer.from(png.slice(png.indexOf(',') + 1), 'base64');
  await fs.writeFile(file, bytes);
  return bytes;
}
const reports: CaptureReport[] = [];
try {
  for (const [browserName, browserType] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    if (process.argv.includes('--quick') && browserName !== 'chromium') continue;
    const browser = await browserType.launch({ headless: true });
    try {
      for (const [name, save] of fixtures) {
        if (process.argv.includes('--quick') && name !== 'restored') continue;
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 1,
        });
        try {
          const page = await context.newPage(),
            errors: string[] = [];
          page.on('pageerror', (error) => errors.push(error.message));
          page.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text());
          });
          await page.goto(url, { waitUntil: 'networkidle' });
          await page.getByRole('button', { name: 'New Game', exact: true }).waitFor();
          await seedSave(page, save);
          await page.reload({ waitUntil: 'networkidle' });
          await page.getByRole('button', { name: 'Graphics', exact: true }).click();
          const graphics = page.getByRole('dialog', { name: 'Graphics', exact: true });
          await graphics.getByLabel('Quality preset', { exact: true }).selectOption('high');
          await graphics.getByRole('button', { name: 'Apply', exact: true }).click();
          await graphics.getByText('Graphics settings applied.', { exact: true }).waitFor();
          await graphics.getByRole('button', { name: 'Close graphics settings' }).click();
          await page.getByRole('button', { name: 'Continue', exact: true }).click();
          await page.getByRole('button', { name: 'Menu', exact: true }).waitFor({ timeout: 90000 });
          await page.locator('app-loading-screen').waitFor({ state: 'hidden', timeout: 90000 });
          const hide = page.getByRole('button', { name: 'Hide objective guide', exact: true });
          if (await hide.isVisible()) await hide.click();
          const state = await inspect(page);
          await frames(page);
          assert.equal(state.material, 'layered-painted-terrain');
          assert.equal(state.renderLoops, 1);
          assert(state.totals['rock'] > 0);
          assert.equal(state.shaderReady, true);
          assert.equal(state.authoredGridVisible, false);
          if (name === 'damaged') assert.equal(state.totals['grass'] + state.totals['shrub'], 0);
          if (name === 'restored')
            assert(state.totals['grass'] > 1500 && state.totals['shrub'] > 20);
          await page.screenshot({ path: path.join(output, `${browserName}-${name}-game.png`) });
          await worldImage(page, path.join(output, `${browserName}-${name}-world.png`));
          await inspect(page, 600);
          await frames(page);
          await page.screenshot({ path: path.join(output, `${browserName}-${name}-close.png`) });
          await inspect(page, 2400);
          await frames(page);
          await worldImage(page, path.join(output, `${browserName}-${name}-far-world.png`));
          if (name === 'restored') {
            await inspect(page);
            await page.locator('canvas[aria-label="Scrapworks 3D viewport"]').focus();
            await page.mouse.move(850, 520);
            await frames(page);
            assert.equal((await inspect(page)).cursorVisible, true);
            await worldImage(page, path.join(output, `${browserName}-cursor-world.png`));
          }
          let shadowChangedPixels: number | undefined;
          if (name === 'restored') {
            await page.getByRole('button', { name: 'Graphics', exact: true }).click();
            await frames(page);
            const onState = await inspect(page, 600);
            const on = await worldImage(page, path.join(output, `${browserName}-shadows-on.png`));
            await graphics.getByLabel('Real-time shadows', { exact: true }).selectOption('off');
            await graphics.getByRole('button', { name: 'Apply', exact: true }).click();
            await graphics.getByText('Graphics settings applied.', { exact: true }).waitFor();
            const offState = await inspect(page, 600);
            await frames(page);
            const off = await worldImage(page, path.join(output, `${browserName}-shadows-off.png`));
            assert.equal(offState.shadowSize, 0);
            assert.deepEqual(offState.totals, onState.totals);
            const a = await sharp(on).removeAlpha().raw().toBuffer();
            const b = await sharp(off).removeAlpha().raw().toBuffer();
            shadowChangedPixels = 0;
            for (let i = 0; i < a.length; i += 3)
              if (
                Math.abs(a[i] - b[i]) +
                  Math.abs(a[i + 1] - b[i + 1]) +
                  Math.abs(a[i + 2] - b[i + 2]) >
                12
              )
                shadowChangedPixels++;
            assert(
              shadowChangedPixels > 5000,
              `Cast shadows did not visibly affect terrain: ${shadowChangedPixels} pixels`,
            );
          }
          assert.deepEqual(errors, []);
          reports.push({ browser: browserName, name, ...state, shadowChangedPixels, errors });
          console.log(
            JSON.stringify({ browser: browserName, name, ...state, shadowChangedPixels }),
          );
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    path.join(output, 'report.json'),
    JSON.stringify({ created: new Date().toISOString(), preparedStates: true, reports }, null, 2) +
      '\n',
  );
  await reviewGallery(reports);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
