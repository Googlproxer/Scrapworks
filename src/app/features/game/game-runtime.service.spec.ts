import { TestBed } from '@angular/core/testing';
import type { GameClient } from '@contracts/game-client';
import type { GameState } from '@contracts/game-state';
import { GAME_CLIENT_FACTORY } from './game-client-factory';
import { GameRuntimeService } from './game-runtime.service';

describe('GameRuntimeService', () => {
  function createClient() {
    let listener: ((state: GameState) => void) | undefined;
    const unsubscribe = vi.fn();
    const destroy = vi.fn();
    const setScene = vi.fn();
    const client: GameClient = {
      subscribe: vi.fn((callback) => {
        listener = callback;
        callback({ phase: 'loading', sceneKey: 'Boot', errorMessage: null });
        return unsubscribe;
      }),
      destroy,
      setScene,
    };
    return { client, unsubscribe, destroy, setScene, emit: (state: GameState) => listener?.(state) };
  }

  let factory: ReturnType<typeof vi.fn<(host: HTMLElement) => GameClient>>;
  let service: GameRuntimeService;

  beforeEach(() => {
    factory = vi.fn<(host: HTMLElement) => GameClient>();
    TestBed.configureTestingModule({ providers: [GameRuntimeService, { provide: GAME_CLIENT_FACTORY, useValue: factory }] });
    service = TestBed.inject(GameRuntimeService);
  });

  it('starts idle and projects loading, ready, and error states into readonly signals', () => {
    expect(service.state()).toEqual({ phase: 'idle', sceneKey: null, errorMessage: null });
    expect(service.isReady()).toBe(false);
    const game = createClient();
    factory.mockReturnValue(game.client);
    service.mount(document.createElement('div'));
    expect(service.isLoading()).toBe(true);
    expect(service.currentSceneKey()).toBe('Boot');
    game.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    expect(service.isReady()).toBe(true);
    game.emit({ phase: 'error', sceneKey: 'Preloader', errorMessage: 'Failed asset' });
    expect(service.errorMessage()).toBe('Failed asset');
    expect(service.isReady()).toBe(false);
  });

  it('makes repeated mounts on the same host harmless', () => {
    const game = createClient();
    factory.mockReturnValue(game.client);
    const host = document.createElement('div');
    service.mount(host);
    service.mount(host);
    expect(factory).toHaveBeenCalledExactlyOnceWith(host);
    expect(game.client.subscribe).toHaveBeenCalledOnce();
    expect(game.destroy).not.toHaveBeenCalled();
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
    factory.mockImplementationOnce(() => {
      throw new Error('Renderer failed');
    });
    const host = document.createElement('div');
    service.mount(host);
    expect(service.state()).toEqual({ phase: 'error', sceneKey: null, errorMessage: 'Renderer failed' });
    const game = createClient();
    factory.mockReturnValue(game.client);
    service.retry();
    expect(service.state().phase).toBe('loading');
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenLastCalledWith(host);
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
    expect(factory).toHaveBeenLastCalledWith(host);
    next.emit({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    previous.emit({ phase: 'ready', sceneKey: 'Game', errorMessage: null });
    expect(service.currentSceneKey()).toBe('MainMenu');
    service.retry();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('destroys a client if subscription setup fails', () => {
    const game = createClient();
    vi.mocked(game.client.subscribe).mockImplementation(() => {
      throw new Error('Subscription failed');
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
});
