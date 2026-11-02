import type { SimulationSnapshot } from '../../src/contracts/simulation';
import { WorldPhysics } from '../../src/simulation/physics/world-physics';
import { staticColliders } from '../../src/simulation/physics/collision-definitions';

/** Test setup only: physical edits define a new initial world, never a continuation. */
export function rebuildPhysics(snapshot: SimulationSnapshot): void {
  const player = snapshot.entities.find((entity) => entity.kind === 'player');
  if (!player?.transform) throw new Error('Missing fixture player');
  const physics = new WorldPhysics(snapshot.definition, player.id, player.transform.position);
  try {
    physics.syncStatic(
      staticColliders(
        snapshot.definition,
        snapshot.entities.flatMap((entity) => (entity.building ? [entity.building] : [])),
        snapshot.definition.deposits.map((deposit) => ({
          ...deposit,
          quantity:
            snapshot.entities.find((entity) => entity.id === deposit.id)?.deposit?.quantity ?? 0,
        })),
      ),
    );
    physics.syncBodies(
      snapshot.entities.flatMap((entity) => (entity.physics ? [entity.physics] : [])),
    );
    snapshot.physics = physics.capture();
  } finally {
    physics.dispose();
  }
}
