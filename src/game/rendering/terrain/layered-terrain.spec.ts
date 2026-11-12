import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { Ray } from '@babylonjs/core/Culling/ray';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { WorldDefinition } from '@contracts/world';
import { LayeredTerrain } from './layered-terrain';

describe('LayeredTerrain native ownership', () => {
  let engine: Engine, scene: Scene, owner: TransformNode, terrain: LayeredTerrain;
  const definition: WorldDefinition = {
    version: 1,
    id: 'terrain-renderer-test',
    grid: { origin: { x: 0, z: 0 }, columns: 8, rows: 8, metresPerCell: 2 },
    terrain: Array<string>(64).fill('soil'),
    spawn: { x: 1, y: 0, z: 1 },
    deposits: [],
    blockers: [],
  };

  const meshes = (kind: string) =>
    scene.meshes.filter((mesh) => mesh.metadata?.kind === kind) as Mesh[];

  const count = (kind: string) =>
    meshes(kind).reduce(
      (total, mesh) => total + (mesh.isEnabled() ? mesh.thinInstanceCount : 0),
      0,
    );

  const rockTransforms = () =>
    meshes('rock').flatMap((mesh) =>
      mesh.thinInstanceGetWorldMatrices().map((matrix) => [...matrix.asArray()]),
    );

  beforeEach(() => {
    engine = new Engine(document.createElement('canvas'), true);
    scene = new Scene(engine);
    owner = new TransformNode('owner', scene);
    new FreeCamera('camera', new Vector3(800, 1200, -800), scene);
    new HemisphericLight('fill', Vector3.Up(), scene);
    terrain = new LayeredTerrain(owner, definition);
  });
  afterEach(() => {
    terrain.dispose();
    engine.dispose();
  });

  it('adds growth at fixed roots and keeps rock transforms stable across recovery', () => {
    terrain.update(Array<number>(64).fill(0), new Set());
    const rocks = rockTransforms();
    expect(count('rock')).toBeGreaterThan(0);
    expect(count('grass')).toBe(0);
    expect(meshes('grass').every((mesh) => !mesh.isEnabled())).toBe(true);
    terrain.update(Array<number>(64).fill(50), new Set());
    const recovering = count('grass');
    terrain.update(Array<number>(64).fill(100), new Set());
    expect(count('grass')).toBeGreaterThan(recovering);
    expect(count('shrub') % 3).toBe(0);
    expect(rockTransforms()).toEqual(rocks);
  });

  it('suppresses all props in occupied space and restores the original counts when cleared', () => {
    terrain.update(Array<number>(64).fill(100), new Set());
    const before = count('grass');
    terrain.update(Array<number>(64).fill(100), new Set(Array.from({ length: 64 }, (_, i) => i)));
    expect(count('grass') + count('rock') + count('shrub')).toBe(0);
    terrain.update(Array<number>(64).fill(100), new Set());
    expect(count('grass')).toBe(before);
  });

  it('releases meshes, GPU buffers, materials and unique custom shader sources', async () => {
    const baseline = new Set(Object.keys(ShaderStore.ShadersStore));
    terrain.update(Array<number>(64).fill(100), new Set());
    scene.render();
    await scene.whenReadyAsync();
    scene.render();
    expect(scene.meshes.length).toBeGreaterThan(5);
    terrain.dispose();
    terrain.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    expect(
      Object.keys(ShaderStore.ShadersStore).filter(
        (key) => !baseline.has(key) && key.startsWith('custom'),
      ),
    ).toEqual([]);
  });

  it('hides the authored grid while preserving explicit cursor picking and restores it on teardown', () => {
    terrain.dispose();
    const ground = MeshBuilder.CreateGround('ground', { width: 1600, height: 1600 }, scene);
    ground.metadata = { terrain: true };
    terrain = new LayeredTerrain(owner, definition);
    expect(ground.isVisible).toBe(false);
    const hit = scene.pickWithRay(
      new Ray(new Vector3(100, 100, 100), Vector3.Down()),
      (mesh) => mesh.metadata?.terrain === true,
    );
    expect(hit?.pickedMesh).toBe(ground);
    terrain.dispose();
    expect(ground.isVisible).toBe(true);
    ground.dispose();
  });
});
