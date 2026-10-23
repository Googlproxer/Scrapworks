import { AssetContainer } from '@babylonjs/core/assetContainer';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Scene } from '@babylonjs/core/scene';
import type { WorldSessionBridge } from '@contracts/game-client';
import type { ActionFrame, ActionState } from '@contracts/input';
import { assertWorldDefinition, type WorldDefinition, type WorldView } from '@contracts/world';
import { loadEditorScene } from '../assets/load-editor-scene';
import { WorldScene } from './world-scene';
import { GameSession } from '../../app/features/game/session/game-session';

describe('WorldScene with the exported character and authored scene', () => {
  let canvas: HTMLCanvasElement;
  let engine: Engine;
  let scene: Scene;
  let assets: AssetContainer;
  let world: WorldScene;
  let camera: ArcRotateCamera;
  let definition: WorldDefinition;
  let session: GameSession;
  let bridge: WorldSessionBridge;

  beforeEach(async () => {
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:73px;top:47px;width:640px;height:480px';
    document.body.append(canvas);
    engine = new Engine(canvas, true);
    engine.setHardwareScalingLevel(1);
    engine.resize();
    scene = new Scene(engine);
    assets = await loadEditorScene(scene, 'Game');
    assets.addAllToScene();
    const response = await fetch(new URL('scene/worlds/game.json', document.baseURI));
    expect(response.ok).toBe(true);
    const data: unknown = await response.json();
    assertWorldDefinition(data);
    definition = data;
    session = new GameSession(definition, { developerFixture: true });
    bridge = {
      initialize: () => undefined,
      registerTickHandler: (handler, order) => session.registerTickHandler(handler, order),
      frame: (seconds, movement, sprint, active) => {
        session.setPaused(!active);
        session.setMovement(movement, sprint);
        session.advance(seconds);
        return session.view;
      },
      place: (cell, rotation) =>
        session.enqueue({ type: 'place', buildingId: 'test-building', cell, rotation }),
      preview: () => ({ valid: true, reason: null, cells: [] }),
    };
    world = await WorldScene.create(scene, definition, { session: bridge, developerFixture: true });
    expect(scene.activeCamera).toBeInstanceOf(ArcRotateCamera);
    camera = scene.activeCamera as ArcRotateCamera;
    await scene.whenReadyAsync();
    scene.render();
  }, 30000);

  afterEach(() => {
    world?.dispose();
    assets?.dispose();
    scene?.dispose();
    engine?.dispose();
    canvas?.remove();
    vi.restoreAllMocks();
  });

  function view(overrides: Partial<WorldView> = {}): WorldView {
    return {
      worldId: definition.id,
      tick: 0,
      stepSeconds: 0.05,
      nextEntityId: 1,
      player: { position: definition.spawn, facing: 0, moving: false, sprinting: false },
      inventory: {},
      equipment: [],
      research: [],
      productionTotals: {},
      deposits: definition.deposits,
      buildings: [],
      lastCommandResult: null,
      ...overrides,
    };
  }

  function present(view: WorldView, seconds: number, active: boolean): void {
    world.player.present(view, seconds, active);
    world.entities.sync(view);
    world.camera.follow(seconds);
  }

  function frame(states: Record<string, ActionState>): ActionFrame {
    return { context: 'gameplay', revision: 0, states };
  }

  function render(input: ActionFrame, seconds: number, active = true): void {
    world.beginFrame(input, seconds, active, { x: 320, y: 240 }, () => true);
    try {
      scene.render();
    } finally {
      world.endFrame();
    }
  }

  it('uses native Toolkit phases for controls, one advance, presentation, follow and picking before draw', () => {
    render(frame({}), 0, false); // native start follows the initial awake render
    expect(world.initialized).toBe(true);
    expect(scene.isPhysicsEnabled()).toBe(false);
    const order: string[] = [];
    const controls = world.camera.controls.bind(world.camera);
    vi.spyOn(world.camera, 'controls').mockImplementation((...args) => {
      order.push('camera input');
      controls(...args);
    });
    const movement = world.playerController.movement.bind(world.playerController);
    vi.spyOn(world.playerController, 'movement').mockImplementation((...args) => {
      order.push('player input');
      return movement(...args);
    });
    const advance = bridge.frame;
    const driver = vi.spyOn(bridge, 'frame').mockImplementation((...args) => {
      order.push('session');
      return advance(...args);
    });
    const player = world.player.present.bind(world.player);
    vi.spyOn(world.player, 'present').mockImplementation((...args) => {
      order.push('player view');
      player(...args);
    });
    const entities = world.entities.sync.bind(world.entities);
    vi.spyOn(world.entities, 'sync').mockImplementation((...args) => {
      order.push('entities');
      entities(...args);
    });
    const follow = world.camera.follow.bind(world.camera);
    vi.spyOn(world.camera, 'follow').mockImplementation((...args) => {
      order.push('follow');
      follow(...args);
    });
    const pick = world.selection.pick.bind(world.selection);
    vi.spyOn(world.selection, 'pick').mockImplementation((...args) => {
      order.push('pick');
      pick(...args);
    });
    scene.onBeforeDrawPhaseObservable.addOnce(() => order.push('draw'));
    render(frame({ move: { kind: 'vector2', value: { x: 0, y: 1 } } }), 0.25);
    expect(order).toEqual([
      'camera input',
      'player input',
      'session',
      'player view',
      'entities',
      'follow',
      'pick',
      'draw',
    ]);
    expect(driver).toHaveBeenCalledTimes(1);
    expect(session.view.tick).toBe(5);
  });

  it('captures placement once on a zero-tick frame and queues it after advancement', () => {
    render(frame({}), 0, false);
    vi.spyOn(world.selection, 'pick').mockImplementation(() => {
      world.selection.cell = { column: 6, row: 5 };
    });
    const place = vi.spyOn(bridge, 'place');
    const pressed = { kind: 'button', held: true, pressed: true, released: false } as const;
    render(frame({ build: pressed, confirm: pressed }), 0.01);
    expect(session.view.tick).toBe(0);
    expect(session.view.lastCommandResult).toBeNull();
    expect(place).toHaveBeenCalledTimes(1);
    render(frame({}), 0.25);
    expect(session.view.tick).toBe(5);
    expect(session.view.lastCommandResult).not.toBeNull();
    expect(place).toHaveBeenCalledTimes(1);
  });

  function project(point: Vector3) {
    const screen = Vector3.Project(
      point,
      Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
    );
    return {
      x: (screen.x * canvas.clientWidth) / engine.getRenderWidth(),
      y: (screen.y * canvas.clientHeight) / engine.getRenderHeight(),
    };
  }

  it('loads one rig at the centimetre boundary and keeps imported geometry out of selection', () => {
    const root = scene.getTransformNodeByName('player-visual')!;
    expect(root.scaling.asArray()).toEqual([100, 100, 100]);
    expect(scene.skeletons).toHaveLength(1);
    expect(scene.skeletons[0].bones).toHaveLength(52);
    const meshes = scene.meshes.filter((mesh) => mesh.skeleton);
    expect(meshes).toHaveLength(10);
    expect(meshes.every((mesh) => !mesh.isPickable)).toBe(true);
    expect(scene.getMeshByName('Protag-v1.glb')).toBeNull();
    expect(scene.animationGroups.map((clip) => clip.name).sort()).toEqual([
      'Idle',
      'Run',
      'TurnLeft',
      'TurnRight',
      'Walk',
    ]);
    const bounds = root.getHierarchyBoundingVectors(true);
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(150);
    expect(bounds.max.y - bounds.min.y).toBeLessThan(180);
    expect(Math.abs(bounds.min.y)).toBeLessThan(5);
    expect(scene.getMeshByName('obstacle')!.isEnabled()).toBe(false);
    expect(scene.getMeshByName('player-placeholder')!.isEnabled()).toBe(false);
  });

  it('interpolates published metre positions and blends movement clips without moving the root itself', () => {
    const root = scene.getTransformNodeByName('player-visual')!;
    const initial = view();
    present(initial, 0.05, true);
    expect(root.position.asArray()).toEqual([100, 0, 100]);
    const walking = view({
      tick: 1,
      player: {
        position: { x: 3, y: 0, z: 1 },
        facing: Math.PI / 2,
        moving: true,
        sprinting: false,
      },
    });
    present(walking, 0.0125, true);
    expect(root.position.x).toBeCloseTo(150);
    present(walking, 0.0125, true);
    expect(root.position.x).toBeCloseTo(200);
    present(walking, 0.1, true);
    expect(root.position.asArray()).toEqual([300, 0, 100]);
    expect(root.rotation.y).toBeGreaterThan(0);
    expect(root.rotation.y).toBeLessThan(Math.PI / 2);
    for (let step = 0; step < 12; step++) present(walking, 0.05, true);
    expect(root.rotation.y).toBeCloseTo(Math.PI / 2);
    const walk = scene.animationGroups.find((clip) => clip.name === 'Walk')!;
    const idle = scene.animationGroups.find((clip) => clip.name === 'Idle')!;
    expect(walk.animatables[0].weight).toBeCloseTo(1);
    expect(idle.animatables[0].weight).toBeCloseTo(0);
    expect(walk.speedRatio).toBeCloseTo(1.5 / 1.5097235);
    const position = root.position.clone();
    walk.goToFrame(walk.to);
    scene.render();
    expect(root.position.asArray()).toEqual(position.asArray());

    const running = view({ tick: 2, player: { ...walking.player, sprinting: true } });
    present(running, 0.4, true);
    const run = scene.animationGroups.find((clip) => clip.name === 'Run')!;
    expect(run.animatables[0].weight).toBeCloseTo(1);
    expect(run.speedRatio).toBeCloseTo(3 / 3.3952876);
    present(running, 0.05, false);
    expect(scene.animationGroups.every((clip) => !clip.isPlaying)).toBe(true);
    present(running, 0.05, true);
    expect(run.isPlaying).toBe(true);
    expect(root.position.asArray()).toEqual(position.asArray());
  });

  it('maps movement through the current camera yaw and clamps orbit and zoom', () => {
    camera.setTarget(Vector3.Zero());
    camera.alpha = -Math.PI / 2;
    camera.beta = Math.PI / 3;
    scene.render();
    const move = frame({ move: { kind: 'vector2', value: { x: 0, y: 1 } } });
    expect(world.playerController.movement(move).x).toBeCloseTo(0);
    expect(world.playerController.movement(move).z).toBeCloseTo(1);
    camera.alpha = 0;
    scene.render();
    expect(world.playerController.movement(move).x).toBeCloseTo(-1);
    expect(world.playerController.movement(move).z).toBeCloseTo(0);
    world.camera.controls(
      frame({
        orbit: { kind: 'vector2', value: { x: 1, y: 1 } },
        zoomIn: { kind: 'button', held: true, pressed: true, released: false },
      }),
      100,
    );
    expect(camera.radius).toBe(600);
    expect(camera.beta).toBeCloseTo(Math.PI / 9);
    world.camera.controls(
      frame({
        orbit: { kind: 'vector2', value: { x: -1, y: -1 } },
        zoomOut: { kind: 'button', held: true, pressed: true, released: false },
      }),
      100,
    );
    expect(camera.radius).toBe(2400);
    expect(camera.beta).toBeCloseTo((Math.PI * 5) / 12);
    expect(camera.inputs.attached['keyboard']).toBeUndefined();
    expect(camera.movement.input.resolveInteraction('pointer', { button: 2 })?.interaction).toBe(
      'rotate',
    );
    expect(camera.movement.input.resolveInteraction('pointer', { button: 0 })).toBeNull();
    expect(camera.movement.input.resolveInteraction('wheel')?.interaction).toBe('zoom');
  });

  it('follows translated player positions without changing the selected orbit or zoom', () => {
    camera.alpha = 0.63;
    camera.beta = 1.15;
    camera.radius = 900;
    present(view(), 0.05, false);
    scene.render();
    const target = camera.getTarget().clone();
    const offset = camera.position.subtract(target);
    const moved = view({
      tick: 1,
      player: { ...view().player, position: { x: 5, y: 0, z: -4 } },
    });
    for (let step = 0; step < 20; step++) {
      present(moved, 0.05, false);
      scene.render();
      expect(camera.alpha).toBeCloseTo(0.63);
      expect(camera.beta).toBeCloseTo(1.15);
      expect(camera.radius).toBeCloseTo(900);
    }
    expect(camera.getTarget().x).toBeGreaterThan(target.x + 300);
    expect(camera.getTarget().z).toBeLessThan(target.z - 300);
    const followedOffset = camera.position.subtract(camera.getTarget());
    expect(followedOffset.x).toBeCloseTo(offset.x);
    expect(followedOffset.y).toBeCloseTo(offset.y);
    expect(followedOffset.z).toBeCloseTo(offset.z);
  });

  it('turns the visible character toward the published +Z and +X headings after glTF conversion', () => {
    const toe = scene.getTransformNodeByName('mixamorig:LeftToeBase')!;
    const foot = scene.getTransformNodeByName('mixamorig:LeftFoot')!;
    expect(toe).not.toBeNull();
    expect(foot).not.toBeNull();
    present(view(), 0.05, false);
    scene.render();
    let forward = toe.getAbsolutePosition().subtract(foot.getAbsolutePosition());
    forward.y = 0;
    forward.normalize();
    expect(forward.z).toBeGreaterThan(0.6);
    for (let step = 0; step < 32; step++)
      present(view({ player: { ...view().player, facing: Math.PI / 2 } }), 0.05, true);
    scene.render();
    forward = toe.getAbsolutePosition().subtract(foot.getAbsolutePosition());
    forward.y = 0;
    forward.normalize();
    expect(forward.x).toBeGreaterThan(0.6);
  });

  it.each([-1, 1])(
    'keeps idle active while smoothly rotating in direction %s without turn animation or movement',
    (direction) => {
      const root = scene.getTransformNodeByName('player-visual')!;
      present(view(), 0.05, true);
      const turning = view({ player: { ...view().player, facing: (direction * Math.PI) / 2 } });
      const before = JSON.stringify(turning);
      present(turning, 0.1, true);
      expect(direction * root.rotation.y).toBeGreaterThan(0);
      expect(direction * root.rotation.y).toBeLessThan(Math.PI / 2);
      const turns = scene.animationGroups.filter((clip) => clip.name.startsWith('Turn'));
      const idle = scene.animationGroups.find((clip) => clip.name === 'Idle')!;
      expect(turns).toHaveLength(2);
      expect(turns.every((clip) => !clip.isStarted && !clip.isPlaying)).toBe(true);
      expect(idle.animatables[0].weight).toBe(1);
      expect(root.position.asArray()).toEqual([100, 0, 100]);
      const pausedHeading = root.rotation.y;
      const pausedWeight = idle.animatables[0].weight;
      present(turning, 0.2, false);
      expect(root.rotation.y).toBe(pausedHeading);
      expect(idle.animatables[0].weight).toBe(pausedWeight);
      expect(idle.isPlaying).toBe(false);
      for (let step = 0; step < 30; step++) present(turning, 0.05, true);
      expect(root.rotation.y).toBeCloseTo((direction * Math.PI) / 2);
      expect(
        scene.animationGroups.find((clip) => clip.name === 'Idle')!.animatables[0].weight,
      ).toBeGreaterThan(0.99);
      expect(root.position.asArray()).toEqual([100, 0, 100]);
      expect(JSON.stringify(turning)).toBe(before);
      expect(turns.every((clip) => !clip.isStarted && !clip.isPlaying)).toBe(true);
    },
  );

  it.each([false, true])(
    'keeps locomotion active throughout a smooth reversal, sprinting=%s',
    (sprinting) => {
      const root = scene.getTransformNodeByName('player-visual')!;
      present(view(), 0.05, true);
      const reversing = view({
        tick: 1,
        player: { position: { x: 1, y: 0, z: -1 }, facing: Math.PI, moving: true, sprinting },
      });
      present(reversing, 0.05, true);
      expect(root.position.asArray()).toEqual([100, 0, -100]);
      expect(root.rotation.y).toBeGreaterThan(0);
      expect(root.rotation.y).toBeLessThan(Math.PI / 8);
      const turns = scene.animationGroups.filter((clip) => clip.name.startsWith('Turn'));
      const locomotion = scene.animationGroups.find(
        (clip) => clip.name === (sprinting ? 'Run' : 'Walk'),
      )!;
      expect(locomotion.animatables[0].weight).toBeGreaterThan(0.5);
      for (let step = 0; step < 24; step++) {
        present(reversing, 0.05, true);
        expect(turns.every((clip) => !clip.isStarted && !clip.isPlaying)).toBe(true);
      }
      expect(root.rotation.y).toBeCloseTo(Math.PI);
      expect(locomotion.animatables[0].weight).toBeGreaterThan(0.99);
      expect(root.position.asArray()).toEqual([100, 0, -100]);
    },
  );

  it.each([30, 60, 144])(
    'turns at the same bounded rate at %s presentation frames per second',
    (fps) => {
      const root = scene.getTransformNodeByName('player-visual')!;
      present(view(), 0, true);
      const turning = view({ player: { ...view().player, facing: Math.PI, moving: true } });
      let previous = 0;
      for (let step = 0; step < fps / 2; step++) {
        present(turning, 1 / fps, true);
        expect(root.rotation.y - previous).toBeLessThanOrEqual((Math.PI * 1.5) / fps + 1e-8);
        previous = root.rotation.y;
      }
      expect(root.rotation.y).toBeCloseTo((Math.PI * 3) / 4, 6);
    },
  );

  it('takes the short turn across the -pi/pi boundary', () => {
    const root = scene.getTransformNodeByName('player-visual')!;
    present(view({ player: { ...view().player, facing: Math.PI - 0.1 } }), 0, true);
    const turning = view({ player: { ...view().player, facing: -Math.PI + 0.1 } });
    present(turning, 0.05, true);
    expect(root.rotation.y).toBeGreaterThan(Math.PI - 0.1);
    expect(root.rotation.y).toBeLessThan(Math.PI);
    present(turning, 0.15, true);
    expect(root.rotation.y).toBeCloseTo(-Math.PI + 0.1);
  });

  it.each([
    { hardwareScaling: 1, alpha: -Math.PI / 2 },
    { hardwareScaling: 0.5, alpha: 0 },
    { hardwareScaling: 2, alpha: Math.PI / 3 },
  ])(
    'picks the same cell at a CSS offset, scaling $hardwareScaling and rotated camera $alpha',
    ({ hardwareScaling, alpha }) => {
      engine.setHardwareScalingLevel(hardwareScaling);
      engine.resize();
      camera.alpha = alpha;
      camera.beta = Math.PI / 3;
      camera.radius = 1500;
      camera.setTarget(Vector3.Zero());
      scene.render();
      expect(canvas.getBoundingClientRect().left).toBe(73);
      expect(canvas.getBoundingClientRect().top).toBe(47);
      const screen = project(new Vector3(300, 0, 300));
      world.selection.pick(screen.x, screen.y);
      expect(world.selection.cell).toEqual({ column: 6, row: 6 });
      expect(scene.getMeshByName('cell-selection')!.position.asArray()).toEqual([300, 1, 300]);

      const blocker = scene.getMeshByName('entity:blocker-1')!;
      const entityScreen = project(blocker.position);
      world.selection.pick(entityScreen.x, entityScreen.y);
      expect(world.selection.entity).toBe('blocker-1');
      world.selection.pick(-100000, -100000);
      expect(world.selection.cell).toBeNull();
      expect(world.selection.entity).toBeNull();
      expect(scene.getMeshByName('cell-selection')!.isEnabled()).toBe(false);
    },
  );

  it('rotates placement feedback around the selected minimum cell and renders accepted footprints once', () => {
    world.selection.cell = { column: 6, row: 6 };
    world.placement.showPreview(true, 0, true);
    const preview = scene.getMeshByName('placement-preview')!;
    expect(preview.position.asArray()).toEqual([400, 60, 300]);
    expect(preview.isEnabled()).toBe(true);
    const material = preview.material as StandardMaterial;
    expect(material.diffuseColor.g).toBeGreaterThan(material.diffuseColor.r);
    world.placement.showPreview(true, 1, false);
    expect(preview.position.asArray()).toEqual([300, 60, 400]);
    expect(preview.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(material.diffuseColor.r).toBeGreaterThan(material.diffuseColor.g);
    const placed = view({
      buildings: [
        {
          id: 'placed-1',
          buildingId: 'test-building',
          cell: world.selection.cell,
          position: { x: 3, y: 0, z: 3 },
          footprint: { width: 2, depth: 1 },
          rotation: 1,
        },
      ],
    });
    present(placed, 0.05, false);
    present(placed, 0.05, false);
    const buildings = scene.meshes.filter((mesh) => mesh.name === 'entity:placed-1');
    expect(buildings).toHaveLength(1);
    expect(buildings[0].position.asArray()).toEqual([300, 60, 400]);
    expect(buildings[0].rotation.y).toBeCloseTo(Math.PI / 2);
    world.selection.cell = null;
    world.placement.showPreview(true, 1, true);
    expect(preview.isEnabled()).toBe(false);
  });

  it('disposes character animation, dynamic meshes and feedback materials with its owner', () => {
    const character = scene.meshes.filter((mesh) => mesh.skeleton);
    const clips = [...scene.animationGroups];
    const ground = scene.getMeshByName('ground')!;
    world.dispose();
    expect(character.every((mesh) => mesh.isDisposed())).toBe(true);
    expect(clips.every((clip) => !scene.animationGroups.includes(clip))).toBe(true);
    expect(scene.getMeshByName('placement-preview')).toBeNull();
    expect(scene.getMeshByName('cell-selection')).toBeNull();
    expect(scene.meshes.some((mesh) => mesh.name.startsWith('entity:'))).toBe(false);
    expect(
      scene.materials.some((material) =>
        ['placement-feedback', 'selection'].includes(material.name),
      ),
    ).toBe(false);
    expect(ground.isDisposed()).toBe(false);
  });

  it('cleans up partially constructed scripts if an authored camera binding is invalid', async () => {
    world.dispose();
    // Babylon defers removal of observers until the current task has finished.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    scene.activeCamera = null;
    const beforeUpdates = scene.onBeforeRenderObservable.observers.length;
    await expect(WorldScene.create(scene, definition)).rejects.toThrow('authored ArcRotateCamera');
    expect(scene.getTransformNodeByName('world-scripts')).toBeNull();
    expect(scene.getTransformNodeByName('player-visual')).toBeNull();
    expect(scene.meshes.some((mesh) => mesh.name.startsWith('entity:'))).toBe(false);
    expect(scene.skeletons).toHaveLength(0);
    expect(scene.animationGroups).toHaveLength(0);
    expect(scene.onBeforeRenderObservable.observers).toHaveLength(beforeUpdates);
  });

  it('fades an obstructing world entity and restores it once the view is clear', () => {
    present(view(), 0.05, false);
    scene.render();
    const blocker = scene.getMeshByName('entity:blocker-1')!;
    const target = new Vector3(100, 85, 100);
    blocker.position.copyFrom(Vector3.Lerp(camera.position, target, 0.5));
    blocker.computeWorldMatrix(true);
    world.camera.follow(0);
    expect(blocker.visibility).toBe(0.25);
    blocker.position.x += 2000;
    blocker.computeWorldMatrix(true);
    world.camera.follow(0);
    expect(blocker.visibility).toBe(1);
    expect(scene.getMeshByName('ground')!.visibility).toBe(1);
  });
});
