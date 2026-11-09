import type { OpeningCommand, OpeningRejection, OpeningView, GroundItemView } from './opening';
import type { PhysicsBodyDefinition, PhysicsBodyView } from './physics';
import type { FactoryCommand, FactorySummary, PlaceableKind } from './factory';

/** Plain gameplay metres. X points east, Z north, Y up; model-forward is +Z. */
export interface WorldPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface GridCell {
  readonly column: number;
  readonly row: number;
}

export interface GridDefinition {
  readonly origin: { readonly x: number; readonly z: number };
  readonly columns: number;
  readonly rows: number;
  readonly metresPerCell: number;
}

export type QuarterTurn = 0 | 1 | 2 | 3;

export interface Footprint {
  readonly width: number;
  readonly depth: number;
}

/** Simple ground-standing movement bounds in metres, centred on the footprint. */
export type CollisionShape =
  | {
      readonly shape: 'box';
      readonly width: number;
      readonly height: number;
      readonly depth: number;
    }
  | { readonly shape: 'cylinder'; readonly radius: number; readonly height: number };

/** Position is the centre of the footprint's minimum X/Z cell. */
export interface WorldEntityDefinition {
  readonly id: string;
  readonly position: WorldPosition;
  readonly footprint: Footprint;
  readonly rotation: QuarterTurn;
  readonly collision?: CollisionShape;
}

export interface DepositDefinition extends WorldEntityDefinition {
  readonly kind: 'scrap' | 'coal';
  readonly quantity: number;
}

export interface WorldDefinition {
  readonly version: 1;
  readonly id: string;
  readonly grid: GridDefinition;
  readonly terrain: readonly string[];
  readonly spawn: WorldPosition;
  readonly deposits: readonly DepositDefinition[];
  readonly blockers: readonly WorldEntityDefinition[];
  readonly bodies?: readonly PhysicsBodyDefinition[];
}

export interface BuildingView extends WorldEntityDefinition {
  readonly buildingId: 'test-building' | PlaceableKind;
  readonly cell: GridCell;
}

export type PlacementRejection =
  | 'invalid-cell'
  | 'out-of-bounds'
  | 'terrain'
  | 'occupied'
  | 'player-overlap'
  | 'out-of-reach'
  | 'machine-required'
  | 'same-machine'
  | 'cable-too-long'
  | 'already-connected'
  | 'unavailable';

export interface PlacementResult {
  readonly valid: boolean;
  readonly reason: PlacementRejection | null;
  readonly cells: readonly GridCell[];
}

export type WorldCommand =
  | OpeningCommand
  | FactoryCommand
  | {
      readonly type: 'place';
      readonly buildingId: 'test-building';
      readonly cell: GridCell;
      readonly rotation: QuarterTurn;
    };

export interface CommandResult {
  readonly accepted: boolean;
  readonly reason: PlacementRejection | OpeningRejection | 'unknown-command' | null;
}

/** A detached presentation view; renderer handles never enter world data. */
export interface WorldView {
  readonly publication?: number;
  readonly worldGeneration?: number;
  readonly changes?: {
    readonly full: boolean;
    readonly upsertedIds: readonly string[];
    readonly removedIds: readonly string[];
    readonly deposits?: readonly DepositDefinition[];
    readonly buildings?: readonly BuildingView[];
    readonly bodies?: readonly PhysicsBodyView[];
  };
  readonly endpoints?: readonly {
    readonly tick: number;
    readonly transform: {
      readonly position: WorldPosition;
      readonly facing: number;
      readonly moving: boolean;
      readonly sprinting: boolean;
    };
  }[];
  readonly worldId: string;
  readonly tick: number;
  readonly stepSeconds: number;
  readonly nextEntityId: number;
  readonly player: {
    readonly position: WorldPosition;
    readonly moving: boolean;
    readonly sprinting: boolean;
    readonly facing: number;
  };
  readonly inventory: Readonly<Record<string, number>>;
  readonly opening?: OpeningView;
  readonly factory?: FactorySummary;
  readonly ground?: readonly GroundItemView[];
  readonly equipment: readonly string[];
  readonly research: readonly string[];
  readonly productionTotals: Readonly<Record<string, number>>;
  readonly deposits: readonly DepositDefinition[];
  readonly buildings: readonly BuildingView[];
  readonly bodies?: readonly PhysicsBodyView[];
}

/** Validate the versioned JSON boundary before constructing a session. */
export function assertWorldDefinition(value: unknown): asserts value is WorldDefinition {
  const fail = (message: string): never => {
    throw new Error(`Invalid world definition: ${message}`);
  };

  const object = (candidate: unknown): Record<string, unknown> => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      return fail('expected an object');
    return candidate as Record<string, unknown>;
  };

  const finite = (candidate: unknown): number => {
    if (typeof candidate !== 'number' || !Number.isFinite(candidate))
      return fail('expected a finite number');
    return candidate;
  };

  const integer = (candidate: unknown, min: number, max: number): number => {
    const result = finite(candidate);
    if (!Number.isInteger(result) || result < min || result > max)
      return fail(`expected an integer from ${min} to ${max}`);
    return result;
  };

  const record = object(value);
  if (record['version'] !== 1) fail('unsupported version');
  if (typeof record['id'] !== 'string' || !record['id']) fail('missing world ID');
  const grid = object(record['grid']);
  const origin = object(grid['origin']);
  const x = finite(origin['x']);
  const z = finite(origin['z']);
  const columns = integer(grid['columns'], 1, 1000);
  const rows = integer(grid['rows'], 1, 1000);
  const size = finite(grid['metresPerCell']);
  if (size <= 0) fail('cell size must be positive');
  if (
    !Array.isArray(record['terrain']) ||
    record['terrain'].length !== columns * rows ||
    !record['terrain'].every((terrain) => ['soil', 'rock', 'grass', 'water'].includes(terrain))
  )
    fail('terrain must contain one supported ID per cell');

  const position = (candidate: unknown) => {
    const item = object(candidate);
    const px = finite(item['x']);
    const py = finite(item['y']);
    const pz = finite(item['z']);
    if (py !== 0 || px < x || pz < z || px >= x + columns * size || pz >= z + rows * size)
      fail('position outside the flat world bounds');
    return { x: px, z: pz };
  };

  const spawn = position(record['spawn']);
  const ids = new Set<string>();
  const occupied = new Set<string>();
  for (const collection of ['deposits', 'blockers']) {
    const entries = record[collection];
    if (!Array.isArray(entries)) fail(`missing ${collection}`);
    for (const entry of entries as unknown[]) {
      const entity = object(entry);
      const id = entity['id'];
      if (typeof id !== 'string' || !id || ids.has(id)) fail('duplicate or missing entity ID');
      ids.add(id as string);
      const point = position(entity['position']);
      const column = (point.x - x) / size - 0.5;
      const row = (point.z - z) / size - 0.5;
      if (Math.abs(column - Math.round(column)) > 1e-6 || Math.abs(row - Math.round(row)) > 1e-6)
        fail('entity must align to cell centre');
      const footprint = object(entity['footprint']);
      const width = integer(footprint['width'], 1, columns);
      const depth = integer(footprint['depth'], 1, rows);
      const rotation = integer(entity['rotation'], 0, 3);
      const w = rotation % 2 ? depth : width;
      const d = rotation % 2 ? width : depth;
      if (entity['collision'] !== undefined) {
        const collision = object(entity['collision']);

        const positive = (key: string): number => {
          const result = finite(collision[key]);
          if (result <= 0) fail('collision dimensions must be positive');

          return result;
        };

        positive('height');
        let collisionWidth: number;
        let collisionDepth: number;
        if (collision['shape'] === 'box') {
          collisionWidth = positive('width');
          collisionDepth = positive('depth');
        } else if (collision['shape'] === 'cylinder') {
          collisionWidth = collisionDepth = positive('radius') * 2;
        } else return fail('unsupported collision shape');
        if (collisionWidth > width * size || collisionDepth > depth * size)
          fail('collision bounds must fit the footprint');
      }
      for (let dz = 0; dz < d; dz++) {
        for (let dx = 0; dx < w; dx++) {
          const col = Math.round(column) + dx;
          const r = Math.round(row) + dz;
          const key = `${col},${r}`;
          if (col >= columns || r >= rows) fail('footprint outside world bounds');
          if (occupied.has(key)) fail('overlapping authored footprints');
          occupied.add(key);
        }
      }
      if (collection === 'deposits') {
        if (!['scrap', 'coal'].includes(String(entity['kind']))) fail('unsupported deposit kind');
        integer(entity['quantity'], 1, Number.MAX_SAFE_INTEGER);
      }
    }
  }
  const spawnCell = `${Math.floor((spawn.x - x) / size)},${Math.floor((spawn.z - z) / size)}`;
  if (occupied.has(spawnCell)) fail('spawn overlaps an authored footprint');
  if (record['bodies'] !== undefined) {
    if (!Array.isArray(record['bodies']) || record['bodies'].length > 10000)
      fail('invalid physics population');
    for (const body of record['bodies'] as unknown[]) {
      assertPhysicsBodyDefinition(body, { origin: { x, z }, columns, rows, metresPerCell: size });
      if (ids.has(body.id)) fail('duplicate physics entity ID');
      ids.add(body.id);
    }
  }
}

export function assertPhysicsBodyDefinition(
  value: unknown,
  grid: GridDefinition,
): asserts value is PhysicsBodyDefinition {
  const fail = (): never => {
    throw new Error('Invalid physics body definition');
  };

  const object = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail();

  const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail());

  const positive = (v: unknown): number => {
    const n = finite(v);
    return n > 0 ? n : fail();
  };

  const b = object(value),
    p = object(b['position']),
    c = object(b['collision']);
  if (
    typeof b['id'] !== 'string' ||
    !b['id'] ||
    !['dynamic', 'kinematic'].includes(String(b['motion']))
  )
    fail();
  const rotation = finite(b['rotation']);
  if (!Number.isInteger(rotation) || rotation < 0 || rotation > 3) fail();
  positive(b['mass']);
  const height = positive(c['height']);
  const width =
    c['shape'] === 'box'
      ? positive(c['width'])
      : c['shape'] === 'cylinder'
        ? positive(c['radius']) * 2
        : fail();
  const depth = c['shape'] === 'box' ? positive(c['depth']) : width;
  const x = finite(p['x']),
    y = finite(p['y']),
    z = finite(p['z']);
  const w = rotation % 2 ? depth : width,
    d = rotation % 2 ? width : depth;
  let endX = x,
    endZ = z;
  if (b['travel'] !== undefined) {
    const t = object(b['travel']);
    if (b['motion'] !== 'kinematic' || !['x', 'z'].includes(String(t['axis']))) fail();
    const distance = finite(t['distance']),
      ticks = positive(t['periodTicks']);
    if (!Number.isSafeInteger(ticks)) fail();
    if (t['axis'] === 'x') endX += distance;
    else endZ += distance;
  }
  if (
    height > 100 ||
    y < height / 2 ||
    y > 100 ||
    Math.min(x, endX) - w / 2 < grid.origin.x ||
    Math.max(x, endX) + w / 2 > grid.origin.x + grid.columns * grid.metresPerCell ||
    Math.min(z, endZ) - d / 2 < grid.origin.z ||
    Math.max(z, endZ) + d / 2 > grid.origin.z + grid.rows * grid.metresPerCell
  )
    fail();
}
