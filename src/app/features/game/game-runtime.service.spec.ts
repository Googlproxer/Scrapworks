import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expectConsoleMessage } from '../../../testing/console-policy';
import type { GameClient, GameClientOptions } from '@contracts/game-client';
import {
  defaultProfile,
  type ActionFrame,
  type BindingProfile,
  type ButtonControl,
  type ControllerInfo,
} from '@contracts/input';
import type { WorldDefinition } from '@contracts/world';
import { ControlSettingsService } from '../controls/control-settings.service';
import { GameSession } from './session/game-session';
import type { GameState } from '@contracts/game-state';
import { GAME_CLIENT_FACTORY } from './game-client-factory';
import { GameRuntimeService } from './game-runtime.service';

describe('GameRuntimeService', () => {
  function createClient(connected: readonly ControllerInfo[] = []) {
    let listener: ((state: GameState) => void) | undefined;
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
      subscribe: vi.fn((callback) => {
        listener = callback;
        callback({ phase: 'loading', sceneKey: 'MainMenu', errorMessage: null });
        return unsubscribe;
      }),
      destroy,
      setScene,
      setInputEnabled,
    };
    return {
      client,
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
      emit: (state: GameState) => listener?.(state),
    };
  }

  let factory: ReturnType<
    typeof vi.fn<(host: HTMLElement, options?: GameClientOptions) => GameClient>
  >;
  let service: GameRuntimeService;
  let settings: { profile: ReturnType<typeof signal<BindingProfile>> };

  beforeEach(() => {
    factory = vi.fn<(host: HTMLElement, options?: GameClientOptions) => GameClient>();
    settings = { profile: signal<BindingProfile>(structuredClone(defaultProfile)) };
    TestBed.configureTestingModule({
      providers: [
        GameRuntimeService,
        { provide: GAME_CLIENT_FACTORY, useValue: factory },
        { provide: ControlSettingsService, useValue: settings },
      ],
    });
    service = TestBed.inject(GameRuntimeService);
  });

  it('starts idle and projects loading, ready, and error states into readonly signals', () => {
    expect(service.state()).toEqual({ phase: 'idle', sceneKey: null, errorMessage: null });
    expect(service.isReady()).toBe(false);
    const game = createClient();
    factory.mockReturnValue(game.client);
    service.mount(document.createElement('div'));
    expect(service.isLoading()).toBe(true);
    expect(service.currentSceneKey()).toBe('MainMenu');
    game.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    expect(service.isReady()).toBe(true);
    game.emit({ phase: 'error', sceneKey: 'Game', errorMessage: 'Failed asset' });
    expect(service.errorMessage()).toBe('Failed asset');
    expect(service.isReady()).toBe(false);
  });

  it('makes repeated mounts on the same host harmless', () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    const host = document.createElement('div');
    service.mount(host);
    service.mount(host);
    expect(factory).toHaveBeenCalledExactlyOnceWith(
      host,
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(game.client.subscribe).toHaveBeenCalledOnce();
    expect(game.destroy).not.toHaveBeenCalled();
  });

  it('retains requested controller selection for Controls and reapplies it on renderer retry', () => {
    const controllers: readonly ControllerInfo[] = [
      { id: 'xbox:0', type: 'xbox', slot: 0, name: 'First', selected: true },
      { id: 'dualsense:1', type: 'dualsense', slot: 1, name: 'Second', selected: false },
    ];
    const game = createClient(controllers);
    const replacement = createClient(controllers);
    factory.mockReturnValueOnce(game.client).mockReturnValueOnce(replacement.client);
    service.mount(document.createElement('div'));
    expect(service.selectedController()).toBeNull();
    service.selectController('dualsense:1');
    expect(service.selectedController()).toBe('dualsense:1');
    game.emit({ phase: 'error', sceneKey: 'Game', errorMessage: 'Context lost' });
    service.retry();
    expect(service.selectedController()).toBe('dualsense:1');
    expect(replacement.input.selectController).toHaveBeenCalledWith('dualsense:1');
    service.selectController(null);
    expect(service.selectedController()).toBeNull();
    expect(replacement.input.selectController).toHaveBeenLastCalledWith(null);
  });

  it('reverts rejected controller requests and shows Automatic after the selected device disconnects', () => {
    const controller: ControllerInfo = {
      id: 'xbox:0',
      type: 'xbox',
      slot: 0,
      name: 'First',
      selected: true,
    };
    const game = createClient([controller]);
    factory.mockReturnValue(game.client);
    service.mount(document.createElement('div'));
    service.selectController(controller.id);
    game.input.selectController.mockReturnValueOnce(false);
    service.selectController('missing:9');
    expect(service.selectedController()).toBe(controller.id);
    game.emitControllers([]);
    expect(service.selectedController()).toBeNull();
  });

  it('retains a pre-mount input block and applies it to replacement clients', () => {
    const previous = createClient();
    const next = createClient();
    factory.mockReturnValueOnce(previous.client).mockReturnValueOnce(next.client);

    service.setInputEnabled(false);
    service.mount(document.createElement('div'));
    expect(previous.setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);

    service.mount(document.createElement('div'));
    expect(previous.destroy).toHaveBeenCalledOnce();
    expect(next.setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);
    next.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    service.setInputEnabled(true);
    expect(next.setInputEnabled.mock.calls).toEqual([[false], [true]]);
  });

  it('retains the current dialog block when Retry replaces a failed client', () => {
    const previous = createClient();
    const next = createClient();
    factory.mockReturnValueOnce(previous.client).mockReturnValueOnce(next.client);
    service.mount(document.createElement('div'));
    previous.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    service.setInputEnabled(false);
    previous.emit({ phase: 'error', sceneKey: 'Game', errorMessage: 'Graphics failed' });

    service.retry();

    expect(previous.destroy).toHaveBeenCalledOnce();
    expect(next.setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('forwards permission while ready and reports a renderer permission failure', () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    service.mount(document.createElement('div'));
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

  it('forwards a new input block to the existing client during loading', () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    service.mount(document.createElement('div'));
    expect(service.isLoading()).toBe(true);

    service.setInputEnabled(false);

    expect(game.setInputEnabled.mock.calls).toEqual([[true], [false]]);
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    expect(game.setInputEnabled).toHaveBeenLastCalledWith(false);
  });

  it('forwards an input unblock during pause before the existing client resumes', () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    service.mount(document.createElement('div'));
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    service.setInputEnabled(false);
    game.emit({ phase: 'paused', sceneKey: 'Game', errorMessage: null });

    service.setInputEnabled(true);

    expect(service.state().phase).toBe('paused');
    expect(game.setInputEnabled.mock.calls).toEqual([[true], [false], [true]]);
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    expect(game.setInputEnabled).toHaveBeenLastCalledWith(true);
  });

  it('unsubscribes before destroying the old client and rejects stale callbacks after remounting', () => {
    const previous = createClient();
    const next = createClient();
    factory.mockReturnValueOnce(previous.client).mockReturnValueOnce(next.client);
    service.mount(document.createElement('div'));
    previous.destroy.mockImplementation(() => {
      expect(previous.unsubscribe).toHaveBeenCalledOnce();
      previous.emit({ phase: 'stopped', sceneKey: null, errorMessage: null });
    });
    service.mount(document.createElement('div'));
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

  it('cleans up when its injector is destroyed even without component unmounting', () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    service.mount(document.createElement('div'));
    TestBed.resetTestingModule();
    expect(game.unsubscribe).toHaveBeenCalledOnce();
    expect(game.destroy).toHaveBeenCalledOnce();
    service.mount(document.createElement('div'));
    expect(factory).toHaveBeenCalledOnce();
    expect(service.state().phase).toBe('stopped');
  });

  it('reports factory failures and allows a later mount to retry', () => {
    const error = new Error('Renderer failed');
    expectConsoleMessage('error', error);
    factory.mockImplementationOnce(() => {
      throw error;
    });
    const host = document.createElement('div');
    service.mount(host);
    expect(service.state()).toEqual({
      phase: 'error',
      sceneKey: null,
      errorMessage: 'Renderer failed',
    });
    const game = createClient();
    factory.mockReturnValue(game.client);
    service.retry();
    expect(service.state().phase).toBe('loading');
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenLastCalledWith(
      host,
      expect.objectContaining({ session: expect.any(Object) }),
    );
  });

  it('retries an asynchronous load failure by replacing the failed client on the same host', () => {
    const previous = createClient();
    const next = createClient();
    factory.mockReturnValueOnce(previous.client).mockReturnValueOnce(next.client);
    const host = document.createElement('div');
    service.mount(host);
    previous.emit({ phase: 'error', sceneKey: 'Game', errorMessage: 'Missing model' });
    service.retry();
    expect(previous.unsubscribe).toHaveBeenCalledOnce();
    expect(previous.destroy).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenLastCalledWith(
      host,
      expect.objectContaining({ session: expect.any(Object) }),
    );
    next.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    previous.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    expect(service.currentSceneKey()).toBe('MainMenu');
    service.retry();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('destroys a client if subscription setup fails', () => {
    const error = new Error('Subscription failed');
    expectConsoleMessage('error', error);
    const game = createClient();
    vi.mocked(game.client.subscribe).mockImplementation(() => {
      throw error;
    });
    factory.mockReturnValue(game.client);
    service.mount(document.createElement('div'));
    expect(game.destroy).toHaveBeenCalledOnce();
    expect(service.errorMessage()).toBe('Subscription failed');
  });

  it('only forwards commands while ready and reports a thrown command', () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    service.setScene('Game');
    service.mount(document.createElement('div'));
    service.setScene('Game');
    expect(game.setScene).not.toHaveBeenCalled();
    game.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    service.setScene('Game');
    expect(game.setScene).toHaveBeenCalledExactlyOnceWith('Game');
    game.setScene.mockImplementation(() => {
      throw new Error('Command failed');
    });
    service.setScene('Game');
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
  function currentOptions(): GameClientOptions {
    return factory.mock.calls.at(-1)![1]!;
  }
  function mountWorld() {
    const game = createClient();
    factory.mockReturnValueOnce(game.client);
    service.mount(document.createElement('div'));
    currentOptions().session!.initialize(definition);
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    return { game, options: currentOptions(), bridge: currentOptions().session! };
  }

  it('observes preference changes even if its initial effect ran before mounting', () => {
    TestBed.tick();
    const { game } = mountWorld();
    const next = structuredClone(defaultProfile);
    settings.profile.set(next);
    TestBed.tick();
    expect(game.input.updateBindings).toHaveBeenLastCalledWith(next);
  });

  it.each(['permission', 'focus', 'capture', 'scene', 'controller', 'inspector'] as const)(
    'stops dispatching an old action frame after a listener changes %s ownership',
    (change) => {
      const { options } = mountWorld();
      const next = vi.fn();
      service.subscribeActions(() => {
        if (change === 'permission') service.setInputEnabled(false);
        if (change === 'focus') service.setUiFocused(true);
        if (change === 'capture') service.captureBinding(() => undefined);
        if (change === 'scene') service.setScene('MainMenu');
        if (change === 'controller') service.selectController(null);
        if (change === 'inspector')
          options.onInspectorState!({ phase: 'loading', errorMessage: null });
      });
      service.subscribeActions(next);
      options.onActionFrame!(actionFrame);
      expect(next).not.toHaveBeenCalled();
    },
  );

  it('rejects old action, world, selection and controller callbacks after remount', () => {
    const previous = mountWorld();
    const action = vi.fn();
    service.subscribeActions(action);
    const next = mountWorld();
    const view = next.bridge.frame(0, { x: 0, z: 0 }, false, true);
    next.options.onWorldView!(view);
    next.options.onSelection!('new');
    previous.options.onActionFrame!(actionFrame);
    previous.options.onWorldView!({ ...view, worldId: 'old' });
    previous.options.onSelection!('old');
    previous.options.onInspectorState!({ phase: 'open', errorMessage: null });
    previous.game.emitControllers([
      { id: 'xbox:9', type: 'xbox', slot: 9, name: 'Old controller', selected: true },
    ]);
    expect(action).not.toHaveBeenCalled();
    expect(service.world()).toEqual(view);
    expect(service.selection()).toBe('new');
    expect(service.controllers()).toEqual([]);
    expect(service.inspectorActive()).toBe(false);
    expect(previous.game.unsubscribeControllers).toHaveBeenCalledOnce();
  });

  it('suspends gameplay and page actions for Inspector while preserving other ownership requests', () => {
    const { game, options, bridge } = mountWorld();
    const listener = vi.fn();
    service.subscribeActions(listener);
    bridge.frame(0.025, { x: 1, z: 0 }, false, true);
    options.onInspectorState!({ phase: 'loading', errorMessage: null });
    expect(service.inspectorActive()).toBe(true);
    expect(game.input.setContext).toHaveBeenLastCalledWith(null);
    service.setInputEnabled(false);
    service.setInputEnabled(true);
    service.focusViewport();
    expect(game.input.setContext).toHaveBeenLastCalledWith(null);
    options.onInspectorState!({ phase: 'open', errorMessage: null });
    options.onActionFrame!(actionFrame);
    expect(listener).not.toHaveBeenCalled();
    expect(bridge.frame(60, { x: 1, z: 0 }, false, true).tick).toBe(0);
    service.setInputEnabled(false);
    options.onInspectorState!({ phase: 'closed', errorMessage: null });
    expect(game.input.setContext).toHaveBeenLastCalledWith('ui');
    service.setInputEnabled(true);
    expect(game.input.setContext).toHaveBeenLastCalledWith('gameplay');
    expect(bridge.frame(0.025, { x: 1, z: 0 }, false, true).tick).toBe(0);
    expect(bridge.frame(0.025, { x: 1, z: 0 }, false, true).tick).toBe(1);
  });

  it('keeps Inspector load failures separate from game errors and clears diagnostics on unmount', () => {
    const { options } = mountWorld();
    options.onInspectorState!({ phase: 'error', errorMessage: 'Chunk unavailable' });
    expect(service.isReady()).toBe(true);
    expect(service.errorMessage()).toBeNull();
    expect(service.inspectorState().errorMessage).toBe('Chunk unavailable');
    service.unmount();
    expect(service.inspectorState()).toEqual({ phase: 'closed', errorMessage: null });
    options.onInspectorState!({ phase: 'open', errorMessage: null });
    expect(service.inspectorActive()).toBe(false);
  });

  it('prevents old renderer session callbacks from advancing or changing the current world', () => {
    const previous = mountWorld();
    const next = mountWorld();
    const before = next.bridge.frame(0, { x: 0, z: 0 }, false, true);
    previous.bridge.initialize({ ...definition, id: 'superseded' });
    expect(previous.bridge.frame(2, { x: 1, z: 1 }, true, true)).toEqual(before);
    const enqueue = vi.spyOn(GameSession.prototype, 'enqueue');
    previous.bridge.place({ column: 4, row: 6 }, 0);
    expect(enqueue).not.toHaveBeenCalled();
    expect(previous.bridge.preview({ column: 4, row: 6 }, 0).valid).toBe(false);
    expect(next.bridge.frame(0, { x: 0, z: 0 }, false, true)).toEqual(before);
  });

  it('registers ordered tick callbacks only after the current world is initialized', () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    service.mount(document.createElement('div'));
    const bridge = currentOptions().session!;
    const premature = vi.fn();
    bridge.registerTickHandler(premature)();
    bridge.initialize(definition);
    game.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    const calls: string[] = [];
    bridge.registerTickHandler(({ tick }) => calls.push(`later:${tick}`), 1);
    bridge.registerTickHandler(({ tick, deltaSeconds }) => {
      expect(deltaSeconds).toBe(0.05);
      calls.push(`first:${tick}`);
    }, -1);
    bridge.frame(0.1, { x: 0, z: 0 }, false, true);
    expect(premature).not.toHaveBeenCalled();
    expect(calls).toEqual(['first:1', 'later:1', 'first:2', 'later:2']);
  });

  it('removes old tick handlers before renderer teardown and ignores delayed old cleanup after remount', () => {
    const register = GameSession.prototype.registerTickHandler;
    const removals: ReturnType<typeof vi.fn<() => void>>[] = [];
    vi.spyOn(GameSession.prototype, 'registerTickHandler').mockImplementation(function (
      this: GameSession,
      handler,
      order,
    ) {
      const remove = vi.fn(register.call(this, handler, order));
      removals.push(remove);
      return remove;
    });
    const previous = mountWorld();
    const oldHandler = vi.fn();
    const stopOld = previous.bridge.registerTickHandler(oldHandler);
    const completed = previous.bridge.frame(0.1, { x: 1, z: 0 }, false, true);
    let cleanupAfterInspector: (() => void) | undefined;
    previous.game.destroy.mockImplementation(() => {
      expect(removals[0]).toHaveBeenCalledOnce();
      // Inspector disposal can delay the scene script's own unsubscribe.
      cleanupAfterInspector = stopOld;
    });
    const next = mountWorld();
    const newHandler = vi.fn();
    next.bridge.registerTickHandler(newHandler);
    const staleRegistration = vi.fn();
    previous.bridge.registerTickHandler(staleRegistration)();
    const first = next.bridge.frame(0.05, { x: 0, z: 0 }, false, true);
    expect(first.tick).toBe(completed.tick + 1);
    expect(first.player.position).toEqual(completed.player.position);
    expect(oldHandler).toHaveBeenCalledTimes(2);
    expect(staleRegistration).not.toHaveBeenCalled();
    cleanupAfterInspector?.();
    stopOld();
    next.bridge.frame(0.05, { x: 0, z: 0 }, false, true);
    expect(oldHandler).toHaveBeenCalledTimes(2);
    expect(newHandler).toHaveBeenCalledTimes(2);
  });

  it('preserves a healthy session through renderer Retry and clears partial elapsed time', () => {
    const previous = mountWorld();
    const before = previous.bridge.frame(0.125, { x: 1, z: 0 }, false, true);
    previous.game.emit({ phase: 'error', sceneKey: 'Game', errorMessage: 'Graphics failed' });
    const replacement = createClient();
    factory.mockReturnValueOnce(replacement.client);
    service.retry();
    const bridge = currentOptions().session!;
    bridge.initialize(definition);
    replacement.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    const retained = bridge.frame(0.025, { x: 0, z: 0 }, false, true);
    expect(retained.tick).toBe(before.tick);
    expect(retained.player.position).toEqual(before.player.position);
    expect(bridge.frame(0.025, { x: 0, z: 0 }, false, true).tick).toBe(before.tick + 1);
  });

  it('replaces a failed session on Retry without publishing a partially completed tick', () => {
    const previous = mountWorld();
    const before = previous.bridge.frame(0.05, { x: 1, z: 0 }, false, true);
    const failure = new Error('Player tick failed');
    const handler = vi.fn(() => {
      throw failure;
    });
    previous.bridge.registerTickHandler(handler);
    expect(() => previous.bridge.frame(0.25, { x: 1, z: 0 }, false, true)).toThrow(failure);
    expect(previous.bridge.frame(0, { x: 0, z: 0 }, false, false)).toEqual(before);
    previous.game.emit({ phase: 'error', sceneKey: 'Game', errorMessage: failure.message });
    const replacement = createClient();
    factory.mockReturnValueOnce(replacement.client);
    service.retry();
    const bridge = currentOptions().session!;
    bridge.initialize(definition);
    replacement.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    const fresh = bridge.frame(0, { x: 0, z: 0 }, false, true);
    expect(fresh.tick).toBe(0);
    expect(fresh.player.position).toEqual(definition.spawn);
    expect(bridge.frame(0.05, { x: 0, z: 0 }, false, true).tick).toBe(1);
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
    (change) => {
      const { options, bridge } = mountWorld();
      const next = vi.fn();
      bridge.registerTickHandler(() => {
        if (change === 'permission') service.setInputEnabled(false);
        if (change === 'focus') service.setUiFocused(true);
        if (change === 'capture') service.captureBinding(() => undefined);
        if (change === 'scene') service.setScene('MainMenu');
        if (change === 'controller') service.selectController(null);
        if (change === 'inspector')
          options.onInspectorState!({ phase: 'loading', errorMessage: null });
        if (change === 'unmount') service.unmount();
      }, -1);
      bridge.registerTickHandler(next);
      const view = bridge.frame(0.25, { x: 1, z: 0 }, true, true);
      expect(next).not.toHaveBeenCalled();
      expect(view.tick).toBe(0);
      expect(view.player.position).toEqual(definition.spawn);
    },
  );

  it.each(['permission', 'focus', 'capture'] as const)(
    'owns the session pause while %s blocks gameplay and resets partial elapsed time',
    (reason) => {
      const { bridge } = mountWorld();
      bridge.frame(0.025, { x: 1, z: 0 }, false, true);
      let stop: (() => void) | undefined;
      if (reason === 'permission') service.setInputEnabled(false);
      if (reason === 'focus') service.setUiFocused(true);
      if (reason === 'capture') stop = service.captureBinding(() => undefined);
      const paused = bridge.frame(60, { x: 1, z: 0 }, false, true);
      expect(paused.tick).toBe(0);
      expect(paused.player.position).toEqual(definition.spawn);
      service.setInputEnabled(true);
      service.setUiFocused(false);
      stop?.();
      expect(bridge.frame(0.025, { x: 1, z: 0 }, false, true).tick).toBe(0);
      expect(bridge.frame(0.025, { x: 1, z: 0 }, false, true).tick).toBe(1);
    },
  );

  it('gives error/loading/paused lifecycle screens the UI context for controller recovery', () => {
    const { game } = mountWorld();
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

  it('does not let an old capture disposer or callback cancel or edit a newer capture', () => {
    const { game } = mountWorld();
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
