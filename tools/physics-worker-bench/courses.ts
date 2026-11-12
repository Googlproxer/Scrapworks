import type { WorldDefinition } from '../../src/contracts/world.ts';
import type { SimulationSnapshot } from '../../src/contracts/simulation.ts';
import { Simulation, type MovementIntent } from '../../src/simulation/ecs-runtime.ts';
import { rebuildPhysics } from '../testing/rebuild-physics.ts';
import { assertSnapshot } from '../../src/simulation/capture.ts';
import { OPENING_CONTENT } from '../../src/content/opening.ts';
import type { EditableData } from '../../src/contracts/readonly-data.ts';
export type Course = 'corner-contact' | 'wall-corner' | 'crate-contact' | 'platform-support' | 'platform-side';
export function courseFixture(authored: WorldDefinition, name: Course): SimulationSnapshot {
  const definition = { ...structuredClone(authored), id: 'physics-course-' + name, terrain: authored.terrain.map(() => 'soil'), deposits: [], blockers: [], bodies: [] } as EditableData<WorldDefinition>;
  if (name === 'wall-corner' || name === 'corner-contact') definition.blockers = [
    { id: 'wall', position: { x: 3, y: 0, z: 1 }, footprint: { width: 1, depth: 3 }, rotation: 0, collision: { shape: 'box', width: 1, height: 2, depth: 6 } },
    { id: 'corner', position: { x: 1, y: 0, z: 7 }, footprint: { width: 1, depth: 3 }, rotation: 1, collision: { shape: 'box', width: 1, height: 2, depth: 6 } },
  ];
  if (name === 'crate-contact') definition.bodies = [
    { id: 'crate', position: { x: 1, y: .45, z: 3.5 }, rotation: 0, collision: { shape: 'box', width: .9, height: .9, depth: .9 }, motion: 'dynamic', mass: 8 },
    { id: 'falling', position: { x: -2, y: 2, z: 4 }, rotation: 1, collision: { shape: 'box', width: .7, height: .7, depth: .7 }, motion: 'dynamic', mass: 4 },
  ];
  if (name.startsWith('platform')) {
    definition.spawn = name === 'platform-support' ? { x: 0, y: 0, z: 2 } : { x: 0, y: 0, z: -1.3 };
    definition.bodies = [{ id: 'mover', position: { x: 0, y: .3, z: 0 }, rotation: 0, collision: { shape: 'box', width: 1.5, height: .6, depth: 1.5 }, motion: 'kinematic', mass: 30, travel: { axis: 'x', distance: 4, periodTicks: 160 } }];
  }
  const simulation = new Simulation(definition); let snapshot: SimulationSnapshot;
  try { snapshot = simulation.capture(); } finally { simulation.dispose(); }
  if (name === 'platform-support') { snapshot.entities.find(entity => entity.kind === 'player')!.transform!.position = { x: 0, y: .6, z: 0 }; rebuildPhysics(snapshot); }
  assertSnapshot(snapshot, OPENING_CONTENT); return snapshot;
}
export function courseMotion(name: Course, n: number): MovementIntent {
  if (name === 'crate-contact') return { x: 0, z: n <= 55 ? 1 : 0, sprint: false };
  if (name === 'platform-support') return { x: 0, z: n > 160 && n <= 185 ? 1 : 0, sprint: false };
  if (name === 'platform-side') return { x: 0, z: n <= 6 ? 1 : 0, sprint: false };
  const phase = n % 160; return { x: phase < 40 ? 1 : phase < 80 ? 0 : phase < 120 ? -1 : 0, z: phase < 40 ? .3 : phase < 80 ? 1 : phase < 120 ? -.3 : -1, sprint: n % 40 >= 20 };
}
