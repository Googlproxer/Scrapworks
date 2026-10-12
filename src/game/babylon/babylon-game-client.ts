import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { Engine } from '@babylonjs/core/Engines/engine';
import type { Scene } from '@babylonjs/core/scene';
import type { GameClient } from '@contracts/game-client';
import type { GameState, SceneKey } from '@contracts/game-state';
import { BehaviorSubject } from 'rxjs';
import { loadPlayer } from './assets/load-player';
import { createGameScene } from './scenes/game.scene';
import { createMainMenuScene } from './scenes/main-menu.scene';

type BabylonSceneKey = Extract<SceneKey, 'MainMenu' | 'Game'>;

export class BabylonGameClient implements GameClient {
  private readonly stateSubject = new BehaviorSubject<GameState>({
    phase: 'loading',
    sceneKey: null,
    errorMessage: null,
  });

  private destroyed = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly engine: Engine;
  private readonly resizeObserver: ResizeObserver;
  private currentScene?: Scene;
  private currentAssets?: AssetContainer;
  private transition = 0;

  public constructor(
    host: HTMLElement,
    private readonly loadPlayerFn = loadPlayer,
  ) {
    this.canvas = host.ownerDocument.createElement('canvas');
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Scrapworks 3D viewport');
    this.canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
    host.append(this.canvas);

    try {
      this.engine = new Engine(this.canvas, true);
    } catch (error) {
      this.canvas.remove();
      throw error;
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.destroyed) this.engine.resize();
    });
    this.resizeObserver.observe(host);
    this.engine.resize();
    this.engine.runRenderLoop(this.renderFrame);
    this.setScene('MainMenu');
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
    this.destroyed = true;
    ++this.transition;
    this.resizeObserver.disconnect();
    this.engine.stopRenderLoop(this.renderFrame);
    this.disposeCurrentScene();
    this.engine.dispose();
    this.canvas.remove();
    this.stateSubject.next({ phase: 'stopped', sceneKey: null, errorMessage: null });
    this.stateSubject.complete();
  }

  public setScene(key: SceneKey): void {
    if (this.destroyed || (key !== 'MainMenu' && key !== 'Game')) return;
    const state = this.stateSubject.value;
    if (state.sceneKey === key && (state.phase === 'loading' || state.phase === 'ready')) return;

    const transition = ++this.transition;
    this.disposeCurrentScene();
    this.stateSubject.next({ phase: 'loading', sceneKey: key, errorMessage: null });
    if (this.isCurrentTransition(transition)) void this.loadScene(key, transition);
  }

  private async loadScene(key: BabylonSceneKey, transition: number): Promise<void> {
    try {
      const scene = key === 'Game' ? createGameScene(this.engine) : createMainMenuScene(this.engine);
      this.currentScene = scene;

      if (key === 'Game') {
        const assets = await this.loadPlayerFn(scene);
        if (!this.isCurrentTransition(transition)) {
          assets.dispose();
          return;
        }
        this.currentAssets = assets;
        assets.addAllToScene();
      }

      await scene.whenReadyAsync();
      if (!this.isCurrentTransition(transition)) return;
      scene.activeCamera?.attachControl(this.canvas, true);
      scene.render();
      this.stateSubject.next({ phase: 'ready', sceneKey: key, errorMessage: null });
    } catch (error) {
      if (this.isCurrentTransition(transition)) this.reportError(error);
    }
  }

  private isCurrentTransition(transition: number): boolean {
    return !this.destroyed && this.transition === transition;
  }

  private disposeCurrentScene(): void {
    const assets = this.currentAssets;
    const scene = this.currentScene;
    this.currentAssets = undefined;
    this.currentScene = undefined;
    assets?.dispose();
    scene?.dispose();
  }

  private reportError(error: unknown): void {
    const sceneKey = this.stateSubject.value.sceneKey;
    this.disposeCurrentScene();
    this.stateSubject.next({ phase: 'error', sceneKey, errorMessage: error instanceof Error ? error.message : String(error) });
  }

  private readonly renderFrame = () => {
    if (!this.destroyed && this.stateSubject.value.phase === 'ready') {
      try {
        this.currentScene?.render();
      } catch (error) {
        this.reportError(error);
      }
    }
  };
}
