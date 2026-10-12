import { AssetContainer } from '@babylonjs/core/assetContainer';
import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import type { GameState } from '@contracts/game-state';
import { loadPlayer } from './assets/load-player';
import { BabylonGameClient } from './babylon-game-client';

describe('BabylonGameClient in the browser', () => {
  let host: HTMLDivElement;
  let client: BabylonGameClient;
  let states: GameState[];
  let loadPlayerFn: ReturnType<typeof vi.fn<typeof loadPlayer>>;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.cssText = 'width: 480px; height: 320px;';
    document.body.append(host);
    loadPlayerFn = vi.fn(loadPlayer);
    client = new BabylonGameClient(host, loadPlayerFn);
    states = [];
    client.subscribe((state) => states.push(state));
  });

  afterEach(() => {
    client.destroy();
    host.remove();
    vi.restoreAllMocks();
  });

  async function waitForMenu() {
    await expect.poll(() => states.at(-1)).toEqual({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    return EngineStore.LastCreatedEngine!;
  }

  function deferModel() {
    let resolve!: (assets: AssetContainer) => void;
    const promise = new Promise<AssetContainer>((complete) => (resolve = complete));
    loadPlayerFn.mockReturnValueOnce(promise);
    return resolve;
  }

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
  });

  it('loads the actual rigged GLB and disposes the previous scene without duplicating the render loop', async () => {
    const engine = await waitForMenu();
    const menu = engine.scenes[0];
    client.setScene('Game');
    client.setScene('Game');
    expect(states.at(-1)).toEqual({ phase: 'loading', sceneKey: 'Game', errorMessage: null });
    expect(menu.isDisposed).toBe(true);
    await expect.poll(() => states.at(-1)?.phase, { timeout: 30000 }).toBe('ready');
    expect(states.at(-1)?.sceneKey).toBe('Game');
    expect(loadPlayerFn).toHaveBeenCalledOnce();
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
    const bounds = scene.getMeshByName('__root__')!.getHierarchyBoundingVectors(true);
    expect(Math.abs(bounds.min.y)).toBeLessThan(0.05);
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(1);
    expect(bounds.max.y - bounds.min.y).toBeLessThan(2);
    expect(scene.cameras).toHaveLength(1);
    expect(scene.lights).toHaveLength(1);
    expect(scene.animationGroups).toHaveLength(0);
  });

  it('reports an asynchronous model failure and can return to the menu', async () => {
    const engine = await waitForMenu();
    loadPlayerFn.mockRejectedValueOnce(new Error('Missing protagonist GLB'));
    client.setScene('Game');
    await expect.poll(() => states.at(-1)).toEqual({ phase: 'error', sceneKey: 'Game', errorMessage: 'Missing protagonist GLB' });
    expect(engine.scenes).toHaveLength(0);
    client.setScene('MainMenu');
    await waitForMenu();
    expect(engine.scenes).toHaveLength(1);
  });

  it('disposes assets that finish loading after the client is destroyed', async () => {
    const engine = await waitForMenu();
    const complete = deferModel();
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

  it('rejects a late model completion from a superseded transition', async () => {
    const engine = await waitForMenu();
    const complete = deferModel();
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
    expect(loadPlayerFn).not.toHaveBeenCalled();
    expect(engine.isDisposed).toBe(true);
    expect(states.at(-1)?.phase).toBe('stopped');
  });
});
