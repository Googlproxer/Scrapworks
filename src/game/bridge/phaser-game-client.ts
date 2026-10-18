import type { GameClient } from '@contracts/game-client';
import { GameEvent, type SceneErrorEvent, type SceneEvent } from '@contracts/game-events';
import type { GameState, SceneKey } from '@contracts/game-state';
import { Core, type Game } from 'phaser';
import { BehaviorSubject } from 'rxjs';

export class PhaserGameClient implements GameClient {
  private readonly stateSubject = new BehaviorSubject<GameState>({
    phase: 'loading',
    sceneKey: null,
    errorMessage: null,
  });

  private destroyed = false;

  public constructor(private readonly game: Game) {
    game.events.addListener(GameEvent.SCENE_LOADING, this.onSceneLoading, this);
    game.events.addListener(GameEvent.SCENE_READY, this.onSceneReady, this);
    game.events.addListener(GameEvent.SCENE_STOPPED, this.onSceneStopped, this);
    game.events.addListener(GameEvent.SCENE_ERROR, this.onSceneError, this);
    game.events.addListener(Core.Events.DESTROY, this.onGameDestroyed, this);
  }

  public subscribe(listener: (state: GameState) => void): () => void {
    if (this.destroyed) {
      listener(this.stateSubject.value);
      return () => undefined;
    }

    const subscription = this.stateSubject.subscribe(listener);
    return () => subscription.unsubscribe();
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.onGameDestroyed();
    this.game.destroy(true);
  }

  public setScene(key: SceneKey): void {
    const state = this.stateSubject.value;
    if (this.destroyed || state.phase !== 'ready' || state.sceneKey === key) return;

    this.stateSubject.next({ phase: 'loading', sceneKey: key, errorMessage: null });
    if (this.destroyed) return;
    try {
      if (state.sceneKey) this.game.scene.stop(state.sceneKey);
      this.game.scene.start(key);
    } catch (error) {
      this.onSceneError({ sceneKey: key, errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }

  public setInputEnabled(on: boolean): void {
    // noop
  }

  private onSceneLoading(data: SceneEvent): void {
    if (this.destroyed || this.stateSubject.value.phase === 'error') return;
    this.stateSubject.next({ phase: 'loading', sceneKey: data.sceneKey, errorMessage: null });
  }

  private onSceneReady(data: SceneEvent): void {
    if (this.destroyed || this.stateSubject.value.phase === 'error') return;
    this.stateSubject.next({ phase: 'ready', sceneKey: data.sceneKey, errorMessage: null });
  }

  private onSceneStopped(data: SceneEvent): void {
    if (this.destroyed || this.stateSubject.value.phase === 'error' || this.stateSubject.value.sceneKey !== data.sceneKey) return;
    this.stateSubject.next({ phase: 'stopped', sceneKey: null, errorMessage: null });
  }

  private onSceneError(data: SceneErrorEvent): void {
    if (this.destroyed || this.stateSubject.value.phase === 'error') return;
    this.stateSubject.next({ phase: 'error', sceneKey: data.sceneKey, errorMessage: data.errorMessage });
  }

  private onGameDestroyed(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.game.events.removeListener(GameEvent.SCENE_LOADING, this.onSceneLoading, this);
    this.game.events.removeListener(GameEvent.SCENE_READY, this.onSceneReady, this);
    this.game.events.removeListener(GameEvent.SCENE_STOPPED, this.onSceneStopped, this);
    this.game.events.removeListener(GameEvent.SCENE_ERROR, this.onSceneError, this);
    this.game.events.removeListener(Core.Events.DESTROY, this.onGameDestroyed, this);
    this.stateSubject.next({ phase: 'stopped', sceneKey: null, errorMessage: null });
    this.stateSubject.complete();
  }
}
