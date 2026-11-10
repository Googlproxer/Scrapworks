import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, type Page } from 'playwright';
import type axe from 'axe-core';
import { staticPreview } from '../portfolio/serve.ts';

if (process.env.CI || process.env.GITHUB_ACTIONS)
  throw new Error('Preload browser diagnostics are local/manual only.');
const output = path.resolve('docs/reports/data-preloading', new Date().toISOString().slice(0, 10));
await fs.mkdir(output, { recursive: true });
const source = await fs.readFile('node_modules/axe-core/axe.min.js', 'utf8');
const server = staticPreview('dist/scrapworks/browser');
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;

declare global {
  interface Window {
    preloadMessages: { worker: number; kind?: string; operation?: string }[];
  }
}

async function observeWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.preloadMessages = [];
    const workers = new WeakMap<Worker, number>();
    let count = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: StructuredSerializeOptions | Transferable[],
    ): void {
      let id = workers.get(this);
      if (id === undefined) {
        id = ++count;
        workers.set(this, id);
        this.addEventListener('message', (event: MessageEvent<{ kind?: string }>) => {
          if (event.data.kind) window.preloadMessages.push({ worker: id!, kind: event.data.kind });
        });
      }
      const data = message as { kind?: string; operation?: string };
      window.preloadMessages.push({ worker: id, kind: data.kind, operation: data.operation });
      Reflect.apply(post, this, [message, options]);
    };
  });
}

async function accessible(page: Page): Promise<void> {
  await page.addScriptTag({ content: source });
  const violations = await page.evaluate(async () =>
    (await (window as unknown as { axe: typeof axe }).axe.run()).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.html),
    })),
  );
  assert.deepEqual(violations, []);
}

try {
  for (const engine of ['chromium', 'firefox'] as const) {
    const browser = await (engine === 'chromium' ? chromium : firefox).launch();
    try {
      for (const viewport of [
        { width: 320, height: 240 },
        { width: 1440, height: 900 },
      ]) {
        const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
        try {
          const page = await context.newPage();
          const errors: string[] = [];
          page.on('pageerror', (e) => errors.push(e.message));
          await observeWorker(page);
          let release!: () => void;
          const gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          let downloads = 0;
          await page.route('**/protagonist-v3.glb', async (route) => {
            downloads++;
            await gate;
            await route.continue();
          });
          await page.goto(url);
          const play = page.getByRole('button', { name: 'New Game', exact: true });
          await play.click({ trial: true });
          await page.waitForFunction(() =>
            window.preloadMessages.some((m) => m.kind === 'simulation-ready'),
          );
          assert.equal(await page.locator('app-loading-screen').count(), 0);
          assert.equal(
            await page.evaluate(() => window.preloadMessages.some((m) => m.operation)),
            false,
            'Menu warmup must not initialize or advance a world',
          );
          assert.equal(downloads, 1);
          const warm = page.workers()[0];
          const before = await play.boundingBox();
          await accessible(page);
          release();
          await page
            .locator('.preload-status')
            .filter({ hasText: 'Game data downloaded.' })
            .waitFor();
          assert.deepEqual(
            await play.boundingBox(),
            before,
            'Readiness must not move menu controls',
          );
          const status = await page.locator('.preload-status').boundingBox();
          assert(status && status.y >= 0 && status.y + status.height <= viewport.height);
          await page.screenshot({
            path: path.join(output, `menu-${engine}-${viewport.width}.png`),
          });
          await play.focus();
          await page.keyboard.press('Enter');
          await page.locator('canvas:focus').waitFor();
          await page.locator('.game-help').waitFor();
          assert.equal(downloads, 1, 'Character parsing must reuse the downloaded bytes');
          assert.deepEqual(page.workers(), [warm], 'Activation must adopt the warmed worker');
          assert.equal(
            await page.evaluate(
              () => window.preloadMessages.filter((m) => m.operation === 'initialize').length,
            ),
            1,
          );
          await accessible(page);
          assert.deepEqual(errors, []);
          // Exercise save controls at their normal gameplay viewport, then return
          // to the compact menu with Continue and Resume both present.
          await page.setViewportSize({ width: 1440, height: 900 });
          await page
            .locator('.top-right app-gameplay-saves summary')
            .filter({ hasText: /^Save & load$/ })
            .click();
          await page.getByRole('button', { name: 'Save game', exact: true }).click();
          await page.locator('.compact-feedback').filter({ hasText: 'Game saved.' }).waitFor();
          await page
            .locator('.top-right app-gameplay-saves summary')
            .filter({ hasText: /^Save & load$/ })
            .click();
          await page.getByRole('button', { name: 'Menu', exact: true }).click();
          await page.getByRole('button', { name: 'Main menu', exact: true }).click();
          await page.setViewportSize(viewport);
          await play.click({ trial: true });
          assert.equal(await page.locator('.centre button').count(), 3);
          for (const button of await page.locator('.centre button').all()) {
            const bounds = await button.boundingBox();
            assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height);
            await button.click({ trial: true });
          }
          await accessible(page);
          await page.screenshot({
            path: path.join(output, `menu-${engine}-${viewport.width}-saved.png`),
          });
        } finally {
          await context.close();
        }
      }
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        let downloads = 0;
        await page.route('**/protagonist-v3.glb', async (route) => {
          if (++downloads === 1)
            await route.fulfill({ status: 404, body: 'Background failure fixture' });
          else await route.continue();
        });
        await page.goto(url);
        await page
          .locator('.preload-status')
          .filter({ hasText: 'Some data will load when you start.' })
          .waitFor();
        await page.getByRole('button', { name: 'New Game', exact: true }).click();
        await page.locator('canvas:focus').waitFor();
        assert.equal(downloads, 2, 'Selection must retry a failed background source');
      } finally {
        await context.close();
      }
      const invalidContext = await browser.newContext();
      try {
        const page = await invalidContext.newPage();
        let downloads = 0;
        await page.route('**/protagonist-v3.glb', async (route) => {
          if (++downloads === 1) await route.fulfill({ status: 200, body: 'Invalid GLB fixture' });
          else await route.continue();
        });
        await page.goto(url);
        await page
          .locator('.preload-status')
          .filter({ hasText: 'Game data downloaded.' })
          .waitFor();
        await page.getByRole('button', { name: 'New Game', exact: true }).click();
        await page.getByRole('alert').waitFor();
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await page
          .locator('.preload-status')
          .filter({ hasText: 'Some data will load when you start.' })
          .waitFor();
        await page.getByRole('button', { name: 'Resume current game', exact: true }).click();
        await page.locator('canvas:focus').waitFor();
        assert.equal(downloads, 2, 'A parse failure must evict invalid cached bytes before Retry');
      } finally {
        await invalidContext.close();
      }
      console.log(
        `${engine}: menu accessibility/layout, byte reuse, worker adoption, no menu world/ticks and background recovery passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
