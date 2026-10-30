import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import type { BuildingView, WorldDefinition, WorldView } from '@contracts/world';
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
  lastCommandResult: null,
  changes: { full: false, upsertedIds: [], removedIds: [] },
  ...partial,
});

describe('EntityViews completed publication changes', () => {
  let engine: NullEngine, scene: Scene, frame: WorldFrame, views: ProjectionViews;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    frame = new WorldFrame({});
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
});
