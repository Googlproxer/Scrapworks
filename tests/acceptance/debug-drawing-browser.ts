import { installBrowserEvents } from './browser-events.ts';
/** Run against yarn dev; artifacts are local diagnostics, not authored scene content. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const origin = process.argv[2] ?? 'http://127.0.0.1:4319';
const output = path.resolve(process.argv[3] ?? 'tmp/debug-drawing');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await installBrowserEvents(page);
const errors: string[] = [];
const driverWarnings: string[] = [];
const expectedFailures: string[] = [];
const enabledCategories = [...Array<string>(9).fill('collision'), 'placement', 'transforms'];

const waitForCategories = (count: number) =>
  page.evaluate(
    (expected) =>
      window.testEvents.frame(() => {
        const scene = ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService
          .client.currentScene;
        return (
          scene
            .getEngine()
            ._virtualScenes.flatMap((layer) => layer.meshes)
            .filter((mesh) => mesh.metadata?.debugDraw && mesh.isEnabled()).length === expected
        );
      }, 'debug drawing categories'),
    count,
  );

async function openPanel(): Promise<void> {
  const details = page.locator('app-debug-draw-panel details');
  await details.waitFor();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open)))
    await page.getByText('Debug drawings', { exact: true }).click();
}
page.on('pageerror', (error) => {
  if (error.message.includes('Debug drawing worker failure probe'))
    expectedFailures.push(error.message);
  else errors.push(error.message);
});
page.on('console', (message) => {
  if (message.text().includes('Debug drawing worker failure probe')) {
    expectedFailures.push(message.text());
    return;
  }
  // Chromium emits this driver notice when screenshots read back WebGL pixels.
  if (/^\[\.WebGL-[^\]]+\]GL Driver Message .*GPU stall due to ReadPixels/.test(message.text())) {
    driverWarnings.push(message.text());
    return;
  }
  if (['error', 'warning'].includes(message.type())) errors.push(message.text());
});

try {
  await page.goto(origin);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
  await openPanel();
  await page.getByLabel('transforms', { exact: true }).waitFor();
  const master = page.getByLabel('Show debug drawings', { exact: true });
  assert.equal(await master.isChecked(), false);

  const inspect = () =>
    page.evaluate(() => {
      const runtime = ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService;
      const scene = runtime.client.currentScene;
      const meshes = scene
        .getEngine()
        ._virtualScenes.flatMap((layer) => layer.meshes)
        .filter((mesh) => mesh.metadata?.debugDraw);
      return {
        categories: meshes
          .filter((mesh) => mesh.isEnabled())
          .map((mesh) => mesh.metadata.category as string)
          .sort(),
        radii: meshes
          .filter((mesh) => mesh.isEnabled())
          .map((mesh) => ({
            category: mesh.metadata.category as string,
            first: Array.from(mesh.getVerticesData('position') ?? []).slice(0, 3),
          })),
        player: runtime.world()?.player.position,
        pickable: meshes.some((mesh) => mesh.isPickable),
        canvases: document.querySelectorAll('canvas').length,
      };
    });

  assert.deepEqual((await inspect()).categories, []);
  await master.check();
  await page.evaluate(() =>
    window.testEvents.frame(() => {
      const scene = ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService
        .client.currentScene;
      return (
        scene
          .getEngine()
          ._virtualScenes.flatMap((layer) => layer.meshes)
          .filter((mesh) => mesh.metadata?.debugDraw && mesh.isEnabled()).length === 11
      );
    }),
  );
  const enabled = await inspect();
  assert.deepEqual(enabled.categories, enabledCategories);
  assert.equal(enabled.canvases, 1);
  assert.equal(enabled.pickable, false);
  assert(
    Math.abs(
      enabled.radii.find((item) => item.category === 'placement')!.first[0] -
        enabled.player!.x * 100 -
        300,
    ) < 0.1,
  );
  assert(
    Math.abs(
      enabled.radii.find((item) => item.category === 'collision')!.first[0] -
        enabled.player!.x * 100 -
        35,
    ) < 0.1,
  );
  await page.screenshot({ path: path.join(output, 'enabled.png'), fullPage: true });

  await page.getByLabel('collision', { exact: true }).uncheck();
  await waitForCategories(2);
  assert.deepEqual((await inspect()).categories, ['placement', 'transforms']);
  await page.getByLabel('collision', { exact: true }).check();
  await page.locator('canvas').focus();
  await page.keyboard.down('KeyD');
  await page.evaluate(
    (x) =>
      window.testEvents.frame(
        () =>
          ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.world().player
            .position.x > x,
      ),
    enabled.player!.x,
  );
  await page.keyboard.up('KeyD');
  await page.evaluate(() =>
    window.testEvents.frame(
      () =>
        !ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.world().player
          .moving,
    ),
  );
  const moved = await inspect();
  assert(
    moved.player!.x > enabled.player!.x,
    'Worker-backed player must move with overlays enabled',
  );
  assert(
    Math.abs(
      moved.radii.find((item) => item.category === 'placement')!.first[0] -
        moved.player!.x * 100 -
        300,
    ) < 0.1,
  );
  await page.screenshot({ path: path.join(output, 'moved.png'), fullPage: true });

  await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
  assert.deepEqual(
    await page.evaluate(async () =>
      (await axe.run(document)).violations.map((item) => ({
        id: item.id,
        nodes: item.nodes.length,
      })),
    ),
    [],
  );
  await master.uncheck();
  await waitForCategories(0);
  assert.deepEqual((await inspect()).categories, []);
  await master.check();
  await page.evaluate(() => {
    const runtime = ng.getComponent(document.querySelector('app-game-page'))
      .gameRuntimeService as unknown as { setScene(key: 'MainMenu'): void };
    runtime.setScene('MainMenu');
  });
  await page.getByRole('button', { name: 'Play Game!', exact: true }).waitFor();
  assert.deepEqual((await inspect()).categories, []);
  await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
  await page.getByLabel('transforms', { exact: true }).waitFor();
  assert.equal(await master.isChecked(), true);
  await waitForCategories(enabledCategories.length);
  assert.deepEqual((await inspect()).categories, enabledCategories);

  // Exercise the existing renderer-failure boundary without destroying GPU state in the probe.
  const healthyWorker = page.workers()[0];
  await page.evaluate(() => {
    const engine = ng
      .getComponent(document.querySelector('app-game-page'))
      .gameRuntimeService.client.currentScene.getEngine();
    engine.onContextLostObservable.notifyObservers(engine);
  });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
  await openPanel();
  await page.getByLabel('transforms', { exact: true }).waitFor();
  await waitForCategories(enabledCategories.length);
  assert.equal(page.workers()[0], healthyWorker, 'Renderer Retry must retain the healthy worker');
  assert.equal(await master.isChecked(), true);
  assert.deepEqual((await inspect()).categories, enabledCategories);

  await healthyWorker.evaluate(() =>
    setTimeout(() => {
      throw new Error('Debug drawing worker failure probe');
    }, 0),
  );
  await page.getByRole('alert').waitFor();
  const freshWorker = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
  assert.notEqual(
    await freshWorker,
    healthyWorker,
    'Worker failure Retry must create fresh authority',
  );
  await openPanel();
  await page.getByLabel('transforms', { exact: true }).waitFor();
  await waitForCategories(enabledCategories.length);
  assert.equal(await master.isChecked(), true);
  assert.deepEqual((await inspect()).categories, enabledCategories);
  await page.reload();
  await page.getByRole('button', { name: 'Play Game!', exact: true }).waitFor();
  await openPanel();
  assert.equal(await master.isChecked(), false);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, 'results.json'),
    JSON.stringify(
      { enabled, moved, errors, driverWarnings, expectedFailures, passed: true },
      null,
      2,
    ),
  );
  console.log(
    'Debug drawing: Editor attachment, player bounds, toggles, movement, AXE, scene replacement, both Retry paths and reload passed.',
  );
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ error: String(error), errors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
