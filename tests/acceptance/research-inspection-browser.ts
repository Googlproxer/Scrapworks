import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import type { BuildingView, WorldDefinition } from '../../src/contracts/world.ts';
import type { RuntimeReply } from '../../src/contracts/simulation.ts';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
import { staticPreview } from '../../tools/portfolio/serve.ts';
import { readJson, type BuildMetadata } from '../../tools/shared.ts';
import { saveFixture } from '../support/save-fixture.ts';
import {
  installBrowserEvents,
  installWorkerEvents,
  workerVersion,
  nextWorkerReply,
} from './browser-events.ts';
import { interactWithMachine } from './machine-interaction.ts';
import { seedSave, saveThroughUi, readManualSave } from './manual-save.ts';

if (process.env['CI'])
  throw new Error('Research/inspection browser diagnostics are local and manually invoked only.');

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, 'tmp/research-inspection-browser');
await fs.mkdir(output, { recursive: true });
const directory = path.join(root, 'dist/scrapworks/browser');
const modules = await createServer({
  configFile: false,
  resolve: { tsconfigPaths: true },
  server: { middlewareMode: true, hmr: false },
  logLevel: 'error',
});
let fixture: SaveSnapshot, recycler: BuildingView;
try {
  const { Simulation } = (await modules.ssrLoadModule(
    '/src/simulation/ecs-runtime.ts',
  )) as typeof import('../../src/simulation/ecs-runtime.ts');
  const { OPENING_TECHNOLOGIES } = (await modules.ssrLoadModule(
    '/src/content/opening.ts',
  )) as typeof import('../../src/content/opening.ts');
  const definition = await readJson<WorldDefinition>(
    path.join(directory, 'scene/worlds/game.json'),
  );
  const initial = new Simulation(definition),
    snapshot = initial.capture();
  initial.dispose();
  for (const technology of OPENING_TECHNOLOGIES.slice(0, 14))
    snapshot.resources.research[technology.id] = {
      consumed: Object.fromEntries(technology.costs.map((cost) => [cost.item, cost.quantity])),
      work: technology.seconds,
      unlocked: true,
    };
  const player = snapshot.entities.find((entity) => entity.kind === 'player')!;
  player.opening!.researchQueue = ['greenhouse']; // Valid older queue, normalized only when activated.
  player.inventory!.slots[0] = { item: 'recycler', quantity: 1 };
  player.inventory!.slots[1] = { item: 'wind-turbine', quantity: 1 };
  player.inventory!.slots[2] = { item: 'scrap', quantity: 100 };
  player.inventory!.slots[3] = { item: 'power-connection', quantity: 1 };
  const simulation = new Simulation(definition, { snapshot });
  const place = (equipment: 'recycler' | 'wind-turbine') => {
    for (let row = 0; row < definition.grid.rows; row++)
      for (let column = 0; column < definition.grid.columns; column++) {
        const x = definition.grid.origin.x + (column + 0.5) * definition.grid.metresPerCell;
        const z = definition.grid.origin.z + (row + 0.5) * definition.grid.metresPerCell;
        if (Math.hypot(x - definition.spawn.x, z - definition.spawn.z) > 3) continue;
        const result = simulation.step({ x: 0, z: 0, sprint: false }, [
          { type: 'factory-place', equipment, cell: { column, row }, rotation: 0 },
        ]).commandResults[0];
        if (result.accepted)
          return simulation.view.buildings.find((building) => building.buildingId === equipment)!;
      }
    throw new Error(`No nearby smoke-fixture cell for ${equipment}`);
  };
  recycler = place('recycler');
  const generator = place('wind-turbine');
  const results = simulation.step({ x: 0, z: 0, sprint: false }, [
    { type: 'factory-connect', from: generator.id, to: recycler.id },
    {
      type: 'factory-transfer',
      target: recycler.id,
      buffer: 'input',
      direction: 'load',
      item: 'scrap',
      quantity: 100,
    },
  ]).commandResults;
  assert(results.every((result) => result.accepted));
  fixture = saveFixture(
    simulation.capture(),
    'inspection-fixture',
    'inspection-fixture-token',
    new Date().toISOString(),
  );
  simulation.dispose();
} finally {
  await modules.close();
}

const metadata = await readJson<BuildMetadata>(
  path.join(root, 'dist/scrapworks/browser-stats.json'),
);
const engineChunk = Object.entries(metadata.outputs).find(([, output]) =>
  Object.keys(output.inputs ?? {}).some((input) =>
    input.replaceAll('\\', '/').endsWith('/Engines/engineStore.js'),
  ),
)?.[0];
assert(engineChunk);
const server = staticPreview(directory);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage(),
  errors: string[] = [];
page.on('pageerror', (error) => errors.push(String(error)));
await installBrowserEvents(page, engineChunk);
interface Probe {
  tick: number;
  position: { x: number; z: number };
  production: Readonly<Record<string, number>>;
}
try {
  await page.goto(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`);
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.getByRole('button', { name: /^Open field kit/ }).click();
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  assert(await page.getByRole('button', { name: 'Pause field research', exact: true }).isVisible());
  assert.match(
    await page.locator('.research-queue [role="status"]').innerText(),
    /No active research/,
  );
  assert.equal(await page.locator('.tech-node').count(), 19);
  await page.locator('[data-technology="material-recovery"]').click();
  assert(
    await page.getByRole('button', { name: 'Queue Material recovery', exact: true }).isDisabled(),
  );
  await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.locator('.zoom-level').filter({ hasText: '80%' }).waitFor();
  const treeViewport = page.locator('.tree-viewport'),
    viewportBox = (await treeViewport.boundingBox())!;
  await page.mouse.move(
    viewportBox.x + viewportBox.width / 2,
    viewportBox.y + viewportBox.height / 2,
  );
  await page.mouse.wheel(0, -100);
  await page.evaluate(() =>
    window.testEvents.dom(
      () => document.querySelector('.zoom-level')?.textContent?.trim() !== '80%',
      'wheel zoom',
    ),
  );
  const beforeDrag = await treeViewport.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop,
  }));
  const selectedId = await page
    .locator('.tech-node[aria-pressed="true"]')
    .getAttribute('data-technology');
  await page.mouse.move(
    viewportBox.x + viewportBox.width * 0.7,
    viewportBox.y + viewportBox.height * 0.6,
  );
  await page.mouse.down();
  await page.mouse.move(
    viewportBox.x + viewportBox.width * 0.7 - 90,
    viewportBox.y + viewportBox.height * 0.6 - 30,
    { steps: 6 },
  );
  await page.mouse.up();
  const afterDrag = await treeViewport.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop,
  }));
  assert.notDeepEqual(afterDrag, beforeDrag);
  assert.equal(
    await page.locator('.tech-node[aria-pressed="true"]').getAttribute('data-technology'),
    selectedId,
  );
  await page.getByRole('button', { name: 'Fit tree', exact: true }).click();
  await page.evaluate(() => window.testEvents.frames(2));
  await page.screenshot({ path: path.join(output, 'research-overview.png') });
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await page.locator('.zoom-level').filter({ hasText: '100%' }).waitFor();
  await page.screenshot({ path: path.join(output, 'research-start.png') });
  await seedSave(page, fixture);
  await page.reload();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByText('Research queue updated', { exact: true }).waitFor();
  const original = await readManualSave(page, 'inspection-fixture');
  assert.deepEqual(
    original!.world.entities.find((entity) => entity.kind === 'player')!.opening!.researchQueue,
    ['greenhouse'],
  );

  await page.getByRole('button', { name: /^Open field kit/ }).click();
  await page.getByRole('tab', { name: 'Factory', exact: true }).click();
  assert.equal(
    await page
      .locator('app-factory-panel button, app-factory-panel input, app-factory-panel select')
      .count(),
    0,
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const worker = page.workers()[0];
  assert(worker);
  await installWorkerEvents(worker);
  await worker.evaluate(() => {
    const scope = globalThis as unknown as {
      inspectionProbe?: Probe;
      postMessage(message: RuntimeReply, transfer?: Transferable[]): void;
    };
    const send = scope.postMessage.bind(globalThis);
    scope.postMessage = (message, ...rest) => {
      if (message.packet?.opening)
        scope.inspectionProbe = {
          tick: message.packet.tick,
          position: message.packet.endpoints.at(-1)!.transform.position,
          production: message.packet.productionTotals,
        };
      return send(message, ...rest);
    };
  });
  const read = () =>
    worker.evaluate(() => (globalThis as unknown as { inspectionProbe?: Probe }).inspectionProbe);
  const until = async (predicate: (probe: Probe) => boolean) => {
    const deadline = performance.now() + 30000;
    while (performance.now() < deadline) {
      const version = await workerVersion(worker),
        probe = await read();
      if (probe && predicate(probe)) return probe;
      await nextWorkerReply(worker, version);
    }
    throw new Error('Missing live inspection state');
  };
  await interactWithMachine(page, engineChunk, recycler);
  await page.locator('[aria-label="Machine input slots"] .occupied').waitFor();
  const before = await until(() => true);
  await page.keyboard.down('KeyD');
  await page.evaluate(() => window.testEvents.frames(8));
  await page.keyboard.up('KeyD');
  const after = await until((probe) => probe.tick > before.tick);
  assert.deepEqual(after.position, before.position);
  await until((probe) =>
    Object.entries(probe.production).some(
      ([item, count]) => count > (before.production[item] ?? 0),
    ),
  );
  await page.locator('[aria-label="Machine output slots"] .occupied').first().waitFor();
  await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await page.screenshot({ path: path.join(output, 'machine-desktop.png') });
  await page.getByRole('button', { name: 'Collect all output', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await page.screenshot({ path: path.join(output, 'machine-mobile.png') });
  await page.keyboard.press('Escape');
  await page.locator('#machine-inspection-title').waitFor({ state: 'hidden' });
  await page.evaluate(() =>
    window.testEvents.dom(
      () => document.activeElement?.tagName === 'CANVAS',
      'viewport focus after inspection',
    ),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await interactWithMachine(page, engineChunk, recycler, 'click');
  await page.getByRole('button', { name: 'Close machine inspection', exact: true }).click();
  await page.getByRole('button', { name: /^Open field kit/ }).click();
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  await page.locator('[data-technology="storage"]').click();
  assert(await page.getByRole('button', { name: 'Queue Energy storage', exact: true }).isEnabled());
  await page.screenshot({ path: path.join(output, 'research-progress.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await page.screenshot({ path: path.join(output, 'research-mobile.png') });
  await saveThroughUi(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  assert.equal(await page.locator('#machine-inspection-title').count(), 0);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        passed: true,
        preparedFixture: true,
        liveProduction: true,
        movementBlocked: true,
        keyboardAndClick: true,
        inventorySlots: true,
        zoomAndPan: true,
        legacyQueueNotice: true,
        axeDesktopAndMobile: true,
        saveReload: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'Production research tree and nearby live machine inspection passed; desktop/mobile AXE and save/reload passed.',
  );
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
  await fs.writeFile(path.join(output, 'failure.txt'), String(error));
  throw error;
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
