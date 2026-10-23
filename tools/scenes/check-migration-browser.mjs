// Development integration probe. Uses Angular's debug access only in the local dev build.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const origin = process.argv[2] ?? 'http://localhost:4317';
const output = process.argv[3] ?? 'tmp/migration-browser';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const scale of [1, 2]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: scale,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const runtime = (expression) => page.evaluate(expression);
    const state = () =>
      runtime(() =>
        ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.world(),
      );
    const position = async () => (await state()).player.position;
    const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const camera = () =>
      runtime(() => {
        const c = ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.client
          .currentScene.activeCamera;
        return { alpha: c.alpha, beta: c.beta, radius: c.radius, fov: c.fov, mode: c.mode };
      });
    await page.goto(origin + '/3d');
    await page.waitForLoadState('networkidle');
    assert.equal(new URL(page.url()).pathname, '/');
    // The existing Save/Load test UI supplies a real two-dimensional button layout.
    await page.getByRole('button', { name: 'Open Test Save Dialog', exact: true }).click();
    const saveRows = page.getByRole('dialog').locator('tbody tr');
    await saveRows.first().getByRole('button', { name: 'Save', exact: true }).focus();
    const assertFocus = async (row, name) =>
      assert.equal(
        await saveRows
          .nth(row)
          .getByRole('button', { name, exact: true })
          .evaluate((element) => element === document.activeElement),
        true,
        `focus ${name} in row ${row + 1}`,
      );
    await page.keyboard.press('ArrowDown', { delay: 70 });
    await assertFocus(1, 'Save');
    await page.keyboard.press('ArrowRight', { delay: 70 });
    await assertFocus(1, 'Load');
    await page.keyboard.press('ArrowUp', { delay: 70 });
    await assertFocus(0, 'Load');
    await page.keyboard.press('ArrowLeft', { delay: 70 });
    await assertFocus(0, 'Save');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
    await page.getByText('Loading game…', { exact: true }).waitFor({ state: 'hidden' });
    await page.waitForFunction(
      () =>
        !!document.querySelector('app-game-page') &&
        ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.world() !==
          null &&
        ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.isReady(),
    );
    await page.waitForLoadState('networkidle');
    const canvas = page.locator('canvas');
    await canvas.focus();
    await page.waitForTimeout(100);
    const initial = await position();
    await page.keyboard.down('w');
    await page.waitForTimeout(1000);
    await page.keyboard.up('w');
    const walked = await position();
    assert(distance(initial, walked) > 1.15, 'walk reaches expected distance');
    await page.keyboard.down('Shift');
    await page.keyboard.down('w');
    await page.waitForTimeout(650);
    await page.screenshot({ path: path.join(output, `run-dpr${scale}.png`) });
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    const ran = await position();
    assert(distance(walked, ran) > 1.4, 'sprint faster than walk');
    const beforeCamera = await camera();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 600, box.y + 350);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(box.x + 750, box.y + 400, { steps: 12 });
    await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(350);
    const afterCamera = await camera();
    console.log('camera', beforeCamera, afterCamera);
    assert(Math.abs(afterCamera.alpha - beforeCamera.alpha) > 0.1, 'right drag orbits');
    assert(Math.abs(afterCamera.radius - beforeCamera.radius) > 1, 'wheel zooms');
    assert.equal(afterCamera.fov, beforeCamera.fov);
    await page.keyboard.down('w');
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const paused = await state();
    await page.waitForTimeout(300);
    assert.equal((await state()).tick, paused.tick, 'modal pauses session');
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    const resumed = await position();
    await page.waitForTimeout(300);
    assert(distance(resumed, await position()) < 0.001, 'held movement suppressed after resume');
    await page.keyboard.up('w');
    await page.keyboard.down('w');
    await page.waitForTimeout(200);
    await page.keyboard.up('w');
    assert(distance(resumed, await position()) > 0.1, 'release and repress resumes movement');
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await page.getByRole('button', { name: 'Save controls', exact: true }).waitFor();
    const sprint = page.locator('[data-action="gameplay.sprint"]');
    await page.screenshot({ path: path.join(output, `controls-keyboard-dpr${scale}.png`) });
    await page.getByRole('tab', { name: 'Keyboard & mouse', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(
      await page.getByRole('tab', { name: 'Gamepad', exact: true }).getAttribute('aria-selected'),
      'true',
    );
    await page.getByRole('combobox', { name: /Button names/ }).selectOption('dualsense');
    assert.match(await page.locator('[data-action="gameplay.confirm"]').innerText(), /Cross/);
    const menuDeadzone = await page
      .getByRole('slider', { name: 'Navigate Left stick deadzone', exact: true })
      .inputValue();
    const moveDeadzone = page.getByRole('slider', {
      name: 'Move Left stick deadzone',
      exact: true,
    });
    await moveDeadzone.focus();
    await page.keyboard.press('Home');
    for (let step = 0; step < 27; step++) await page.keyboard.press('ArrowRight');
    assert.equal(await moveDeadzone.inputValue(), '0.27');
    assert.equal(
      await page
        .getByRole('slider', { name: 'Navigate Left stick deadzone', exact: true })
        .inputValue(),
      menuDeadzone,
    );
    await page.screenshot({ path: path.join(output, `controls-gamepad-dpr${scale}.png`) });
    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
    assert.deepEqual(
      await page.evaluate(async () =>
        (await axe.run(document.querySelector('app-controls'))).violations.map((v) => v.id),
      ),
      [],
      'gamepad Controls axe',
    );
    await page.setViewportSize({ width: 640, height: 480 });
    await page.screenshot({ path: path.join(output, `controls-small-dpr${scale}.png`) });
    assert.deepEqual(
      await page.evaluate(async () =>
        (await axe.run(document.querySelector('app-controls'))).violations.map((v) => v.id),
      ),
      [],
      'small Controls axe',
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('tab', { name: 'Keyboard & mouse', exact: true }).click();
    assert.deepEqual(
      await page.evaluate(async () =>
        (await axe.run(document.querySelector('app-controls'))).violations.map((v) => v.id),
      ),
      [],
      'keyboard Controls axe',
    );
    await sprint
      .getByRole('button', { name: /^Change Sprint binding/ })
      .first()
      .click();
    await page.keyboard.press('Control');
    await sprint.getByRole('button', { name: /Left Ctrl/ }).waitFor();
    await page.getByRole('button', { name: 'Save controls', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(
      await page.evaluate(() => document.activeElement.textContent.trim()),
      'Controls',
      'focus restored',
    );
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await sprint.getByRole('button', { name: /Left Ctrl/ }).waitFor();
    // Tab/Alt are ordinary standalone bindings in capture, with Escape retaining its exit behavior.
    for (const key of ['Tab', 'Alt']) {
      await page
        .locator('[data-action="gameplay.sprint"]')
        .getByRole('button', { name: /^Change Sprint binding/ })
        .first()
        .click();
      await page.keyboard.press(key);
      await page
        .locator('[data-action="gameplay.sprint"]')
        .getByRole('button', { name: new RegExp(key === 'Alt' ? 'Left Alt' : key) })
        .waitFor();
    }
    await page.getByRole('button', { name: 'Reset defaults', exact: true }).click();
    await page.getByRole('button', { name: 'Save controls', exact: true }).click();
    await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
    await page.getByText('Loading game…', { exact: true }).waitFor({ state: 'hidden' });
    await page.waitForFunction(
      () =>
        !!document.querySelector('app-game-page') &&
        ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.world() !==
          null &&
        ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.isReady(),
    );
    await canvas.focus();
    await page.waitForTimeout(200);
    // Project a known free cell through the actual authored camera to exercise CSS/display-scale picking.
    const target = await runtime(() => {
      const r = ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService;
      const s = r.client.currentScene;
      const c = s.activeCamera;
      const v = c.position.constructor;
      const m = s.getTransformMatrix();
      const e = s.getEngine();
      const rect = e.getRenderingCanvas().getBoundingClientRect();
      const p = v.Project(
        new v(100, 0, 300),
        m.constructor.Identity(),
        m,
        c.viewport.toGlobal(e.getRenderWidth(), e.getRenderHeight()),
      );
      return {
        x: rect.left + (p.x / e.getRenderWidth()) * rect.width,
        y: rect.top + (p.y / e.getRenderHeight()) * rect.height,
      };
    });
    await page.mouse.move(target.x, target.y);
    await page.keyboard.press('b');
    await page.waitForTimeout(100);
    assert.match(await page.locator('.game-help').innerText(), /Placement available/);
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(150);
    assert.equal((await state()).buildings.length, 1, 'developer fixture places via command');
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(100);
    assert.equal((await state()).buildings.length, 1, 'occupied placement rejected');
    await page.keyboard.press('b');
    await page.screenshot({ path: path.join(output, `perspective-dpr${scale}.png`) });
    await runtime(() => {
      const c = ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.client
        .currentScene.activeCamera;
      c.mode = 1;
      const aspect = c.getEngine().getRenderWidth() / c.getEngine().getRenderHeight();
      c.orthoTop = 800;
      c.orthoBottom = -800;
      c.orthoLeft = -800 * aspect;
      c.orthoRight = 800 * aspect;
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(output, `orthographic-comparison-dpr${scale}.png`) });
    await runtime(
      () =>
        (ng.getComponent(
          document.querySelector('app-game-page'),
        ).gameRuntimeService.client.currentScene.activeCamera.mode = 0),
    );
    await page.setViewportSize({ width: 640, height: 480 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(output, `resize-dpr${scale}.png`) });
    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
    const axe = await page.evaluate(async () =>
      (await axe.run()).violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.html),
      })),
    );
    assert.deepEqual(axe, [], 'game has no axe violations');
    assert.deepEqual(errors, []);
    results.push({
      deviceScaleFactor: scale,
      walkMetres: distance(initial, walked),
      sprintMetres: distance(walked, ran),
      camera: { before: beforeCamera, after: afterCamera },
      routeRedirect: true,
      modalPause: true,
      heldRelease: true,
      ctrlTabAltCapture: true,
      settingsReload: true,
      spatialSaveLoadNavigation: true,
      controlTabsAndLabels: true,
      independentDeadzones: true,
      controlsAxe: [],
      placement: true,
      resize: true,
      axe,
      errors,
    });
    await context.close();
  }
  await fs.writeFile(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        method:
          'Local development Chromium, actual keyboard/mouse flow; no physical gamepad attached. Orthographic is a comparison only; perspective restored.',
        results,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
