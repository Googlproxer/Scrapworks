import { AssetContainer } from '@babylonjs/core/assetContainer';
import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import { Material } from '@babylonjs/core/Materials/material';
import type { GameState } from '@contracts/game-state';
import { loadEditorScene } from './assets/load-editor-scene';
import { BabylonGameClient } from './babylon-game-client';
import { InputManager } from './input/input-manager';

describe('BabylonGameClient in the browser', () => {
  let host: HTMLDivElement;
  let client: BabylonGameClient;
  let states: GameState[];
  let loadSceneFn: ReturnType<typeof vi.fn<typeof loadEditorScene>>;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.cssText = 'width: 480px; height: 320px;';
    document.body.append(host);
    loadSceneFn = vi.fn(loadEditorScene);
    client = new BabylonGameClient(host, loadSceneFn);
    states = [];
    client.subscribe((state) => states.push(state));
  });

  afterEach(() => {
    client.destroy();
    host.remove();
    vi.restoreAllMocks();
  });

  async function waitForMenu() {
    await expect
      .poll(() => states.at(-1))
      .toEqual({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    return EngineStore.LastCreatedEngine!;
  }

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

  it('withholds gameplay input permission in the menu, during loading and after scene errors', async () => {
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
      client.setInputEnabled(false);
      expect(observed.enabled()).toBe(false);

      const scene = engine.scenes[0];
      const frame = scene.getFrameId();
      await expect.poll(() => scene.getFrameId()).toBeGreaterThan(frame);
      host.style.width = '0px';
      await expect.poll(() => states.at(-1)?.phase).toBe('paused');
      expect(observed.enabled()).toBe(false);
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

      client.destroy();
      expect(observed.enabled()).toBe(false);
      expect(observed.completed).toHaveBeenCalledOnce();
    } finally {
      observed.unsubscribe();
      button.remove();
    }
  }, 45000);

  it('publishes ready after a first frame and resizes the renderer with its host', async () => {
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

  it('loads the packaged logo as an opaque cutout instead of a fallback texture', async () => {
    const engine = await waitForMenu();
    const material = engine.scenes[0].getMeshByName('title')!.material!;
    expect(material.needAlphaBlending()).toBe(false);
    expect(material.needAlphaTesting()).toBe(true);
    const texture = material.getAlphaTestTexture()!;
    expect(texture.hasAlpha).toBe(true);
    expect(texture.name).toContain('assets/textures/branding/title-logo-v1.png');
    // A failed-image checker can still report ready. Inspect the uploaded image
    // to prove the actual PNG, with both transparent and solid pixels, loaded.
    const pixels = await texture.readPixels();
    expect(pixels).not.toBeNull();
    const rgba = new Uint8Array(pixels!.buffer, pixels!.byteOffset, pixels!.byteLength);
    let solid = 0;
    let transparent = 0;
    for (let index = 3; index < rgba.length; index += 4) {
      if (rgba[index] >= 128) ++solid;
      if (rgba[index] === 0) ++transparent;
    }
    expect(solid).toBeGreaterThan(0);
    expect(transparent).toBeGreaterThan(0);
  });

  it('loads the authored Game scene and rig and disposes the menu without duplicating the render loop', async () => {
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
    expect(scene.skeletons[0].bones.length).toBeGreaterThan(0);
    const skinnedMeshes = scene.meshes.filter((mesh) => mesh.skeleton);
    expect(skinnedMeshes).toHaveLength(10);
    expect(skinnedMeshes.every((mesh) => mesh.isVerticesDataPresent('matricesWeights'))).toBe(true);
    const bounds = scene.getMeshByName('Protag-v1.glb')!.getHierarchyBoundingVectors(true);
    expect(Math.abs(bounds.min.y)).toBeLessThan(5);
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(100);
    expect(bounds.max.y - bounds.min.y).toBeLessThan(200);
    expect(scene.getMeshByName('obstacle')!.position.asArray()).toEqual([300, 75, 0]);
    expect(scene.cameras).toHaveLength(1);
    expect(
      scene.lights.filter((light) => light.getClassName() === 'HemisphericLight'),
    ).toHaveLength(1);
    expect(scene.animationGroups).toHaveLength(0);
  });

  it('reports an asynchronous scene failure and can return to the menu', async () => {
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

  it('disposes assets that finish loading after the client is destroyed', async () => {
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
    const engine = await waitForMenu();
    client.subscribe((state) => {
      if (state.phase === 'loading') client.destroy();
    });
    client.setScene('Game');
    expect(loadSceneFn).toHaveBeenCalledOnce(); // Only the initial menu.
    expect(engine.isDisposed).toBe(true);
    expect(states.at(-1)?.phase).toBe('stopped');
  });
});
