import type { PlaceableKind } from '@contracts/factory';
import type {
  GridCell,
  PlacementResult,
  QuarterTurn,
  WorldDefinition,
  WorldView,
} from '@contracts/world';
import {
  cellCenter,
  cellInBounds,
  distanceToCell,
  footprintCells,
  worldToCell,
} from '@core/world-grid';
import { OPENING_SETTINGS } from '@content/opening';
import { PLAYER_RADIUS } from './world-rules';
import { MACHINE_COLLISION } from '@content/factory';

export function validateFactoryPlacement(
  definition: WorldDefinition,
  view: Pick<WorldView, 'player' | 'buildings' | 'deposits'>,
  equipment: PlaceableKind,
  cell: GridCell,
  rotation: QuarterTurn,
): PlacementResult {
  const cells = [cell];

  const fail = (reason: PlacementResult['reason']): PlacementResult => ({
    valid: false,
    reason,
    cells,
  });

  if (!cellInBounds(definition.grid, cell)) return fail('out-of-bounds');
  if (!Number.isInteger(rotation) || rotation < 0 || rotation > 3) return fail('invalid-cell');
  if (definition.terrain[cell.row * definition.grid.columns + cell.column] === 'water')
    return fail('terrain');
  const centre = cellCenter(definition.grid, cell);
  if (distanceToCell(definition.grid, view.player.position, cell) > OPENING_SETTINGS.reach)
    return fail('out-of-reach');
  const dx = Math.max(0, Math.abs(view.player.position.x - centre.x) - MACHINE_COLLISION.width / 2);
  const dz = Math.max(0, Math.abs(view.player.position.z - centre.z) - MACHINE_COLLISION.depth / 2);
  if (equipment !== 'conveyor' && dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS - 1e-10)
    return fail('player-overlap');
  const deposits = view.deposits.filter((d) => {
    const anchor = worldToCell(definition.grid, d.position);
    return (
      anchor &&
      footprintCells(anchor, d.footprint, d.rotation).some(
        (c) => c.column === cell.column && c.row === cell.row,
      )
    );
  });
  if (
    equipment === 'extractor' &&
    (deposits.length !== 1 ||
      deposits[0].quantity <= 0 ||
      deposits[0].position.x !== centre.x ||
      deposits[0].position.z !== centre.z)
  )
    return fail('unavailable');
  if (equipment !== 'extractor' && deposits.some((d) => d.quantity > 0)) return fail('occupied');
  for (const entity of [...definition.blockers, ...view.buildings]) {
    const anchor = worldToCell(definition.grid, entity.position);
    if (
      anchor &&
      footprintCells(anchor, entity.footprint, entity.rotation).some(
        (c) => c.column === cell.column && c.row === cell.row,
      )
    )
      return fail('occupied');
  }
  return { valid: true, reason: null, cells };
}
