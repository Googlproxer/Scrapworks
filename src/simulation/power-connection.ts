import { FACTORY_SETTINGS, isMachineKind } from '@content/factory';
import { OPENING_SETTINGS } from '@content/opening';
import type { GridCell, PlacementResult, WorldDefinition, WorldView } from '@contracts/world';
import { distanceToCell } from '@core/world-grid';

export const machineAtCell = (buildings: WorldView['buildings'], cell: GridCell) =>
  buildings.find(
    (b) => isMachineKind(b.buildingId) && b.cell.column === cell.column && b.cell.row === cell.row,
  );

/** Shared advisory/authoritative geometry and topology rules. Inventory stays worker-owned. */
export function validatePowerConnection(
  definition: WorldDefinition,
  view: Pick<WorldView, 'player' | 'buildings'> & {
    readonly factory?: Pick<NonNullable<WorldView['factory']>, 'connections'>;
  },
  from: string | null,
  to: string,
): PlacementResult {
  const target = view.buildings.find((b) => b.id === to && isMachineKind(b.buildingId));
  const source =
    from === null ? null : view.buildings.find((b) => b.id === from && isMachineKind(b.buildingId));
  const cells = target ? [target.cell] : [];

  const fail = (reason: PlacementResult['reason']): PlacementResult => ({
    valid: false,
    reason,
    cells,
  });

  if (!target || (from !== null && !source)) return fail('machine-required');
  if (source?.id === target.id) return fail('same-machine');

  const near = (cell: GridCell) =>
    distanceToCell(definition.grid, view.player.position, cell) <= OPENING_SETTINGS.reach + 1e-9;

  if (!near(target.cell) && (!source || !near(source.cell))) return fail('out-of-reach');
  if (source) {
    if (
      Math.hypot(source.position.x - target.position.x, source.position.z - target.position.z) >
      FACTORY_SETTINGS.cableReach
    )
      return fail('cable-too-long');
    if (
      view.factory?.connections.some(
        (c) =>
          (c.from === source.id && c.to === target.id) ||
          (c.to === source.id && c.from === target.id),
      )
    )
      return fail('already-connected');
  }
  return { valid: true, reason: null, cells };
}
