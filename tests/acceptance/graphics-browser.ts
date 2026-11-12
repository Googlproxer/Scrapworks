/** Manually invoked local graphics/UI verification; no gameplay progression or CI route. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import type { Page } from 'playwright';
import type { EngineStore } from '@babylonjs/core/Engines/engineStore';
import type { CustomMaterial } from '@babylonjs/materials/custom/customMaterial';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { AxeResults } from 'axe-core';
import { staticPreview } from '../../tools/portfolio/serve.ts';
import { readJson, type BuildMetadata } from '../../tools/shared.ts';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, 'docs/reports/rendering/2026-11-12/production-I');
await fs.mkdir(output, { recursive: true });
const metadata = await readJson<BuildMetadata>(
  path.join(root, 'dist/scrapworks/browser-stats.json'),
);
const chunk = Object.entries(metadata.outputs).find(([, entry]) =>
  Object.keys(entry.inputs ?? {}).some((file) =>
    file.replaceAll('\\', '/').endsWith('/Engines/engineStore.js'),
  ),
)?.[0];
assert(chunk, 'EngineStore chunk was not found');
const server = staticPreview(path.join(root, 'dist/scrapworks/browser'));
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}/`;

async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function inspect(page: Page, closeView = false) {
  return page.evaluate(
    async ({ file, close }) => {
      const module: Record<string, unknown> = await import(new URL(file, document.baseURI).href);
      const store = Object.values(module).find(
        (value): value is typeof EngineStore =>
          typeof value === 'function' && 'Instances' in value && 'LastCreatedEngine' in value,
      );
      const engine = store?.LastCreatedEngine;
      const scene = engine
        ? [...engine.scenes].reverse().find((value) => value.meshes.some((mesh) => !!mesh.skeleton))
        : undefined;
      if (!engine || !scene) throw new Error('Gameplay renderer is not ready');
      const character = scene.meshes.find((mesh) => !!mesh.skeleton)!;
      const material = character.material as CustomMaterial;
      if (close) {
        const camera = scene.activeCamera as ArcRotateCamera;
        camera.alpha = Math.PI / 4;
        camera.beta = Math.PI / 4;
        camera.radius = 600;
      }
      const generator = scene.getLightByName('painted-sun')?.getShadowGenerator();
      return {
        triangles: character.getTotalIndices() / 3,
        influences: character.numBoneInfluencers,
        material: material.name,
        bandHalfWidth: material._newUniformInstances?.['float-swBandHalfWidth'],
        textureSRGB: material.diffuseTexture?.getInternalTexture()?._useSRGBBuffer,
        shadows: scene.shadowsEnabled,
        shadowSize: generator?.getShadowMap()?.getSize().width ?? 0,
        renderTargets: scene.textures.filter((texture) => texture.isRenderTarget).length,
        renderTargetNames: scene.textures
          .filter((texture) => texture.isRenderTarget)
          .map((texture) => texture.name),
        renderWidth: engine.getRenderWidth(),
        cssWidth: engine.getRenderingCanvas()!.clientWidth,
        renderScale: engine.getHardwareScalingLevel(),
        renderLoops: engine.activeRenderLoops.length,
        cameraFar: scene.activeCamera!.maxZ,
      };
    },
    { file: chunk!, close: closeView },
  );
}

async function auditDialog(page: Page) {
  if (!(await page.evaluate(() => 'axe' in window)))
    await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
  const result = await page.evaluate(async () => {
    const api = (window as unknown as { axe: { run(target: Element): Promise<AxeResults> } }).axe;
    const result = await api.run(
      document.querySelector('cdk-dialog-container[aria-label="Graphics"]')!,
    );
    return {
      violations: result.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((node) => node.target),
      })),
    };
  });
  assert.deepEqual(result.violations, []);
  return result;
}

const reports: unknown[] = [];
try {
  for (const [name, browserType] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    if (process.argv.includes('--firefox-only') && name !== 'firefox') continue;
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(url, { waitUntil: 'networkidle' });
      const graphicsButton = page.getByRole('button', { name: 'Graphics', exact: true });
      await graphicsButton.click();
      const dialog = page.getByRole('dialog', { name: 'Graphics', exact: true });
      await dialog.getByLabel('Quality preset', { exact: true }).selectOption('high');
      await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
      await dialog.getByText('Graphics settings applied.', { exact: true }).waitFor();
      // Audit the same component as a single modal before exercising the nested
      // pause-menu route and live WebGL quality changes below.
      const axe = await auditDialog(page);
      await dialog.getByRole('button', { name: 'Close graphics settings' }).click();
      assert(
        await graphicsButton.evaluate((element) => element === document.activeElement),
        'Focus did not return to Graphics',
      );
      await page.getByRole('button', { name: 'New Game', exact: true }).click();
      await page.getByRole('button', { name: 'Menu', exact: true }).waitFor({ timeout: 90000 });
      await page.locator('app-loading-screen').waitFor({ state: 'hidden', timeout: 90000 });
      await frames(page);
      const high = await inspect(page, true);
      assert.equal(high.triangles, 104972);
      assert.equal(high.influences, 8);
      assert.equal(high.material, 'protagonist-painted-I');
      assert.equal(high.bandHalfWidth, 0.025);
      assert.equal(high.textureSRGB, false);
      assert.equal(high.shadowSize, 2048);
      assert.equal(high.renderLoops, 1);
      assert.equal(high.cameraFar, 10000);
      await frames(page);
      await page.screenshot({ path: path.join(output, `${name}-game-high.png`) });
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      const pause = page.getByRole('dialog', { name: 'Paused', exact: true });
      await pause.getByRole('button', { name: 'Graphics', exact: true }).click();
      await dialog.waitFor();
      const apply = dialog.getByRole('button', { name: 'Apply', exact: true });
      const before = await apply.boundingBox();
      await page.screenshot({ path: path.join(output, `${name}-graphics-before.png`) });
      await dialog.getByLabel('Real-time shadows', { exact: true }).selectOption('off');
      await dialog.getByLabel('3D render resolution', { exact: true }).selectOption('50');
      await apply.click();
      await dialog.getByText('Graphics settings applied.', { exact: true }).waitFor();
      await frames(page);
      const low = await inspect(page);
      assert.equal(low.shadows, false);
      assert.equal(low.shadowSize, 0);
      // The authored grid retains its independent TileMaskTexture target.
      assert.equal(low.renderTargets, high.renderTargets - 1);
      assert(!low.renderTargetNames.some((name) => name.endsWith('_shadowMap')));
      assert.equal(low.renderScale, 2);
      assert(Math.abs(low.renderWidth - low.cssWidth / 2) <= 1);
      assert.equal(low.bandHalfWidth, 0.025);
      assert.equal(low.renderLoops, 1);
      const after = await apply.boundingBox();
      await page.screenshot({ path: path.join(output, `${name}-graphics-after.png`) });
      assert(
        before && after && Math.abs(before.y - after.y) < 1,
        'Apply moved during the settings change',
      );
      const pausedAxe = await auditDialog(page);
      await page.screenshot({ path: path.join(output, `${name}-graphics-dialog.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
      const box = await dialog.boundingBox();
      assert(
        box && box.x >= 0 && box.x + box.width <= 391 && box.y >= 0 && box.y + box.height <= 845,
        'Graphics dialog overflows mobile viewport',
      );
      await page.screenshot({ path: path.join(output, `${name}-graphics-mobile.png`) });
      const mobileAxe = await auditDialog(page);
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Graphics', exact: true }).click();
      await dialog.getByLabel('Quality preset', { exact: true }).waitFor();
      await dialog
        .getByRole('button', { name: 'Apply', exact: true })
        .waitFor({ state: 'visible' });
      await page.waitForFunction(() => {
        const apply = document.querySelector(
          'app-graphics-settings button.primary',
        ) as HTMLButtonElement | null;
        return apply && !apply.disabled;
      });
      assert.equal(
        await dialog.getByLabel('Real-time shadows', { exact: true }).inputValue(),
        'off',
      );
      assert.equal(
        await dialog.getByLabel('3D render resolution', { exact: true }).inputValue(),
        '50',
      );
      await dialog.getByRole('button', { name: 'Close graphics settings' }).click();
      await page.getByRole('button', { name: 'New Game', exact: true }).click();
      await page.getByRole('button', { name: 'Menu', exact: true }).waitFor({ timeout: 90000 });
      await page.locator('app-loading-screen').waitFor({ state: 'hidden', timeout: 90000 });
      await frames(page);
      const reloaded = await inspect(page);
      assert.equal(reloaded.shadowSize, 0);
      assert.equal(reloaded.renderScale, 2);
      assert.equal(reloaded.bandHalfWidth, 0.025);
      assert.deepEqual(errors, []);
      reports.push({
        browser: name,
        high,
        low,
        reloaded,
        axeViolations: axe.violations.length,
        pausedAxeViolations: pausedAxe.violations.length,
        mobileAxeViolations: mobileAxe.violations.length,
        errors,
      });
      console.log(
        `${name}: approved material, live shadows/resolution, persistence, focus and axe passed`,
      );
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    path.join(output, 'report.json'),
    JSON.stringify({ created: new Date().toISOString(), reports }, null, 2) + '\n',
  );
  console.log(output);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
