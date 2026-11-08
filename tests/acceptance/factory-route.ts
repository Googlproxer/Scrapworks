import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import type { Page } from 'playwright';
import type { OpeningView } from '../../src/contracts/opening.ts';
import type { FactorySummary, MachineKind } from '../../src/contracts/factory.ts';
import type { BuildingView, WorldPosition } from '../../src/contracts/world.ts';
import type { SaveSnapshot } from '../../src/contracts/save.ts';
import type { OpeningRecipe } from '../../src/content/opening.ts';
import type { Inspection } from '../../src/contracts/simulation.ts';
import type { EngineStore } from '@babylonjs/core';
import type { BuildMetadata } from '../../tools/shared.ts';

export interface FactoryRouteProbe {
  opening: OpeningView;
  tick: number;
  position: WorldPosition;
  moving: boolean;
  production: Record<string, number>;
  factory?: FactorySummary;
  buildings?: BuildingView[];
  details?: readonly Inspection[];
}
interface RoutePorts {
  prepared?: boolean;
  page: Page;
  root: string;
  output: string;
  read(): Promise<FactoryRouteProbe>;
  until(
    predicate: (p: FactoryRouteProbe) => boolean,
    label: string,
    timeout?: number,
    advanceMilliseconds?: number,
  ): Promise<FactoryRouteProbe>;
  craft(recipe: string, count: number): Promise<void>;
  research(name: string, id: string): Promise<void>;
}

/** Real built UI only, following the empty-handed opening. No grants, mutation APIs or injected saves. */
export async function checkFactoryRoute(ports: RoutePorts): Promise<void> {
  const { page, read, until, craft, research, root, output } = ports;
  const modules = await createServer({
    configFile: false,
    resolve: { tsconfigPaths: true },
    server: { middlewareMode: true, hmr: false },
    logLevel: 'error',
  });
  let recipes: readonly OpeningRecipe[];
  try {
    recipes = (
      (await modules.ssrLoadModule(
        '/src/content/opening.ts',
      )) as typeof import('../../src/content/opening.ts')
    ).OPENING_RECIPES;
  } finally {
    await modules.close();
  }
  const amount = (p: FactoryRouteProbe, item: string) =>
    p.opening.bag.slots.reduce((n, s) => n + (s?.item === item ? s.quantity : 0), 0);
  const metadata = JSON.parse(
    await fs.readFile(path.join(root, 'dist/scrapworks/browser-stats.json'), 'utf8'),
  ) as BuildMetadata;
  const engineChunk = Object.entries(metadata.outputs).find(([, output]) =>
    Object.keys(output.inputs ?? {}).some((input) =>
      input.replaceAll('\\', '/').endsWith('/Engines/engineStore.js'),
    ),
  )?.[0];
  assert(engineChunk, 'Production EngineStore export for read-only camera projection');
  const pointAt = async (x: number, z: number) => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const point = await page.evaluate(
        async ({ file, x, z }) => {
          const module: Record<string, unknown> = await import(
            new URL(file, document.baseURI).href
          );
          const store = Object.values(module).find(
            (value): value is typeof EngineStore =>
              typeof value === 'function' && 'LastCreatedEngine' in value && 'Instances' in value,
          );
          const engine = store!.LastCreatedEngine!,
            scene = engine.scenes.at(-1)!,
            camera = scene.activeCamera!;
          const m = scene.getTransformMatrix().m,
            worldX = x * 100,
            worldZ = z * 100,
            w = worldX * m[3] + worldZ * m[11] + m[15],
            clipX = (worldX * m[0] + worldZ * m[8] + m[12]) / w,
            clipY = (worldX * m[1] + worldZ * m[9] + m[13]) / w,
            viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
            canvas = engine.getRenderingCanvas()!.getBoundingClientRect();
          return {
            x:
              canvas.left +
              ((viewport.x + ((clipX + 1) * viewport.width) / 2) * canvas.width) /
                engine.getRenderWidth(),
            y:
              canvas.top +
              ((viewport.y + ((1 - clipY) * viewport.height) / 2) * canvas.height) /
                engine.getRenderHeight(),
          };
        },
        { file: engineChunk, x, z },
      );
      await page.mouse.move(point.x, point.y);
      await page.evaluate(() => window.testEvents.frames(2));
      const selected = await page.evaluate(async (file) => {
        const module: Record<string, unknown> = await import(new URL(file, document.baseURI).href);
        const store = Object.values(module).find(
          (value): value is typeof EngineStore =>
            typeof value === 'function' && 'LastCreatedEngine' in value && 'Instances' in value,
        );
        return store!
          .LastCreatedEngine!.scenes.at(-1)!
          .getMeshByName('cell-selection')
          ?.position.asArray();
      }, engineChunk);
      if (
        selected &&
        Math.abs(selected[0] / 100 - x) < 0.01 &&
        Math.abs(selected[2] / 100 - z) < 0.01
      )
        return point;
    }
    throw new Error(`Cannot point at world footprint ${x},${z}`);
  };
  const open = async (tab = 'Factory') => {
    if (!(await page.locator('#field-kit').isVisible()))
      await page.getByRole('button', { name: /Open field kit/ }).click();
    await page.getByRole('tab', { name: tab, exact: true }).click();
  };
  const close = async () => {
    if (await page.locator('#field-kit').isVisible()) {
      await page.getByRole('button', { name: 'Close', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.locator('#field-kit').waitFor({ state: 'hidden' });
    }
    await page.locator('canvas').focus();
  };
  const walk = async (x: number, z: number) => {
    await close();
    for (let attempt = 0; attempt < 500; attempt++) {
      const p = await read(),
        dx = x - p.position.x,
        dz = z - p.position.z;
      if (Math.hypot(dx, dz) < 0.13) return;
      const key =
        Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'KeyD' : 'KeyA') : dz > 0 ? 'KeyW' : 'KeyS';
      await page.keyboard.down(key);
      try {
        await until(
          (next) =>
            Math.hypot(next.position.x - p.position.x, next.position.z - p.position.z) > 0.02,
          'factory walk step',
          15000,
          Math.hypot(dx, dz) < 0.6 ? 50 : 250,
        );
      } finally {
        await page.keyboard.up(key);
      }
      await until((next) => !next.moving, 'factory movement stopped', 15000);
    }
    throw Error(
      `Cannot reach factory waypoint ${x},${z}; ${JSON.stringify((await read()).position)}`,
    );
  };
  await page.setViewportSize({ width: 1280, height: 900 });
  if (!ports.prepared) {
    // Return to the opening deposit before building; gather every material through normal salvage.
    await walk(-1.2, 1);
    await page.keyboard.press('KeyG');
    await until((p) => amount(p, 'scrap') >= 550, 'factory bootstrap scrap', 300000);
    await page.keyboard.press('KeyG');
    await open('Inventory & Crafting');
    const ensure = async (item: string, needed: number): Promise<void> => {
      while (amount(await read(), item) < needed) {
        const recipe = recipes.find((r) => r.outputs.some((s) => s.item === item));
        assert(recipe, `No bootstrap recipe for ${item}`);
        const missing = needed - amount(await read(), item);
        const count = [100, 25, 10, 5, 1].find(
          (n) => n <= missing && (recipe!.id.startsWith('assemble-') ? n <= 5 : true),
        )!;
        let lastStock = await read();
        // Making a later precursor can consume an earlier prepared material. Recheck the whole bundle.
        while (
          !recipe.inputs.every((input) => amount(lastStock, input.item) >= input.quantity * count)
        ) {
          for (const input of recipe.inputs) await ensure(input.item, input.quantity * count);
          lastStock = await read();
        }
        await craft(recipe.id, count);
      }
    };
    const technologies = [
      [
        'Electrical engineering',
        'electrical-engineering',
        [
          ['mechanical-part', 2],
          ['electrical-part', 2],
        ],
      ],
      [
        'Solar power',
        'solar-power',
        [
          ['plate', 6],
          ['wire', 4],
          ['electrical-part', 2],
        ],
      ],
      [
        'Wind power',
        'wind-power',
        [
          ['plate', 6],
          ['mechanical-part', 3],
          ['electrical-part', 1],
        ],
      ],
      [
        'Mixed recycling',
        'mixed-recycling',
        [
          ['plate', 6],
          ['mechanical-part', 3],
          ['electrical-part', 2],
        ],
      ],
      [
        'Basic fabrication',
        'basic-fabrication',
        [
          ['plate', 4],
          ['mechanical-part', 2],
        ],
      ],
      [
        'Medium fabrication',
        'medium-fabrication',
        [
          ['mechanical-part', 2],
          ['electrical-part', 2],
        ],
      ],
      [
        'Extraction',
        'extraction',
        [
          ['plate', 4],
          ['mechanical-part', 3],
        ],
      ],
      [
        'Laboratory research',
        'laboratory-research',
        [
          ['mechanical-part', 2],
          ['electrical-part', 3],
        ],
      ],
    ] as const;
    for (const [name, id, costs] of technologies) {
      let stocked = await read();
      while (!costs.every(([item, n]) => amount(stocked, item) >= n)) {
        for (const [item, n] of costs) await ensure(item, n);
        stocked = await read();
      }
      await research(name, id);
    }
    for (const [item, count] of [
      ['solar-panel', 1],
      ['wind-turbine', 1],
      ['recycler', 1],
      ['basic-fabricator', 1],
      ['medium-fabricator', 1],
      ['extractor', 1],
      ['laboratory', 2],
      ['power-connection', 8],
    ] as const) {
      await ensure(item, count);
      console.log(JSON.stringify({ factoryAssembled: item, count }));
    }
  }
  await open('Research');
  if ((await read()).opening.state.fieldEnabled)
    await page.getByRole('button', { name: 'Pause field research', exact: true }).click();
  await until((p) => !p.opening.state.fieldEnabled, 'field research disabled before factory work');
  const placements = [
    ['wind-turbine', 5, 5, -1, 0.8],
    ['extractor', 4, 6, -1.2, 1],
    ['recycler', 5, 7, -1, 1.2],
    ['basic-fabricator', 6, 7, 1, 1.2],
    ['medium-fabricator', 7, 7, 3, 1.2],
    ['laboratory', 8, 7, 5, 1.2],
    ['laboratory', 9, 7, 7, 1.2],
  ] as const;
  const placed: { id: string; kind: MachineKind; column: number; row: number }[] = [];
  const place = async (kind: MachineKind, column: number, row: number) => {
    await open('Inventory & Crafting');
    const before = (await read()).buildings?.length ?? 0;
    const slot = [
      'wind-turbine',
      'extractor',
      'recycler',
      'basic-fabricator',
      'medium-fabricator',
      'laboratory',
      'solar-panel',
    ].indexOf(kind);
    const recipe = recipes.find((r) => r.id === `assemble-${kind}`)!;
    await page.getByLabel('Toolbar slot', { exact: true }).selectOption(String(slot));
    await page.getByRole('button', { name: `Assign ${recipe.name}`, exact: true }).click();
    await until(
      (p) => p.opening.state.toolbar?.slots[slot] === kind,
      'toolbar assignment committed',
    );
    await close();
    await page.keyboard.press(`Digit${slot + 1}`);
    await until((p) => p.opening.state.toolbar?.active === slot, 'active toolbar slot committed');
    await page.keyboard.press('KeyB');
    if (kind === 'wind-turbine') await page.keyboard.press('KeyR');
    const pointer = await pointAt(column * 2 - 11, row * 2 - 11);
    await page.getByText('Placement available', { exact: true }).waitFor();
    await page.mouse.click(pointer.x, pointer.y);
    const p = await until((p) => (p.buildings?.length ?? 0) === before + 1, `place ${kind}`);
    const b = p.buildings!.find((b) => b.cell.column === column - 1 && b.cell.row === row - 1)!;
    assert.equal(b.buildingId, kind);
    if (kind === 'wind-turbine') assert.equal(b.rotation, 1);
    await page.keyboard.press('KeyB');
    placed.push({ id: b.id, kind, column, row });
    console.log(JSON.stringify({ factoryPlaced: kind, column, row }));
  };
  for (const [kind, col, row, x, z] of placements) {
    await walk(x, z);
    await place(kind, col, row);
  }
  await walk(7, -3);
  await walk(-5, -2.8);
  await place('solar-panel', 3, 5);
  const select = async (kind: MachineKind, index = 0) => {
    const m = placed.filter((b) => b.kind === kind)[index];
    await open();
    await page
      .getByRole('button', {
        name: new RegExp(
          `^${kind === 'basic-fabricator' ? 'Basic Fabricator' : kind === 'medium-fabricator' ? 'Medium Fabricator' : kind === 'laboratory' ? 'Laboratory' : kind === 'recycler' ? 'Mixed-output recycler' : kind === 'extractor' ? 'Extractor' : kind === 'solar-panel' ? 'Solar panel' : 'Wind turbine'} · ${m.column}, ${m.row}$`,
        ),
      })
      .click();
    await page.getByRole('button', { name: 'Disable machine', exact: true }).waitFor();
    return m;
  };
  const wire = async (from: MachineKind, toId: string) => {
    const source = placed.find((b) => b.kind === from)!;
    const target = placed.find((b) => b.id === toId)!;
    await open('Inventory & Crafting');
    await page.getByLabel('Toolbar slot', { exact: true }).selectOption('7');
    await page.getByRole('button', { name: 'Assign Power connection', exact: true }).click();
    await until(
      (p) => p.opening.state.toolbar?.slots[7] === 'power-connection',
      'connector toolbar assignment',
    );
    await close();
    await page.keyboard.press('Digit8');
    await until((p) => p.opening.state.toolbar?.active === 7, 'active connector slot');
    const count = (await read()).factory?.connections.length ?? 0;
    const stock = amount(await read(), 'power-connection');
    await page.keyboard.press('KeyB');
    const first = await pointAt(source.column * 2 - 11, source.row * 2 - 11);
    await page.getByText('Click a machine to start a power connection.', { exact: true }).waitFor();
    await page.mouse.click(first.x, first.y);
    await page.getByText('Click again to cancel this connection.', { exact: true }).waitFor();
    if (count === 0) {
      await page.mouse.click(first.x, first.y); // Same-cell cancellation never spends stock.
      await page
        .getByText('Click a machine to start a power connection.', { exact: true })
        .waitFor();
      assert.equal(amount(await read(), 'power-connection'), stock);
      assert.equal((await read()).factory?.connections.length ?? 0, count);
      await page.mouse.click(first.x, first.y);
      await page.getByText('Click again to cancel this connection.', { exact: true }).waitFor();
    }
    const second = await pointAt(target.column * 2 - 11, target.row * 2 - 11);
    await page.getByText('Click to connect; first cell again cancels.', { exact: true }).waitFor();
    assert.equal(amount(await read(), 'power-connection'), stock);
    if (count === 0)
      await page.screenshot({ path: path.join(output, 'connector-preview.png'), fullPage: true });
    await page.mouse.click(second.x, second.y);
    await until((p) => (p.factory?.connections.length ?? 0) === count + 1, 'power connection');
    assert.equal(amount(await read(), 'power-connection'), stock - 1);
    await page.keyboard.press('KeyB');
  };
  // Connect the spare eighth edge at the solar source, then the star from the turbine.
  await wire('solar-panel', placed.find((b) => b.kind === 'recycler')!.id);
  await walk(-5, -3);
  await walk(1, -3);
  await walk(1, 1.2);
  await walk(-1, 0.8);
  for (const target of placed.filter((b) => b.kind !== 'wind-turbine'))
    await wire('wind-turbine', target.id);
  const load = async (item: string, count: number) => {
    const before = amount(await read(), item);
    await page.getByLabel('Material', { exact: true }).selectOption(item);
    await page.getByLabel('Transfer quantity', { exact: true }).fill(String(count));
    await page.getByRole('button', { name: 'Load input from bag', exact: true }).click();
    await until((p) => amount(p, item) === before - count, 'local transfer processed');
  };
  await select('recycler');
  await walk(-1, 1.2);
  await select('recycler');
  await load('scrap', 80);
  const refined = async (item: string, min: number) => {
    await page.getByLabel('Transfer quantity', { exact: true }).fill('1');
    while (amount(await read(), item) < min) {
      const collect = page.getByRole('button', {
        name: `Collect ${item === 'plate' ? 'Metal plate' : 'Recovered wire'} from output`,
        exact: true,
      });
      await until(
        (p) =>
          !!p.details?.some((d) =>
            d.entity.machine?.output.slots.some((s) => s?.item === item && s.quantity > 0),
          ),
        `recycler output ${item}`,
      );
      const before = amount(await read(), item);
      await collect.click();
      await until((p) => amount(p, item) === before + 1, 'collection committed to bag');
    }
  };
  // Refined machine output, rather than personal recovery, supplies the industrial demonstration.
  const oldPlate = amount(await read(), 'plate'),
    oldWire = amount(await read(), 'wire');
  await refined('plate', oldPlate + 12);
  await refined('wire', oldWire + 8);
  const configure = async (recipe: string) => {
    await page.getByLabel('Fabrication recipe', { exact: true }).selectOption(recipe);
    await page.getByRole('button', { name: 'Set recipe', exact: true }).click();
    await until(
      (p) => !!p.details?.some((d) => d.entity.machine?.recipe === recipe),
      'recipe committed',
    );
  };
  const collectFour = async (item: string, label: string) => {
    await page.getByLabel('Transfer quantity', { exact: true }).fill('1');
    const before = amount(await read(), item);
    while (amount(await read(), item) < before + 4) {
      const button = page.getByRole('button', {
        name: `Collect ${label} from output`,
        exact: true,
      });
      await until(
        (p) =>
          !!p.details?.some((d) =>
            d.entity.machine?.output.slots.some((s) => s?.item === item && s.quantity > 0),
          ),
        `fabricated output ${item}`,
      );
      const previous = amount(await read(), item);
      await button.click();
      await until((p) => amount(p, item) === previous + 1, 'fabricated output committed to bag');
    }
  };
  await walk(1, 1.2);
  await select('basic-fabricator');
  await configure('mechanical-part');
  await load('plate', 8);
  await collectFour('mechanical-part', 'Mechanical part');
  await walk(3, 1.2);
  await select('medium-fabricator');
  await configure('electrical-part');
  await load('plate', 4);
  await load('wire', 8);
  await collectFour('electrical-part', 'Electrical part');
  await page.getByRole('button', { name: 'Disable machine', exact: true }).click();
  const pauseTick = (await read()).tick;
  await until((p) => p.tick > pauseTick, 'medium stopped');
  await configure('basic-research-kit');
  await page.getByRole('button', { name: 'Enable machine', exact: true }).click();
  await load('mechanical-part', 4);
  await load('electrical-part', 4);
  await collectFour('research-kit', 'Basic research kit');
  for (const [index, x] of [
    [0, 5],
    [1, 7],
  ] as const) {
    await walk(x, 1.2);
    await select('laboratory', index);
    await load('research-kit', 2);
  }
  await open('Research');
  await page.getByRole('button', { name: 'Queue Sorting and conveyors', exact: true }).click();
  await until(
    (p) => !!p.opening.ledgers['sorting-logistics']?.unlocked,
    'two powered supplied labs complete shared research',
  );
  assert.equal((await read()).opening.state.fieldEnabled, false);
  assert.equal((await read()).opening.ledgers['sorting-logistics'].consumed['research-kit'], 4);
  console.log(JSON.stringify({ factorySharedLabResearch: true, fieldDisabled: true }));
  await open();
  await page.screenshot({ path: path.join(output, 'factory-desktop.png'), fullPage: true });
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await close();
  await page.screenshot({ path: path.join(output, 'factory-world.png'), fullPage: true });
  await open();
  const readSlot = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('ScrapworksGameplaySaves');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        return await new Promise<SaveSnapshot | undefined>((resolve, reject) => {
          const tx = db.transaction('slots', 'readonly'),
            r = tx.objectStore('slots').get('manual-1');
          tx.oncomplete = () => resolve(r.result?.payload as SaveSnapshot | undefined);
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    });
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Game saved.' }).waitFor();
  const saved = await readSlot();
  assert(saved);
  assert.equal(saved.contentVersion, 'factory-1');
  assert.equal(saved.world.entities.filter((e) => e.machine).length, 8);
  assert.equal(saved.world.resources.factory!.connections.length, 8);
  const savedToolbar = saved.world.entities.find((e) => e.opening)!.opening!.toolbar;
  assert(savedToolbar && savedToolbar.slots.filter(Boolean).length === 8);
  assert.equal(savedToolbar.slots[7], 'power-connection');
  const beforeReload = {
    runId: saved.runId,
    connections: saved.world.resources.factory!.connections,
    ids: saved.world.entities.filter((e) => e.machine).map((e) => e.id),
  };
  await page.reload();
  await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await open();
  await page
    .getByRole('button', { name: /^Laboratory ·/ })
    .first()
    .waitFor();
  assert.equal(await page.locator('[aria-labelledby="machines-title"] button').count(), 8);
  assert.equal(page.workers().length, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await page.screenshot({ path: path.join(output, 'factory-mobile.png'), fullPage: true });
  const loaded = await readSlot();
  assert.equal(loaded!.runId, beforeReload.runId);
  assert.deepEqual(loaded!.world.resources.factory!.connections, beforeReload.connections);
  assert.deepEqual(loaded!.world.entities.find((e) => e.opening)!.opening!.toolbar, savedToolbar);
  await close();
  assert.equal(
    await page.getByRole('toolbar', { name: 'Placeable toolbar' }).getByRole('button').count(),
    8,
  );
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(output, 'toolbar-mobile.png'), fullPage: true });
  await fs.writeFile(
    path.join(output, 'factory-results.json'),
    JSON.stringify(
      {
        passed: true,
        emptyHandedUi: !ports.prepared,
        preparedFixture: !!ports.prepared,
        provisionalBootstrapGathered: ports.prepared ? 0 : 550,
        machines: 8,
        connections: 8,
        sharedLabResearch: true,
        fieldDisabled: true,
        saveReload: true,
        toolbarPlaceables: true,
        connectorToolbar: true,
        connectorSameCellCancellation: true,
        connectorSpendsOnSecondClick: true,
        toolsExcludedFromToolbar: true,
        toolbarSaved: true,
        axeDesktop: [],
        axeMobile: [],
        runId: saved.runId,
        world: saved.world,
      },
      null,
      2,
    ),
  );
}
