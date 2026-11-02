import type {
  ContentDefinition,
  EntityData,
  InventoryData,
  SimulationSnapshot,
} from '@contracts/simulation';
import { requireInvariant as check } from '@contracts/simulation';
import { assertWorldDefinition } from '@contracts/world';
import { cellCenter, cellInBounds } from '@core/world-grid';
import { assertOpening } from './opening-capture';
import { assertPhysicsBodyDefinition } from '@contracts/world';
import { RAPIER_VERSION } from '@contracts/physics';

const object = (v: unknown, keys?: readonly string[]): Record<string, unknown> => {
  check(!!v && typeof v === 'object' && !Array.isArray(v), 'Expected snapshot object');
  check(
    Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null,
    'Expected plain snapshot data',
  );
  if (keys)
    check(
      Object.keys(v).every((key) => keys.includes(key)),
      'Unknown snapshot field',
    );
  return v as Record<string, unknown>;
};

const number = (v: unknown, integer = false): number => {
  check(
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && (!integer || Number.isSafeInteger(v)),
    'Invalid snapshot number',
  );
  return v;
};

const text = (v: unknown): string => {
  check(typeof v === 'string' && v.length > 0 && v.length <= 256, 'Invalid snapshot ID');
  return v;
};

/** Composition supplies content; the runtime owns an immutable validated copy. */
export function ownContent(value: ContentDefinition): ContentDefinition {
  text(value.version);
  const copy = structuredClone(value);
  for (const [id, item] of Object.entries(copy.items)) {
    text(id);
    check(number(item.stackLimit, true) > 0, 'Invalid stack limit');
    number(item.solidValue);
    Object.freeze(item);
  }
  for (const [id, recipe] of Object.entries(copy.recipes)) {
    text(id);
    check(number(recipe.seconds) > 0, 'Invalid recipe duration');
    for (const list of [recipe.inputs, recipe.outputs]) {
      check(Array.isArray(list) && list.length <= 256, 'Invalid recipe stock');
      for (const item of list) {
        stack(item, copy);
        Object.freeze(item);
      }
      Object.freeze(list);
    }
    Object.freeze(recipe);
  }
  check(new Set(copy.technologies).size === copy.technologies.length, 'Duplicate technology');
  for (const id of copy.technologies) text(id);
  Object.freeze(copy.items);
  Object.freeze(copy.recipes);
  Object.freeze(copy.technologies);
  return Object.freeze(copy);
}

function stack(v: unknown, content: ContentDefinition): void {
  const s = object(v, ['item', 'quantity']);
  const item = text(s['item']);
  check(Object.hasOwn(content.items, item), 'Unknown snapshot item');
  number(s['quantity'], true);
  check((s['quantity'] as number) > 0, 'Empty item stack');
}

function inventory(v: unknown, content: ContentDefinition): asserts v is InventoryData {
  const bag = object(v, ['slots']);
  check(Array.isArray(bag['slots']) && bag['slots'].length <= 4096, 'Invalid inventory capacity');
  for (const slot of bag['slots'])
    if (slot !== null) {
      stack(slot, content);
      const s = slot as { item: string; quantity: number };
      check(s.quantity <= content.items[s.item].stackLimit, 'Overfull stack');
    }
}

export function assertSnapshot(
  value: unknown,
  content: ContentDefinition,
): asserts value is SimulationSnapshot {
  const s = object(value, [
    'version',
    'contentVersion',
    'definition',
    'resources',
    'entities',
    'physics',
  ]);
  check(
    s['version'] === 3 && s['contentVersion'] === content.version,
    'Unsupported snapshot/content version',
  );
  assertWorldDefinition(s['definition']);
  const definition = s['definition'];
  {
    const physics = object(s['physics'], [
      'format',
      'engine',
      'engineVersion',
      'bytes',
      'bodyIds',
      'verticalVelocity',
    ]);
    check(
      physics['format'] === 3 &&
        physics['engine'] === 'rapier3d' &&
        physics['engineVersion'] === RAPIER_VERSION,
      'Unsupported physics snapshot',
    );
    check(
      Array.isArray(physics['bytes']) &&
        physics['bytes'].length > 0 &&
        physics['bytes'].length <= 64 * 1024 * 1024 &&
        physics['bytes'].every((n) => Number.isInteger(n) && n >= 0 && n <= 255),
      'Invalid physics snapshot bytes',
    );
    check(
      Array.isArray(physics['bodyIds']) &&
        physics['bodyIds'].length <= 250000 &&
        physics['bodyIds'].every(
          (id) => typeof id === 'string' && id.length > 0 && id.length <= 512,
        ) &&
        new Set(physics['bodyIds']).size === physics['bodyIds'].length,
      'Invalid physics snapshot identities',
    );
    check(
      typeof physics['verticalVelocity'] === 'number' &&
        Number.isFinite(physics['verticalVelocity']),
      'Invalid physics velocity',
    );
  }
  const resources = object(s['resources']);
  check(
    resources['worldId'] === s['definition'].id && resources['stepSeconds'] === 0.05,
    'Snapshot world/timing mismatch',
  );
  text(resources['playerId']);
  number(resources['tick'], true);
  number(resources['nextEntityId'], true);
  for (const key of ['productionTotals', 'extractionTotals'])
    for (const n of Object.values(object(resources[key]))) number(n, true);
  for (const [id, value] of Object.entries(object(resources['research']))) {
    check(content.technologies.includes(id), 'Unknown technology');
    const ledger = object(value);
    number(ledger['work']);
    check(typeof ledger['unlocked'] === 'boolean', 'Invalid research unlock');
    for (const [item, n] of Object.entries(object(ledger['consumed']))) {
      check(Object.hasOwn(content.items, item), 'Unknown research item');
      number(n, true);
    }
  }
  check(
    Array.isArray(s['entities']) && s['entities'].length > 0 && s['entities'].length <= 250000,
    'Invalid entity population',
  );
  const ids = new Set<string>();
  const entities: EntityData[] = [];
  for (const value of s['entities']) {
    const e = object(value);
    check(
      Object.keys(e).every((key) =>
        [
          'id',
          'kind',
          'transform',
          'inventory',
          'equipment',
          'deposit',
          'pile',
          'building',
          'opening',
          'physics',
        ].includes(key),
      ),
      'Unknown component',
    );
    const id = text(e['id']);
    check(!ids.has(id), 'Duplicate entity ID');
    ids.add(id);
    check(
      ['player', 'deposit', 'pile', 'building', 'body'].includes(String(e['kind'])),
      'Unknown entity kind',
    );
    const required: Record<string, string> = {
      player: 'transform',
      pile: 'pile',
      deposit: 'deposit',
      building: 'building',
      body: 'physics',
    };
    check(e[required[String(e['kind'])]], 'Missing required component');
    if (e['transform']) {
      const t = object(e['transform'], ['position', 'facing', 'moving', 'sprinting', 'rotation']);
      const p = object(t['position'], ['x', 'y', 'z']);
      for (const key of ['x', 'y', 'z'])
        check(typeof p[key] === 'number' && Number.isFinite(p[key]), 'Invalid transform');
      check(
        (e['kind'] === 'body' || e['kind'] === 'player' || e['kind'] === 'pile' || p['y'] === 0) &&
          typeof t['facing'] === 'number' &&
          Number.isFinite(t['facing']) &&
          typeof t['moving'] === 'boolean' &&
          typeof t['sprinting'] === 'boolean',
        'Invalid movement',
      );
      if (t['rotation'] !== undefined) {
        const rotation = object(t['rotation'], ['x', 'y', 'z', 'w']);
        const values = ['x', 'y', 'z', 'w'].map((key) => rotation[key]);
        check(
          values.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
            Math.abs(Math.hypot(...(values as number[])) - 1) < 0.001,
          'Invalid physics rotation',
        );
      }
    }
    if (e['physics']) {
      assertPhysicsBodyDefinition(e['physics'], s['definition'].grid);
      check(
        e['kind'] === 'body' &&
          e['physics'].id === id &&
          e['transform'] &&
          object(e['transform'])['rotation'],
        'Invalid physics component owner',
      );
      const source = s['definition'].bodies?.find((body) => body.id === id);
      check(
        source && JSON.stringify(source) === JSON.stringify(e['physics']),
        'Physics definition mismatch',
      );
    }
    if (e['inventory']) inventory(e['inventory'], content);
    if (e['equipment']) {
      const tool = object(e['equipment'], ['tool'])['tool'];
      check(
        tool === null || (typeof tool === 'string' && Object.hasOwn(content.items, tool)),
        'Unknown tool',
      );
    }
    if (e['opening']) {
      check(e['kind'] === 'player' && e['inventory'] && e['equipment'], 'Invalid opening owner');
      assertOpening(
        e['opening'],
        e['inventory'] as InventoryData,
        (e['equipment'] as { tool: string | null }).tool,
      );
    }
    if (e['deposit']) {
      const d = object(e['deposit'], ['kind', 'quantity']);
      check(d['kind'] === 'scrap', 'Unknown deposit');
      number(d['quantity'], true);
    }
    if (e['pile']) stack(e['pile'], content);
    if (e['building']) {
      const b = object(e['building'], [
        'id',
        'buildingId',
        'position',
        'footprint',
        'cell',
        'rotation',
      ]);
      const p = object(b['position'], ['x', 'y', 'z']);
      const f = object(b['footprint'], ['width', 'depth']);
      const cell = object(b['cell'], ['column', 'row']);
      check(
        b['id'] === id &&
          b['buildingId'] === 'test-building' &&
          Number.isInteger(b['rotation']) &&
          Number(b['rotation']) >= 0 &&
          Number(b['rotation']) <= 3,
        'Invalid building identity',
      );
      for (const key of ['x', 'y', 'z'])
        check(typeof p[key] === 'number' && Number.isFinite(p[key]), 'Invalid building position');
      const width = number(f['width'], true),
        depth = number(f['depth'], true);
      check(width > 0 && depth > 0, 'Invalid building footprint');
      const anchor = {
        column: number(cell['column'], true),
        row: number(cell['row'], true),
      };
      const grid = s['definition'].grid;
      const rotatedWidth = Number(b['rotation']) % 2 ? depth : width;
      const rotatedDepth = Number(b['rotation']) % 2 ? width : depth;
      // Bound geometry arithmetically before collision rebuilding enumerates cells.
      check(
        cellInBounds(grid, anchor) &&
          rotatedWidth <= grid.columns - anchor.column &&
          rotatedDepth <= grid.rows - anchor.row,
        'Building footprint outside world bounds',
      );
      const centre = cellCenter(grid, anchor);
      check(
        p['x'] === centre.x && p['y'] === 0 && p['z'] === centre.z,
        'Building position/cell mismatch',
      );
    }
    entities.push(value as EntityData);
  }
  const players = entities.filter((e) => e.kind === 'player');
  const bodies = entities.filter((entity) => entity.kind === 'body');
  check(
    bodies.length === (definition.bodies?.length ?? 0) &&
      bodies.every((entity) => definition.bodies?.some((source) => source.id === entity.id)),
    'Physics entity population mismatch',
  );
  check(
    players.length === 1 &&
      players[0].id === resources['playerId'] &&
      players[0].transform &&
      players[0].inventory?.slots.length === 24 &&
      players[0].equipment &&
      players[0].opening,
    'Invalid player components',
  );
}
