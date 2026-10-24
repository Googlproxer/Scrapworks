import type {
  Footprint,
  GridCell,
  GridDefinition,
  QuarterTurn,
  WorldPosition,
} from '@contracts/world';

export const SCENE_UNITS_PER_METRE = 100;

export function sceneToMetres(position: WorldPosition): WorldPosition {
  return { x: position.x / 100, y: position.y / 100, z: position.z / 100 };
}

export function metresToScene(position: WorldPosition): WorldPosition {
  return { x: position.x * 100, y: position.y * 100, z: position.z * 100 };
}

export function worldToCell(grid: GridDefinition, position: WorldPosition): GridCell | null {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
  const column = Math.floor((position.x - grid.origin.x) / grid.metresPerCell);
  const row = Math.floor((position.z - grid.origin.z) / grid.metresPerCell);
  return cellInBounds(grid, { column, row }) ? { column, row } : null;
}

export function cellInBounds(grid: GridDefinition, cell: GridCell): boolean {
  return (
    Number.isInteger(cell.column) &&
    Number.isInteger(cell.row) &&
    cell.column >= 0 &&
    cell.row >= 0 &&
    cell.column < grid.columns &&
    cell.row < grid.rows
  );
}

export function cellCenter(grid: GridDefinition, cell: GridCell): WorldPosition {
  return {
    x: grid.origin.x + (cell.column + 0.5) * grid.metresPerCell,
    y: 0,
    z: grid.origin.z + (cell.row + 0.5) * grid.metresPerCell,
  };
}

export function footprintCells(
  anchor: GridCell,
  footprint: Footprint,
  rotation: QuarterTurn,
): GridCell[] {
  const width = rotation % 2 ? footprint.depth : footprint.width;
  const depth = rotation % 2 ? footprint.width : footprint.depth;
  const cells: GridCell[] = [];
  for (let row = 0; row < depth; row++) {
    for (let column = 0; column < width; column++)
      cells.push({ column: anchor.column + column, row: anchor.row + row });
  }
  return cells;
}

export function circleOverlapsCell(
  grid: GridDefinition,
  position: WorldPosition,
  radius: number,
  cell: GridCell,
): boolean {
  const minX = grid.origin.x + cell.column * grid.metresPerCell;
  const minZ = grid.origin.z + cell.row * grid.metresPerCell;
  const nearestX = Math.max(minX, Math.min(position.x, minX + grid.metresPerCell));
  const nearestZ = Math.max(minZ, Math.min(position.z, minZ + grid.metresPerCell));
  return (position.x - nearestX) ** 2 + (position.z - nearestZ) ** 2 < radius ** 2;
}
