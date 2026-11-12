import type { WorldDefinition } from '../../src/contracts/world.ts';
import type { PhysicsBodyDefinition } from '../../src/contracts/physics.ts';
import type { EditableData } from '../../src/contracts/readonly-data.ts';
import type { SimulationSnapshot } from '../../src/contracts/simulation.ts';
import { Simulation } from '../../src/simulation/ecs-runtime.ts';
import { assertSnapshot } from '../../src/simulation/capture.ts';
import { OPENING_CONTENT } from '../../src/content/opening.ts';
import { rebuildPhysics } from '../testing/rebuild-physics.ts';
import { courseFixture } from './courses.ts';
export type ContactCourse = 'free-space' | 'corner-contact' | 'wall-corner' | 'crate-contact' | 'platform-support' | 'platform-side' | 'dense-contacts';
export function contactFixture(authored: WorldDefinition, course: ContactCourse): SimulationSnapshot {
  if (course === 'free-space') { const value = new Simulation(authored); try { return value.capture(); } finally { value.dispose(); } }
  if (course === 'dense-contacts') {
    const definition: WorldDefinition = { ...structuredClone(authored), id: 'contact-render-dense', terrain: authored.terrain.map(() => 'soil'), deposits: [], blockers: [], spawn: { x: 0, y: 0, z: 2.19 }, bodies: Array.from({ length: 100 }, (_, index): PhysicsBodyDefinition => ({ id: `dense-${index}`, motion: 'dynamic', mass: 8, rotation: (index % 4) as 0 | 1 | 2 | 3, position: { x: ((index % 5) - 2) * .92, y: .45 + Math.floor(index / 15) * .91, z: 3 + (Math.floor(index / 5) % 3) * .92 }, collision: { shape: 'box', width: .9, height: .9, depth: .9 } })) };
    const value = new Simulation(definition); try { return value.capture(); } finally { value.dispose(); }
  }
  const world = courseFixture(authored, course), definition = structuredClone(world.definition) as EditableData<WorldDefinition>;
  world.definition = definition;
  if (course === 'platform-support') {
    definition.bodies![0].collision = { shape: 'box', width: 8, height: .6, depth: 8 };
    world.entities.find(entity => entity.id === 'mover')!.physics = structuredClone(definition.bodies![0]);
  }
  if (course === 'crate-contact') world.entities.find(entity => entity.kind === 'player')!.transform!.position = { x: 1, y: 0, z: 2.69 };
  if (course === 'platform-side') world.entities.find(entity => entity.kind === 'player')!.transform!.position = { x: 0, y: 0, z: -1.11 };
  rebuildPhysics(world); assertSnapshot(world, OPENING_CONTENT); return world;
}
