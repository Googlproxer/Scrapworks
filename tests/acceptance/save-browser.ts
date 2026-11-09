import { readManualSave, readSavedHistory, seedSave, corruptNewestSave } from './manual-save.ts';
import { saveFixture } from '../support/save-fixture.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import { createServer } from 'vite';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
import type { WorldDefinition } from '../../src/contracts/world.ts';
import { installBrowserEvents } from './browser-events.ts';
import { checkResearchRoute } from './research-route.ts';
import { checkFactoryRoute, type FactoryRouteProbe } from './factory-route.ts';
import type { RuntimeReply } from '../../src/contracts/simulation.ts';
import { readJson, type BuildMetadata } from '../../tools/shared.ts';

const researchMode = process.argv.includes('--research');
const firefoxMode = process.argv.includes('--firefox');
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
    ...(firefoxMode ? ['firefox'] : []),
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
  fixture = saveFixture(world, 'fixture-run', 'fixture-token', new Date().toISOString());
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
const browser = await (firefoxMode ? firefox : chromium).launch({ headless: true }),
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
  return readManualSave(page);
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
  await seedSave(page, fixturePayload);
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
    await checkResearchRoute(page, readSlot, output, root, fixture.contentVersion);
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
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Load selected revision', exact: true })
      .click();
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
    stage = 'new named run preserves previous run';
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
    await waitMessage('Game saved.');
    assert.notEqual((await readSlot())!.runId, fixture.runId);
    assert.equal((await readManualSave(page, fixture.runId))!.runId, fixture.runId);
    stage = 'M9 JSON backup, repeated import and deliberate activation';
    const panel = page.locator('.top-right app-gameplay-saves');
    const downloading = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Export selected revision', exact: true }).click();
    const download = await downloading;
    const backupPath = path.join(output, 'm9-backup.json');
    await download.saveAs(backupPath);
    const backup = await readJson<SaveSnapshot>(backupPath);
    assert.equal(backup.schema, 2);
    assert(download.suggestedFilename().startsWith('scrapworks-'));
    const importedRuns: string[] = [];
    for (let n = 0; n < 2; n++) {
      await panel.locator('input[type=file]').setInputFiles(backupPath);
      await waitMessage('Backup validated.');
      await panel.locator('[data-save-import-name]').fill(`Imported checkpoint ${n + 1}`);
      await panel.getByRole('button', { name: 'Import as new run', exact: true }).click();
      await waitMessage('Backup imported as a new run.');
      const saved = (await readManualSave(page))!;
      importedRuns.push(saved.runId);
      assert.deepEqual(saved.world, backup.world);
      assert.deepEqual(saved.origin, { runId: backup.runId, token: backup.token });
    }
    assert.notEqual(importedRuns[0], importedRuns[1]);
    assert.equal(new Set((await readSavedHistory(page)).map((m) => m.runId)).size, 4);
    await panel.getByRole('button', { name: 'Load selected revision', exact: true }).click();
    await confirm();
    await waitMessage('Game loaded.');
    await panel.getByRole('button', { name: 'Save game', exact: true }).click();
    await waitMessage('Game saved.');
    assert.equal(page.workers().length, 1);
    stage = 'accessibility';
    await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
    assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
    await page.screenshot({ path: path.join(output, 'restored-mobile.png'), fullPage: true });
    stage = 'corrupt slot preserves metadata and does not trap startup';
    await corruptNewestSave(page);
    await page.reload();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'newer unsupported format' }).waitFor();
    await page.getByRole('button', { name: 'New Game', exact: true }).click({ trial: true });
    assert.equal(await page.getByRole('button', { name: 'Continue', exact: true }).count(), 1);
    await page.getByText('Save & load', { exact: true }).click();
    stage = 'M9 recover previous revision without erasing damaged newest';
    const damaged = (await readSavedHistory(page))
      .filter((m) => m.runId === importedRuns[1])
      .sort((a, b) => b.sequence - a.sequence)[0];
    const previous = (await readSavedHistory(page)).find(
      (m) => m.runId === damaged.runId && m.sequence < damaged.sequence,
    )!;
    await panel.locator('[data-save-revision]').selectOption(previous.token);
    await panel.getByRole('button', { name: 'Load selected revision', exact: true }).click();
    await waitMessage('Game loaded.');
    assert((await readSavedHistory(page)).some((m) => m.token === damaged.token));
    await panel.getByRole('button', { name: 'Save game', exact: true }).click();
    await waitMessage('Game saved.');
    assert.equal((await readManualSave(page, damaged.runId))!.recoveredFrom, previous.token);
    stage = 'delete slot and verify full reload';
    await page.getByRole('button', { name: 'Delete saved run', exact: true }).click();
    await confirm();
    await waitMessage('Saved data deleted.');
    assert(!(await readSavedHistory(page)).some((m) => m.runId === damaged.runId));
    assert.equal((await readManualSave(page, fixture.runId))!.runId, fixture.runId);
    await page.reload();
    await page.getByRole('button', { name: 'New Game', exact: true }).click({ trial: true });
    assert.equal(await page.getByRole('button', { name: 'Continue', exact: true }).count(), 1);
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
