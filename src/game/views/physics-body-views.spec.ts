import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import type { PhysicsBodyView } from '@contracts/physics';
import { PhysicsBodyViews } from './physics-body-views';

const body = (x = 0): PhysicsBodyView => ({
  id: 'crate',
  position: { x, y: 0.45, z: 3 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  collision: { shape: 'box', width: 0.9, height: 0.9, depth: 0.9 },
  motion: 'dynamic',
});

describe('PhysicsBodyViews', () => {
  let engine: NullEngine, scene: Scene, views: PhysicsBodyViews;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    views = new PhysicsBodyViews(scene);
  });
  afterEach(() => {
    views.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('interpolates completed position/quaternion publications in centimetres without mutating their values', () => {
    views.sync({ bodies: [body()] }, true);
    const target = { ...body(2), rotation: { x: 0, y: 1, z: 0, w: 0 } };
    const before = JSON.stringify(target);
    views.sync(
      { changes: { full: false, upsertedIds: ['crate'], removedIds: [], bodies: [target] } },
      false,
    );
    views.present(0.025, 0.05);
    const mesh = scene.getMeshByName('physics:crate')!;
    expect(mesh.position.asArray()).toEqual([100, 45, 300]);
    expect(mesh.rotationQuaternion!.y).toBeCloseTo(Math.SQRT1_2);
    expect(mesh.rotationQuaternion!.w).toBeCloseTo(Math.SQRT1_2);
    views.present(0, 0.05);
    expect(mesh.position.x).toBe(100);
    views.present(0.025, 0.05);
    expect(mesh.position.x).toBe(200);
    expect(mesh.rotationQuaternion!.y).toBeCloseTo(1);
    expect(JSON.stringify(target)).toBe(before);
  });

  it('disposes removed bodies and rebuilds primitive geometry when a full replacement changes the shape', () => {
    views.sync({ bodies: [body()] }, true);
    const original = scene.getMeshByName('physics:crate')!;
    const material = original.material!;
    const disposeMaterial = vi.spyOn(material, 'dispose');
    views.sync(
      { bodies: [{ ...body(), collision: { shape: 'cylinder', radius: 0.3, height: 1 } }] },
      true,
    );
    expect(original.isDisposed()).toBe(true);
    expect(disposeMaterial).toHaveBeenCalledOnce();
    const replacement = scene.getMeshByName('physics:crate')!;
    expect(replacement).not.toBe(original);
    views.sync({ changes: { full: false, upsertedIds: [], removedIds: ['crate'] } }, false);
    expect(replacement.isDisposed()).toBe(true);
    expect(scene.getMeshByName('physics:crate')).toBeNull();
  });

  it('recovers current bodies after skipped publications and releases all scene-owned resources', () => {
    views.sync({ bodies: [body(), { ...body(4), id: 'old' }] }, true);
    const old = scene.getMeshByName('physics:old')!;
    views.sync({ bodies: [body(8)] }, true);
    views.present(0.05, 0.05);
    expect(old.isDisposed()).toBe(true);
    const retained = scene.getMeshByName('physics:crate')!;
    expect(retained.position.x).toBe(800);
    views.dispose();
    views.dispose();
    expect(retained.isDisposed()).toBe(true);
    expect(scene.materials.filter((material) => material.name.startsWith('physics:'))).toHaveLength(
      0,
    );
  });
});
