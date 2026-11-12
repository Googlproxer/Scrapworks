import { AssetContainer } from '@babylonjs/core/assetContainer';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { graphicsPresets } from '@contracts/graphics';
import { testScenePorts } from '../../testing/game-ports';
import { WorldFrame } from '../views/world-frame';
import { WorldRendering } from './world-rendering';
import { firstValueFrom, filter } from 'rxjs';
import { fromBabylonObservable } from '../lifecycle/from-babylon-observable';

describe('WorldRendering shadow ownership', () => {
  let engine: NullEngine, scene: Scene, node: TransformNode, rendering: WorldRendering;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    new FreeCamera('camera', new Vector3(0, 500, -800), scene);
    node = new TransformNode('owner', scene);
    const frame = new WorldFrame(testScenePorts());
    frame.isCurrent = () => true;
    rendering = new WorldRendering(
      node,
      node,
      new AssetContainer(scene),
      frame,
      graphicsPresets.high,
    );
    rendering.attach();
    rendering.startFrame();
  });
  afterEach(() => {
    rendering.dispose();
    engine.dispose();
  });

  it('releases the shadow map on Off and creates one replacement on re-enable', () => {
    const first = rendering.shadowGenerator!;
    const target = first.getShadowMap()!;
    const dispose = vi.spyOn(target, 'dispose');
    rendering.applySettings(graphicsPresets.low);
    expect(dispose).toHaveBeenCalledOnce();
    expect(rendering.shadowGenerator).toBeUndefined();
    expect(rendering.sun.getShadowGenerator()).toBeNull();
    expect(scene.shadowsEnabled).toBe(false);
    rendering.applySettings(graphicsPresets.medium);
    const next = rendering.shadowGenerator!;
    expect(next).not.toBe(first);
    // NullEngine advertises a 512 texture limit; requested Medium falls back.
    expect(next.getShadowMap()!.getSize().width).toBe(512);
    expect(rendering.status.shadows).toBe('low');
    rendering.applySettings({ ...graphicsPresets.medium, preset: 'custom', renderScale: 50 });
    expect(rendering.shadowGenerator).toBe(next);
  });

  it('registers new solid descendants and removes dismantled meshes, excluding feedback', async () => {
    const building = new TransformNode('building', scene);
    building.metadata = { worldEntity: 'test' };
    const added = firstValueFrom(
      fromBabylonObservable(scene.onNewMeshAddedObservable).pipe(
        filter((mesh) => mesh.name === 'part'),
      ),
    );
    const part = MeshBuilder.CreateBox('part', {}, scene);
    part.parent = building;
    part.material = new StandardMaterial('solid', scene);
    const ghost = MeshBuilder.CreateBox('placement-preview', {}, scene);
    ghost.material = new StandardMaterial('ghost', scene);
    ghost.material.alpha = 0.4;
    // Babylon defers the new-mesh notification until construction has finished.
    await added;
    rendering.lateFrame();
    expect(rendering.shadowGenerator!.getShadowMap()!.renderList).toContain(part);
    expect(rendering.shadowGenerator!.getShadowMap()!.renderList).not.toContain(ghost);
    expect(part.receiveShadows).toBe(true);
    part.dispose();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(rendering.shadowGenerator!.getShadowMap()!.renderList).not.toContain(part);
  });

  it('unsubscribes scene observers and disposes scene-owned resources', async () => {
    const generator = rendering.shadowGenerator!;
    const dispose = vi.spyOn(generator, 'dispose');
    rendering.dispose();
    rendering.dispose();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(dispose).toHaveBeenCalledOnce();
    expect(scene.onNewMeshAddedObservable.hasObservers()).toBe(false);
  });
});
