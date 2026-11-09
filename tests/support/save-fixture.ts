import type { SimulationSnapshot } from '../../src/contracts/simulation.ts';
import { SAVE_SCHEMA, type SaveSnapshot } from '../../src/contracts/save.ts';
import { authoredMapKey } from '../../src/core/authored-map.ts';
import { RAPIER_VERSION } from '../../src/contracts/physics.ts';

/** Typed M9 envelope for isolated fixtures; the owning test still runs production validators. */
export function saveFixture(
  world: SimulationSnapshot,
  runId = 'fixture-run',
  token = 'fixture-token',
  savedAt = '2026-11-09T00:00:00.000Z',
): SaveSnapshot {
  return {
    schema: SAVE_SCHEMA,
    slot: `${runId}/manual`,
    runId,
    token,
    savedAt,
    name: 'Fixture run',
    kind: 'manual',
    sequence: 1,
    previousToken: null,
    recoveredFrom: null,
    origin: null,
    worldId: world.definition.id,
    mapKey: authoredMapKey(world.definition),
    contentVersion: world.contentVersion,
    physicsVersion: RAPIER_VERSION,
    tick: world.resources.tick,
    world,
  };
}
