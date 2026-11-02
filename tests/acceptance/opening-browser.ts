import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import type { RuntimeReply } from '../../src/contracts/simulation.ts';
import type { OpeningView } from '../../src/contracts/opening.ts';
import type { WorldPosition } from '../../src/contracts/world.ts';
import type { EngineStore } from '@babylonjs/core';
import { readJson, type BuildMetadata } from '../../tools/shared.ts';

interface Probe {
  opening: OpeningView;
  tick: number;
  position: WorldPosition;
  moving: boolean;
  production: Record<string, number>;
}
const root = path.resolve(import.meta.dirname, '../..');
const directory = path.join(root, 'dist/scrapworks/browser');
const metadata = await readJson<BuildMetadata>(
  path.join(root, 'dist/scrapworks/browser-stats.json'),
);
const engineStoreChunk = Object.entries(metadata.outputs).find(([, output]) =>
  Object.keys(output.inputs ?? {}).some((input) =>
    input.replaceAll('\\', '/').endsWith('/Engines/engineStore.js'),
  ),
)?.[0];
const relaxed = process.argv.includes('--relaxed');
const output = path.join(root, relaxed ? 'tmp/opening-browser-relaxed' : 'tmp/opening-browser');
await fs.mkdir(output, { recursive: true });
const server = http.createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    let target = path.resolve(directory, '.' + name);
    if (target !== directory && !target.startsWith(directory + path.sep))
      throw new Error('Invalid path');
    if (!path.extname(target)) target = path.join(directory, 'index.html');
    const mime: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.glb': 'model/gltf-binary',
    };
    response.setHeader('Content-Type', mime[path.extname(target)] ?? 'application/octet-stream');
    response.setHeader(
      'Content-Security-Policy',
      "worker-src 'self'; object-src 'none'; base-uri 'self'",
    );
    response.end(await fs.readFile(target));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const checkpoints: { name: string; seconds: number; tick: number }[] = [];
let start = performance.now();
let firstAutomatic = 0;
let lastProbe: Probe | null = null;
try {
  await page.goto(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/`);
  const play = page.getByRole('button', { name: 'Play Game!', exact: true });
  await play.waitFor({ state: 'visible' });
  const created = page.waitForEvent('worker');
  await play.click();
  const worker = await created;
  await worker.evaluate(() => {
    const scope = globalThis as unknown as {
      openingProbe?: Probe;
      postMessage(message: RuntimeReply, transfer?: Transferable[]): void;
    };
    const send = scope.postMessage.bind(globalThis);
    scope.postMessage = (message, ...rest) => {
      if (message.packet?.opening)
        scope.openingProbe = {
          opening: message.packet.opening,
          tick: message.packet.tick,
          position: message.packet.endpoints.at(-1)!.transform.position,
          moving: message.packet.endpoints.at(-1)!.transform.moving,
          production: message.packet.productionTotals,
        };
      return send(message, ...rest);
    };
  });
  const read = async () => {
    lastProbe = await worker.evaluate(
      () => (globalThis as unknown as { openingProbe: Probe }).openingProbe,
    );
    return lastProbe;
  };
  const until = async (predicate: (probe: Probe) => boolean, label: string, timeout = 130000) => {
    const deadline = performance.now() + timeout;
    while (performance.now() < deadline) {
      const probe = await read();
      if (probe && predicate(probe)) return probe;
      await page.waitForTimeout(100);
    }
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
    throw new Error(`Timed out: ${label}; ${JSON.stringify(await read())}`);
  };
  const mark = async (name: string) => {
    const probe = await read();
    const checkpoint = { name, seconds: (performance.now() - start) / 1000, tick: probe.tick };
    checkpoints.push(checkpoint);
    console.log(JSON.stringify(checkpoint));
  };
  const verifyFocusPause = async () => {
    // Chromium headless reports all tabs focused, even after bringToFront/CDP focus emulation.
    // Inject only the browser focus signal; never alter session/world state or time.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false });
      window.dispatchEvent(new Event('blur'));
    });
    await page.waitForTimeout(300);
    const pausedTick = (await read()).tick;
    await page.waitForTimeout(600);
    assert.equal((await read()).tick, pausedTick);
    await page.evaluate(() => {
      Reflect.deleteProperty(document, 'hasFocus');
      window.dispatchEvent(new Event('focus'));
    });
    await until((probe) => probe.tick > pausedTick, 'resume after window focus returns', 5000);
  };
  await until((probe) => probe.tick > 0, 'first completed tick');
  const initial = await read();
  assert(initial.opening.bag.slots.every((slot) => slot === null));
  assert.equal(initial.opening.tool, null);
  assert.deepEqual(initial.opening.ledgers, {});
  const inspectPresentation = () =>
    page.evaluate(async (file) => {
      if (!file) throw new Error('EngineStore chunk missing');
      const module: Record<string, unknown> = await import(new URL(file, document.baseURI).href);
      const store = Object.values(module).find(
        (value): value is typeof EngineStore =>
          !!value &&
          typeof value === 'function' &&
          'Instances' in value &&
          'LastCreatedEngine' in value,
      );
      const scene = store?.LastCreatedEngine?.scenes.at(-1);
      if (!scene) throw new Error('Rendered scene missing');
      const idle = scene.animationGroups.find((clip) => clip.name === 'Idle');
      return {
        frame: scene.getFrameId(),
        idlePlaying: idle?.isPlaying,
        idleWeight: idle?.animatables[0]?.weight,
        clipsPaused: scene.animationGroups.every((clip) => !clip.isPlaying),
      };
    }, engineStoreChunk);
  const verifyGameplayUi = async () => {
    await page.locator('canvas').focus();
    const beforeMovement = await read();
    await page.keyboard.down('KeyW');
    try {
      await until(
        (probe) =>
          Math.hypot(
            probe.position.x - beforeMovement.position.x,
            probe.position.z - beforeMovement.position.z,
          ) > 0.05,
        'movement before opening gameplay UI',
        30000,
      );
      await page.keyboard.press('Tab');
    } finally {
      await page.keyboard.up('KeyW');
    }
    const kit = page.locator('#field-kit');
    await kit.waitFor();
    await page.waitForTimeout(650);
    const stopped = await read();
    const idle = await inspectPresentation();
    await page.waitForTimeout(250);
    const next = await read();
    const rendered = await inspectPresentation();
    assert(next.tick > stopped.tick, 'Gameplay UI must keep the worker active');
    assert.deepEqual(next.position, stopped.position, 'UI input must stop character movement');
    assert(rendered.frame > idle.frame, 'UI must keep rendering frames');
    assert(
      rendered.idlePlaying && (rendered.idleWeight ?? 0) > 0.99,
      'Character must return to animated idle',
    );
    const box = (await kit.boundingBox())!;
    assert(
      Math.abs(box.x + box.width / 2 - 640) < 2 && Math.abs(box.y + box.height / 2 - 450) < 2,
      'Kit must be centred in viewport',
    );
    assert(box.height <= 700);
    assert.equal(await kit.getByRole('heading', { name: 'Gathering', exact: true }).count(), 0);
    await page.screenshot({ path: path.join(output, 'field-kit-tabbed.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Research', exact: true }).click();
    assert.deepEqual(await kit.boundingBox(), box, 'Tab switch must retain kit geometry');
    await page.screenshot({ path: path.join(output, 'field-kit-research.png'), fullPage: true });
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.waitForTimeout(250);
    const paused = (await read()).tick;
    assert((await inspectPresentation()).clipsPaused, 'Pause menu must pause animation');
    await page.waitForTimeout(250);
    assert.equal((await read()).tick, paused);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await fs.writeFile(
      path.join(output, 'ui.json'),
      JSON.stringify(
        {
          success: true,
          centredBox: box,
          workerContinues: true,
          renderingContinues: true,
          animatedIdle: true,
          pauseMenuPauses: true,
        },
        null,
        2,
      ),
    );
  };
  if (process.argv.includes('--ui-only')) {
    await verifyGameplayUi();
    // A real out-of-reach world action produces a notice while the kit is closed.
    await page.locator('canvas').focus();
    await page.keyboard.press('KeyG');
    const notice = page.locator('.notification-stack .notification').first();
    await notice.waitFor();
    const before = (await notice.boundingBox())!;
    assert.equal(
      await page
        .locator('.notification-stack')
        .evaluate((element) => getComputedStyle(element).position),
      'fixed',
    );
    assert(Math.abs(before.y - 16) < 2 && Math.abs(before.x + before.width - 1264) < 2);
    await page.screenshot({ path: path.join(output, 'notification-viewport.png'), fullPage: true });
    await page.getByRole('button', { name: /Open field kit/ }).click();
    assert.deepEqual(
      await notice.boundingBox(),
      before,
      'Opening the kit must not reposition viewport notifications',
    );
    await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
    assert.deepEqual(
      await page.evaluate(async () =>
        (await axe.run()).violations.map((violation) => violation.id),
      ),
      [],
    );
    await page.setViewportSize({ width: 480, height: 740 });
    await page.screenshot({
      path: path.join(output, 'field-kit-tabbed-mobile.png'),
      fullPage: true,
    });
    assert.deepEqual(
      await page.evaluate(async () =>
        (await axe.run()).violations.map((violation) => violation.id),
      ),
      [],
    );
    await fs.writeFile(
      path.join(output, 'ui-notifications.json'),
      JSON.stringify(
        {
          success: true,
          viewportFixed: true,
          unchangedWithKit: true,
          axeViolations: [],
          mobileAxeViolations: [],
        },
        null,
        2,
      ),
    );
  } else if (process.argv.includes('--focus-only')) {
    await page.getByRole('button', { name: /Open field kit/ }).click();
    await verifyFocusPause();
    console.log(
      'Controlled browser focus loss pauses the UI-focused simulation and focus return resumes it.',
    );
  } else {
    await verifyGameplayUi();
    start = performance.now();
    await page.locator('canvas').focus();
    // Authored camera alpha -pi/2: W is +Z and D is +X. Physical key input only.
    const deposit = JSON.parse(
      await fs.readFile(path.join(root, 'assets/game.scene/nodes/scrap-deposit.json'), 'utf8'),
    ) as { position: number[] };
    const target = { x: deposit.position[0] / 100, z: deposit.position[2] / 100 };
    for (let attempt = 0; attempt < 180; attempt++) {
      const probe = await read(),
        dx = target.x - probe.position.x,
        dz = target.z - probe.position.z;
      if (Math.hypot(dx, dz) <= 1.9) break;
      const key =
        Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'KeyD' : 'KeyA') : dz > 0 ? 'KeyW' : 'KeyS';
      await page.keyboard.down(key);
      try {
        await until(
          (next) =>
            Math.hypot(next.position.x - probe.position.x, next.position.z - probe.position.z) >
            0.05,
          `authoritative movement toward salvage with ${key}`,
          15000,
        );
      } finally {
        await page.keyboard.up(key);
      }
      await until(
        (next) => !next.moving,
        'movement stopped before choosing the next salvage approach',
        15000,
      );
      if (attempt === 179) throw new Error('Could not walk into salvage reach');
    }
    await mark('walked to scrap');
    const amount = (probe: Probe, item: string) =>
      probe.opening.bag.slots.reduce(
        (sum, slot) => sum + (slot?.item === item ? slot.quantity : 0),
        0,
      );
    await page.keyboard.press('KeyG');
    await until((probe) => amount(probe, 'scrap') >= 8, 'eight hand-salvaged scrap', 35000);
    await page.keyboard.press('KeyG');
    await page.getByRole('button', { name: /Open field kit/ }).click();
    await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
    const accessibility = await page.evaluate(async () =>
      (await axe.run()).violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target),
      })),
    );
    assert.deepEqual(accessibility, []);
    const research = async (name: string, id: string) => {
      await page.getByRole('tab', { name: 'Research', exact: true }).click();
      // Optional reference itinerary includes reading/decision time, never a gameplay wait.
      if (relaxed) await page.waitForTimeout(40000);
      await page.getByRole('button', { name: `Research ${name}`, exact: true }).click();
      await until((probe) => !!probe.opening.ledgers[id]?.unlocked, name);
      await mark(name);
    };
    const craft = async (recipe: string, count: number) => {
      await page.getByRole('tab', { name: 'Inventory & Crafting', exact: true }).click();
      if (relaxed) await page.waitForTimeout(40000);
      await page.getByLabel('Recipe', { exact: true }).selectOption(recipe);
      await page.getByLabel('Batch size', { exact: true }).selectOption(String(count));
      await page.getByRole('button', { name: `Handcraft ${count}`, exact: true }).click();
      await until((probe) => !!probe.opening.state.handcraft, `start ${recipe}`, 5000);
      await until((probe) => !probe.opening.state.handcraft, `finish ${recipe}`);
    };
    await research('Improvised tools', 'improvised-tools');
    await craft('scrap-prybar', 1);
    assert.equal((await read()).opening.tool, 'prybar');
    await mark('prybar equipped');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('canvas').focus();
    await page.keyboard.press('KeyG');
    await until((probe) => amount(probe, 'scrap') >= 54, 'remaining opening scrap', 65000);
    await page.keyboard.press('KeyG');
    await page.getByRole('button', { name: /Open field kit/ }).click();
    await research('Material recovery', 'material-recovery');
    await craft('metal-plate', 10);
    await craft('metal-plate', 5);
    await craft('metal-plate', 1);
    await craft('recovered-wire', 10);
    await craft('recovered-wire', 1);
    await craft('recovered-wire', 1);
    await research('Mechanical assembly', 'mechanical-assembly');
    await research('Electrical assembly', 'electrical-assembly');
    await craft('mechanical-part', 1);
    await craft('mechanical-part', 1);
    await craft('electrical-part', 1);
    await craft('electrical-part', 1);
    await research('Mini fabrication', 'mini-fabrication');
    await craft('base-minifab', 1);
    assert.equal((await read()).opening.state.minifab.owned, true);
    assert.equal((await read()).opening.state.minifab.charge, 0);
    await mark('MiniFab assembled without power');
    await page.getByLabel('MiniFab recipe', { exact: true }).selectOption('metal-plate');
    const before = (await read()).production['plate'];
    await page.getByRole('button', { name: 'Request 1 from MiniFab', exact: true }).click();
    await until((probe) => probe.production['plate'] === before + 1, 'first automatic plate');
    firstAutomatic = (performance.now() - start) / 1000;
    assert(
      relaxed ? firstAutomatic >= 900 && firstAutomatic <= 1200 : firstAutomatic < 300,
      `Opening reference pacing outside its target: ${firstAutomatic}`,
    );
    await mark('first automatic plate');
    const handle = page.getByRole('button', { name: 'Wind MiniFab handle', exact: true });
    await handle.focus();
    for (const key of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
    }
    await until(
      (probe) => probe.opening.state.minifab.charge > 11.9,
      'keyboard winding turn',
      5000,
    );
    const held = (await read()).opening.state.minifab.charge;
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowUp');
    assert.equal((await read()).opening.state.minifab.charge, held);
    const bounds = (await handle.boundingBox())!;
    const point = (step: number) => ({
      x:
        bounds.x +
        bounds.width / 2 +
        Math.cos(((step * 22.5 - 90) * Math.PI) / 180) * bounds.width * 0.375,
      y:
        bounds.y +
        bounds.height / 2 +
        Math.sin(((step * 22.5 - 90) * Math.PI) / 180) * bounds.height * 0.375,
    });
    const first = point(0);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (let step = 1; step <= 16; step++) {
      const next = point(step);
      await page.mouse.move(next.x, next.y);
      await page.waitForTimeout(45);
    }
    await page.mouse.up();
    await until(
      (probe) => probe.opening.state.minifab.charge >= held + 11.8,
      'pointer winding turn',
      5000,
    );
    const afterPointer = (await read()).opening.state.minifab.charge;
    await handle.click();
    await page.waitForTimeout(300);
    assert.equal((await read()).opening.state.minifab.charge, afterPointer);
    await handle.screenshot({ path: path.join(output, 'winding.png') });
    await page.screenshot({ path: path.join(output, 'field-kit.png'), fullPage: true });
    // Confirm intentional exit offers both paths and cancellation refunds only unfinished work.
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('canvas').focus();
    await page.keyboard.press('KeyG');
    await until((probe) => amount(probe, 'scrap') >= 6, 'warning-test ingredients', 10000);
    await page.keyboard.press('KeyG');
    await page.getByRole('button', { name: /Open field kit/ }).click();
    await page.getByLabel('Recipe', { exact: true }).selectOption('metal-plate');
    await page.getByLabel('Batch size', { exact: true }).selectOption('1');
    await page.getByRole('button', { name: 'Handcraft 1', exact: true }).click();
    await until((probe) => !!probe.opening.state.handcraft, 'warning-test handcraft', 5000);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const warning = page.getByRole('alertdialog');
    await warning.waitFor();
    const warningAxe = await page.evaluate(async () =>
      (await axe.run()).violations.map((violation) => violation.id),
    );
    assert.deepEqual(warningAxe, []);
    await page.getByRole('button', { name: 'Stay and continue', exact: true }).click();
    await until((probe) => !probe.opening.state.handcraft, 'continued handcraft');
    const originalStock = amount(await read(), 'scrap');
    await page.getByRole('button', { name: 'Handcraft 1', exact: true }).click();
    await until((probe) => !!probe.opening.state.handcraft, 'cancel-test handcraft', 5000);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await warning.waitFor();
    await page.getByRole('button', { name: 'Cancel and leave', exact: true }).click();
    await until(
      (probe) => !probe.opening.state.handcraft && amount(probe, 'scrap') === originalStock,
      'exact unfinished-input refund',
      5000,
    );
    await page.getByRole('button', { name: /Open field kit/ }).click();
    const finalAxe = await page.evaluate(async () =>
      (await axe.run()).violations.map((violation) => violation.id),
    );
    assert.deepEqual(finalAxe, []);
    await verifyFocusPause();
    await page.setViewportSize({ width: 480, height: 740 });
    await page.screenshot({ path: path.join(output, 'field-kit-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(output, 'result.json'),
      JSON.stringify(
        {
          success: true,
          itinerary: relaxed
            ? 'Scripted relaxed route with 40 seconds reading/decision time per research/craft action; not a human usability study'
            : 'Experienced physical-keyboard/UI route',
          firstAutomaticSeconds: firstAutomatic,
          checkpoints,
          axeViolations: accessibility,
          pointerAndKeyboardWinding: true,
          handcraftStayAndCancel: true,
          errors,
          final: await read(),
        },
        null,
        2,
      ),
    );
  }
  assert.deepEqual(errors, []);
} catch (error) {
  await page
    .screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
    .catch(() => undefined);
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ error: String(error), checkpoints, lastProbe, errors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
