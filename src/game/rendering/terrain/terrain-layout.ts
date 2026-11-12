import type { WorldDefinition, WorldEntityDefinition, GridDefinition } from '@contracts/world';
import { circleOverlapsCell, footprintCells, worldToCell } from '@core/world-grid';
import { kaykitScatter } from '../../../../art/world/kaykit-forest-v1/runtime/meshes';

export interface ScatterCandidate {
  readonly x: number;
  readonly z: number;
  readonly cell: number;
  readonly model: number;
  readonly yaw: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly rank: number;
  readonly tint: number;
  readonly chunk: string;
}

/** Presentation-only integer hash; never consumes the simulation random stream. */
export function terrainHash(x: number, z: number, seed: number): number {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function terrainSeed(id: string): number {
  let seed = 2166136261;
  for (const letter of id) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619);
  return seed >>> 0;
}

export function terrainNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const fx = x - ix,
    fz = z - iz;
  const u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  const a = terrainHash(ix, iz, seed),
    b = terrainHash(ix + 1, iz, seed);
  const c = terrainHash(ix, iz + 1, seed),
    d = terrainHash(ix + 1, iz + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function terrainBlockedCells(
  definition: WorldDefinition,
  entities: readonly WorldEntityDefinition[],
): Set<number> {
  const blocked = new Set<number>();
  for (const entity of entities) {
    const anchor = worldToCell(definition.grid, entity.position);
    if (!anchor) continue;
    for (const cell of footprintCells(anchor, entity.footprint, entity.rotation))
      blocked.add(cell.row * definition.grid.columns + cell.column);
  }
  return blocked;
}

/** Includes neighbouring cells touched by a prop's silhouette, not just its root. */
export function scatterFits(
  candidate: ScatterCandidate,
  definition: WorldDefinition,
  blocked: ReadonlySet<number>,
): boolean {
  const grid = definition.grid,
    { x, z, radius } = candidate;
  if (
    x - radius < grid.origin.x ||
    z - radius < grid.origin.z ||
    x + radius > grid.origin.x + grid.columns * grid.metresPerCell ||
    z + radius > grid.origin.z + grid.rows * grid.metresPerCell
  )
    return false;
  const first = worldToCell(grid, { x: x - radius, y: 0, z: z - radius })!;
  const last = {
    column: Math.min(
      grid.columns - 1,
      Math.floor((x + radius - grid.origin.x) / grid.metresPerCell),
    ),
    row: Math.min(grid.rows - 1, Math.floor((z + radius - grid.origin.z) / grid.metresPerCell)),
  };
  for (let row = first.row; row <= last.row; row++)
    for (let column = first.column; column <= last.column; column++) {
      const index = row * grid.columns + column;
      if (
        (blocked.has(index) || definition.terrain[index] === 'water') &&
        circleOverlapsCell(grid, { x, y: 0, z }, radius, { row, column })
      )
        return false;
    }
  return true;
}

export function createTerrainScatter(definition: WorldDefinition): readonly ScatterCandidate[] {
  const seed = terrainSeed(definition.id),
    grid = definition.grid;
  const samples: ScatterCandidate[] = [];
  for (const [kind, spacing, salt] of [
    ['rock', 1.15, 103],
    ['grass', 0.58, 241],
    ['shrub', 1.85, 977],
  ] as const) {
    const models = kaykitScatter
      .map((model, index) => ({ model, index }))
      .filter(({ model }) => model.kind === kind);
    for (let row = 0; row < Math.ceil((grid.rows * grid.metresPerCell) / spacing); row++)
      for (
        let column = 0;
        column < Math.ceil((grid.columns * grid.metresPerCell) / spacing);
        column++
      ) {
        const random = (stream: number) => terrainHash(column, row, seed ^ (salt + stream * 7919));

        const x = grid.origin.x + (column + 0.12 + random(1) * 0.76) * spacing;
        const z = grid.origin.z + (row + 0.12 + random(2) * 0.76) * spacing;
        const cell = worldToCell(grid, { x, y: 0, z });
        if (!cell) continue;
        const patch = terrainNoise(
          (x + 3.71) / (kind === 'rock' ? 7.7 : 4.7),
          (z - 2.13) / 5.9,
          seed ^ salt,
        );
        const occupancy =
          kind === 'grass'
            ? 0.3 + 0.65 * patch
            : kind === 'rock'
              ? 0.16 + 0.28 * patch
              : 0.08 + 0.12 * patch;
        if (random(3) > occupancy) continue;
        const model = models[Math.floor(random(4) * models.length)].index;
        const width =
          kind === 'rock'
            ? 0.12 + random(5) * 0.27
            : kind === 'grass'
              ? 0.18 + random(5) * 0.18
              : 0.38 + random(5) * 0.24;
        const height =
          kind === 'rock'
            ? 0.055 + random(6) * 0.12
            : kind === 'grass'
              ? 0.14 + random(6) * 0.17
              : 0.23 + random(6) * 0.2;
        const candidate: ScatterCandidate = {
          x,
          z,
          cell: cell.row * grid.columns + cell.column,
          model,
          yaw: random(7) * Math.PI * 2,
          width,
          height,
          radius: width * 0.55 + 0.07,
          rank:
            kind === 'rock'
              ? 0
              : kind === 'grass'
                ? 0.07 + random(8) * 0.69
                : 0.4 + random(8) * 0.48,
          tint: random(9),
          chunk: `${Math.floor((x - grid.origin.x) / 8)}:${Math.floor((z - grid.origin.z) / 8)}`,
        };
        if (Math.hypot(x - definition.spawn.x, z - definition.spawn.z) < 0.65 + candidate.radius)
          continue;
        if (scatterFits(candidate, definition, new Set())) samples.push(candidate);
      }
  }
  return samples;
}

/** Shared corner averages keep neighbouring quads continuous at health boundaries. */
export function cornerHealth(
  grid: GridDefinition,
  terrain: readonly string[],
  health: readonly number[],
  column: number,
  row: number,
): number {
  let sum = 0,
    count = 0;
  for (let dz = -1; dz <= 0; dz++)
    for (let dx = -1; dx <= 0; dx++) {
      const x = column + dx,
        z = row + dz;
      if (x < 0 || z < 0 || x >= grid.columns || z >= grid.rows) continue;
      const index = z * grid.columns + x;
      if (terrain[index] === 'water') continue;
      sum += Math.max(0, Math.min(100, health[index] ?? 0));
      count++;
    }
  return count ? sum / count / 100 : 0;
}
