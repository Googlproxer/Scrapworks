import type { WorldPosition } from '../../src/contracts/world.ts';
import { Simulation } from '../../src/simulation/ecs-runtime.ts';
import { WorldPhysics } from '../../src/simulation/physics/world-physics.ts';
import { staticColliders } from '../../src/simulation/physics/collision-definitions.ts';
import { FixtureBuilder, fixtureCounts, matrixSpecs, workloadKey } from './fixtures.ts';
import { distribution } from './statistics.ts';
import { RAPIER } from '../../src/simulation/physics/rapier.ts';

function liveNativeCounts(physics: WorldPhysics) {
  // This diagnostic observes the live cache; restored snapshot caches can be empty.
  const world = Reflect.get(physics, 'world') as InstanceType<typeof RAPIER.World>;
  let pairs = 0, manifolds = 0, contacts = 0, solverContacts = 0, activeBodies = 0;
  world.forEachActiveRigidBody(() => ++activeBodies);
  world.colliders.forEach(collider => world.contactPairsWith(collider, other => {
    if (collider.handle >= other.handle) return;
    ++pairs;
    world.contactPair(collider, other, manifold => {
      ++manifolds; contacts += manifold.numContacts(); solverContacts += manifold.numSolverContacts();
    });
  }));
  return { pairs, manifolds, contacts, solverContacts, activeBodies, method: 'Live native world after stepping; census outside timed spans.' };
}
/** Attribution controls only: no gameplay qualification is inferred from removing the native step. */
export async function isolation(builder: FixtureBuilder, emit: (kind: string, data: unknown) => Promise<void>): Promise<void> {
  for (const spec of matrixSpecs().filter(spec => spec.level === 0)) {
    const initial = builder.build(spec), player = initial.entities.find(entity => entity.kind === 'player')!;
    const native = new WorldPhysics(initial.definition, player.id, player.transform!.position, initial.physics);
    try {
      native.syncStatic(staticColliders(initial.definition, initial.entities.flatMap(entity => entity.building ? [entity.building] : []), initial.definition.deposits));
      native.syncBodies(initial.definition.bodies ?? []);
      const times: number[] = [];
      let afterWarmup: ReturnType<typeof liveNativeCounts> | undefined;
      for (let n = 0; n < 2200; ++n) { const start = performance.now(); native.movePlayer(0, 0, initial.resources.tick + n); [...native.changedBodies()]; if (n >= 200) times.push(performance.now() - start); if (n === 199) afterWarmup = liveNativeCounts(native); }
      await emit('isolation-native', { key: workloadKey(spec), counts: fixtureCounts(initial), liveContacts: { afterWarmup, final: liveNativeCounts(native) }, nativeStepMs: distribution(times), rawNativeStepMs: times, gameSteps: 0, interpretation: 'Native physics control with fixed zero game work; no worker messaging, ECS or renderer. Separate bundle/JIT and instrumentation from primary optimized workers.' });
    } finally { native.dispose(); }
  }
  for (const level of [0, 1, 2, 3] as const) {
    const initial = builder.base(level), value = new Simulation(initial.definition, { snapshot: initial, developerFixture: true });
    const move = WorldPhysics.prototype.movePlayer, changed = WorldPhysics.prototype.changedBodies;
    const position: WorldPosition = initial.entities.find(entity => entity.kind === 'player')!.transform!.position;
    try {
      // Validated initialization finishes first. This diagnostic intentionally freezes physics and
      // never captures/reuses the resulting nonphysical continuation as a valid game or save.
      WorldPhysics.prototype.movePlayer = () => ({ ...position });
      WorldPhysics.prototype.changedBodies = () => [];
      const times: number[] = [];
      for (let n = 0; n < 2200; ++n) { const start = performance.now(); value.step({ x: 0, z: 0, sprint: false }); if (n >= 200) times.push(performance.now() - start); }
      await emit('isolation-simulation', { level, counts: fixtureCounts(initial), simulationOnlyMs: distribution(times), rawSimulationOnlyMs: times, nativeSteps: 0, interpretation: 'Frozen physics diagnostic, initialized from an unmodified valid fixture. Native processing/pose publication removed identically for every tier. Collider edits remain charged if game work causes them. No coherent-save or playable-capacity claim.' });
    } finally { WorldPhysics.prototype.movePlayer = move; WorldPhysics.prototype.changedBodies = changed; value.dispose(); }
  }
}
