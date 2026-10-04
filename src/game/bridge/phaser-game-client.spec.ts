import { GameEvent } from '@contracts/game-events';
import type { GameState } from '@contracts/game-state';
import { Core, Events, type Game } from 'phaser';
import { PhaserGameClient } from './phaser-game-client';

describe('PhaserGameClient', () => {
  function createClient() {
    const events = new Events.EventEmitter();
    const scene = { start: vi.fn(), stop: vi.fn() };
    const destroy = vi.fn();
    const game = { events, scene, destroy } as unknown as Game;
    return { client: new PhaserGameClient(game), events, scene, destroy };
  }

  it('replays state and invokes the ready handler with the client context', () => {
    const { client, events } = createClient();
    const states: GameState[] = [];
    const unsubscribe = client.subscribe((state) => states.push(state));
    expect(states).toEqual([{ phase: 'loading', sceneKey: null, errorMessage: null }]);
    events.emit(GameEvent.SCENE_LOADING, { sceneKey: 'Boot' });
    events.emit(GameEvent.SCENE_READY, { sceneKey: 'MainMenu' });
    expect(states.at(-1)).toEqual({ phase: 'ready', sceneKey: 'MainMenu', errorMessage: null });
    const replay = vi.fn();
    client.subscribe(replay);
    expect(replay).toHaveBeenCalledWith(states.at(-1));
    unsubscribe();
    events.emit(GameEvent.SCENE_LOADING, { sceneKey: 'Game' });
    expect(states).toHaveLength(3);
    client.destroy();
  });

  it('only switches a ready scene once and stops the previous scene', () => {
    const { client, events, scene } = createClient();
    const listener = vi.fn();
    client.subscribe(listener);
    client.setScene('Game');
    expect(scene.start).not.toHaveBeenCalled();
    events.emit(GameEvent.SCENE_READY, { sceneKey: 'MainMenu' });
    client.setScene('MainMenu');
    expect(scene.start).not.toHaveBeenCalled();
    client.setScene('Game');
    client.setScene('Game');
    expect(scene.stop).toHaveBeenCalledExactlyOnceWith('MainMenu');
    expect(scene.start).toHaveBeenCalledExactlyOnceWith('Game');
    expect(listener).toHaveBeenLastCalledWith({ phase: 'loading', sceneKey: 'Game', errorMessage: null });
    events.emit(GameEvent.SCENE_STOPPED, { sceneKey: 'MainMenu' });
    expect(listener).toHaveBeenLastCalledWith({ phase: 'loading', sceneKey: 'Game', errorMessage: null });
    events.emit(GameEvent.SCENE_READY, { sceneKey: 'Game' });
    events.emit(GameEvent.SCENE_STOPPED, { sceneKey: 'Game' });
    expect(listener).toHaveBeenLastCalledWith({ phase: 'stopped', sceneKey: null, errorMessage: null });
    client.destroy();
  });

  it('preserves the first load failure instead of letting later readiness hide it', () => {
    const { client, events, scene } = createClient();
    const listener = vi.fn();
    client.subscribe(listener);
    events.emit(GameEvent.SCENE_ERROR, { sceneKey: 'Preloader', errorMessage: 'Missing player asset' });
    events.emit(GameEvent.SCENE_ERROR, { sceneKey: 'Preloader', errorMessage: 'Another error' });
    events.emit(GameEvent.SCENE_LOADING, { sceneKey: 'MainMenu' });
    events.emit(GameEvent.SCENE_READY, { sceneKey: 'MainMenu' });
    events.emit(GameEvent.SCENE_STOPPED, { sceneKey: 'Preloader' });
    client.setScene('Game');
    expect(scene.start).not.toHaveBeenCalled();
    expect(listener).toHaveBeenLastCalledWith({ phase: 'error', sceneKey: 'Preloader', errorMessage: 'Missing player asset' });
    client.destroy();
  });

  it('reports a scene-start exception as state', () => {
    const { client, events, scene } = createClient();
    const listener = vi.fn();
    client.subscribe(listener);
    events.emit(GameEvent.SCENE_READY, { sceneKey: 'MainMenu' });
    scene.start.mockImplementation(() => {
      throw new Error('Scene failed');
    });
    client.setScene('Game');
    expect(listener).toHaveBeenLastCalledWith({ phase: 'error', sceneKey: 'Game', errorMessage: 'Scene failed' });
    client.destroy();
  });

  it('detaches its handlers and replays stopped state after idempotent destruction', () => {
    const { client, events, scene, destroy } = createClient();
    const otherListener = vi.fn();
    events.on(GameEvent.SCENE_READY, otherListener);
    const listener = vi.fn();
    client.subscribe(listener);
    client.destroy();
    client.destroy();
    client.setScene('Game');
    events.emit(GameEvent.SCENE_READY, { sceneKey: 'Game' });
    expect(otherListener).toHaveBeenCalledOnce();
    expect(events.listenerCount(GameEvent.SCENE_READY)).toBe(1);
    expect(events.listenerCount(GameEvent.SCENE_LOADING)).toBe(0);
    expect(events.listenerCount(GameEvent.SCENE_ERROR)).toBe(0);
    expect(events.listenerCount(GameEvent.SCENE_STOPPED)).toBe(0);
    expect(events.listenerCount(Core.Events.DESTROY)).toBe(0);
    expect(destroy).toHaveBeenCalledExactlyOnceWith(true);
    expect(scene.start).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(2);
    const lateListener = vi.fn();
    const unsubscribe = client.subscribe(lateListener);
    expect(lateListener).toHaveBeenCalledExactlyOnceWith({ phase: 'stopped', sceneKey: null, errorMessage: null });
    unsubscribe();
  });

  it('finishes its state when Phaser is destroyed externally', () => {
    const { client, events, destroy } = createClient();
    const listener = vi.fn();
    client.subscribe(listener);
    events.emit(Core.Events.DESTROY);
    client.destroy();
    expect(listener).toHaveBeenLastCalledWith({ phase: 'stopped', sceneKey: null, errorMessage: null });
    expect(destroy).not.toHaveBeenCalled();
    expect(events.eventNames()).toEqual([]);
  });

  it('does not start a scene if a subscriber destroys the client during its loading notification', () => {
    const { client, events, scene, destroy } = createClient();
    events.emit(GameEvent.SCENE_READY, { sceneKey: 'MainMenu' });
    client.subscribe((state) => {
      if (state.phase === 'loading') client.destroy();
    });
    client.setScene('Game');
    expect(destroy).toHaveBeenCalledOnce();
    expect(scene.stop).not.toHaveBeenCalled();
    expect(scene.start).not.toHaveBeenCalled();
  });
});
