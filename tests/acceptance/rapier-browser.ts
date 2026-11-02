/** Actual keyboard input against the worker-backed playable physics scene. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import type { WorldDefinition } from '../../src/contracts/world.ts';

const origin = process.argv[2] ?? 'http://127.0.0.1:4319';
const output = path.resolve(process.argv[3] ?? 'tmp/rapier-browser');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const inspect = () =>
  page.evaluate(() => {
    const runtime = ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService;
    const scene = runtime.client.currentScene;
    return {
      world: runtime.world(),
      meshes: scene.meshes
        .filter((mesh) => mesh.name.startsWith('physics:'))
        .map((mesh) => ({
          name: mesh.name,
          position: mesh.position.asArray(),
          rotation: mesh.rotationQuaternion?.asArray(),
        })),
      drawings: scene
        .getEngine()
        ._virtualScenes.flatMap((layer) => layer.meshes)
        .filter((mesh) => mesh.metadata?.debugDraw && mesh.isEnabled())
        .map((mesh) => mesh.name),
    };
  });
try {
  await page.goto(origin);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
  await page.waitForFunction(
    () =>
      ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.world()?.bodies
        ?.length === 6,
  );
  assert.equal(page.workers().length, 1, 'One authoritative worker');
  const initial = await inspect();
  await page.getByText('Debug drawings', { exact: true }).click();
  await page.getByLabel('Show debug drawings', { exact: true }).check();
  await page.waitForFunction(
    () =>
      ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.world().tick >=
      20,
  );
  const settled = await inspect();
  assert.equal(settled.meshes.length, 6);
  assert(
    settled.world.bodies!.find((body) => body.id === 'physics-stack-falling')!.position.y < 1.5,
  );
  assert(settled.drawings.filter((name) => name.startsWith('debug:physics:')).length === 6);
  await page.screenshot({ path: path.join(output, 'scene.png'), fullPage: true });
  await page.locator('canvas').focus();
  await page.keyboard.down('KeyW');
  try {
    await page.waitForFunction(
      () =>
        ng
          .getComponent(document.querySelector('app-game-page'))
          .gameRuntimeService.world()
          .bodies!.find((body) => body.id === 'physics-crate')!.position.z > 4.25,
      undefined,
      { timeout: 10000 },
    );
  } finally {
    await page.keyboard.up('KeyW');
  }
  const pushed = await inspect();
  assert(pushed.world.player.position.z > initial.world.player.position.z);
  await page.screenshot({ path: path.join(output, 'pushed.png'), fullPage: true });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Resume game', exact: true }).waitFor();
  await page.waitForTimeout(200);
  const paused = await inspect();
  await page.waitForTimeout(300);
  assert.deepEqual(
    (await inspect()).world,
    paused.world,
    'Pause freezes physics and gameplay together',
  );
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await page.waitForFunction(
    (tick) =>
      ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.world().tick >
      tick,
    paused.world.tick,
  );
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);

  // Only the fixture spawn changes. Exercise the actual authored mover and production worker,
  // including the native controller's predictive contact margin on a stationary player.
  await page.route('**/worlds/game.json', async (route) => {
    const response = await route.fetch();
    const definition: WorldDefinition = await response.json();
    await route.fulfill({ response, json: { ...definition, spawn: { x: -4.1, y: 0, z: 1.895 } } });
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
  await page.waitForFunction(
    () =>
      ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.world()?.bodies
        ?.length === 6,
  );
  const beside = await inspect();
  assert(Math.abs(beside.world.player.position.x + 4.1) < 0.01);
  const sideContact = [];
  for (const tick of [80, 160]) {
    await page.waitForFunction(
      (target) =>
        ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.world().tick >=
        target,
      tick,
    );
    const state = await inspect();
    assert(
      Math.abs(state.world.player.position.x + 4.1) < 0.05,
      'Idle side contact must not carry the player',
    );
    assert(Math.abs(state.world.player.position.z - 1.895) < 0.01);
    sideContact.push(state.world);
  }
  await page.locator('canvas').focus();
  await page.keyboard.down('KeyS');
  try {
    await page.waitForFunction(
      () =>
        ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.world().player
          .position.z < 0.5,
    );
  } finally {
    await page.keyboard.up('KeyS');
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, 'results.json'),
    JSON.stringify(
      { passed: true, initial, settled, pushed, paused, sideContact, errors },
      null,
      2,
    ),
  );
  console.log(
    'Rapier browser: one worker, gravity/stack, moving block without side attachment, keyboard pushing/separation, interpolated bodies, collision drawings, pause/resume and AXE passed.',
  );
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify(
      { error: String(error), errors, state: await inspect().catch(() => null) },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
