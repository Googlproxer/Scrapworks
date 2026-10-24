import type { BuildingView, GridCell, WorldDefinition } from '@contracts/world';
import { footprintCells, worldToCell } from '@core/world-grid';

export const FIXED_STEP_SECONDS = 0.05;
export const PLAYER_RADIUS = 0.35;
export const WALK_SPEED = 1.5;
export const SPRINT_SPEED = 3;
export const PLACEMENT_REACH = 3;
export const TEST_BUILDING_FOOTPRINT = { width: 2, depth: 1 } as const;

export function occupiedCells(
  definition: WorldDefinition,
  buildings: readonly BuildingView[],
): GridCell[] {
  return [...definition.blockers, ...definition.deposits, ...buildings].flatMap((entity) => {
    const anchor = worldToCell(definition.grid, entity.position);
    return anchor ? footprintCells(anchor, entity.footprint, entity.rotation) : [];
  });
}
