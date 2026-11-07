import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
import type { WorldDefinition } from '../../src/contracts/world.ts';
import { installBrowserEvents } from './browser-events.ts';

const root = path.resolve(import.meta.dirname, '../..'),
  directory = path.join(root, 'dist/scrapworks/browser'),
  output = path.join(root, 'tmp/save-browser');
await fs.mkdir(output, { recursive: true });
// Isolated fixture preparation uses the real simulation and its alias resolution. No production mutation hooks.
const modules = await createServer({
  configFile: false,
  resolve: { tsconfigPaths: true },
  server: { middlewareMode: true },
  logLevel: 'error',
});
let fixture: SaveSnapshot;
try {
  const { Simulation } = (await modules.ssrLoadModule(
    '/src/simulation/ecs-runtime.ts',
  )) as typeof import('../../src/simulation/ecs-runtime.ts');
  const { OPENING_TECHNOLOGIES } = (await modules.ssrLoadModule(
    '/src/content/opening.ts',
  )) as typeof import('../../src/content/opening.ts');
  const { preparePlayerSave } = (await modules.ssrLoadModule(
    '/src/simulation/player-save.ts',
  )) as typeof import('../../src/simulation/player-save.ts');
  const definition = JSON.parse(
    await fs.readFile(path.join(directory, 'scene/worlds/game.json'), 'utf8'),
  ) as WorldDefinition;
  const initial = new Simulation(definition),
    snapshot = initial.capture();
  initial.dispose();
  for (const technology of OPENING_TECHNOLOGIES)
    snapshot.resources.research[technology.id] = {
      consumed: Object.fromEntries(technology.costs.map((cost) => [cost.item, cost.quantity])),
      work: technology.seconds,
      unlocked: true,
    };
  const player = snapshot.entities.find((entity) => entity.kind === 'player')!;
  for (const [i, [item, quantity]] of (
    [
      ['plate', 2],
      ['wire', 2],
      ['mechanical-part', 1],
      ['electrical-part', 1],
    ] as const
  ).entries())
    player.inventory!.slots[i] = { item, quantity };
  const work = new Simulation(definition, { snapshot });
  work.step({ x: 0, z: 0, sprint: false }, [
    { type: 'handcraft-ui', visible: true },
    { type: 'craft', recipe: 'base-minifab', quantity: 1 },
  ]);
  const world = work.capture();
  work.dispose();
  preparePlayerSave(world);
  fixture = {
    schema: 1,
    slot: 'manual-1',
    token: 'fixture-token',
    runId: 'fixture-run',
    worldId: definition.id,
    contentVersion: world.contentVersion,
    savedAt: new Date().toISOString(),
    tick: world.resources.tick,
    world,
  };
} finally {
  await modules.close();
}

const server = http.createServer(async (request, response) => {
  try {
    const name = new URL(request.url ?? '/', 'http://localhost').pathname;
    let target = path.resolve(directory, '.' + decodeURIComponent(name));
    if (!target.startsWith(directory + path.sep) && target !== directory)
      throw new Error('Invalid path');
    if (name === '/' || !path.extname(target)) target = path.join(directory, 'index.html');
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.css': 'text/css',
      '.webp': 'image/webp',
      '.png': 'image/png',
      '.glb': 'model/gltf-binary',
    };
    response.setHeader('Content-Type', types[path.extname(target)] ?? 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
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
const browser = await chromium.launch({ headless: true }),
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } }),
  page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(String(error)));
await installBrowserEvents(page);
const url = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
async function readSlot(): Promise<SaveSnapshot | undefined> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ScrapworksGameplaySaves');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<SaveSnapshot | undefined>((resolve, reject) => {
        const transaction = db.transaction('slots', 'readonly'),
          request = transaction.objectStore('slots').get('manual-1');
        transaction.oncomplete = () =>
          resolve((request.result as { payload?: SaveSnapshot } | undefined)?.payload);
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
}
async function waitMessage(message: string): Promise<void> {
  await page.getByRole('status').filter({ hasText: message }).waitFor();
}
async function confirm(): Promise<void> {
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
}
let stage = 'startup';
try {
  await page.goto(url);
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ trial: true });
  await page.evaluate(async (save) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ScrapworksGameplaySaves');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('slots', 'readwrite');
        const { world: _world, ...metadata } = save;
        transaction.objectStore('slots').put({ slot: 'manual-1', metadata, payload: save });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }, fixture);
  await page.reload();
  stage = 'continue saved handcraft';
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('#field-kit #recipe').waitFor();
  assert.equal(await page.locator('#recipe').inputValue(), 'base-minifab');
  stage = 'save while handcraft remains visible';
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  await waitMessage('Game saved.');
  const saved = (await readSlot())!;
  const job = saved.world.entities.find((entity) => entity.kind === 'player')!.opening!.handcraft;
  assert(job && job.recipe === 'base-minifab' && job.remaining > 0);
  assert.equal(saved.runId, fixture.runId);
  assert.equal(saved.world.resources.productionTotals['minifab'] ?? 0, 0);
  await page.screenshot({ path: path.join(output, 'saved-handcraft.png') });
  stage = 'page reload and continue';
  await page.reload();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('#field-kit #recipe').waitFor();
  assert.equal(await page.locator('#recipe').inputValue(), 'base-minifab');
  await waitMessage('Game loaded.');
  stage = 'complete once after load';
  await page.getByText('Power-free baseline', { exact: false }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  await waitMessage('Game saved.');
  const finished = (await readSlot())!;
  assert.equal(finished.world.resources.productionTotals['minifab'], 1);
  assert.equal(
    finished.world.entities.find((entity) => entity.kind === 'player')!.opening!.handcraft,
    null,
  );
  stage = 'pause menu load and confirmations';
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Load game', exact: true }).click();
  const needsConfirmation = await Promise.race([
    page
      .getByRole('alertdialog')
      .waitFor()
      .then(() => true),
    page
      .getByRole('dialog')
      .getByRole('status')
      .filter({ hasText: 'Game loaded.' })
      .waitFor()
      .then(() => false),
  ]);
  if (needsConfirmation) await confirm();
  await page.getByRole('dialog').getByRole('status').filter({ hasText: 'Game loaded.' }).waitFor();
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  stage = 'new run and different-run overwrite';
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Main menu', exact: true }).click();
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Keep current progress', exact: true })
    .click();
  assert.equal((await readSlot())!.runId, fixture.runId);
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await confirm();
  await waitMessage('New game started.');
  await page.locator('canvas:focus').waitFor();
  assert.equal((await readSlot())!.runId, fixture.runId);
  await page.getByText('Save & load', { exact: true }).click();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Keep current progress', exact: true })
    .click();
  assert.equal((await readSlot())!.runId, fixture.runId);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await confirm();
  await waitMessage('Game saved.');
  assert.notEqual((await readSlot())!.runId, fixture.runId);
  assert.equal(page.workers().length, 1);
  stage = 'accessibility';
  await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await page.screenshot({ path: path.join(output, 'restored-mobile.png'), fullPage: true });
  stage = 'corrupt slot preserves metadata and does not trap startup';
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ScrapworksGameplaySaves');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('slots', 'readwrite'),
          store = transaction.objectStore('slots'),
          request = store.get('manual-1');
        request.onsuccess = () => {
          const row = request.result as {
            slot: string;
            metadata: unknown;
            payload: Record<string, unknown>;
          };
          row.payload['schema'] = 999;
          store.put(row);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
  await page.reload();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Unsupported save schema' }).waitFor();
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ trial: true });
  assert.equal(await page.getByRole('button', { name: 'Continue', exact: true }).count(), 1);
  await page.getByText('Save & load', { exact: true }).click();
  stage = 'delete slot and verify full reload';
  await page.getByRole('button', { name: 'Delete save', exact: true }).click();
  await confirm();
  await waitMessage('Save deleted.');
  assert.equal(await readSlot(), undefined);
  await page.reload();
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ trial: true });
  assert.equal(await page.getByRole('button', { name: 'Continue', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        passed: true,
        savedTick: saved.tick,
        savedWork: job.remaining,
        loadedRun: saved.runId,
        completedOnce: finished.world.resources.productionTotals['minifab'],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Production IndexedDB reload, visible craft continuation, pause load, deletion and AXE passed.',
  );
} catch (error) {
  await page
    .screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
    .catch(() => undefined);
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ stage, error: String(error), errors }, null, 2),
  );
  throw new Error(`Save acceptance failed at ${stage}`, { cause: error });
} finally {
  await context.close();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
