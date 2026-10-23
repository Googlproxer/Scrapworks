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

/** Position is the centre of the footprint's minimum X/Z cell. */
export interface WorldEntityDefinition {
  readonly id: string;
  readonly position: WorldPosition;
  readonly footprint: Footprint;
  readonly rotation: QuarterTurn;
}

export interface DepositDefinition extends WorldEntityDefinition {
  readonly kind: 'scrap';
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
}

export interface BuildingView extends WorldEntityDefinition {
  readonly buildingId: 'test-building';
  readonly cell: GridCell;
}

export type PlacementRejection =
  | 'invalid-cell'
  | 'out-of-bounds'
  | 'terrain'
  | 'occupied'
  | 'player-overlap'
  | 'out-of-reach'
  | 'unavailable';

export interface PlacementResult {
  readonly valid: boolean;
  readonly reason: PlacementRejection | null;
  readonly cells: readonly GridCell[];
}

export interface WorldCommand {
  readonly type: 'place';
  readonly buildingId: 'test-building';
  readonly cell: GridCell;
  readonly rotation: QuarterTurn;
}

export interface CommandResult {
  readonly accepted: boolean;
  readonly reason: PlacementRejection | 'unknown-command' | null;
}

/** A detached presentation view; renderer handles never enter world data. */
export interface WorldView {
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
  readonly equipment: readonly string[];
  readonly research: readonly string[];
  readonly productionTotals: Readonly<Record<string, number>>;
  readonly deposits: readonly DepositDefinition[];
  readonly buildings: readonly BuildingView[];
  readonly lastCommandResult: CommandResult | null;
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
        if (entity['kind'] !== 'scrap') fail('unsupported deposit kind');
        integer(entity['quantity'], 1, Number.MAX_SAFE_INTEGER);
      }
    }
  }
  const spawnCell = `${Math.floor((spawn.x - x) / size)},${Math.floor((spawn.z - z) / size)}`;
  if (occupied.has(spawnCell)) fail('spawn overlaps an authored footprint');
}
