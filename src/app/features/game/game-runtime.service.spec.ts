import { saveFixture } from '../../../../tests/support/save-fixture.ts';
import { clientNotifications } from '../../../testing/game-ports';
import '../../../testing/readonly-contracts';
import { finalize } from 'rxjs';
import type { WorldSessionBridge } from '@contracts/game-client';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expectConsoleMessage } from '../../../testing/console-policy';
import type { GameClient, GameClientOptions } from '@game/client-api';
import {
  defaultProfile,
  type ActionFrame,
  type BindingProfile,
  type ButtonControl,
  type ControllerInfo,
} from '@contracts/input';
import type { WorldDefinition } from '@contracts/world';
import { ControlSettingsService } from '../controls/control-settings.service';
import { GameSession } from '../../../session/game-session';
import { InlineSimulationPort } from '../../../../tools/testing/inline-simulation-port';
import { SIMULATION_PORT_FACTORY } from './simulation-port-factory';
import type { GameState } from '@contracts/game-state';
import { GAME_CLIENT_LOADER, type GameClientLoader } from './game-client-factory';
import { GameRuntimeService } from './game-runtime.service';
import { AFTER_PAINT, type AfterPaint } from '../../shared/loading/after-paint';
import { GameSessionOwner } from './game-session-owner';
import type { SaveSnapshot } from '@contracts/save';

describe('GameRuntimeService', () => {
  function createClient(connected: readonly ControllerInfo[] = []) {
    const notices = clientNotifications();
    const unsubscribe = vi.fn();
    const destroy = vi.fn();
    const setScene = vi.fn();
    const setInputEnabled = vi.fn<(on: boolean) => void>();
    let controllersListener: ((controllers: readonly ControllerInfo[]) => void) | undefined;
    let captureListener: ((control: ButtonControl) => void) | undefined;
    const unsubscribeControllers = vi.fn();
    const stopCapture = vi.fn();
    const input = {
      setContext: vi.fn(),
      updateBindings: vi.fn(),
      selectController: vi.fn(() => true),
      subscribeControllers: vi.fn((callback: (controllers: readonly ControllerInfo[]) => void) => {
        controllersListener = callback;
        callback(connected);
        return unsubscribeControllers;
      }),
      captureBinding: vi.fn((callback: (control: ButtonControl) => void) => {
        captureListener = callback;
        return stopCapture;
      }),
      handleUiKeyboard: vi.fn(() => false),
      handleUiPointer: vi.fn(() => false),
      focus: vi.fn(),
    };
    const client: GameClient = {
      input,
      ...notices,
      state$: notices.state$.pipe(finalize(unsubscribe)),
      toggleInspector: vi.fn(async () => undefined),
      destroy,
      setScene,
      setInputEnabled,
      setDebugDrawSettings: vi.fn(),
    };
    return {
      client,
      notices,
      input,
      unsubscribeControllers,
      stopCapture,
      emitControllers: (controllers: readonly ControllerInfo[]) =>
        controllersListener?.(controllers),
      emitCapture: (control: ButtonControl) => captureListener?.(control),
      unsubscribe,
      destroy,
      setScene,
      setInputEnabled,
      emit: (state: GameState) => notices.state$.next(state),
    };
  }

  let factory: ReturnType<
    typeof vi.fn<(host: HTMLElement, options?: GameClientOptions) => GameClient>
  >;
  let service: GameRuntimeService;
  let loader: ReturnType<typeof vi.fn<GameClientLoader>>;
  let paint: ReturnType<typeof vi.fn<AfterPaint>>;
  let settings: { profile: ReturnType<typeof signal<BindingProfile>> };

  beforeEach(() => {
    factory = vi.fn<(host: HTMLElement, options?: GameClientOptions) => GameClient>();
    loader = vi.fn(async () => factory);
    paint = vi.fn((work) => {
      work();
      return () => undefined;
    });
    settings = { profile: signal<BindingProfile>(structuredClone(defaultProfile)) };
    TestBed.configureTestingModule({
      providers: [
        GameRuntimeService,
        { provide: SIMULATION_PORT_FACTORY, useValue: () => new InlineSimulationPort() },
        { provide: GAME_CLIENT_LOADER, useValue: loader },
        { provide: AFTER_PAINT, useValue: paint },
        { provide: ControlSettingsService, useValue: settings },
      ],
    });
    service = TestBed.inject(GameRuntimeService);
  });

  it('waits for paint before importing and cancels a pending mount', () => {
    let painted: (() => void) | undefined;
    const cancel = vi.fn();
    paint.mockImplementationOnce((work) => {
      painted = work;
      return cancel;
    });
    const host = document.createElement('div');
    service.mount(host);
    service.mount(host);
    expect(service.isBusy()).toBe(true);
    expect(paint).toHaveBeenCalledOnce();
    expect(loader).not.toHaveBeenCalled();
    service.unmount();
    painted?.();
    expect(cancel).toHaveBeenCalledOnce();
    expect(loader).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });

  it('does not construct a superseded renderer when its module finishes importing', async () => {
    const oldFactory = vi.fn(() => createClient().client);
    let finish: ((value: typeof factory) => void) | undefined;
    loader.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    service.mount(document.createElement('div'));
    factory.mockReturnValue(createClient().client);
    await mount(document.createElement('div'));
    finish?.(oldFactory);
    await Promise.resolve();
    expect(oldFactory).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledOnce();
  });

  it('reports module import failures and retries the loader', async () => {
    const error = new Error('Renderer module unavailable');
    expectConsoleMessage('error', error);
    loader.mockRejectedValueOnce(error);
    await mount(document.createElement('div'));
    expect(service.errorMessage()).toBe(error.message);
    expect(service.isBusy()).toBe(false);
    factory.mockReturnValue(createClient().client);
    await retry();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenCalledOnce();
  });

  it('keeps progress independent of input and covers a pause before the first ready frame', async () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    await mount(document.createElement('div'));
    game.input.setContext.mockClear();
    const state = service.state();
    game.notices.loading$.next({ task: 'Loading scene assets…', progress: 0.5 });
    expect(service.loading()?.progress).toBe(0.5);
    expect(service.state()).toBe(state);
    expect(game.input.setContext).not.toHaveBeenCalled();
    game.emit({ phase: 'paused', sceneKey: 'MainMenu', errorMessage: null });
    expect(service.isBusy()).toBe(true);
    game.notices.loading$.next(null);
    expect(service.isBusy()).toBe(true);
    game.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    expect(service.loading()).toBeNull();
  });

  it('covers a transition before dispatching and ignores the previous scene readiness', async () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    await mount(document.createElement('div'));
    game.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    let painted: (() => void) | undefined;
    paint.mockImplementationOnce((work) => {
      painted = work;
      return () => undefined;
    });
    service.setScene('Game');
    expect(service.isLoading()).toBe(true);
    expect(game.input.setContext).toHaveBeenLastCalledWith('ui');
    expect(game.setScene).not.toHaveBeenCalled();
    game.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    expect(service.isLoading()).toBe(true);
    service.setScene('Game');
    painted?.();
    expect(game.setScene).toHaveBeenCalledExactlyOnceWith('Game');
    game.notices.loading$.next({ task: 'Loading character…', progress: 1 });
    expect(service.isBusy()).toBe(true);
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    expect(service.isBusy()).toBe(false);
  });

  it('cancels a queued scene change if the old viewport fails before it can paint', async () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    await mount(document.createElement('div'));
    game.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    let painted: (() => void) | undefined;
    paint.mockImplementationOnce((work) => {
      painted = work;
      return () => undefined;
    });
    service.setScene('Game');
    game.emit({ phase: 'error', sceneKey: 'MainMenu', errorMessage: 'Graphics context lost' });
    expect(service.errorMessage()).toBe('Graphics context lost');
    expect(service.isBusy()).toBe(false);
    painted?.();
    expect(game.setScene).not.toHaveBeenCalled();
  });

  it('retains debug preferences through renderer Retry without advancing or unpausing the session', async () => {
    const game = createClient();
    factory.mockReturnValueOnce(game.client).mockReturnValue(createClient().client);
    const host = document.createElement('div');
    await mount(host);
    const first = factory.mock.calls[0][1]!;
    notifications(first).debugDrawStatus$.next({
      available: true,
      categories: ['collision', 'placement'],
    });
    game.setInputEnabled.mockClear();
    service.setDebugDrawEnabled(true);
    service.setDebugDrawCategory('collision', false);
    expect(game.client.setDebugDrawSettings).toHaveBeenLastCalledWith({
      enabled: true,
      disabledCategories: ['collision'],
    });
    expect(game.setInputEnabled).not.toHaveBeenCalled();
    game.emit({ phase: 'error', sceneKey: 'Game', errorMessage: 'Renderer probe' });
    await retry();
    expect(factory.mock.calls[1][1]!.debugDrawSettings).toEqual({
      enabled: true,
      disabledCategories: ['collision'],
    });
    notifications(first).debugDrawStatus$.next({ available: true, categories: ['stale'] });
    expect(service.debugDrawStatus().categories).not.toContain('stale');
    service.setDebugDrawCategory('collision', true);
    expect(service.debugDrawSettings().disabledCategories).toEqual([]);
  });

  it('starts idle and projects loading, ready, and error states into readonly signals', async () => {
    expect(service.state()).toEqual({ phase: 'idle', sceneKey: null, errorMessage: null });
    expect(service.isReady()).toBe(false);
    const game = createClient();
    factory.mockReturnValue(game.client);
    await mount(document.createElement('div'));
    expect(service.isLoading()).toBe(true);
    expect(service.currentSceneKey()).toBe('MainMenu');
    game.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    expect(service.isReady()).toBe(true);
    game.emit({ phase: 'error', sceneKey: 'Game', errorMessage: 'Failed asset' });
    expect(service.errorMessage()).toBe('Failed asset');
    expect(service.isReady()).toBe(false);
  });

  it('makes repeated mounts on the same host harmless', async () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    const host = document.createElement('div');
    await mount(host);
    await mount(host);
    expect(factory).toHaveBeenCalledExactlyOnceWith(
      host,
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(game.notices.state$.observed).toBe(true);
    expect(game.destroy).not.toHaveBeenCalled();
  });

  it('retains requested controller selection for Controls and reapplies it on renderer retry', async () => {
    const controllers: readonly ControllerInfo[] = [
      { id: 'xbox:0', type: 'xbox', slot: 0, name: 'First', selected: true },
      { id: 'dualsense:1', type: 'dualsense', slot: 1, name: 'Second', selected: false },
    ];
    const game = createClient(controllers);
    const replacement = createClient(controllers);
    factory.mockReturnValueOnce(game.client).mockReturnValueOnce(replacement.client);
    await mount(document.createElement('div'));
    expect(service.selectedController()).toBeNull();
    service.selectController('dualsense:1');
    expect(service.selectedController()).toBe('dualsense:1');
    game.emit({ phase: 'error', sceneKey: 'Game', errorMessage: 'Context lost' });
    await retry();
    expect(service.selectedController()).toBe('dualsense:1');
    expect(replacement.input.selectController).toHaveBeenCalledWith('dualsense:1');
    service.selectController(null);
    expect(service.selectedController()).toBeNull();
    expect(replacement.input.selectController).toHaveBeenLastCalledWith(null);
  });

  it('reverts rejected controller requests and shows Automatic after the selected device disconnects', async () => {
    const controller: ControllerInfo = {
      id: 'xbox:0',
      type: 'xbox',
      slot: 0,
      name: 'First',
      selected: true,
    };
    const game = createClient([controller]);
    factory.mockReturnValue(game.client);
    await mount(document.createElement('div'));
    service.selectController(controller.id);
    game.input.selectController.mockReturnValueOnce(false);
    service.selectController('missing:9');
    expect(service.selectedController()).toBe(controller.id);
    game.emitControllers([]);
    expect(service.selectedController()).toBeNull();
  });

  it('retains a pre-mount input block and applies it to replacement clients', async () => {
    const previous = createClient();
    const next = createClient();
    factory.mockReturnValueOnce(previous.client).mockReturnValueOnce(next.client);

    service.setInputEnabled(false);
    await mount(document.createElement('div'));
    expect(previous.setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);

    await mount(document.createElement('div'));
    expect(previous.destroy).toHaveBeenCalledOnce();
    expect(next.setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);
    next.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    service.setInputEnabled(true);
    expect(next.setInputEnabled.mock.calls).toEqual([[false], [true]]);
  });

  it('retains the current dialog block when Retry replaces a failed client', async () => {
    const previous = createClient();
    const next = createClient();
    factory.mockReturnValueOnce(previous.client).mockReturnValueOnce(next.client);
    await mount(document.createElement('div'));
    previous.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    service.setInputEnabled(false);
    previous.emit({ phase: 'error', sceneKey: 'Game', errorMessage: 'Graphics failed' });

    await retry();

    expect(previous.destroy).toHaveBeenCalledOnce();
    expect(next.setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('forwards permission while ready and reports a renderer permission failure', async () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    await mount(document.createElement('div'));
    expect(game.setInputEnabled).toHaveBeenCalledExactlyOnceWith(true);
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    service.setInputEnabled(false);
    expect(game.setInputEnabled.mock.calls).toEqual([[true], [false]]);

    game.setInputEnabled.mockImplementationOnce(() => {
      throw new Error('Could not update input');
    });
    service.setInputEnabled(true);
    expect(service.state()).toEqual({
      phase: 'error',
      sceneKey: 'Game',
      errorMessage: 'Could not update input',
    });
  });

  it('forwards a new input block to the existing client during loading', async () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    await mount(document.createElement('div'));
    expect(service.isLoading()).toBe(true);

    service.setInputEnabled(false);

    expect(game.setInputEnabled.mock.calls).toEqual([[true], [false]]);
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    expect(game.setInputEnabled).toHaveBeenLastCalledWith(false);
  });

  it('forwards an input unblock during pause before the existing client resumes', async () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    await mount(document.createElement('div'));
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    service.setInputEnabled(false);
    game.emit({ phase: 'paused', sceneKey: 'Game', errorMessage: null });

    service.setInputEnabled(true);

    expect(service.state().phase).toBe('paused');
    expect(game.setInputEnabled.mock.calls).toEqual([[true], [false], [true]]);
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    expect(game.setInputEnabled).toHaveBeenLastCalledWith(true);
  });

  it('unsubscribes before destroying the old client and rejects stale callbacks after remounting', async () => {
    const previous = createClient();
    const next = createClient();
    factory.mockReturnValueOnce(previous.client).mockReturnValueOnce(next.client);
    await mount(document.createElement('div'));
    previous.destroy.mockImplementation(() => {
      expect(previous.unsubscribe).toHaveBeenCalledOnce();
      previous.emit({ phase: 'stopped', sceneKey: null, errorMessage: null });
    });
    await mount(document.createElement('div'));
    next.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    previous.emit({ phase: 'error', sceneKey: 'Game', errorMessage: 'Old game' });
    expect(previous.destroy).toHaveBeenCalledOnce();
    expect(service.state()).toEqual({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    service.unmount();
    service.unmount();
    next.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    expect(next.unsubscribe).toHaveBeenCalledOnce();
    expect(next.destroy).toHaveBeenCalledOnce();
    expect(service.state()).toEqual({ phase: 'stopped', sceneKey: null, errorMessage: null });
  });

  it('cleans up when its injector is destroyed even without component unmounting', async () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    await mount(document.createElement('div'));
    TestBed.resetTestingModule();
    expect(game.unsubscribe).toHaveBeenCalledOnce();
    expect(game.destroy).toHaveBeenCalledOnce();
    await mount(document.createElement('div'));
    expect(factory).toHaveBeenCalledOnce();
    expect(service.state().phase).toBe('stopped');
  });

  it('reports factory failures and allows a later mount to retry', async () => {
    const error = new Error('Renderer failed');
    expectConsoleMessage('error', error);
    factory.mockImplementationOnce(() => {
      throw error;
    });
    const host = document.createElement('div');
    await mount(host);
    expect(service.state()).toEqual({
      phase: 'error',
      sceneKey: null,
      errorMessage: 'Renderer failed',
    });
    const game = createClient();
    factory.mockReturnValue(game.client);
    await retry();
    expect(service.state().phase).toBe('loading');
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenLastCalledWith(
      host,
      expect.objectContaining({ session: expect.any(Object) }),
    );
  });

  it('retries an asynchronous load failure by replacing the failed client on the same host', async () => {
    const previous = createClient();
    const next = createClient();
    factory.mockReturnValueOnce(previous.client).mockReturnValueOnce(next.client);
    const host = document.createElement('div');
    await mount(host);
    previous.emit({ phase: 'error', sceneKey: 'Game', errorMessage: 'Missing model' });
    await retry();
    expect(previous.unsubscribe).toHaveBeenCalledOnce();
    expect(previous.destroy).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenLastCalledWith(
      host,
      expect.objectContaining({ session: expect.any(Object) }),
    );
    next.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    previous.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    expect(service.currentSceneKey()).toBe('MainMenu');
    await retry();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('destroys a client if subscription setup fails', async () => {
    const error = new Error('Subscription failed');
    expectConsoleMessage('error', error);
    const game = createClient();
    Object.defineProperty(game.client, 'state$', {
      get: () => {
        throw error;
      },
    });
    factory.mockReturnValue(game.client);
    await mount(document.createElement('div'));
    expect(game.destroy).toHaveBeenCalledOnce();
    expect(service.errorMessage()).toBe('Subscription failed');
  });

  it('only forwards commands while ready and reports a thrown command', async () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    service.setScene('Game');
    await mount(document.createElement('div'));
    service.setScene('Game');
    expect(game.setScene).not.toHaveBeenCalled();
    game.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    service.setScene('Game');
    expect(game.setScene).toHaveBeenCalledExactlyOnceWith('Game');
    game.setScene.mockImplementation(() => {
      throw new Error('Command failed');
    });
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    service.setScene('MainMenu');
    expect(service.errorMessage()).toBe('Command failed');
    service.setScene('Game');
    service.unmount();
    service.setScene('Game');
    expect(game.setScene).toHaveBeenCalledTimes(2);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  const definition: WorldDefinition = {
    version: 1,
    id: 'runtime-test-world',
    grid: { origin: { x: -10, z: -10 }, columns: 10, rows: 10, metresPerCell: 2 },
    terrain: Array<string>(100).fill('soil'),
    spawn: { x: 1, y: 0, z: 1 },
    deposits: [],
    blockers: [],
  };
  const actionFrame: ActionFrame = {
    context: 'gameplay',
    revision: 1,
    states: { menu: { kind: 'button', held: true, pressed: true, released: false } },
  };

  async function mount(host: HTMLElement): Promise<void> {
    service.mount(host);
    await Promise.resolve();
  }

  async function retry(): Promise<void> {
    service.retry();
    await Promise.resolve();
  }

  function currentOptions(): GameClientOptions {
    return factory.mock.calls.at(-1)![1]!;
  }

  async function mountWorld() {
    const game = createClient();
    factory.mockReturnValueOnce(game.client);
    await mount(document.createElement('div'));
    currentOptions().session!.initialize(definition);
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    return { game, options: currentOptions(), bridge: currentOptions().session! };
  }

  function notifications(options: GameClientOptions) {
    const index = factory.mock.calls.findIndex((call) => call[1] === options);
    return factory.mock.results[index].value as GameClient & ReturnType<typeof clientNotifications>;
  }

  // Explicitly run submission and the next owned presentation frame for this inline control.
  function render(bridge: WorldSessionBridge, ...args: Parameters<WorldSessionBridge['frame']>) {
    bridge.frame(...args);
    bridge.completeFrame!();
    const view = bridge.frame(0, args[1], args[2], args[3], args[4]);
    bridge.completeFrame!();
    return view;
  }

  it('rejects a changed-map save before candidate worker/presentation construction and preserves the active world', async () => {
    const { game, bridge } = await mountWorld();
    await bridge.initialize(definition);
    const before = render(bridge, 0, { x: 0, z: 0 }, false, true);
    const world = await service.captureForSave();
    world.definition.terrain[0] = 'grass';
    const save: SaveSnapshot = saveFixture(
      world,
      'map-test',
      'map-test',
      '2026-11-09T00:00:00.000Z',
    );
    const prepare = vi.spyOn(GameSessionOwner.prototype, 'prepare');
    const present = vi.fn(async () => {
      throw Error('Presentation must not be constructed');
    });
    game.client.prepareWorld = present;
    const stage = vi.fn(async () => undefined);
    const fetchMap = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify(definition), { status: 200 }));
    try {
      await expect(service.validateForSave(save)).rejects.toThrow(
        'save is invalid because the map has changed',
      );
      expect(prepare).not.toHaveBeenCalled();
      await expect(service.replaceForSave(save, stage)).rejects.toThrow(
        'save is invalid because the map has changed',
      );
      expect(prepare).not.toHaveBeenCalled();
      expect(present).not.toHaveBeenCalled();
      expect(stage).not.toHaveBeenCalled();
      expect(service.world()?.tick).toBe(before.tick);
      expect(service.world()?.player).toEqual(before.player);
    } finally {
      fetchMap.mockRestore();
    }
  });

  it('pins the completed view before submitting the next authoritative batch', async () => {
    const { bridge } = await mountWorld();
    const callback = vi.fn();
    bridge.registerCompletedTickHandler(callback);
    expect(bridge.frame(0.05, { x: 1, z: 0 }, false, true).tick).toBe(0);
    bridge.completeFrame!();
    expect(callback).not.toHaveBeenCalled();
    expect(bridge.frame(0, { x: 0, z: 0 }, false, true).tick).toBe(1);
    bridge.completeFrame!();
    expect(callback).toHaveBeenCalledOnce();
  });

  it('scopes confirmation actions to UI and restores the enclosing save hold after close', async () => {
    const { game, options, bridge } = await mountWorld();
    const listener = vi.fn();
    service.subscribeActions(listener);
    const release = service.holdForSave();
    const confirmation = service.holdForSaveConfirmation();
    expect(game.input.setContext).toHaveBeenLastCalledWith('ui');
    options.actions.dispatch(actionFrame);
    expect(listener).not.toHaveBeenCalled();
    const uiFrame: ActionFrame = { context: 'ui', revision: 1, states: {} };
    options.actions.dispatch(uiFrame);
    expect(listener).toHaveBeenCalledExactlyOnceWith(uiFrame);
    expect(service.command({ type: 'research', enabled: false }).status).toBe('unavailable');
    expect(render(bridge, 0.25, { x: 1, z: 0 }, false, true).tick).toBe(0);
    confirmation();
    confirmation();
    expect(game.input.setContext).toHaveBeenLastCalledWith(null);
    listener.mockClear();
    options.actions.dispatch(uiFrame);
    expect(listener).not.toHaveBeenCalled();
    release();
    expect(service.command({ type: 'research', enabled: false }).status).toBe('queued');
  });

  it('observes preference changes even if its initial effect ran before mounting', async () => {
    TestBed.tick();
    const { game } = await mountWorld();
    const next = structuredClone(defaultProfile);
    settings.profile.set(next);
    TestBed.tick();
    expect(game.input.updateBindings).toHaveBeenLastCalledWith(next);
  });

  it.each(['permission', 'focus', 'capture', 'scene', 'controller', 'inspector'] as const)(
    'stops dispatching an old action frame after a listener changes %s ownership',
    async (change) => {
      const { options } = await mountWorld();
      const next = vi.fn();
      service.subscribeActions(() => {
        if (change === 'permission') service.setInputEnabled(false);
        if (change === 'focus') service.setUiFocused(true);
        if (change === 'capture') service.captureBinding(() => undefined);
        if (change === 'scene') service.setScene('MainMenu');
        if (change === 'controller') service.selectController(null);
        if (change === 'inspector')
          notifications(options).inspectorState$.next({ phase: 'loading', errorMessage: null });
      });
      service.subscribeActions(next);
      options.actions.dispatch(actionFrame);
      expect(next).not.toHaveBeenCalled();
    },
  );

  it('rejects old action, world, selection and controller callbacks after remount', async () => {
    const previous = await mountWorld();
    const action = vi.fn();
    service.subscribeActions(action);
    const next = await mountWorld();
    const view = render(next.bridge, 0, { x: 0, z: 0 }, false, true);
    notifications(next.options).selection$.next({ kind: 'entity', id: 'new' });
    previous.options.actions.dispatch(actionFrame);
    notifications(previous.options).selection$.next({ kind: 'entity', id: 'old' });
    notifications(previous.options).inspectorState$.next({ phase: 'open', errorMessage: null });
    previous.game.emitControllers([
      { id: 'xbox:9', type: 'xbox', slot: 9, name: 'Old controller', selected: true },
    ]);
    expect(action).not.toHaveBeenCalled();
    expect(service.world()).toEqual(view);
    expect(service.selection()).toEqual({ kind: 'entity', id: 'new' });
    expect(service.controllers()).toEqual([]);
    expect(service.inspectorActive()).toBe(false);
    expect(previous.game.unsubscribeControllers).toHaveBeenCalledOnce();
  });

  it('suspends gameplay and page actions for Inspector while preserving other ownership requests', async () => {
    const { game, options, bridge } = await mountWorld();
    const listener = vi.fn();
    service.subscribeActions(listener);
    render(bridge, 0.025, { x: 1, z: 0 }, false, true);
    notifications(options).inspectorState$.next({ phase: 'loading', errorMessage: null });
    expect(service.inspectorActive()).toBe(true);
    expect(game.input.setContext).toHaveBeenLastCalledWith(null);
    service.setInputEnabled(false);
    service.setInputEnabled(true);
    service.focusViewport();
    expect(game.input.setContext).toHaveBeenLastCalledWith(null);
    notifications(options).inspectorState$.next({ phase: 'open', errorMessage: null });
    options.actions.dispatch(actionFrame);
    expect(listener).not.toHaveBeenCalled();
    expect(render(bridge, 60, { x: 1, z: 0 }, false, true).tick).toBe(0);
    service.setInputEnabled(false);
    notifications(options).inspectorState$.next({ phase: 'closed', errorMessage: null });
    expect(game.input.setContext).toHaveBeenLastCalledWith('ui');
    service.setInputEnabled(true);
    expect(game.input.setContext).toHaveBeenLastCalledWith('gameplay');
    expect(render(bridge, 0.025, { x: 1, z: 0 }, false, true).tick).toBe(0);
    expect(render(bridge, 0.025, { x: 1, z: 0 }, false, true).tick).toBe(1);
  });

  it('keeps Inspector load failures separate from game errors and clears diagnostics on unmount', async () => {
    const { options } = await mountWorld();
    notifications(options).inspectorState$.next({
      phase: 'error',
      errorMessage: 'Chunk unavailable',
    });
    expect(service.isReady()).toBe(true);
    expect(service.errorMessage()).toBeNull();
    expect(service.inspectorState().errorMessage).toBe('Chunk unavailable');
    service.unmount();
    expect(service.inspectorState()).toEqual({ phase: 'closed', errorMessage: null });
    notifications(options).inspectorState$.next({ phase: 'open', errorMessage: null });
    expect(service.inspectorActive()).toBe(false);
  });

  it('prevents old renderer session callbacks from advancing or changing the current world', async () => {
    const previous = await mountWorld();
    const next = await mountWorld();
    const before = render(next.bridge, 0, { x: 0, z: 0 }, false, true);
    previous.bridge.initialize({ ...definition, id: 'superseded' });
    expect(render(previous.bridge, 2, { x: 1, z: 1 }, true, true)).toEqual(before);
    const enqueue = vi.spyOn(GameSession.prototype, 'enqueue');
    previous.options.placement!.place({ column: 4, row: 6 }, 0);
    expect(enqueue).not.toHaveBeenCalled();
    expect(previous.options.placement!.preview({ column: 4, row: 6 }, 0).valid).toBe(false);
    expect(render(next.bridge, 0, { x: 0, z: 0 }, false, true)).toEqual(before);
  });

  it('registers ordered tick callbacks only after the current world is initialized', async () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    await mount(document.createElement('div'));
    const bridge = currentOptions().session!;
    const premature = vi.fn();
    bridge.registerCompletedTickHandler(premature)();
    bridge.initialize(definition);
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    const calls: string[] = [];
    bridge.registerCompletedTickHandler(({ tick }) => calls.push(`later:${tick}`), 1);
    bridge.registerCompletedTickHandler(({ tick, deltaSeconds }) => {
      expect(deltaSeconds).toBe(0.05);
      calls.push(`first:${tick}`);
    }, -1);
    render(bridge, 0.1, { x: 0, z: 0 }, false, true);
    expect(premature).not.toHaveBeenCalled();
    expect(calls).toEqual(['first:1', 'later:1', 'first:2', 'later:2']);
  });

  it('removes old tick handlers before renderer teardown and ignores delayed old cleanup after remount', async () => {
    const register = GameSession.prototype.registerCompletedTickHandler;
    const removals: ReturnType<typeof vi.fn<() => void>>[] = [];
    vi.spyOn(GameSession.prototype, 'registerCompletedTickHandler').mockImplementation(function (
      this: GameSession,
      handler,
      order,
    ) {
      const remove = vi.fn(register.call(this, handler, order));
      removals.push(remove);
      return remove;
    });
    const previous = await mountWorld();
    const oldHandler = vi.fn();
    const stopOld = previous.bridge.registerCompletedTickHandler(oldHandler);
    render(previous.bridge, 0.1, { x: 1, z: 0 }, false, true);
    let cleanupAfterInspector: (() => void) | undefined;
    previous.game.destroy.mockImplementation(() => {
      expect(removals[0]).toHaveBeenCalledOnce();
      // Inspector disposal can delay the scene script's own unsubscribe.
      cleanupAfterInspector = stopOld;
    });
    const next = await mountWorld();
    const newHandler = vi.fn();
    next.bridge.registerCompletedTickHandler(newHandler);
    const staleRegistration = vi.fn();
    previous.bridge.registerCompletedTickHandler(staleRegistration)();
    const first = render(next.bridge, 0.05, { x: 0, z: 0 }, false, true);
    expect(first.tick).toBe(1);
    expect(first.player.position).toEqual(definition.spawn);
    expect(oldHandler).toHaveBeenCalledTimes(2);
    expect(staleRegistration).not.toHaveBeenCalled();
    cleanupAfterInspector?.();
    stopOld();
    render(next.bridge, 0.05, { x: 0, z: 0 }, false, true);
    expect(oldHandler).toHaveBeenCalledTimes(2);
    expect(newHandler).toHaveBeenCalledTimes(2);
  });

  it('preserves a healthy session through renderer Retry and clears partial elapsed time', async () => {
    const previous = await mountWorld();
    const before = render(previous.bridge, 0.125, { x: 1, z: 0 }, false, true);
    previous.game.emit({ phase: 'error', sceneKey: 'Game', errorMessage: 'Graphics failed' });
    const replacement = createClient();
    factory.mockReturnValueOnce(replacement.client);
    await retry();
    const bridge = currentOptions().session!;
    bridge.initialize(definition);
    replacement.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    const retained = render(bridge, 0.025, { x: 0, z: 0 }, false, true);
    expect(retained.tick).toBe(before.tick);
    expect(retained.player.position).toEqual(before.player.position);
    expect(render(bridge, 0.025, { x: 0, z: 0 }, false, true).tick).toBe(before.tick + 1);
  });

  it('restarts from the authored world after a completed presentation hook fails', async () => {
    const previous = await mountWorld();
    render(previous.bridge, 0.05, { x: 1, z: 0 }, false, true);
    const failure = new Error('Player tick failed');
    const handler = vi.fn(() => {
      throw failure;
    });
    previous.bridge.registerCompletedTickHandler(handler);
    expect(() => render(previous.bridge, 0.25, { x: 1, z: 0 }, false, true)).toThrow(failure);
    expect(service.errorMessage()).toContain('Retry restarts this world');
    previous.game.emit({ phase: 'error', sceneKey: 'Game', errorMessage: failure.message });
    const replacement = createClient();
    factory.mockReturnValueOnce(replacement.client);
    await retry();
    const bridge = currentOptions().session!;
    bridge.initialize(definition);
    replacement.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    const fresh = render(bridge, 0, { x: 0, z: 0 }, false, true);
    expect(fresh.tick).toBe(0);
    expect(fresh.player.position).toEqual(definition.spawn);
    expect(render(bridge, 0.05, { x: 0, z: 0 }, false, true).tick).toBe(1);
    expect(handler).toHaveBeenCalledOnce();
  });

  it.each([
    'permission',
    'focus',
    'capture',
    'scene',
    'controller',
    'inspector',
    'unmount',
  ] as const)(
    'aborts tick dispatch and its remaining catch-up when a tick handler changes %s ownership',
    async (change) => {
      const { options, bridge } = await mountWorld();
      const next = vi.fn();
      bridge.registerCompletedTickHandler(() => {
        if (change === 'permission') service.setInputEnabled(false);
        if (change === 'focus') service.setUiFocused(true);
        if (change === 'capture') service.captureBinding(() => undefined);
        if (change === 'scene') service.setScene('MainMenu');
        if (change === 'controller') service.selectController(null);
        if (change === 'inspector')
          notifications(options).inspectorState$.next({ phase: 'loading', errorMessage: null });
        if (change === 'unmount') service.unmount();
      }, -1);
      bridge.registerCompletedTickHandler(next);
      const view = render(bridge, 0.25, { x: 1, z: 0 }, true, true);
      expect(next).not.toHaveBeenCalled();
      expect(view.tick).toBe(5);
      expect(view.player.position.x).toBeGreaterThan(definition.spawn.x);
    },
  );

  it.each(['permission', 'capture'] as const)(
    'owns the session pause while %s blocks gameplay and resets partial elapsed time',
    async (reason) => {
      const { bridge } = await mountWorld();
      render(bridge, 0.025, { x: 1, z: 0 }, false, true);
      let stop: (() => void) | undefined;
      if (reason === 'permission') service.setInputEnabled(false);
      if (reason === 'capture') stop = service.captureBinding(() => undefined);
      const paused = render(bridge, 60, { x: 1, z: 0 }, false, true);
      expect(paused.tick).toBe(0);
      expect(paused.player.position).toEqual(definition.spawn);
      service.setInputEnabled(true);
      service.setUiFocused(false);
      stop?.();
      expect(render(bridge, 0.025, { x: 1, z: 0 }, false, true).tick).toBe(0);
      expect(render(bridge, 0.025, { x: 1, z: 0 }, false, true).tick).toBe(1);
    },
  );

  it('keeps simulation running with UI focus while blocking movement and gameplay presentation hooks', async () => {
    const { bridge } = await mountWorld();
    const callback = vi.fn();
    bridge.registerCompletedTickHandler(callback);
    service.setUiFocused(true);
    const focused = render(bridge, 0.1, { x: 1, z: 0 }, true, false, true);
    expect(focused.tick).toBe(2);
    expect(focused.player.position).toEqual(definition.spawn);
    expect(callback).not.toHaveBeenCalled();
    service.setUiFocused(false);
    expect(render(bridge, 0.05, { x: 1, z: 0 }, false, true).player.position.x).toBeGreaterThan(
      definition.spawn.x,
    );
  });

  it('picks up deliberately selected ground items only while the world owns input', async () => {
    const { options, bridge } = await mountWorld();
    const view = render(bridge, 0, { x: 0, z: 0 }, false, true);
    vi.spyOn(service, 'world').mockReturnValue({
      ...view,
      ground: [{ id: 'ground-test', position: definition.spawn, item: 'scrap', quantity: 1 }],
    });
    const command = vi
      .spyOn(service, 'command')
      .mockImplementation(() => ({ status: 'unavailable' }));
    notifications(options).selection$.next({ kind: 'entity', id: 'ground-test' });
    expect(command).toHaveBeenCalledExactlyOnceWith({ type: 'pickup', target: 'ground-test' });
    service.setUiFocused(true);
    command.mockClear();
    notifications(options).selection$.next({ kind: 'entity', id: 'ground-test' });
    expect(command).not.toHaveBeenCalled();
  });

  it('gives error/loading/paused lifecycle screens the UI context for controller recovery', async () => {
    const { game } = await mountWorld();
    expect(game.input.setContext).toHaveBeenLastCalledWith('gameplay');
    for (const phase of ['error', 'loading', 'paused'] as const) {
      game.emit({
        phase,
        sceneKey: 'Game',
        errorMessage: phase === 'error' ? 'Graphics lost' : null,
      });
      expect(game.input.setContext).toHaveBeenLastCalledWith('ui');
    }
  });

  it('does not let an old capture disposer or callback cancel or edit a newer capture', async () => {
    const { game } = await mountWorld();
    const first = vi.fn();
    const stopFirst = service.captureBinding(first);
    const oldCallback = game.input.captureBinding.mock.calls.at(-1)![0];
    const second = vi.fn();
    const stopSecond = service.captureBinding(second);
    stopFirst();
    expect(service.capturingBinding()).toBe(true);
    oldCallback({ device: 'keyboard', code: 'KeyF' });
    expect(first).not.toHaveBeenCalled();
    game.emitCapture({ device: 'keyboard', code: 'KeyG' });
    expect(second).toHaveBeenCalledOnce();
    stopSecond();
    expect(service.capturingBinding()).toBe(false);
  });
});
