import type {
  GridCell,
  PlacementResult,
  QuarterTurn,
  WorldDefinition,
  WorldView,
} from '../contracts/world';
import { cellCenter, cellInBounds, circleOverlapsCell, footprintCells } from '../core/world-grid';
import {
  occupiedCells,
  PLAYER_RADIUS,
  PLACEMENT_REACH,
  TEST_BUILDING_FOOTPRINT,
} from './world-rules';
export { PLACEMENT_REACH, TEST_BUILDING_FOOTPRINT } from './world-rules';

export function validatePlacement(
  definition: WorldDefinition,
  view: WorldView,
  cell: GridCell,
  rotation: QuarterTurn,
  developerFixture = false,
): PlacementResult {
  if (
    !Number.isInteger(cell.column) ||
    !Number.isInteger(cell.row) ||
    !Number.isInteger(rotation) ||
    rotation < 0 ||
    rotation > 3
  )
    return { valid: false, reason: 'invalid-cell', cells: [] };
  const cells = footprintCells(cell, TEST_BUILDING_FOOTPRINT, rotation);
  const reject = (reason: PlacementResult['reason']): PlacementResult => ({
    valid: false,
    reason,
    cells,
  });
  if (cells.some((item) => !cellInBounds(definition.grid, item))) return reject('out-of-bounds');
  if (
    cells.some(
      (item) => definition.terrain[item.row * definition.grid.columns + item.column] === 'water',
    )
  )
    return reject('terrain');
  const occupied = new Set(
    occupiedCells(definition, view.buildings).map((item) => `${item.column},${item.row}`),
  );
  if (cells.some((item) => occupied.has(`${item.column},${item.row}`))) return reject('occupied');
  if (
    cells.some((item) =>
      circleOverlapsCell(definition.grid, view.player.position, PLAYER_RADIUS, item),
    )
  )
    return reject('player-overlap');
  const centre = cellCenter(definition.grid, cell);
  if (
    Math.hypot(centre.x - view.player.position.x, centre.z - view.player.position.z) >
    PLACEMENT_REACH
  )
    return reject('out-of-reach');
  if (!developerFixture) return reject('unavailable');
  return { valid: true, reason: null, cells };
}
