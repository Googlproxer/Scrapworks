import { Engine } from '@babylonjs/core/Engines/engine';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { WorldView } from '@contracts/world';
import { expectConsoleMessage } from '../../../testing/console-policy';
import { DevelopmentDebugDraw } from './development-renderer';
import type { DebugDrawWriter } from './types';

describe('development debug drawing in a real renderer', () => {
  let engine: Engine;
  let canvas: HTMLCanvasElement;
  let scene: Scene;
  let owner: TransformNode;
  let manager: DevelopmentDebugDraw;

  beforeAll(() => {
    canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    document.body.append(canvas);
    engine = new Engine(canvas, true);
  });
  beforeEach(() => {
    scene = new Scene(engine);
    const camera = new FreeCamera('camera', new Vector3(0, 500, -1000), scene);
    camera.setTarget(Vector3.Zero());
    owner = new TransformNode('owner', scene);
    manager = new DevelopmentDebugDraw(scene);
  });
  afterEach(() => {
    manager.dispose();
    scene.dispose();
    expect(engine.scenes).toHaveLength(0);
    expect(engine.activeRenderLoops).toHaveLength(0);
  });
  afterAll(() => {
    engine.dispose();
    canvas.remove();
  });

  const enable = (disabledCategories: string[] = []) =>
    manager.configure({ enabled: true, disabledCategories }, () => true);

  it('discovers categories while off and reuses geometry across radius, position and toggle changes', () => {
    let radius = 1;
    const provider = vi.fn((draw: DebugDrawWriter) => draw.circle('range', { radius }));
    const attachment = manager.attach(owner, { category: 'interaction' }, provider);
    const status = vi.fn();
    manager.subscribe(status);
    scene.render();
    expect(provider).not.toHaveBeenCalled();
    expect(manager.renderingScene).toBeUndefined();
    expect(status).toHaveBeenLastCalledWith({ available: true, categories: ['interaction'] });
    enable();
    scene.render();
    const mesh = manager.renderingScene!.meshes[0];
    const geometry = mesh.geometry;
    owner.position.x = 300;
    radius = 2;
    scene.render();
    expect(manager.renderingScene!.meshes[0]).toBe(mesh);
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.position.x).toBe(300);
    expect(mesh.getVerticesData(VertexBuffer.PositionKind)![0]).toBe(200);
    const calls = provider.mock.calls.length;
    enable(['interaction']);
    scene.render();
    expect(provider).toHaveBeenCalledTimes(calls);
    expect(mesh.isEnabled()).toBe(false);
    enable();
    attachment.setEnabled(false);
    scene.render();
    expect(provider).toHaveBeenCalledTimes(calls);
    attachment.setEnabled(true);
    owner.setEnabled(false);
    scene.render();
    expect(provider).toHaveBeenCalledTimes(calls);
    owner.setEnabled(true);
    scene.render();
    expect(mesh.isEnabled()).toBe(true);
    attachment.clear('range');
    expect(mesh.isDisposed()).toBe(true);
    scene.render();
    attachment.dispose();
    attachment.dispose();
    expect(manager.renderingScene!.meshes).toHaveLength(0);
  });

  it('strips model scale, follows parent rotations, supports absolute metres and preserves depth settings', () => {
    const parent = new TransformNode('parent', scene);
    parent.position.x = 200;
    parent.rotation.y = Math.PI / 2;
    owner.parent = parent;
    owner.scaling.set(100, 50, 100);
    manager.attach(owner, {}, (draw) =>
      draw.line('direction', { start: Vector3.Zero(), end: Vector3.Forward() }),
    );
    manager.attach(owner, { space: 'world', depthTest: false, category: 'absolute' }, (draw) =>
      draw.circle('range', { center: { x: 3, y: 0, z: 0 }, radius: 1 }),
    );
    enable();
    scene.render();
    const [local, absolute] = manager.renderingScene!.meshes;
    const tip = Vector3.TransformCoordinates(
      new Vector3(0, 0, 100),
      local.computeWorldMatrix(true),
    );
    expect(tip.x).toBeCloseTo(300);
    expect(local.scaling.asArray()).toEqual([1, 1, 1]);
    parent.scaling.set(2, 3, 4);
    owner.rotation.set(0.4, 0.7, 0.2);
    scene.render();
    const rigid = local.computeWorldMatrix(true);
    expect(
      Vector3.Distance(
        Vector3.TransformCoordinates(Vector3.Zero(), rigid),
        Vector3.TransformCoordinates(new Vector3(0, 0, 100), rigid),
      ),
    ).toBeCloseTo(100);
    expect(absolute.position.asArray()).toEqual([0, 0, 0]);
    expect(absolute.getVerticesData(VertexBuffer.PositionKind)![0]).toBe(400);
    expect(local.material!.depthFunction).toBe(Constants.LEQUAL);
    expect(absolute.material!.depthFunction).toBe(Constants.ALWAYS);
    expect(local.material!.disableDepthWrite).toBe(true);
    expect(local.isPickable).toBe(false);
    expect(manager.renderingScene!.autoClearDepthAndStencil).toBe(false);
    const target = MeshBuilder.CreateBox('pickable', { size: 100 }, scene);
    expect(scene.meshes).toEqual([target]);
    expect(manager.renderingScene!.meshes.every((mesh) => !mesh.isPickable)).toBe(true);
  });

  it('uses fresh completed views across publication gaps and generations while following transforms every frame', () => {
    let view = {
      worldGeneration: 1,
      publication: 1,
      player: { position: { x: 1, y: 0, z: 0 } },
    } as WorldView;
    manager.bindWorld(() => view);
    manager.attach(owner, { space: 'world' }, (draw) =>
      draw.circle('range', { center: view.player.position, radius: 1 }),
    );
    manager.attach(owner, {}, (draw) => draw.axes('pose', { length: 1 }));
    enable();
    scene.render();
    const [ring, pose] = manager.renderingScene!.meshes;
    owner.position.x = 50;
    scene.render();
    expect(pose.position.x).toBe(50);
    view = { ...view, publication: 5, player: { ...view.player, position: { x: 7, y: 0, z: 0 } } };
    scene.render();
    expect(ring.getVerticesData(VertexBuffer.PositionKind)![0]).toBe(800);
    view = {
      ...view,
      worldGeneration: 2,
      publication: 1,
      player: { ...view.player, position: { x: 0, y: 0, z: 0 } },
    };
    scene.render();
    expect(ring.getVerticesData(VertexBuffer.PositionKind)![0]).toBe(100);
  });

  it('hides omitted output and isolates invalid shapes and throwing providers without leaking RxJS errors', () => {
    let visible = true;
    manager.attach(owner, {}, (draw) => {
      if (visible) draw.circle('range', { radius: 1 });
      draw.circle('bad', { radius: NaN });
    });
    manager.attach(owner, {}, () => {
      throw new Error('probe');
    });
    expectConsoleMessage('warn', 'Debug draw (owner/bad): Dimension must be positive');
    expectConsoleMessage('warn', 'Debug draw (owner/provider): probe');
    enable();
    scene.render();
    expect(manager.renderingScene!.meshes[0].isEnabled()).toBe(true);
    visible = false;
    scene.render();
    expect(manager.renderingScene!.meshes[0].isEnabled()).toBe(false);
  });

  it('does not commit staged output or call later providers after the pinned frame loses ownership', () => {
    let current = true;
    const view = { worldGeneration: 1 } as WorldView;
    manager.bindWorld(() => (current ? view : undefined));
    manager.attach(owner, {}, (draw) => {
      draw.circle('stale', { radius: 1 });
      current = false;
    });
    const later = vi.fn();
    manager.attach(owner, {}, later);
    enable();
    scene.render();
    expect(later).not.toHaveBeenCalled();
    expect(manager.renderingScene).toBeUndefined();
  });

  it('stops synchronous dispatch on invalidation and removes observers before resource disposal', async () => {
    const before = scene.onBeforeActiveMeshesEvaluationObservable.observers.length;
    manager.attach(owner, {}, () =>
      manager.configure({ enabled: false, disabledCategories: [] }, () => true),
    );
    const later = vi.fn();
    manager.attach(owner, {}, later);
    enable();
    scene.render();
    expect(later).not.toHaveBeenCalled();
    expect(manager.renderingScene).toBeUndefined();
    owner.dispose();
    manager.dispose();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(scene.onBeforeActiveMeshesEvaluationObservable.observers.length).toBeLessThan(before);
  });
});
