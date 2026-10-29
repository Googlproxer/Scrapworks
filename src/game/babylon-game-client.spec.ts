import { AssetContainer } from '@babylonjs/core/assetContainer';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import { Material } from '@babylonjs/core/Materials/material';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { GameClientOptions, WorldSessionBridge } from '@contracts/game-client';
import type { GameState } from '@contracts/game-state';
import { defaultProfile, type BindingProfile } from '@contracts/input';
import type { WorldView } from '@contracts/world';
import { GameSession } from '../app/features/game/session/game-session';
import { loadEditorScene } from './assets/load-editor-scene';
import { loadCharacter, type CharacterLoader } from './assets/load-character';
import { BabylonGameClient } from './babylon-game-client';
import type { InspectorLoader } from './debug/scene-inspector';
import { InputManager } from './input/input-manager';
import { FrameClock } from './timing/frame-clock';
import { AuthoredWorldFixture } from './testing/authored-world-fixture';
import { CameraController } from './views/camera-controller';
import { PlacementController } from './views/placement-controller';
import { PlayerController } from './views/player-controller';
import { PlayerView } from './views/player-view';
import { SelectionController } from './views/selection-controller';

describe('BabylonGameClient in the browser', () => {
  let fixture: AuthoredWorldFixture;
  let host: HTMLDivElement;
  let client: BabylonGameClient;
  let clients: BabylonGameClient[];
  let states: GameState[];
  let loadSceneFn: ReturnType<typeof vi.fn<typeof loadEditorScene>>;

  beforeAll(async () => {
    fixture = await AuthoredWorldFixture.load();
  }, 30000);

  beforeEach(() => {
    host = document.createElement('div');
    host.style.cssText = 'width: 480px; height: 320px;';
    document.body.append(host);
    clients = [];
    loadSceneFn = vi.fn(async (scene, key) => {
      if (key === 'Game') return fixture.loadScene(scene);
      // Lifecycle checks need a renderable menu, not its authored assets.
      const assets = new AssetContainer(scene);
      const camera = new FreeCamera('test-menu-camera', Vector3.Zero(), scene);
      assets.cameras.push(camera);
      scene.activeCamera = camera;
      return assets;
    });
    states = [];
  });

  afterEach(() => {
    for (const created of clients) created.destroy();
    host.remove();
    vi.restoreAllMocks();
  });

  function startClient(
    options: GameClientOptions = {},
    inspectorLoader?: InspectorLoader,
    characterLoader: CharacterLoader = fixture.loadCharacter,
  ): void {
    client = new BabylonGameClient(host, loadSceneFn, options, inspectorLoader, characterLoader);
    clients.push(client);
    states = [];
    client.subscribe((state) => states.push(state));
  }

  async function waitForMenu() {
    await expect
      .poll(() => states.at(-1), { timeout: 30_000 })
      .toEqual({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    return EngineStore.LastCreatedEngine!;
  }

  it('stops input and frames immediately but waits for Inspector before disposing its scene and engine', async () => {
    let completeCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => (completeCleanup = resolve));
    const disposeInspector = vi.fn(() => cleanup);
    startClient({}, async () => () => ({
      dispose: disposeInspector,
      onClose: () => () => undefined,
    }));
    const engine = await waitForMenu();
    const scene = engine.scenes[0];
    await client.toggleInspector();
    client.destroy();
    expect(disposeInspector).toHaveBeenCalledOnce();
    expect(host.querySelector('canvas')).toBeNull();
    expect(engine.activeRenderLoops).toHaveLength(0);
    expect(scene.isDisposed).toBe(false);
    expect(engine.isDisposed).toBe(false);
    completeCleanup();
    await expect.poll(() => engine.isDisposed).toBe(true);
    expect(scene.isDisposed).toBe(true);
  });

  function deferScene() {
    let resolve!: (assets: AssetContainer) => void;
    const promise = new Promise<AssetContainer>((complete) => (resolve = complete));
    loadSceneFn.mockReturnValueOnce(promise);
    return resolve;
  }

  function observeInputPermission() {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    window.dispatchEvent(new FocusEvent('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    const inputs: InputManager[] = [];
    const original = InputManager.prototype.setViewportActive;
    vi.spyOn(InputManager.prototype, 'setViewportActive').mockImplementation(function (
      this: InputManager,
      active,
    ) {
      inputs.push(this);
      original.call(this, active);
    });
    const canvas = host.querySelector('canvas')!;
    canvas.focus();
    const input = inputs.at(-1)!;
    expect(input).toBeDefined();
    const permissions: boolean[] = [];
    const completed = vi.fn();
    const subscription = input.enabledObs.subscribe({
      next: (enabled) => permissions.push(enabled),
      complete: completed,
    });
    return {
      canvas,
      input,
      completed,
      enabled: () => permissions.at(-1)!,
      unsubscribe: () => subscription.unsubscribe(),
    };
  }

  async function createPlayableWorld(options: Omit<GameClientOptions, 'session'> = {}) {
    let session: GameSession | undefined;
    const currentSession = () => {
      if (!session) throw new Error('World not initialized');
      return session;
    };
    const bridge: WorldSessionBridge = {
      initialize: vi.fn((definition) => {
        session = new GameSession(definition, { developerFixture: true });
      }),
      registerCompletedTickHandler: (handler, order) =>
        currentSession().registerCompletedTickHandler(handler, order),
      frame: vi.fn((seconds, movement, sprint, active) => {
        const current = currentSession();
        current.setPaused(!active);
        current.setMovement(movement, sprint);
        current.advance(seconds);
        return current.view;
      }),
      place: vi.fn((cell, rotation) =>
        currentSession().enqueue({ type: 'place', buildingId: 'test-building', cell, rotation }),
      ),
      preview: vi.fn(() => ({ valid: false, reason: 'unavailable', cells: [] })),
    };
    startClient({
      developerFixture: true,
      ...options,
      session: bridge,
    });
    const observed = observeInputPermission();
    const engine = await waitForMenu();
    client.setScene('Game');
    await expect.poll(() => states.at(-1)?.phase, { timeout: 30000 }).toBe('ready');
    expect(observed.enabled()).toBe(true);
    const render = engine.activeRenderLoops[0];
    engine.stopRenderLoop();
    return { engine, scene: engine.scenes[0], render, bridge, session: currentSession() };
  }

  it('initializes native scripts before ready and shares one sampled frame through ordered update and late hooks', async () => {
    const onActionFrame = vi.fn();
    const onWorldView = vi.fn();
    const { scene, render, bridge } = await createPlayableWorld({ onActionFrame, onWorldView });
    expect(scene.getFrameId()).toBeGreaterThanOrEqual(2);
    const sample = vi.spyOn(InputManager.prototype, 'takeFrame');
    const camera = vi.spyOn(CameraController.prototype, 'controls');
    const player = vi.spyOn(PlayerController.prototype, 'movement');
    const present = vi.spyOn(PlayerView.prototype, 'present');
    const follow = vi.spyOn(CameraController.prototype, 'follow');
    const select = vi.spyOn(SelectionController.prototype, 'pick');
    const preview = vi.spyOn(PlacementController.prototype, 'showPreview');
    const advance = vi.mocked(bridge.frame);
    advance.mockClear();
    onActionFrame.mockClear();
    onWorldView.mockClear();
    render();
    expect(sample).toHaveBeenCalledOnce();
    const input = sample.mock.results[0].value;
    expect(onActionFrame).toHaveBeenCalledExactlyOnceWith(input);
    expect(camera.mock.calls[0][0]).toBe(input);
    expect(player).toHaveBeenCalledExactlyOnceWith(input);
    expect(advance).toHaveBeenCalledOnce();
    expect(onWorldView).toHaveBeenCalledOnce();
    expect(present.mock.calls[0][0]).toBe(onWorldView.mock.calls[0][0]);
    const order = [camera, player, advance, present, follow, select, preview].map(
      (call) => call.mock.invocationCallOrder[0],
    );
    expect(order.every((value) => value !== undefined)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  }, 45000);

  it('aborts later scripts and drawing when a tick callback transfers gameplay ownership', async () => {
    const { scene, render, session } = await createPlayableWorld();
    const before = session.view;
    const later = vi.fn();
    session.registerCompletedTickHandler(() => client.setInputEnabled(false), -1);
    session.registerCompletedTickHandler(later);
    const present = vi.spyOn(PlayerView.prototype, 'present');
    const follow = vi.spyOn(CameraController.prototype, 'follow');
    const select = vi.spyOn(SelectionController.prototype, 'pick');
    const afterRender = vi.fn();
    scene.onAfterRenderObservable.add(afterRender);
    vi.spyOn(FrameClock.prototype, 'sample').mockReturnValue(0.1);
    render();
    expect(later).not.toHaveBeenCalled();
    expect(session.view.tick).toBe(before.tick + 2);
    expect(present).not.toHaveBeenCalled();
    expect(follow).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(afterRender).not.toHaveBeenCalled();
    expect(states.at(-1)?.phase).toBe('ready');
    expect(scene.isDisposed).toBe(false);
    expect(session.failed).toBe(false);
  }, 45000);

  it('stops the old scene render when publication synchronously replaces that scene', async () => {
    let replaceScene = false;
    const { scene, render } = await createPlayableWorld({
      onWorldView: () => {
        if (!replaceScene) return;
        replaceScene = false;
        client.setScene('MainMenu');
      },
    });
    const present = vi.spyOn(PlayerView.prototype, 'present');
    const afterRender = vi.fn();
    scene.onAfterRenderObservable.add(afterRender);
    replaceScene = true;
    render();
    expect(scene.isDisposed).toBe(true);
    expect(present).not.toHaveBeenCalled();
    expect(afterRender).not.toHaveBeenCalled();
    expect(states.at(-1)?.phase).not.toBe('error');
    expect(states.at(-1)?.sceneKey).toBe('MainMenu');
  }, 45000);

  it('keeps the final scene transition when every completed-view publication requests the menu', async () => {
    const clock = vi.spyOn(FrameClock.prototype, 'sample').mockReturnValue(0);
    const onWorldView = vi.fn((view: WorldView) => {
      if (view.tick > 0) client.setScene('MainMenu');
    });
    const { engine, scene, render, session } = await createPlayableWorld({ onWorldView });
    const loads = loadSceneFn.mock.calls.length;
    onWorldView.mockClear();
    clock.mockReturnValue(0.05);

    expect(() => render()).not.toThrow();

    expect(session.view.tick).toBe(1);
    expect(onWorldView).toHaveBeenCalledTimes(2);
    expect(scene.isDisposed).toBe(true);
    expect(loadSceneFn).toHaveBeenCalledTimes(loads + 1);
    expect(loadSceneFn.mock.lastCall?.[1]).toBe('MainMenu');
    expect(states.some((state) => state.phase === 'error')).toBe(false);
    engine.runRenderLoop(render);
    await waitForMenu();
    expect(engine.scenes).toHaveLength(1);
    expect(engine.scenes[0]).not.toBe(scene);
    expect(loadSceneFn).toHaveBeenCalledTimes(loads + 1);
  }, 45000);

  it('keeps gameplay suspended when every completed-view publication requests UI input', async () => {
    const clock = vi.spyOn(FrameClock.prototype, 'sample').mockReturnValue(0);
    const onWorldView = vi.fn((view: WorldView) => {
      if (view.tick > 0) client.input.setContext('ui');
    });
    const { scene, render, bridge, session } = await createPlayableWorld({ onWorldView });
    onWorldView.mockClear();
    clock.mockReturnValue(0.05);

    expect(() => render()).not.toThrow();

    expect(onWorldView).toHaveBeenCalledTimes(2);
    expect(session.view.tick).toBe(1);
    const sample = vi.spyOn(InputManager.prototype, 'takeFrame');
    vi.mocked(bridge.frame).mockClear();
    clock.mockReturnValue(0.25);
    expect(() => render()).not.toThrow();
    expect(sample.mock.lastCall).toBeDefined();
    expect(sample.mock.results[0].value.context).toBe('ui');
    expect(vi.mocked(bridge.frame).mock.calls.every(([, , , active]) => !active)).toBe(true);
    expect(session.view.tick).toBe(1);
    expect(session.failed).toBe(false);
    expect(scene.isDisposed).toBe(false);
    expect(states.at(-1)).toEqual({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    expect(states.some((state) => state.phase === 'error')).toBe(false);
  }, 45000);

  it('reports a publication error without publishing it again during error teardown', async () => {
    const clock = vi.spyOn(FrameClock.prototype, 'sample').mockReturnValue(0);
    const onWorldView = vi.fn((view: WorldView) => {
      if (view.tick > 0) throw new Error('World publication failed');
    });
    const { scene, render, session } = await createPlayableWorld({ onWorldView });
    onWorldView.mockClear();
    clock.mockReturnValue(0.05);

    expect(() => render()).not.toThrow();

    expect(onWorldView).toHaveBeenCalledOnce();
    expect(states.at(-1)).toEqual({
      phase: 'error',
      sceneKey: 'Game',
      errorMessage: 'World publication failed',
    });
    expect(scene.isDisposed).toBe(true);
    expect(session.failed).toBe(false);
    expect(session.view.tick).toBe(1);
  }, 45000);

  it('reports tick errors and disposes the scene while retaining the last completed view for suspension', async () => {
    const { scene, render, session } = await createPlayableWorld();
    const before = session.view;
    session.registerCompletedTickHandler(() => {
      throw new Error('Presentation script failed');
    });
    const present = vi.spyOn(PlayerView.prototype, 'present');
    vi.spyOn(FrameClock.prototype, 'sample').mockReturnValue(0.1);
    render();
    expect(states.at(-1)).toEqual({
      phase: 'error',
      sceneKey: 'Game',
      errorMessage: 'Presentation script failed',
    });
    expect(session.failed).toBe(true);
    expect(session.view.tick).toBe(before.tick + 2);
    expect(session.view.player.position).toEqual(before.player.position);
    expect(scene.isDisposed).toBe(true);
    expect(present).not.toHaveBeenCalled();
  }, 45000);

  it('withholds gameplay input permission in the menu, during loading and after scene errors', async () => {
    startClient();
    const observed = observeInputPermission();
    try {
      await waitForMenu();
      expect(observed.enabled()).toBe(false);
      loadSceneFn.mockRejectedValueOnce(new Error('Input ownership load failure'));
      client.setScene('Game');
      expect(states.at(-1)?.phase).toBe('loading');
      expect(observed.enabled()).toBe(false);
      await expect.poll(() => states.at(-1)?.phase).toBe('error');
      expect(observed.enabled()).toBe(false);
      client.setScene('MainMenu');
      await waitForMenu();
      expect(observed.enabled()).toBe(false);
    } finally {
      observed.unsubscribe();
    }
  });

  it('updates gameplay input permission on resize, blur and destruction while preserving UI blocking', async () => {
    startClient();
    // Physical bindings and action transitions are tested in input/capture and
    // input/evaluator. This boundary verifies the client's ownership signal.
    const observed = observeInputPermission();
    const button = document.createElement('button');
    document.body.append(button);
    try {
      const engine = await waitForMenu();
      client.setScene('Game');
      await expect.poll(() => states.at(-1)?.phase, { timeout: 30000 }).toBe('ready');
      expect(observed.enabled()).toBe(true);
      expect(observed.canvas.tabIndex).toBe(0);
      client.setInputEnabled(false);
      expect(observed.enabled()).toBe(false);

      const scene = engine.scenes[0];
      const frame = scene.getFrameId();
      await expect.poll(() => scene.getFrameId()).toBeGreaterThan(frame);
      host.style.width = '0px';
      await expect.poll(() => states.at(-1)?.phase).toBe('paused');
      expect(observed.enabled()).toBe(false);
      client.setScene('Game');
      expect(engine.scenes[0]).toBe(scene);
      expect(scene.isDisposed).toBe(false);
      expect(loadSceneFn).toHaveBeenCalledTimes(2);
      host.style.width = '480px';
      await expect.poll(() => states.at(-1)?.phase).toBe('ready');
      expect(engine.scenes[0]).toBe(scene);
      expect(observed.enabled()).toBe(false);

      client.setInputEnabled(true);
      expect(observed.enabled()).toBe(true);
      button.focus();
      expect(observed.enabled()).toBe(false);
      observed.canvas.focus();
      expect(observed.enabled()).toBe(true);
      expect(observed.canvas.tabIndex).toBe(0);

      client.destroy();
      expect(observed.enabled()).toBe(false);
      expect(observed.completed).toHaveBeenCalledOnce();
    } finally {
      observed.unsubscribe();
      button.remove();
    }
  }, 45000);

  it('publishes ready after a first frame and resizes the renderer with its host', async () => {
    startClient();
    expect(states.at(-1)?.phase).toBe('loading');
    const engine = await waitForMenu();
    expect(engine.scenes[0].getFrameId()).toBeGreaterThan(0);
    expect(engine.activeRenderLoops).toHaveLength(1);
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    host.style.width = '320px';
    host.style.height = '240px';
    await expect.poll(() => engine.getRenderWidth()).toBe(320);
    await expect.poll(() => engine.getRenderHeight()).toBe(240);
    const renderCallback = engine.activeRenderLoops[0];
    const stopRenderLoop = vi.spyOn(engine, 'stopRenderLoop');
    client.destroy();
    expect(stopRenderLoop).toHaveBeenCalledWith(renderCallback);
  });

  it('defers every frame while a scene prepares hidden and resumes the same scene once visible', async () => {
    startClient();
    const engine = await waitForMenu();
    const hidden = vi.spyOn(document, 'hidden', 'get');
    try {
      hidden.mockReturnValue(true);
      document.dispatchEvent(new Event('visibilitychange'));
      client.setScene('Game');
      await expect.poll(() => states.at(-1)?.phase, { timeout: 30000 }).toBe('paused');
      const scene = engine.scenes[0];
      expect(scene.getFrameId()).toBe(0);
      expect(states.at(-1)?.sceneKey).toBe('Game');

      hidden.mockReturnValue(false);
      document.dispatchEvent(new Event('visibilitychange'));
      await expect.poll(() => states.at(-1)?.phase).toBe('ready');
      expect(engine.scenes[0] === scene).toBe(true);
      expect(scene.getFrameId()).toBeGreaterThan(0);
      expect(loadSceneFn).toHaveBeenCalledTimes(2);
      expect(engine.activeRenderLoops).toHaveLength(1);
    } finally {
      hidden.mockRestore();
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });

  it('deserializes a GridMaterial and renders it with the authored menu camera', async () => {
    loadSceneFn.mockImplementation(loadEditorScene);
    startClient();
    const engine = await waitForMenu();
    const scene = engine.scenes[0];
    // Do not import GridMaterial in the test: that would register the missing
    // class and mask a regression in the runtime's serialized-type imports.
    const material = Material.Parse(
      {
        customType: 'BABYLON.GridMaterial',
        id: 'grid-regression',
        name: 'grid-regression',
        gridRatio: 100,
        lineColor: [0, 1, 0],
      },
      scene,
      '',
    );
    expect(material?.getClassName()).toBe('GridMaterial');
    expect(material).toMatchObject({ gridRatio: 100, lineColor: { r: 0, g: 1, b: 0 } });
    scene.getMeshByName('ground')!.material = material;
    await scene.whenReadyAsync();
    const previousFrame = scene.getFrameId();
    scene.render();
    expect(scene.getFrameId()).toBeGreaterThan(previousFrame);
    expect(scene.activeCamera?.getClassName()).toBe('UniversalCamera');
    expect(states.at(-1)?.phase).toBe('ready');
  });

  it('keeps the menu scene free of the title now owned by Angular', async () => {
    loadSceneFn.mockImplementation(loadEditorScene);
    startClient();
    const engine = await waitForMenu();
    const scene = engine.scenes[0];
    expect(scene.getMeshByName('title')).toBeNull();
    expect(scene.textures.some((texture) => texture.name.includes('title-logo'))).toBe(false);
    expect(scene.getMeshByName('ground')).not.toBeNull();
  });

  it('loads the authored Game scene and rig and disposes the menu without duplicating the render loop', async () => {
    loadSceneFn.mockImplementation(loadEditorScene);
    startClient({}, undefined, loadCharacter);
    const engine = await waitForMenu();
    const menu = engine.scenes[0];
    client.setScene('Game');
    client.setScene('Game');
    expect(states.at(-1)).toEqual({ phase: 'loading', sceneKey: 'Game', errorMessage: null });
    expect(menu.isDisposed).toBe(true);
    await expect.poll(() => states.at(-1)?.phase, { timeout: 30000 }).toBe('ready');
    expect(states.at(-1)?.sceneKey).toBe('Game');
    expect(loadSceneFn).toHaveBeenCalledTimes(2);
    expect(engine.activeRenderLoops).toHaveLength(1);
    expect(engine.scenes).toHaveLength(1);
    const scene = engine.scenes[0];
    expect(scene.getFrameId()).toBeGreaterThan(0);
    expect(scene.getMeshByName('ground')).toBeTruthy();
    expect(scene.getMeshByName('player-placeholder')).toBeTruthy();
    expect(scene.getMeshByName('obstacle')).toBeTruthy();
    expect(scene.skeletons).toHaveLength(1);
    expect(scene.skeletons[0].bones).toHaveLength(52);
    const skinnedMeshes = scene.meshes.filter((mesh) => mesh.skeleton);
    expect(skinnedMeshes).toHaveLength(10);
    expect(skinnedMeshes.every((mesh) => mesh.isVerticesDataPresent('matricesWeights'))).toBe(true);
    expect(scene.getMeshByName('Protag-v1.glb')).toBeNull();
    const root = scene.getTransformNodeByName('player-visual')!;
    expect(root.scaling.asArray()).toEqual([100, 100, 100]);
    const bounds = root.getHierarchyBoundingVectors(true);
    expect(Math.abs(bounds.min.y)).toBeLessThan(5);
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(100);
    expect(bounds.max.y - bounds.min.y).toBeLessThan(200);
    expect(scene.getMeshByName('entity:blocker-1')!.position.asArray()).toEqual([300, 75, -100]);
    expect(scene.cameras).toHaveLength(1);
    expect(
      scene.lights.filter((light) => light.getClassName() === 'HemisphericLight'),
    ).toHaveLength(1);
    expect(scene.animationGroups.map((animation) => animation.name).sort()).toEqual([
      'Idle',
      'Run',
      'TurnLeft',
      'TurnRight',
      'Walk',
    ]);
    expect(
      scene.animationGroups.every((animation) => animation.targetedAnimations.length > 0),
    ).toBe(true);
  });

  it('reports an asynchronous scene failure and can return to the menu', async () => {
    startClient();
    const engine = await waitForMenu();
    loadSceneFn.mockRejectedValueOnce(new Error('Missing authored scene'));
    client.setScene('Game');
    await expect
      .poll(() => states.at(-1))
      .toEqual({ phase: 'error', sceneKey: 'Game', errorMessage: 'Missing authored scene' });
    expect(engine.scenes).toHaveLength(0);
    client.setScene('MainMenu');
    await waitForMenu();
    expect(engine.scenes).toHaveLength(1);
  });

  it('reports character load failures and disposes the partially prepared scene', async () => {
    const characterLoader = vi
      .fn<CharacterLoader>()
      .mockRejectedValue(new Error('Missing character'));
    startClient({}, undefined, characterLoader);
    const engine = await waitForMenu();
    client.setScene('Game');
    await expect
      .poll(() => states.at(-1))
      .toEqual({
        phase: 'error',
        sceneKey: 'Game',
        errorMessage: 'Missing character',
      });
    expect(characterLoader).toHaveBeenCalledOnce();
    expect(engine.scenes).toHaveLength(0);
    client.setScene('MainMenu');
    await waitForMenu();
    expect(engine.scenes).toHaveLength(1);
  });

  it('disposes a character that finishes loading after its client is destroyed', async () => {
    let complete!: (assets: AssetContainer) => void;
    const pending = new Promise<AssetContainer>((resolve) => (complete = resolve));
    const characterLoader = vi.fn<CharacterLoader>(() => pending);
    startClient({}, undefined, characterLoader);
    const engine = await waitForMenu();
    client.setScene('Game');
    await expect.poll(() => characterLoader.mock.calls.length).toBe(1);
    const scene = engine.scenes[0];
    const assets = await fixture.loadCharacter(scene);
    const dispose = vi.spyOn(assets, 'dispose');
    client.destroy();
    dispose.mockClear(); // Scene disposal may already release unattached assets.
    complete(assets);
    await expect.poll(() => dispose.mock.calls.length).toBe(1);
    expect(scene.isDisposed).toBe(true);
    expect(engine.isDisposed).toBe(true);
    expect(states.at(-1)?.phase).toBe('stopped');
  });

  it('disposes assets that finish loading after the client is destroyed', async () => {
    startClient();
    const engine = await waitForMenu();
    const complete = deferScene();
    client.setScene('Game');
    const scene = engine.scenes[0];
    const assets = new AssetContainer(scene);
    const dispose = vi.spyOn(assets, 'dispose');
    client.destroy();
    client.destroy();
    // Babylon also disposes unattached containers with their scene.
    dispose.mockClear();
    complete(assets);
    await expect.poll(() => dispose.mock.calls.length).toBe(1);
    expect(scene.isDisposed).toBe(true);
    expect(engine.isDisposed).toBe(true);
    expect(engine.activeRenderLoops).toHaveLength(0);
    expect(host.querySelector('canvas')).toBeNull();
    expect(states.at(-1)).toEqual({ phase: 'stopped', sceneKey: null, errorMessage: null });
    const lateListener = vi.fn();
    client.subscribe(lateListener)();
    expect(lateListener).toHaveBeenCalledExactlyOnceWith(states.at(-1));
    client.setScene('Game');
    expect(host.querySelector('canvas')).toBeNull();
  });

  it('rejects a late scene completion from a superseded transition', async () => {
    startClient();
    const engine = await waitForMenu();
    const complete = deferScene();
    client.setScene('Game');
    const assets = new AssetContainer(engine.scenes[0]);
    const dispose = vi.spyOn(assets, 'dispose');
    client.setScene('MainMenu');
    await waitForMenu();
    dispose.mockClear();
    complete(assets);
    await expect.poll(() => dispose.mock.calls.length).toBe(1);
    expect(states.at(-1)?.sceneKey).toBe('MainMenu');
    expect(engine.scenes).toHaveLength(1);
    expect(engine.scenes[0].isDisposed).toBe(false);
  });

  it('does not construct a scene if a subscriber destroys the client during loading', async () => {
    startClient();
    const engine = await waitForMenu();
    client.subscribe((state) => {
      if (state.phase === 'loading') client.destroy();
    });
    client.setScene('Game');
    expect(loadSceneFn).toHaveBeenCalledOnce(); // Only the initial menu.
    expect(engine.isDisposed).toBe(true);
    expect(states.at(-1)?.phase).toBe('stopped');
  });

  it('stops the renderer on context loss, keeps UI polling alive, and disposes recovery on remount', async () => {
    const onActionFrame = vi.fn();
    startClient({ onActionFrame });
    const engine = await waitForMenu();
    const scene = engine.scenes[0];
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame');
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');
    engine.onContextLostObservable.notifyObservers(engine);
    expect(states.at(-1)).toEqual({
      phase: 'error',
      sceneKey: 'MainMenu',
      errorMessage: 'Graphics context was lost. Choose Retry to restore the 3D viewport.',
    });
    expect(engine.activeRenderLoops).toHaveLength(0);
    expect(scene.isDisposed).toBe(true);
    const priorFrames = onActionFrame.mock.calls.length;
    await expect.poll(() => onActionFrame.mock.calls.length).toBeGreaterThan(priorFrames);
    expect(onActionFrame.mock.lastCall?.[0].context).toBe('ui');
    const priorLoads = loadSceneFn.mock.calls.length;
    client.setScene('MainMenu');
    expect(loadSceneFn).toHaveBeenCalledTimes(priorLoads);
    const recoveryHandle = requestFrame.mock.results.at(-1)?.value;
    client.destroy();
    expect(cancelFrame).toHaveBeenCalledWith(recoveryHandle);
    expect(engine.isDisposed).toBe(true);
    expect(host.querySelector('canvas')).toBeNull();

    // The page's Retry action constructs a fresh client; the damaged instance
    // cannot silently reuse its lost WebGL context.
    startClient();
    const replacement = await waitForMenu();
    expect(replacement).not.toBe(engine);
    expect(replacement.activeRenderLoops).toHaveLength(1);
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('releases shared document activity only after the final viewport is destroyed', async () => {
    const baselineEngines = EngineStore.Instances.length;
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    startClient();
    await waitForMenu();
    const visibilityListener = add.mock.calls.find(([name]) => name === 'visibilitychange')?.[1];
    expect(visibilityListener).toBeDefined();
    const otherHost = document.createElement('div');
    otherHost.style.cssText = 'width:320px;height:240px';
    document.body.append(otherHost);
    const other = new BabylonGameClient(otherHost, loadSceneFn);
    try {
      expect(add.mock.calls.filter(([name]) => name === 'visibilitychange')).toHaveLength(1);
      expect(EngineStore.Instances).toHaveLength(baselineEngines + 2);
      client.destroy();
      expect(
        remove.mock.calls.some(
          ([name, callback]) => name === 'visibilitychange' && callback === visibilityListener,
        ),
      ).toBe(false);
      other.destroy();
      other.destroy();
      expect(
        remove.mock.calls.filter(
          ([name, callback]) => name === 'visibilitychange' && callback === visibilityListener,
        ),
      ).toHaveLength(1);
      expect(EngineStore.Instances).toHaveLength(baselineEngines);
      expect(otherHost.querySelector('canvas')).toBeNull();
    } finally {
      other.destroy();
      otherHost.remove();
    }
  });

  it('cleans up an engine and its canvas if input construction fails', async () => {
    startClient();
    await waitForMenu();
    const initialEngines = [...EngineStore.Instances];
    const failedHost = document.createElement('div');
    document.body.append(failedHost);
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const bindings = { ...defaultProfile, schemaVersion: 2 } as unknown as BindingProfile;
    try {
      expect(() => new BabylonGameClient(failedHost, loadSceneFn, { bindings })).toThrow(
        'Unsupported control profile',
      );
      expect(failedHost.querySelector('canvas')).toBeNull();
      expect(EngineStore.Instances).toEqual(initialEngines);
      client.destroy();
      expect(
        removeListener.mock.calls.filter(([name]) => name === 'visibilitychange'),
      ).toHaveLength(1);
    } finally {
      failedHost.remove();
    }
  });
});
