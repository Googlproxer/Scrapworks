import type { WorldDefinition, WorldEntityDefinition } from '../../src/contracts/world.ts';
import { assertWorldDefinition } from '../../src/contracts/world.ts';
import type { PhysicsBodyDefinition } from '../../src/contracts/physics.ts';
import type { SimulationSnapshot } from '../../src/contracts/simulation.ts';
import type { EditableData } from '../../src/contracts/readonly-data.ts';
import { Simulation } from '../../src/simulation/ecs-runtime.ts';
import { WorldPhysics } from '../../src/simulation/physics/world-physics.ts';
import { staticColliders } from '../../src/simulation/physics/collision-definitions.ts';
import { assertSnapshot } from '../../src/simulation/capture.ts';
import { OPENING_CONTENT } from '../../src/content/opening.ts';
import { portfolioFixture, workloadCounts } from '../portfolio/fixtures.ts';
import { RAPIER } from '../../src/simulation/physics/rapier.ts';

export interface WorkloadSpec { level: 0 | 1 | 2 | 3; profile: 'P0' | 'static-near' | 'static-far' | 'awake' | 'sleeping' | 'mixed' | 'contacts'; count: number }
export const workloadKey = (spec: WorkloadSpec) => `S${spec.level}-${spec.profile}-${spec.count}`;
export function matrixSpecs(): WorkloadSpec[] {
  return ([0, 1, 2, 3] as const).flatMap(level => [
    { level, profile: 'P0' as const, count: 0 },
    ...(['static-near', 'static-far'] as const).flatMap(profile => [100, 1000, 10000].map(count => ({ level, profile, count }))),
    ...(['awake', 'sleeping', 'mixed'] as const).flatMap(profile => [10, 100, 1000].map(count => ({ level, profile, count }))),
    ...[10, 100, 1000].map(count => ({ level, profile: 'contacts' as const, count })),
  ]);
}

function expand(input: WorldDefinition, size: number): EditableData<WorldDefinition> {
  const output = structuredClone(input) as EditableData<WorldDefinition>;
  output.terrain = Array<string>(size * size).fill('soil');
  for (let row = 0; row < input.grid.rows; ++row)
    for (let column = 0; column < input.grid.columns; ++column)
      output.terrain[row * size + column] = input.terrain[row * input.grid.columns + column];
  output.grid.columns = size; output.grid.rows = size;
  return output;
}

export class FixtureBuilder {
  private readonly bases = new Map<string, SimulationSnapshot>();
  constructor(private readonly authored: WorldDefinition) {}

  public base(level: WorkloadSpec['level'], gridSide = level === 2 ? 40 : level === 3 ? 80 : this.authored.grid.columns): SimulationSnapshot {
    const key = `${level}-${gridSide}`;
    let cached = this.bases.get(key);
    if (!cached) {
      const definition = gridSide > this.authored.grid.columns ? expand(this.authored, gridSide) : structuredClone(this.authored);
      if (level === 0) { const simulation = new Simulation(definition); try { cached = simulation.capture(); } finally { simulation.dispose(); } }
      else cached = portfolioFixture(definition, 'renewable', 24 * (level === 1 ? 1 : level === 2 ? 4 : 16)).world;
      if (level > 0) cached.resources.productionTotals['research-kit'] = 50;
      assertSnapshot(cached, OPENING_CONTENT);
      this.bases.set(key, cached);
    }
    return structuredClone(cached);
  }

  public build(spec: WorkloadSpec): SimulationSnapshot {
    let world = this.base(spec.level, spec.profile === 'P0' ? undefined : spec.profile.startsWith('static') ? 160 : 80);
    if (spec.profile === 'P0') return world;
    const baseDefinition = world.definition;
    const definition = structuredClone(world.definition) as EditableData<WorldDefinition>;
    world.definition = definition;
    definition.id = `physics-worker-${workloadKey(spec)}`;
    world.resources.worldId = definition.id;
    if (spec.profile.startsWith('static')) {
      const available: { x: number; z: number; distance: number }[] = [];
      const occupied = [...world.entities.filter(entity => entity.transform).map(entity => entity.transform!.position), ...definition.blockers.map(entity => entity.position)];
      for (let row = 2; row < definition.grid.rows - 2; ++row) for (let column = 2; column < definition.grid.columns - 2; ++column) {
        const x = definition.grid.origin.x + (column + .5) * definition.grid.metresPerCell;
        const z = definition.grid.origin.z + (row + .5) * definition.grid.metresPerCell;
        if (definition.terrain[row * definition.grid.columns + column] !== 'soil') continue;
        const distance = Math.hypot(x - definition.spawn.x, z - definition.spawn.z);
        if (distance < 5 || occupied.some(position => Math.hypot(x - position.x, z - position.z) < 4)) continue;
        available.push({ x, z, distance });
      }
      available.sort((a, b) => spec.profile === 'static-near' ? a.distance - b.distance : b.distance - a.distance);
      if (available.length < spec.count) throw new Error(`Valid static fixture bound: ${available.length} < ${spec.count}`);
      const extra: WorldEntityDefinition[] = available.slice(0, spec.count).map((position, index) => ({ id: `bench-static-${index}`, position: { x: position.x, y: 0, z: position.z }, footprint: { width: 1, depth: 1 }, rotation: 0, collision: { shape: 'box', width: .4, depth: .4, height: 1 } }));
      definition.blockers.push(...extra);
    } else {
      const extras: PhysicsBodyDefinition[] = [];
      for (let index = 0; index < spec.count; ++index) {
        const awake = spec.profile === 'awake' || (spec.profile === 'mixed' && index < spec.count / 2);
        const dense = spec.profile === 'contacts';
        const x = dense ? 90 + (index % 20) * .92 : (awake ? 90 : 110) + (index % 32) * 1.2;
        const z = dense ? 90 + (Math.floor(index / 20) % 5) * .92 : (awake ? 90 : 20) + Math.floor(index / 32) * 1.2;
        const y = dense ? .45 + Math.floor(index / 100) * .91 : awake ? .65 : .45;
        extras.push({ id: `bench-body-${index}`, position: { x, y, z }, rotation: (index % 4) as 0 | 1 | 2 | 3, motion: 'dynamic', mass: 8, collision: { shape: 'box', width: .9, depth: .9, height: .9 } });
      }
      if (spec.profile === 'awake' || spec.profile === 'mixed') extras.push({ id: 'bench-moving-support', position: { x: 110, y: .1, z: 110 }, rotation: 0, motion: 'kinematic', mass: 1000, collision: { shape: 'box', width: 50, depth: 50, height: .2 }, travel: { axis: 'x', distance: 2, periodTicks: 40 } });
      if (spec.profile === 'contacts') extras.push({ id: 'bench-contact-pusher', position: { x: 87, y: .5, z: 92 }, rotation: 0, motion: 'kinematic', mass: 1000, collision: { shape: 'box', width: 1, depth: 6, height: 1 }, travel: { axis: 'x', distance: 5, periodTicks: 100 } });
      definition.bodies ??= [];
      definition.bodies.push(...extras);
      for (const body of extras) {
        const angle = body.rotation * Math.PI / 2;
        world.entities.push({ id: body.id, kind: 'body', physics: structuredClone(body), transform: { position: { ...body.position }, facing: 0, moving: false, sprinting: false, rotation: { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) } } });
      }
    }
    assertWorldDefinition(definition);
    const player = world.entities.find(entity => entity.kind === 'player')!;
    const physics = new WorldPhysics(baseDefinition, player.id, player.transform!.position, world.physics);
    try {
      // Retain the existing native timeline/poses, then apply the prepared structural edits.
      physics.syncStatic(staticColliders(baseDefinition, world.entities.flatMap(entity => entity.building ? [entity.building] : []), baseDefinition.deposits));
      physics.syncBodies(baseDefinition.bodies ?? []);
      physics.syncStatic(staticColliders(definition, world.entities.flatMap(entity => entity.building ? [entity.building] : []), definition.deposits));
      physics.syncBodies(definition.bodies ?? []);
      physics.assertClearance();
      for (const entity of world.entities) if (entity.physics && entity.transform) {
        const pose = physics.pose(entity.id);
        entity.transform.position = { ...pose.position };
        entity.transform.rotation = { ...pose.rotation };
        entity.transform.moving = !pose.sleeping;
      }
      world.physics = physics.capture();
    } finally { physics.dispose(); }
    if (spec.profile === 'sleeping' || spec.profile === 'mixed') {
      const settled = new Simulation(world.definition, { snapshot: world });
      try { for (let step = 0; step < 240; ++step) settled.step({ x: 0, z: 0, sprint: false }); world = settled.capture(); }
      finally { settled.dispose(); }
    }
    assertSnapshot(world, OPENING_CONTENT);
    return world;
  }
}

export function fixtureCounts(world: SimulationSnapshot) {
  const native = RAPIER.World.restoreSnapshot(Uint8Array.from(world.physics.bytes));
  let active = 0, sleeping = 0, contactPairs = 0, contactManifolds = 0, contacts = 0, solverContacts = 0, kinematics = 0, dynamics = 0, ccdBodies = 0;
  try {
    native.forEachActiveRigidBody(() => ++active);
    native.forEachRigidBody(body => { if (body.isSleeping()) ++sleeping; if (body.isKinematic()) ++kinematics; if (body.isDynamic()) ++dynamics; if (body.isCcdEnabled()) ++ccdBodies; });
    native.colliders.forEach(collider => native.contactPairsWith(collider, other => {
      if (collider.handle >= other.handle) return;
      ++contactPairs;
      native.contactPair(collider, other, manifold => { ++contactManifolds; contacts += manifold.numContacts(); solverContacts += manifold.numSolverContacts(); });
    }));
    const player = world.entities.find(entity => entity.kind === 'player');
    const terrainKinds: Record<string, number> = {}; for (const terrain of world.definition.terrain) terrainKinds[terrain] = (terrainKinds[terrain] ?? 0) + 1;
    return { ...workloadCounts(world), gridCells: world.definition.grid.columns * world.definition.grid.rows, terrainKinds, queuedResearch: player?.opening?.researchQueue.length ?? 0, researchKitHistory: world.resources.productionTotals['research-kit'] ?? 0, unlockedTechnologies: Object.values(world.resources.research).filter(value => value.unlocked).length, researchWork: Object.values(world.resources.research).reduce((sum, value) => sum + value.work, 0), staticColliders: staticColliders(world.definition, world.entities.flatMap(entity => entity.building ? [entity.building] : []), world.definition.deposits).length, totalNativeBodies: native.bodies.len(), totalNativeColliders: native.colliders.len(), activeNativeBodies: active, sleepingNativeBodies: sleeping, nativeKinematics: kinematics, nativeDynamics: dynamics, ccdBodies, contactPairs, contactManifolds, contacts, solverContacts, islands: null, contactCountMethod: 'Restored native snapshot, outside timed spans; pair cache may be empty immediately after restore.' };
  } finally { native.free(); }
}
