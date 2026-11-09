import type { BuildingView, DepositDefinition, WorldDefinition } from '@contracts/world';
import { cellCenter } from '@core/world-grid';
import { entityCollider } from '@core/world-collision';
import type { NamedCollider } from './world-physics';
import { isPipe } from '@content/environment';

/** Plain authored geometry and live occupancy; no native engine handles. */
export function staticColliders(
  definition: WorldDefinition,
  buildings: readonly BuildingView[],
  deposits: readonly DepositDefinition[],
): NamedCollider[] {
  const colliders: NamedCollider[] = [
    ...definition.blockers,
    ...deposits.filter((deposit) => deposit.quantity > 0),
    ...buildings.filter((b) => b.buildingId !== 'conveyor' && !isPipe(b.buildingId)),
  ].map((entity) => ({
    ...entityCollider(definition.grid, entity),
    source: 'entity',
    id: entity.id,
  }));
  for (let row = 0; row < definition.grid.rows; row++)
    for (let column = 0; column < definition.grid.columns; column++)
      if (definition.terrain[row * definition.grid.columns + column] === 'water')
        colliders.push({
          id: `water:${column}:${row}`,
          source: 'terrain',
          shape: 'box',
          center: cellCenter(definition.grid, { row, column }),
          width: definition.grid.metresPerCell,
          depth: definition.grid.metresPerCell,
          height: 1,
        });
  return colliders;
}
