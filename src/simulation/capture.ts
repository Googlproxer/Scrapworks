import type {
  ContentDefinition,
  EntityData,
  InventoryData,
  SimulationSnapshot,
} from '@contracts/simulation';
import { requireInvariant as check } from '@contracts/simulation';
import { assertWorldDefinition } from '@contracts/world';

export const EMPTY_CONTENT: ContentDefinition = Object.freeze({
  version: 'foundation-empty-v1',
  items: Object.freeze({}),
  recipes: Object.freeze({}),
  technologies: Object.freeze([]),
});
const object = (v: unknown): Record<string, unknown> => {
  check(!!v && typeof v === 'object' && !Array.isArray(v), 'Expected snapshot object');
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
  const s = object(v);
  const item = text(s['item']);
  check(Object.hasOwn(content.items, item), 'Unknown snapshot item');
  number(s['quantity'], true);
  check((s['quantity'] as number) > 0, 'Empty item stack');
}
function inventory(v: unknown, content: ContentDefinition): asserts v is InventoryData {
  const bag = object(v);
  check(Array.isArray(bag['slots']) && bag['slots'].length <= 4096, 'Invalid inventory capacity');
  for (const slot of bag['slots'])
    if (slot !== null) {
      stack(slot, content);
      const s = slot as { item: string; quantity: number };
      check(s.quantity <= content.items[s.item].stackLimit, 'Overfull stack');
    }
  check(
    Array.isArray(bag['reservations']) && bag['reservations'].length <= 256,
    'Invalid reservations',
  );
  const ids = new Set<string>();
  const held = new Map<string, number>();
  for (const value of bag['reservations']) {
    const r = object(value);
    const id = text(r['id']);
    text(r['owner']);
    check(!ids.has(id), 'Duplicate reservation ID');
    ids.add(id);
    check(Array.isArray(r['items']) && r['items'].length <= 256, 'Invalid reservation items');
    for (const item of r['items']) {
      stack(item, content);
      const s = item as { item: string; quantity: number };
      held.set(s.item, (held.get(s.item) ?? 0) + s.quantity);
    }
  }
  for (const [item, count] of held) {
    const total = bag['slots'].reduce((n: number, value: unknown) => {
      const s = value as { item: string; quantity: number } | null;
      return n + (s?.item === item ? s.quantity : 0);
    }, 0);
    check(count <= total, 'Reservation exceeds stock');
  }
}
export function assertSnapshot(
  value: unknown,
  content: ContentDefinition,
): asserts value is SimulationSnapshot {
  const s = object(value);
  check(
    s['version'] === 1 && s['contentVersion'] === content.version,
    'Unsupported snapshot/content version',
  );
  assertWorldDefinition(s['definition']);
  const resources = object(s['resources']);
  check(
    resources['worldId'] === s['definition'].id && resources['stepSeconds'] === 0.05,
    'Snapshot world/timing mismatch',
  );
  text(resources['playerId']);
  number(resources['tick'], true);
  number(resources['nextEntityId'], true);
  for (const key of ['productionTotals', 'extractionTotals', 'counters'])
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
          'owner',
          'work',
          'charge',
        ].includes(key),
      ),
      'Unknown component',
    );
    const id = text(e['id']);
    check(!ids.has(id), 'Duplicate entity ID');
    ids.add(id);
    check(
      ['player', 'deposit', 'pile', 'building', 'owner', 'processor'].includes(String(e['kind'])),
      'Unknown entity kind',
    );
    const required: Record<string, string> = {
      player: 'transform',
      owner: 'inventory',
      processor: 'work',
      pile: 'pile',
      deposit: 'deposit',
      building: 'building',
    };
    check(e[required[String(e['kind'])]], 'Missing required component');
    if (e['transform']) {
      const t = object(e['transform']);
      const p = object(t['position']);
      for (const key of ['x', 'y', 'z'])
        check(typeof p[key] === 'number' && Number.isFinite(p[key]), 'Invalid transform');
      check(
        p['y'] === 0 &&
          typeof t['facing'] === 'number' &&
          Number.isFinite(t['facing']) &&
          typeof t['moving'] === 'boolean' &&
          typeof t['sprinting'] === 'boolean',
        'Invalid movement',
      );
    }
    if (e['inventory']) inventory(e['inventory'], content);
    if (e['equipment']) {
      const tool = object(e['equipment'])['tool'];
      check(
        tool === null || (typeof tool === 'string' && Object.hasOwn(content.items, tool)),
        'Unknown tool',
      );
    }
    if (e['deposit']) {
      const d = object(e['deposit']);
      check(d['kind'] === 'scrap', 'Unknown deposit');
      number(d['quantity'], true);
    }
    if (e['pile']) stack(e['pile'], content);
    if (e['charge']) {
      const c = object(e['charge']);
      check(number(c['value']) <= number(c['capacity']), 'Invalid charge');
    }
    if (e['work']) {
      const w = object(e['work']);
      check(
        typeof w['recipe'] === 'string' && Object.hasOwn(content.recipes, w['recipe']),
        'Unknown work recipe',
      );
      check(['active', 'idle', 'blocked'].includes(String(w['status'])), 'Invalid work status');
      number(w['remaining']);
      check(number(w['duration']) > 0, 'Invalid work duration');
      number(w['completed'], true);
      inventory(w['input'], content);
      inventory(w['output'], content);
      for (const key of ['reserved', 'held']) {
        check(Array.isArray(w[key]) && w[key].length <= 256, 'Invalid work stock');
        for (const item of w[key]) stack(item, content);
      }
    }
    if (e['building']) {
      const b = object(e['building']);
      const p = object(b['position']);
      const f = object(b['footprint']);
      const cell = object(b['cell']);
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
      check(
        p['y'] === 0 && number(f['width'], true) > 0 && number(f['depth'], true) > 0,
        'Invalid building footprint',
      );
      number(cell['column'], true);
      number(cell['row'], true);
    }
    entities.push(value as EntityData);
  }
  const players = entities.filter((e) => e.kind === 'player');
  check(
    players.length === 1 &&
      players[0].id === resources['playerId'] &&
      players[0].transform &&
      players[0].inventory?.slots.length === 24 &&
      players[0].equipment,
    'Invalid player components',
  );
  for (const e of entities) {
    if (e.owner) check(ids.has(e.owner) && e.owner !== e.id, 'Invalid owner link');
    for (const bag of [e.inventory, e.work?.input, e.work?.output])
      for (const r of bag?.reservations ?? []) check(ids.has(r.owner), 'Invalid reservation owner');
  }
  const result = s['lastCommandResult'];
  check(
    result === null ||
      (typeof object(result)['accepted'] === 'boolean' &&
        (object(result)['reason'] === null ||
          [
            'invalid-cell',
            'out-of-bounds',
            'terrain',
            'occupied',
            'player-overlap',
            'out-of-reach',
            'unavailable',
            'unknown-command',
          ].includes(String(object(result)['reason'])))),
    'Invalid command result',
  );
}
