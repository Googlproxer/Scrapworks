import { SCRAP_RETURN_ROUTE, TRANSPORT_CONVEYOR_COUNT } from '../support/transport-layout.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { PlaceableKind, MachineKind } from '../../src/contracts/factory.ts';
import type { MaterialPort, ConveyorTurn } from '../../src/contracts/transport.ts';
import type { BuildingView, QuarterTurn } from '../../src/contracts/world.ts';
import type { OpeningRecipe } from '../../src/content/opening.ts';
import type { FactoryRouteProbe } from './factory-route.ts';
import { saveThroughUi } from './manual-save.ts';
import type { ContentDefinition } from '../../src/contracts/simulation.ts';

interface TransportRoutePorts {
  content: ContentDefinition;
  obstacles(): Promise<readonly { minX: number; maxX: number; minZ: number; maxZ: number }[]>;
  resumed?: boolean;
  page: Page;
  output: string;
  recipes: readonly OpeningRecipe[];
  read(): Promise<FactoryRouteProbe>;
  until(
    predicate: (p: FactoryRouteProbe) => boolean,
    label: string,
    timeout?: number,
  ): Promise<FactoryRouteProbe>;
  craft(recipe: string, count: number): Promise<void>;
  open(tab?: string): Promise<void>;
  inspect(building: BuildingView): Promise<void>;
  close(): Promise<void>;
  walk(x: number, z: number): Promise<void>;
  place(kind: PlaceableKind, column: number, row: number, rotation?: QuarterTurn): Promise<void>;
  wire(from: MachineKind, to: string): Promise<void>;
}

/** Local/manual earned UI continuation after M6; optional resume uses an earned save, never stock grants. */
export async function checkTransportRoute(
  p: TransportRoutePorts,
): Promise<{ sorter: string; plateTarget: string; blockedEdge: string; segments: number }> {
  const { page, read, until, open, close, craft } = p;
  const amount = (v: FactoryRouteProbe, item: string) =>
    v.opening.bag.slots.reduce((n, s) => n + (s?.item === item ? s.quantity : 0), 0);
  const position = (column: number, row: number) => ({ x: column * 2 - 9, z: row * 2 - 9 });
  const buildings = async () => (await read()).buildings ?? [];
  // Read-only geometry guides ordinary movement through the gaps between authored bodies.
  const approach = async (a: { column: number; row: number }, b = a, placing = false) => {
    await close();
    const current = await read(),
      placed = await buildings();
    const rectangles = [...(await p.obstacles())];
    for (const building of placed.filter((e) => e.buildingId !== 'conveyor'))
      rectangles.push({
        minX: building.position.x - 0.6,
        maxX: building.position.x + 0.6,
        minZ: building.position.z - 0.6,
        maxZ: building.position.z + 0.6,
      });
    rectangles.push({ minX: 2.25, maxX: 3.75, minZ: -1.75, maxZ: -0.25 });
    if (placing) {
      const c = position(a.column, a.row);
      rectangles.push({ minX: c.x - 0.6, maxX: c.x + 0.6, minZ: c.z - 0.6, maxZ: c.z + 0.6 });
    }
    const point = (x: number, z: number) => ({ x: x * 0.5 - 9.5, z: z * 0.5 - 9.5 });
    const clear = (c: { x: number; z: number }) =>
      !rectangles.some(
        (r) =>
          c.x > r.minX - 0.31 && c.x < r.maxX + 0.31 && c.z > r.minZ - 0.31 && c.z < r.maxZ + 0.31,
      );
    const reachable = (c: { x: number; z: number }, cell: { column: number; row: number }) => {
      const target = position(cell.column, cell.row);
      return (
        Math.hypot(
          Math.max(0, Math.abs(c.x - target.x) - 1),
          Math.max(0, Math.abs(c.z - target.z) - 1),
        ) <= 1.9
      );
    };
    const start = {
      x: Math.round((current.position.x + 9.5) * 2),
      z: Math.round((current.position.z + 9.5) * 2),
    };
    const queue = [{ ...start, path: [] as { x: number; z: number }[] }],
      seen = new Set<string>();
    for (let index = 0; index < queue.length; index++) {
      const next = queue[index],
        key = next.x + ',' + next.z;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = point(next.x, next.z);
      if (clear(c) && reachable(c, a) && reachable(c, b)) {
        const path = [...next.path, { x: next.x, z: next.z }],
          corners = path.filter(
            (p, i) =>
              i === path.length - 1 ||
              (i > 0 &&
                (p.x - path[i - 1].x !== path[i + 1]?.x - p.x ||
                  p.z - path[i - 1].z !== path[i + 1]?.z - p.z)),
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
        if (x < 0 || z < 0 || x > 38 || z > 38 || seen.has(x + ',' + z) || !clear(point(x, z)))
          continue;
        queue.push({ x, z, path: [...next.path, { x: next.x, z: next.z }] });
      }
    }
    throw Error('No reachable transport interaction at ' + JSON.stringify([a, b]));
  };
  const select = async (b: BuildingView) => {
    await p.inspect(b);
    await until((v) => !!v.details?.some((d) => d.id === b.id), 'transport inspection');
  };
  const ensure = async (item: string, needed: number): Promise<void> => {
    while (amount(await read(), item) < needed) {
      const recipe = p.recipes.find((r) => r.outputs.some((s) => s.item === item));
      assert(recipe, `Obtainable recipe for ${item}`);
      const missing = needed - amount(await read(), item),
        count = [25, 10, 5, 1].find(
          (n) => n <= missing && (!recipe.id.startsWith('assemble-') || n <= 5),
        )!;
      let stock = await read();
      while (!recipe.inputs.every((s) => amount(stock, s.item) >= s.quantity * count)) {
        for (const s of recipe.inputs) await ensure(s.item, s.quantity * count);
        stock = await read();
      }
      await open('Inventory & Crafting');
      await craft(recipe.id, count);
    }
  };
  const checkpoint = async (name: string) => {
    await open();
    const save = await saveThroughUi(page);
    await fs.writeFile(path.join(p.output, name), JSON.stringify(save, null, 2));
  };
  await checkpoint('earned-factory-checkpoint.json');
  const required = [
    ['conveyor', TRANSPORT_CONVEYOR_COUNT],
    ['sorter', 1],
    ['basic-fabricator', 1],
    ['medium-fabricator', 1],
    ['power-connection', 2],
    ['plate', 40],
  ] as const;
  const currentStock = await read();
  const missingValue = required.reduce(
    (n, [item, count]) =>
      n + Math.max(0, count - amount(currentStock, item)) * p.content.items[item].solidValue,
    0,
  );
  if (amount(currentStock, 'scrap') < missingValue) {
    await approach({ column: 3, row: 5 });
    // Manual salvage uses centre distance, whereas factory commands use footprint reach.
    await p.walk(-1.2, 1);
    await page.keyboard.press('KeyG');
    await until((v) => !!v.opening.state.salvage, 'transport salvage started', 5000);
    await until(
      (v) => amount(v, 'scrap') >= missingValue + 16,
      'transport earned construction scrap',
      300000,
    );
    await page.keyboard.press('KeyG');
  }
  for (const [item, count] of required) {
    await ensure(item, count);
    console.log(JSON.stringify({ transportAssembled: item, count }));
  }
  await checkpoint('earned-transport-stock.json');
  const place = async (
    kind: PlaceableKind,
    column: number,
    row: number,
    rotation: QuarterTurn = 0,
  ) => {
    await approach({ column, row }, { column, row }, true);
    await p.place(kind, column + 1, row + 1, rotation);
    return (await buildings()).find((b) => b.cell.column === column && b.cell.row === row)!;
  };
  const sorter = await place('sorter', 4, 7),
    basic = await place('basic-fabricator', 3, 7),
    medium = await place('medium-fabricator', 5, 7);
  await approach(basic.cell);
  await select(basic);
  await page.getByLabel('Fabrication recipe', { exact: true }).selectOption('mechanical-part');
  await page.getByRole('button', { name: 'Set recipe', exact: true }).click();
  await until(
    (v) =>
      !!v.details?.some((d) => d.id === basic.id && d.entity.machine?.recipe === 'mechanical-part'),
    'automatic plate recipe',
  );
  await approach(medium.cell);
  await select(medium);
  await page.getByLabel('Fabrication recipe', { exact: true }).selectOption('electrical-part');
  await page.getByRole('button', { name: 'Set recipe', exact: true }).click();
  await until(
    (v) =>
      !!v.details?.some(
        (d) => d.id === medium.id && d.entity.machine?.recipe === 'electrical-part',
      ),
    'automatic wire recipe',
  );
  await page.getByLabel('Material', { exact: true }).selectOption('plate');
  await page.getByLabel('Transfer quantity', { exact: true }).fill('40');
  const previous = amount(await read(), 'plate');
  await page.getByRole('button', { name: 'Load input from bag', exact: true }).click();
  await until((v) => amount(v, 'plate') === previous - 40, 'secondary fabrication input supplied');
  const wind = (await buildings()).find((b) => b.buildingId === 'wind-turbine')!;
  await approach(wind.cell);
  await p.wire('wind-turbine', basic.id);
  await p.wire('wind-turbine', medium.id);
  const connect = async (
    a: BuildingView,
    b: BuildingView,
    output: MaterialPort = 'front',
    input: MaterialPort = 'back',
  ) => {
    await approach(a.cell, b.cell);
    await select(a);
    await page.getByLabel('Source output port', { exact: true }).selectOption(output);
    await page.getByLabel('Destination', { exact: true }).selectOption(b.id);
    await page.getByLabel('Destination input port', { exact: true }).selectOption(input);
    await page.getByRole('button', { name: 'Connect material ports', exact: true }).click();
    await until(
      (v) => !!v.factory?.transport?.connections.some((c) => c.from === a.id && c.to === b.id),
      'material edge committed',
    );
  };
  const configure = async (b: BuildingView, turn: ConveyorTurn) => {
    if (turn === 'straight') return;
    await approach(b.cell);
    await select(b);
    await page.getByLabel('Conveyor path', { exact: true }).selectOption(turn);
    await page.getByRole('button', { name: 'Apply transport configuration', exact: true }).click();
    await until(
      (v) => v.factory?.transport?.segments.find((s) => s.id === b.id)?.turn === turn,
      'conveyor corner',
    );
  };
  await approach(sorter.cell);
  await select(sorter);
  await page.getByLabel('Left output filter', { exact: true }).selectOption('plate');
  await page.getByLabel('Right output filter', { exact: true }).selectOption('wire');
  await page.getByRole('button', { name: 'Apply transport configuration', exact: true }).click();
  await until(
    (v) => v.factory?.transport?.segments.find((s) => s.id === sorter.id)?.filters[0] === 'plate',
    'sorter configuration',
  );
  const recycler = (await buildings()).find((b) => b.buildingId === 'recycler')!,
    extractor = (await buildings()).find((b) => b.buildingId === 'extractor')!;
  const feed = await place('conveyor', 3, 6);
  await configure(feed, 'right');
  await connect(extractor, feed);
  await connect(feed, recycler, 'right', 'left');
  await connect(recycler, sorter);
  await connect(sorter, basic, 'left', 'right');
  await connect(sorter, medium, 'right', 'left');
  const route = SCRAP_RETURN_ROUTE;
  let last = sorter,
    lastOutput: MaterialPort = 'front';
  for (const [col, row, rotation, turn] of route) {
    const next = await place('conveyor', col, row, rotation);
    await configure(next, turn);
    await connect(last, next, lastOutput);
    last = next;
    lastOutput = turn === 'straight' ? 'front' : turn;
  }
  await connect(last, recycler, lastOutput, 'back');
  await until(
    (v) =>
      !!v.factory?.transport?.connections.find(
        (c) => c.from === last.id && c.to === recycler.id && c.lastItem === 'scrap',
      ),
    'returned scrap traversed full loop',
  );
  await approach(basic.cell);
  await select(basic);
  await until(
    (v) =>
      !!v.details?.some(
        (d) =>
          d.id === basic.id &&
          d.entity.machine?.output.slots.some((s) => s?.item === 'mechanical-part'),
      ),
    'sorted plates become useful fabrication',
  );
  await page.getByRole('button', { name: 'Disable machine', exact: true }).click();
  await until(
    (v) => !!v.details?.some((d) => d.id === basic.id && !d.entity.machine?.enabled),
    'pause collection target',
  );
  const history = (await read()).production['mechanical-part'],
    bagBefore = amount(await read(), 'mechanical-part');
  await page.getByRole('button', { name: 'Collect all output', exact: true }).click();
  await until((v) => amount(v, 'mechanical-part') > bagBefore, 'collect transported production');
  assert.equal((await read()).production['mechanical-part'], history);
  await page.getByRole('button', { name: 'Enable machine', exact: true }).click();
  await approach(sorter.cell);
  await select(sorter);
  const plateEdge = (await read()).factory!.transport!.connections.find(
    (c) => c.from === sorter.id && c.to === basic.id,
  )!;
  await page.locator(`[data-material-edge="${plateEdge.id}"]`).click();
  await until(
    (v) => !v.factory?.transport?.connections.some((c) => c.id === plateEdge.id),
    'blocked plate destination disconnected',
  );
  const electrical = (await read()).production['electrical-part'] ?? 0;
  await until(
    (v) =>
      v.factory?.transport?.segments
        .find((s) => s.id === sorter.id)
        ?.units.filter((u) => u.lane === 0).length === 4 &&
      (v.production['electrical-part'] ?? 0) > electrical,
    'blocked plates retain four while wire continues',
    180000,
  );
  const proof = {
    sorter: sorter.id,
    plateTarget: basic.id,
    blockedEdge: plateEdge.id,
    segments: TRANSPORT_CONVEYOR_COUNT + 1,
  };
  await fs.writeFile(
    path.join(p.output, 'transport-proof.json'),
    JSON.stringify(
      {
        passed: true,
        emptyHandedUi: !p.resumed,
        resumedSavedFactory: !!p.resumed,
        powerFree: true,
        strictBlockedLane: true,
        wireFabricationContinues: true,
        returnedScrapFullLoop: true,
        noCollectionHistory: true,
        conveyors: TRANSPORT_CONVEYOR_COUNT,
        sorters: 1,
        ...proof,
      },
      null,
      2,
    ),
  );
  await page
    .getByRole('heading', { name: 'Material transport', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(p.output, 'transport-desktop.png'), fullPage: true });
  await close();
  await page.screenshot({ path: path.join(p.output, 'transport-world.png'), fullPage: true });
  await open();
  console.log(JSON.stringify({ transportRoute: true, ...proof }));
  return proof;
}
