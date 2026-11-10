import { OPENING_CONTENT } from '@content/opening';
import {
  isConveyorTurn,
  isMaterialPort,
  isTransportKind,
  sorterLane,
  TRANSPORT_SETTINGS,
} from '@content/transport';
import { requireInvariant as check, type SimulationSnapshot } from '@contracts/simulation';
import { MACHINE_COLLISION } from '@content/factory';
import { materialConnectionValid } from './transport';
import { sameData } from '@core/data-equality';

function record(value: unknown, keys: readonly string[]): void {
  check(
    !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)),
    'Invalid transport record',
  );
  check(
    Object.keys(value).every((k) => keys.includes(k)),
    'Unknown transport field',
  );
}

const integer = (v: unknown, max: number) =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max;

const item = (v: unknown) => typeof v === 'string' && Object.hasOwn(OPENING_CONTENT.items, v);

/** Validate complete topology before physics/candidate replacement; never repair corrupt stock. */
export function assertTransportSnapshot(save: SimulationSnapshot): void {
  const segments = save.entities.filter((e) => e.transport);
  for (const e of segments) {
    const b = e.building,
      t = e.transport!;
    check(
      e.kind === 'building' && b && isTransportKind(b.buildingId) && !e.machine,
      'Invalid transport owner',
    );
    check(
      b.footprint.width === 1 &&
        b.footprint.depth === 1 &&
        sameData(e.transform?.position, b.position),
      'Invalid transport geometry',
    );
    check(
      b.buildingId === 'conveyor'
        ? b.collision === undefined
        : sameData(b.collision, MACHINE_COLLISION),
      'Invalid transport collision',
    );
    record(t, ['turn', 'filters', 'units', 'status']);
    check(
      isConveyorTurn(t.turn) && (b.buildingId !== 'sorter' || t.turn === 'straight'),
      'Invalid conveyor direction',
    );
    check(
      Array.isArray(t.filters) &&
        t.filters.length === 2 &&
        t.filters.every((f) => f === null || item(f)) &&
        (t.filters[0] === null || t.filters[0] !== t.filters[1]),
      'Invalid sorter filters',
    );
    check(b.buildingId !== 'conveyor' || t.filters.every((f) => f === null), 'Filters on conveyor');
    check(
      ['idle', 'moving', 'blocked', 'disconnected', 'incompatible'].includes(t.status),
      'Invalid transport status',
    );
    check(
      Array.isArray(t.units) &&
        t.units.length <= TRANSPORT_SETTINGS.capacity * (b.buildingId === 'sorter' ? 3 : 1),
      'Invalid transit capacity',
    );
    const counts = [0, 0, 0];
    for (const u of t.units) {
      record(u, ['item', 'progress', 'lane']);
      check(
        item(u.item) &&
          integer(u.progress, TRANSPORT_SETTINGS.travelTicks) &&
          integer(u.lane, b.buildingId === 'sorter' ? 2 : 0),
        'Invalid transit unit',
      );
      check(
        b.buildingId !== 'sorter' || u.lane === sorterLane(t.filters, u.item),
        'Misrouted held material',
      );
      check(++counts[u.lane] <= TRANSPORT_SETTINGS.capacity, 'Overfull transport lane');
    }
  }
  const state = save.resources.factory?.transport;
  if (!state) {
    check(!segments.length, 'Missing transport resources');
    return;
  }
  record(state, ['connections', 'cursors']);
  check(
    Array.isArray(state.connections) && state.connections.length <= save.entities.length * 4,
    'Invalid material graph',
  );
  record(state.cursors, Object.keys(state.cursors));
  const ids = new Set([
    ...save.entities.map((e) => e.id),
    ...(save.resources.factory?.connections.map((c) => c.id) ?? []),
  ]);
  const accepted: typeof state.connections = [];
  for (const c of state.connections) {
    record(c, ['id', 'from', 'output', 'to', 'input', 'cooldown', 'lastItem']);
    check(
      typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 256 && !ids.has(c.id),
      'Invalid material edge ID',
    );
    ids.add(c.id);
    check(
      isMaterialPort(c.output) &&
        isMaterialPort(c.input) &&
        materialConnectionValid(save.entities, accepted, c.from, c.output, c.to, c.input),
      'Invalid material endpoints',
    );
    check(
      integer(c.cooldown, TRANSPORT_SETTINGS.intervalTicks) &&
        (c.lastItem === null || item(c.lastItem)),
      'Invalid material service state',
    );
    accepted.push(c);
  }
  for (const [target, id] of Object.entries(state.cursors))
    check(
      state.connections.some((c) => c.id === id && c.to === target),
      'Invalid material arbitration cursor',
    );
}
