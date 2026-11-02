import { testScenePorts } from '../../testing/game-ports';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import type { BuildingView, WorldDefinition, WorldView } from '@contracts/world';
import { GameSession } from '../../session/game-session';
import { InlineSimulationPort } from '../../../tools/testing/inline-simulation-port';
import { EntityViews } from './entity-views';
import { WorldFrame } from './world-frame';

class ProjectionViews extends EntityViews {
  public pulse(): void {
    super.onUpdate();
  }
}

const definition: WorldDefinition = {
  version: 1,
  id: 'projection-scene',
  grid: { origin: { x: 0, z: 0 }, columns: 10, rows: 10, metresPerCell: 2 },
  terrain: Array<string>(100).fill('soil'),
  spawn: { x: 1, y: 0, z: 1 },
  deposits: [],
  blockers: [],
};

const building = (id: string): BuildingView => ({
  id,
  buildingId: 'test-building',
  cell: { column: 0, row: 0 },
  footprint: { width: 1, depth: 1 },
  rotation: 0,
  position: { x: 1.234, y: 0, z: 3.456 },
});

const view = (partial: Partial<WorldView> = {}): WorldView => ({
  worldId: definition.id,
  worldGeneration: 1,
  publication: 4,
  tick: 5,
  stepSeconds: 0.05,
  nextEntityId: 3,
  player: { position: { x: 1, y: 0, z: 1 }, facing: 0, moving: false, sprinting: false },
  inventory: {},
  equipment: [],
  research: [],
  productionTotals: {},
  deposits: [],
  buildings: [],
  changes: { full: false, upsertedIds: [], removedIds: [] },
  ...partial,
});

describe('EntityViews completed publication changes', () => {
  it('presents stable ground-item IDs, updates positions and disposes collected piles', () => {
    const item = { id: 'ground-1', item: 'scrap', quantity: 2, position: { x: 2, y: 0, z: 3 } };
    frame.view = view({ ground: [item] });
    views.pulse();
    const mesh = scene.getMeshByName('ground:ground-1')!;
    expect(mesh.position.asArray()).toEqual([200, 10, 300]);
    expect(mesh.metadata.worldEntity).toBe('ground-1');
    frame.view = view({ publication: 5, ground: [{ ...item, position: { x: 4, y: 0.6, z: 5 } }] });
    views.pulse();
    expect(scene.getMeshByName('ground:ground-1')).toBe(mesh);
    expect(mesh.position.asArray()).toEqual([400, 70, 500]);
    frame.view = view({ publication: 6, ground: [] });
    views.pulse();
    expect(mesh.isDisposed()).toBe(true);
  });
  let engine: NullEngine, scene: Scene, frame: WorldFrame, views: ProjectionViews;
  it('does not rescan retained ground items when another publication arrives', () => {
    const ground = [
      { id: 'ground-1', item: 'scrap', quantity: 1, position: { x: 2, y: 0.6, z: 3 } },
    ];
    frame.view = view({ ground });
    views.pulse();
    const scan = vi.spyOn(ground, Symbol.iterator);
    frame.view = view({ publication: 5, tick: 6, ground });
    views.pulse();
    expect(scan).not.toHaveBeenCalled();
    expect(scene.getMeshByName('ground:ground-1')!.position.y).toBe(70);
  });
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    frame = new WorldFrame(testScenePorts());
    views = new ProjectionViews(new TransformNode('entities', scene), definition, frame);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
    vi.restoreAllMocks();
  });

  it('rebuilds existing entities on a new renderer even when its first completed view is a delta', () => {
    frame.view = view({ buildings: [building('retained')] });
    views.pulse();
    expect(scene.getMeshByName('entity:retained')).not.toBeNull();
    expect([...views.values()]).toHaveLength(1);
    const repeated = { ...frame.view };
    Object.defineProperty(repeated, 'buildings', {
      get: () => {
        throw new Error('Full scan on repeated publication');
      },
    });
    frame.view = repeated;
    expect(() => views.pulse()).not.toThrow();
  });

  it('applies changed and removed renderables once and resets on world replacement', () => {
    const fullSync = vi.spyOn(views, 'sync');
    frame.view = view({ buildings: [building('old')] });
    views.pulse();
    const old = scene.getMeshByName('entity:old')!;
    const next: BuildingView = {
      ...building('new'),
      footprint: { width: 2, depth: 1 },
      rotation: 1,
    };
    const deposit = {
      id: 'pile-marker',
      kind: 'scrap' as const,
      quantity: 123,
      footprint: { width: 1, depth: 1 },
      rotation: 0 as const,
      position: { x: 3.21, y: 0, z: 4.56 },
    };
    frame.view = view({
      publication: 5,
      deposits: [deposit],
      buildings: [next],
      changes: {
        full: false,
        upsertedIds: [next.id, deposit.id],
        removedIds: ['old'],
        buildings: [next],
        deposits: [deposit],
      },
    });
    views.pulse();
    expect(old.isDisposed()).toBe(true);
    expect([...views.values()]).toHaveLength(2);
    expect(scene.getMeshByName('entity:new')!.position.x).toBeCloseTo(123.4, 8);
    expect(scene.getMeshByName('entity:new')!.position.z).toBeCloseTo(445.6, 8);
    expect(fullSync).toHaveBeenCalledOnce();
    frame.view = view({ worldGeneration: 2, publication: 5 });
    views.pulse();
    expect([...views.values()]).toHaveLength(0);
    expect(fullSync).toHaveBeenCalledTimes(2);
  });

  it('renders a placement when a pause publication arrives before the next frame', async () => {
    const session = new GameSession(definition, {
      developerFixture: true,
      portFactory: () => new InlineSimulationPort(),
    });
    try {
      await session.ready;
      frame.view = session.readView();
      views.pulse();
      session.enqueue({
        type: 'place',
        buildingId: 'test-building',
        cell: { column: 1, row: 0 },
        rotation: 0,
      });
      session.advance(0.05);
      expect(session.readView().buildings).toHaveLength(1);
      session.setPaused(true);
      frame.view = session.readView();
      expect(frame.view.changes?.buildings).toEqual([]);
      views.pulse();
      expect(scene.getMeshByName('entity:building-1')).not.toBeNull();
    } finally {
      session.dispose();
    }
  });

  it('recovers removals and updates from skipped publications', () => {
    frame.view = view({ buildings: [building('removed'), building('retained')] });
    views.pulse();
    const removed = scene.getMeshByName('entity:removed')!;
    const updated = { ...building('retained'), position: { x: 5, y: 0, z: 7 } };
    frame.view = view({ publication: 6, buildings: [updated] });
    views.pulse();
    expect(removed.isDisposed()).toBe(true);
    expect([...views.values()]).toHaveLength(1);
    expect(scene.getMeshByName('entity:retained')!.position.x).toBe(500);
    expect(scene.getMeshByName('entity:retained')!.position.z).toBe(700);
  });
});
