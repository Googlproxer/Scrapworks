import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { FactoryRouteProbe } from './factory-route.ts';
import type { OpeningRecipe } from '../../src/content/opening.ts';
import type { ContentDefinition } from '../../src/contracts/simulation.ts';
import type { BuildingView, QuarterTurn, WorldDefinition } from '../../src/contracts/world.ts';
import type { MachineKind, PlaceableKind } from '../../src/contracts/factory.ts';
import type { MaterialPort } from '../../src/contracts/transport.ts';
import { saveThroughUi, readManualSave } from './manual-save.ts';

interface Ports {
  page: Page;
  output: string;
  definition: WorldDefinition;
  recipes: readonly OpeningRecipe[];
  content: ContentDefinition;
  read(): Promise<FactoryRouteProbe>;
  until(
    predicate: (p: FactoryRouteProbe) => boolean,
    label: string,
    timeout?: number,
    advanceMilliseconds?: number,
  ): Promise<FactoryRouteProbe>;
  craft(recipe: string, count: number): Promise<void>;
  research(name: string, id: string): Promise<void>;
  open(tab?: string): Promise<void>;
  inspect(building: BuildingView): Promise<void>;
  close(): Promise<void>;
  walk(x: number, z: number): Promise<void>;
  place(kind: PlaceableKind, column: number, row: number, rotation?: QuarterTurn): Promise<void>;
  wire(from: MachineKind, to: string): Promise<void>;
  obstacles(): Promise<readonly { minX: number; maxX: number; minZ: number; maxZ: number }[]>;
}
/** Local/manual only: continues the earned opening/factory/transport UI, never grants stock. */
export async function checkRestorationRoute(p: Ports): Promise<void> {
  const { page, read, until, open, close } = p;
  const research = async (name: string, id: string) => {
    if ((await read()).opening.ledgers[id]?.unlocked) return;
    await open('Research');
    await page.locator(`[data-technology="${id}"]`).click();
    await page.getByRole('button', { name: `Queue ${name}`, exact: true }).click();
    const enable = page.getByRole('button', { name: 'Enable field research', exact: true });
    if (await enable.count()) await enable.click();
    await until((v) => !!v.opening.ledgers[id]?.unlocked, name);
    console.log(JSON.stringify({ restorationResearched: id, tick: (await read()).tick }));
  };
  await page.setViewportSize({ width: 1280, height: 900 });
  const amount = (v: FactoryRouteProbe, item: string) =>
    v.opening.bag.slots.reduce((n, s) => n + (s?.item === item ? s.quantity : 0), 0);
  const centre = (cell: { column: number; row: number }) => ({
    x: p.definition.grid.origin.x + (cell.column + 0.5) * 2,
    z: p.definition.grid.origin.z + (cell.row + 0.5) * 2,
  });
  const buildings = async () => (await read()).buildings ?? [];
  const approach = async (a: { column: number; row: number }, b = a, placing = false) => {
    await close();
    const current = await read();
    const rectangles = [...(await p.obstacles())];
    for (const building of (await buildings()).filter(
      (b) => !['conveyor', 'pipe', 'pipe-junction'].includes(b.buildingId),
    ))
      rectangles.push({
        minX: building.position.x - 0.6,
        maxX: building.position.x + 0.6,
        minZ: building.position.z - 0.6,
        maxZ: building.position.z + 0.6,
      });
    for (const entity of [...p.definition.blockers, ...p.definition.deposits])
      rectangles.push({
        minX: entity.position.x - 0.8,
        maxX: entity.position.x + 0.8,
        minZ: entity.position.z - 0.8,
        maxZ: entity.position.z + 0.8,
      });
    for (let i = 0; i < p.definition.terrain.length; i++)
      if (p.definition.terrain[i] === 'water') {
        const c = centre({ column: i % 20, row: Math.floor(i / 20) });
        rectangles.push({ minX: c.x - 1, maxX: c.x + 1, minZ: c.z - 1, maxZ: c.z + 1 });
      }
    if (placing) {
      const c = centre(a);
      rectangles.push({ minX: c.x - 0.6, maxX: c.x + 0.6, minZ: c.z - 0.6, maxZ: c.z + 0.6 });
    }
    const origin = p.definition.grid.origin,
      point = (x: number, z: number) => ({
        x: origin.x + 0.5 + x * 0.5,
        z: origin.z + 0.5 + z * 0.5,
      });
    const clear = (c: { x: number; z: number }) =>
      !rectangles.some(
        (r) =>
          c.x > r.minX - 0.31 && c.x < r.maxX + 0.31 && c.z > r.minZ - 0.31 && c.z < r.maxZ + 0.31,
      );
    const reaches = (c: { x: number; z: number }, cell: { column: number; row: number }) => {
      const target = centre(cell);
      return (
        Math.hypot(
          Math.max(0, Math.abs(c.x - target.x) - 1),
          Math.max(0, Math.abs(c.z - target.z) - 1),
        ) <= 1.9
      );
    };
    const start = {
        x: Math.round((current.position.x - origin.x - 0.5) * 2),
        z: Math.round((current.position.z - origin.z - 0.5) * 2),
      },
      queue = [{ ...start, path: [] as { x: number; z: number }[] }],
      seen = new Set<string>();
    for (let at = 0; at < queue.length; at++) {
      const next = queue[at],
        key = next.x + ',' + next.z;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = point(next.x, next.z);
      if (clear(c) && reaches(c, a) && reaches(c, b)) {
        const route = [...next.path, { x: next.x, z: next.z }];
        const corners = route.filter(
          (step, i) =>
            i === route.length - 1 ||
            (i > 0 &&
              (step.x - route[i - 1].x !== route[i + 1]?.x - step.x ||
                step.z - route[i - 1].z !== route[i + 1]?.z - step.z)),
        );
        for (const corner of corners) {
          const target = point(corner.x, corner.z);
          await p.walk(target.x, target.z);
        }
        return;
      }
      for (const [dx, dz] of [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ]) {
        const x = next.x + dx,
          z = next.z + dz;
        if (x < 0 || z < 0 || x > 78 || z > 78 || seen.has(x + ',' + z) || !clear(point(x, z)))
          continue;
        queue.push({ x, z, path: [...next.path, { x: next.x, z: next.z }] });
      }
    }
    throw Error('No restoration approach ' + JSON.stringify([a, b]));
  };
  const select = async (b: BuildingView) => {
    await p.inspect(b);
    await until((v) => !!v.details?.some((d) => d.id === b.id), 'restoration inspection');
  };
  const setEnabled = async (b: BuildingView, enabled: boolean) => {
    await approach(b.cell);
    await select(b);
    const toggle = page.getByRole('button', {
      name: enabled ? 'Enable machine' : 'Disable machine',
      exact: true,
    });
    if (await toggle.count()) await toggle.click();
    await page
      .getByRole('button', { name: enabled ? 'Disable machine' : 'Enable machine', exact: true })
      .waitFor();
  };
  const ensure = async (item: string, needed: number): Promise<void> => {
    while (amount(await read(), item) < needed) {
      const recipe = p.recipes.find((r) => r.outputs.some((s) => s.item === item));
      assert(recipe, `Recipe for ${item}`);
      const missing = needed - amount(await read(), item),
        count = [100, 25, 10, 5, 1].find(
          (n) => n <= missing && (!recipe.id.startsWith('assemble-') || n <= 5),
        )!;
      let stock = await read();
      while (!recipe.inputs.every((s) => amount(stock, s.item) >= s.quantity * count)) {
        for (const s of recipe.inputs) await ensure(s.item, s.quantity * count);
        stock = await read();
      }
      await open('Inventory & Crafting');
      await p.craft(recipe.id, count);
    }
  };
  await close();
  const zoomTick = (await read()).tick;
  await page.keyboard.down('Minus');
  try {
    await until((v) => v.tick >= zoomTick + 40, 'zoom out for the expanded map');
  } finally {
    await page.keyboard.up('Minus');
  }
  await open();
  const initial = await saveThroughUi(page);
  await fs.writeFile(path.join(p.output, 'earned-m8-entry.json'), JSON.stringify(initial));
  // Retain the earned factory, but stop its old consumers while qualifying the restoration chain.
  for (const b of await buildings())
    if (
      ['recycler', 'extractor', 'basic-fabricator', 'medium-fabricator', 'laboratory'].includes(
        b.buildingId,
      )
    ) {
      await approach(b.cell);
      await select(b);
      const disable = page.getByRole('button', { name: 'Disable machine', exact: true });
      if (await disable.count()) await disable.click();
    }
  await approach({ column: 3, row: 5 });
  await p.walk(-1.2, 1);
  if ((await read()).opening.state.salvage) await page.keyboard.press('KeyG');
  if (
    !(await read()).opening.ledgers['greenhouse']?.unlocked &&
    amount(await read(), 'scrap') < 800
  ) {
    await page.keyboard.press('KeyG');
    await until((v) => amount(v, 'scrap') >= 800, 'earned M8 construction scrap', 600000);
    await page.keyboard.press('KeyG');
  }
  const greenResearch = ['storage', 'water-treatment', 'greenhouse'];
  const kitsNeeded = greenResearch.reduce(
    (n, id) =>
      n +
      (initial.world.resources.research[id]?.unlocked
        ? 0
        : id === 'storage'
          ? 4
          : id === 'water-treatment'
            ? 6
            : 8),
    0,
  );
  await ensure('research-kit', kitsNeeded);
  await open('Research');
  for (const [name, id] of [
    ['Energy storage', 'storage'],
    ['Water treatment', 'water-treatment'],
    ['Greenhouse restoration', 'greenhouse'],
  ])
    await research(name, id);
  const field = page.getByRole('button', { name: 'Pause field research', exact: true });
  if (await field.count()) await field.click();
  if (!initial.world.resources.environment?.completed)
    assert(
      !(await read()).opening.ledgers['coal-power']?.unlocked,
      'Green route earns its research without coal',
    );
  for (const [item, count] of [
    ['battery', 1],
    ['wind-turbine', 2],
    ['water-pump', 1],
    ['water-treatment', 1],
    ['pipe-junction', 1],
    ['water-tank', 1],
    ['water-return', 1],
    ['greenhouse', 3],
    ['pipe', 2],
    ['power-connection', 15],
  ] as const) {
    const existing = (await buildings()).filter((b) => b.buildingId === item).length;
    if (item === 'power-connection' && (await buildings()).some((b) => b.buildingId === 'battery'))
      continue;
    await ensure(
      item,
      Math.max(0, count - (item === 'wind-turbine' ? Math.max(0, existing - 1) : existing)),
    );
  }
  const place = async (
    kind: PlaceableKind,
    column: number,
    row: number,
    rotation: QuarterTurn = 0,
  ) => {
    const existing = (await buildings()).find(
      (b) => b.cell.column === column && b.cell.row === row,
    );
    if (existing) {
      assert.equal(existing.buildingId, kind);
      assert.equal(existing.rotation, rotation);
      return existing;
    }
    await approach({ column, row }, { column, row }, true);
    await p.place(kind, column + 1, row + 1, rotation);
    const b = (await buildings()).find((b) => b.cell.column === column && b.cell.row === row)!;
    console.log(JSON.stringify({ restorationPlaced: kind, column, row, id: b.id }));
    return b;
  };
  const battery = await place('battery', 9, 4),
    windA = await place('wind-turbine', 9, 3, 1),
    windB = await place('wind-turbine', 10, 3, 1),
    pump = await place('water-pump', 11, 6, 1),
    treatment = await place('water-treatment', 10, 6),
    junction = await place('pipe-junction', 10, 7),
    tank = await place('water-tank', 10, 8),
    outfall = await place('water-return', 11, 7, 1),
    greenA = await place('greenhouse', 9, 7),
    greenB = await place('greenhouse', 9, 8),
    greenC = await place('greenhouse', 10, 9);
  const oldWind = (await buildings()).find(
    (b) => b.buildingId === 'wind-turbine' && b.id !== windA.id && b.id !== windB.id,
  )!;
  const power = async (source: BuildingView, target: BuildingView) => {
    if (
      (await read()).factory!.connections.some(
        (e) =>
          (e.from === source.id && e.to === target.id) ||
          (e.from === target.id && e.to === source.id),
      )
    )
      return;
    await ensure('power-connection', 1);
    await approach(source.cell);
    await p.wire(source.buildingId as MachineKind, target.id);
  };
  await power(oldWind, battery);
  for (const b of [windA, windB, pump, treatment, greenA, greenB, greenC]) {
    await power(battery, b);
  }
  const fluid = async (
    a: BuildingView,
    output: MaterialPort,
    b: BuildingView,
    input: MaterialPort,
  ) => {
    if (
      (await read()).factory!.environment!.connections.some(
        (e) => e.from === a.id && e.to === b.id && e.output === output && e.input === input,
      )
    )
      return;
    await approach(a.cell, b.cell);
    await select(a);
    await page.getByLabel('Source port', { exact: true }).selectOption(output);
    await page.getByLabel('Destination', { exact: true }).selectOption(b.id);
    await page.getByLabel('Destination port', { exact: true }).selectOption(input);
    const count = (await read()).factory!.environment!.connections.length;
    await page.getByRole('button', { name: 'Connect water', exact: true }).click();
    await until(
      (v) => v.factory!.environment!.connections.length === count + 1,
      'fluid link committed',
    );
  };
  await fluid(pump, 'back', treatment, 'right');
  await fluid(treatment, 'front', junction, 'back');
  await fluid(junction, 'left', greenA, 'right');
  await fluid(junction, 'front', tank, 'back');
  await fluid(junction, 'right', outfall, 'back');
  await fluid(tank, 'left', greenB, 'right');
  await fluid(tank, 'front', greenC, 'back');
  await approach(junction.cell);
  await select(junction);
  await page.getByRole('button', { name: 'east', exact: true }).click();
  await until((v) => (v.factory?.environment?.average ?? 0) > 0, 'earned greenhouse restoration');
  await until(
    (v) => !!v.factory?.environment?.completed,
    'all 400 cells restored without coal',
    300000,
    5000,
  );
  const green = await saveThroughUi(page);
  assert(green?.world.resources.environment?.completed);
  assert(green.world.resources.environment.health.every((h) => h === 100));
  await fs.writeFile(path.join(p.output, 'earned-green-checkpoint.json'), JSON.stringify(green));
  console.log(
    JSON.stringify({
      greenCheckpoint: true,
      tick: green.tick,
      average: (await read()).factory?.environment?.average,
    }),
  );
  // Build the optional coal branch after earning the entirely green checkpoint.
  await ensure('research-kit', 10);
  await open('Research');
  await research('Coal power — optional', 'coal-power');
  await research('Pollution mitigation — optional', 'pollution-mitigation');
  const pause = page.getByRole('button', { name: 'Pause field research', exact: true });
  if (await pause.count()) await pause.click();
  await ensure('coal-generator', 1);
  await ensure('air-scrubber', 1);
  await ensure('power-connection', 4);
  const coal = await place('coal-generator', 11, 8),
    scrubber = await place('air-scrubber', 12, 9);
  await power(battery, coal);
  await power(battery, scrubber);
  await fluid(tank, 'right', coal, 'left');
  await approach({ column: 14, row: 13 });
  await p.walk(17.2, 17);
  await page.keyboard.press('KeyG');
  await until((v) => amount(v, 'coal') >= 8, 'earned coal fuel', 60000);
  await page.keyboard.press('KeyG');
  await approach(coal.cell);
  await select(coal);
  await page.getByLabel('Material', { exact: true }).selectOption('coal');
  await page.getByLabel('Transfer quantity', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Load input from bag', exact: true }).click();
  // Disable renewables to exercise base-load ramp and actual fuel/water use through the UI.
  for (const b of (await buildings()).filter(
    (b) => b.buildingId === 'wind-turbine' || b.buildingId === 'solar-panel',
  )) {
    await approach(b.cell);
    await select(b);
    const disable = page.getByRole('button', { name: 'Disable machine', exact: true });
    if (await disable.count()) await disable.click();
  }
  await until((v) => (v.factory?.environment?.coalUsed ?? 0) > 0, 'coal base load ramp');
  await approach(coal.cell);
  await select(coal);
  await page.screenshot({ path: path.join(p.output, 'restoration-coal.png'), fullPage: true });
  const saved = await saveThroughUi(page);
  assert(saved);
  await fs.writeFile(path.join(p.output, 'earned-restoration-final.json'), JSON.stringify(saved));
  // Earn a pollution/recovery branch with the same stock and world, using ordinary controls.
  // Stop all positive support and battery discharge. Otherwise stored renewable energy
  // can satisfy the small remaining demand and correctly keep coal switched off.
  for (const b of [greenA, greenB, greenC, scrubber, outfall, battery]) await setEnabled(b, false);
  await until(
    (v) => (v.factory?.environment?.average ?? 100) < 99.99999,
    'local coal pollution after stopping positive support',
    60000,
  );
  assert(
    (await read()).factory!.environment!.completed,
    'Later pollution never revokes the checkpoint',
  );
  await setEnabled(coal, false);
  for (const b of (await buildings()).filter((b) =>
    [
      'wind-turbine',
      'solar-panel',
      'greenhouse',
      'air-scrubber',
      'water-return',
      'battery',
    ].includes(b.buildingId),
  ))
    await setEnabled(b, true);
  await until(
    (v) => v.factory!.environment!.health.every((h) => h === 100),
    'recover polluted cells with earned green equipment',
    120000,
  );
  for (const b of [pump, treatment, junction, tank, outfall, greenA, greenB, greenC])
    await setEnabled(b, false);
  const beforeDismantle = await saveThroughUi(page);
  const litres = beforeDismantle.world.entities.reduce(
    (n, e) =>
      n +
      [...(e.machine?.utility?.water ?? []), ...(e.machine?.utility?.clean ?? [])].reduce(
        (n, b) => n + b.volume,
        0,
      ),
    0,
  );
  assert(litres > 0, 'Dismantling exercises filled infrastructure');
  await approach(pump.cell);
  await select(pump);
  await page.getByRole('button', { name: 'Dismantle machine', exact: true }).click();
  await until((v) => !v.buildings?.some((b) => b.id === pump.id), 'water pump dismantled');
  const recovered = await saveThroughUi(page);
  assert(
    Math.abs(
      recovered.world.resources.environment!.sources[0].returned -
        beforeDismantle.world.resources.environment!.sources[0].returned -
        litres,
    ) < 1e-6,
  );
  await fs.writeFile(
    path.join(p.output, 'earned-recovered-restoration.json'),
    JSON.stringify(recovered),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await open();
  await until((v) => !!v.factory?.environment?.completed, 'saved checkpoint continues');
  assert.equal((await readManualSave(page))!.runId, saved.runId);
  await page.addScriptTag({
    path: path.resolve(import.meta.dirname, '../../node_modules/axe-core/axe.min.js'),
  });
  await page.getByText('Inspect land and water cell health', { exact: true }).click();
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await page.screenshot({ path: path.join(p.output, 'restoration-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await page.screenshot({ path: path.join(p.output, 'restoration-mobile.png'), fullPage: true });
  await fs.writeFile(
    path.join(p.output, 'restoration-results.json'),
    JSON.stringify(
      {
        passed: true,
        earnedUi: true,
        greenCheckpoint: true,
        optionalCoal: true,
        saveReload: true,
        pollutionRecovered: true,
        dismantledWaterReturned: litres,
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
