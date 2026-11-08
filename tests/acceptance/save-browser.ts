import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
import type { WorldDefinition } from '../../src/contracts/world.ts';
import { installBrowserEvents } from './browser-events.ts';
import { checkResearchRoute } from './research-route.ts';
import { checkFactoryRoute, type FactoryRouteProbe } from './factory-route.ts';
import type { RuntimeReply } from '../../src/contracts/simulation.ts';
import { readJson, type BuildMetadata } from '../../tools/shared.ts';

const researchMode = process.argv.includes('--research');
const factoryMode = process.argv.includes('--factory-controls');

const root = path.resolve(import.meta.dirname, '../..'),
  directory = path.join(root, 'dist/scrapworks/browser'),
  output = path.join(
    root,
    factoryMode
      ? 'tmp/factory-controls-browser'
      : researchMode
        ? 'tmp/research-browser'
        : 'tmp/save-browser',
  );
await fs.mkdir(output, { recursive: true });
// Isolated fixture preparation uses the real simulation and its alias resolution. No production mutation hooks.
const modules = await createServer({
  configFile: false,
  resolve: { tsconfigPaths: true },
  server: { middlewareMode: true, hmr: false },
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
  for (const technology of researchMode
    ? []
    : OPENING_TECHNOLOGIES.filter((t) => !factoryMode || t.id !== 'sorting-logistics'))
    snapshot.resources.research[technology.id] = {
      consumed: Object.fromEntries(technology.costs.map((cost) => [cost.item, cost.quantity])),
      work: technology.seconds,
      unlocked: true,
    };
  const player = snapshot.entities.find((entity) => entity.kind === 'player')!;
  if (factoryMode) player.opening!.fieldEnabled = true;
  for (const [i, [item, quantity]] of (
    (factoryMode
      ? [
          ['solar-panel', 1],
          ['wind-turbine', 1],
          ['recycler', 1],
          ['basic-fabricator', 1],
          ['medium-fabricator', 1],
          ['extractor', 1],
          ['laboratory', 2],
          ['power-connection', 8],
          ['scrap', 100],
        ]
      : researchMode
        ? [['scrap', 100]]
        : [
            ['plate', 2],
            ['wire', 2],
            ['mechanical-part', 1],
            ['electrical-part', 1],
          ]) as readonly (readonly [string, number])[]
  ).entries())
    player.inventory!.slots[i] = { item, quantity };
  if (researchMode) {
    snapshot.resources.research['improvised-tools'] = {
      consumed: { scrap: 2 },
      work: 3.5,
      unlocked: false,
    };
    snapshot.resources.extractionTotals['scrap'] = 100;
    player.opening!.researchQueue = ['improvised-tools'];
  }
  const prepared = new Simulation(definition, { snapshot });
  if (!researchMode && !factoryMode)
    prepared.step({ x: 0, z: 0, sprint: false }, [
      { type: 'handcraft-ui', visible: true },
      { type: 'craft', recipe: 'base-minifab', quantity: 1 },
    ]);
  const world = prepared.capture();
  prepared.dispose();
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
const metadata = await readJson<BuildMetadata>(
  path.join(root, 'dist/scrapworks/browser-stats.json'),
);
const engineStoreChunk = Object.entries(metadata.outputs).find(([, output]) =>
  Object.keys(output.inputs ?? {}).some((input) =>
    input.replaceAll('\\', '/').endsWith('/Engines/engineStore.js'),
  ),
)?.[0];
await installBrowserEvents(page, engineStoreChunk);
if (factoryMode) await page.clock.install();
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
let lastFactoryProbe: FactoryRouteProbe | undefined;
try {
  await page.goto(url);
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ trial: true });
  const fixturePayload = researchMode
    ? {
        ...fixture,
        contentVersion: 'opening-1',
        world: {
          ...fixture.world,
          contentVersion: 'opening-1',
          resources: Object.fromEntries(
            Object.entries(fixture.world.resources).filter(([key]) => key !== 'factory'),
          ),
          entities: fixture.world.entities.map((entity) => {
            if (!entity.opening) return entity;
            const { researchQueue, ...opening } = entity.opening;
            return {
              ...entity,
              opening: { ...opening, fieldTechnology: researchQueue[0] ?? null },
            };
          }),
        },
      }
    : fixture;
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
  }, fixturePayload);
  await page.reload();
  if (factoryMode) {
    stage = 'prepared factory controls';
    const created = page.waitForEvent('worker');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const worker = await created;
    await worker.evaluate(() => {
      const scope = globalThis as unknown as {
        factoryProbe?: FactoryRouteProbe;
        postMessage(message: RuntimeReply, transfer?: Transferable[]): void;
      };
      const send = scope.postMessage.bind(globalThis),
        buildings = new Map<string, import('../../src/contracts/world.ts').BuildingView>();
      scope.postMessage = (message, ...rest) => {
        if (message.packet?.full) buildings.clear();
        for (const m of message.packet?.mappings ?? [])
          if (m.building) buildings.set(m.id, m.building);
        if (message.packet?.opening)
          scope.factoryProbe = {
            opening: message.packet.opening,
            tick: message.packet.tick,
            position: message.packet.endpoints.at(-1)!.transform.position,
            moving: message.packet.endpoints.at(-1)!.transform.moving,
            production: message.packet.productionTotals,
            factory: message.packet.factory,
            buildings: [...buildings.values()],
            details: message.packet.details,
          };
        return send(message, ...rest);
      };
    });
    const read = async () => {
      lastFactoryProbe = await worker.evaluate(
        () => (globalThis as unknown as { factoryProbe: FactoryRouteProbe }).factoryProbe,
      );
      return lastFactoryProbe;
    };
    const until = async (
      predicate: (probe: FactoryRouteProbe) => boolean,
      label: string,
      timeout = 120000,
      advanceMilliseconds = 250,
    ) => {
      const deadline = performance.now() + timeout,
        stamp = await page.evaluate(() => Date.now());
      let advanced = 0;
      await page.clock.setFixedTime(stamp);
      await page.clock.pauseAt(stamp);
      try {
        while (performance.now() < deadline) {
          const p = await read();
          if (p && predicate(p)) return p;
          await page.clock.fastForward(advanceMilliseconds);
          advanced += advanceMilliseconds;
          await worker.evaluate(() => undefined);
        }
        throw Error('Factory controls timeout: ' + label + ' ' + JSON.stringify(await read()));
      } finally {
        await page.clock.setSystemTime(stamp + advanced);
        await page.clock.resume();
      }
    };
    await until((p) => p.tick > fixture.world.resources.tick, 'first factory tick');
    await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
    await checkFactoryRoute({
      page,
      read,
      until,
      prepared: true,
      root,
      output,
      craft: async () => {
        throw Error('Unexpected fixture crafting');
      },
      research: async () => {
        throw Error('Unexpected fixture research');
      },
    });
    assert.deepEqual(errors, []);
    console.log('Prepared factory UI controls, industry, shared labs, persistence and AXE passed.');
  } else if (researchMode) {
    stage = 'shared research queue and M4 compatibility';
    await checkResearchRoute(page, readSlot, output, root);
    assert.deepEqual(errors, []);
  } else {
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
    await page
      .getByRole('dialog')
      .getByRole('status')
      .filter({ hasText: 'Game loaded.' })
      .waitFor();
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
  }
} catch (error) {
  await page
    .screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
    .catch(() => undefined);
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ stage, error: String(error), errors, lastFactoryProbe }, null, 2),
  );
  throw new Error(`Save acceptance failed at ${stage}`, { cause: error });
} finally {
  await context.close();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
