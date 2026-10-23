import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import type { GameClient } from '@contracts/game-client';
import {
  BabylonSceneKey,
  isValidSceneKey,
  type GameState,
  type SceneKey,
} from '@contracts/game-state';
import { BehaviorSubject, combineLatest, fromEvent, map, Subscription } from 'rxjs';
import { loadEditorScene } from './assets/load-editor-scene';
import { InputManager } from './input/input-manager';
import { BrowserActivity } from './lifecycle/browser-activity';

export class BabylonGameClient implements GameClient {
  private readonly stateSubject = new BehaviorSubject<GameState>({
    phase: 'loading',
    sceneKey: null,
    errorMessage: null,
  });

  private readonly destroyedSubject = new BehaviorSubject(false);
  private readonly scenePreparedSubject = new BehaviorSubject(false);
  private readonly hostHasSizeSubject = new BehaviorSubject(false);

  private readonly inputManager: InputManager;
  private readonly browserActivity = new BrowserActivity();

  private readonly canvas: HTMLCanvasElement;
  private readonly engine: Engine;
  private readonly resizeObserver: ResizeObserver;
  private currentScene?: Scene;
  private currentAssets?: AssetContainer;
  private transition = 0;

  private canvasActiveSubject = new BehaviorSubject(false);

  public get hasError() {
    return this.stateSubject.value.phase === 'error';
  }

  public get currentKey() {
    return this.stateSubject.value.sceneKey;
  }

  private subs: Subscription[] = [];

  constructor(
    host: HTMLElement,
    private readonly loadSceneFn = loadEditorScene,
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

    this.inputManager = new InputManager(this.engine);

    this.subs.push(
      fromEvent<FocusEvent>(this.canvas, 'focus').subscribe(this.checkCanvasActive.bind(this)),
      fromEvent<FocusEvent>(this.canvas, 'blur').subscribe(this.checkCanvasActive.bind(this)),
    );
    this.checkCanvasActive();

    this.resizeObserver = new ResizeObserver(() => {
      if (this.destroyedSubject.value) return;
      this.engine.resize();
      this.hostHasSizeSubject.next(host.clientWidth > 0 && host.clientHeight > 0);
    });
    this.resizeObserver.observe(host);
    this.engine.resize();
    this.hostHasSizeSubject.next(host.clientWidth > 0 && host.clientHeight > 0);
    this.engine.runRenderLoop(this.renderFrame);

    // watch relevant observables for updates an update camera/render as necessary
    const errorObs = this.stateSubject.pipe(map((s) => s.phase === 'error'));
    const renderObs = combineLatest([
      this.scenePreparedSubject,
      this.destroyedSubject,
      errorObs,
      this.browserActivity.visibleObs,
      this.hostHasSizeSubject,
    ]);
    const gameSceneObs = this.stateSubject.pipe(map((s) => s.sceneKey === 'Game'));

    this.subs.push(
      combineLatest([
        renderObs,
        gameSceneObs,
        this.browserActivity.hasFocusObs,
        this.canvasActiveSubject,
        this.inputManager.enabledObs,
      ])
        //  flatten array
        .pipe(map(([[a, b, c, d, e], f, g, h, i]) => [a, b, c, d, e, f, g, h, i] as const))
        .subscribe((flags) => {
          if (!this.currentScene) return;
          this.attachCamera(this.currentScene, ...flags);
        }),
      //  clear input on error
      errorObs.subscribe(() => {
        this.inputManager.clear();
      }),
      renderObs.subscribe(([scenePrepared, destroyed, hasError]) =>
        this.updateRenderState(destroyed, hasError, scenePrepared),
      ),

      combineLatest([
        this.scenePreparedSubject,
        gameSceneObs,
        this.hostHasSizeSubject,
        this.canvasActiveSubject,
        this.destroyedSubject,
        errorObs,
      ]).subscribe(([scenePrepared, isGame, hostHasSize, canvasFocused, destroyed, hasError]) => {
        const viewportActive =
          scenePrepared && isGame && hostHasSize && canvasFocused && !destroyed && !hasError;
        this.inputManager.setViewportActive(viewportActive);
      }),
    );

    this.setScene('MainMenu');
  }

  public subscribe(listener: (state: GameState) => void): () => void {
    if (this.destroyedSubject.value) {
      listener(this.stateSubject.value);
      return () => undefined;
    }

    const subscription = this.stateSubject.subscribe(listener);
    return () => subscription.unsubscribe();
  }

  public destroy(): void {
    if (this.destroyedSubject.value) return;
    this.destroyedSubject.next(true);
    ++this.transition;
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
    this.subs = [];
    this.resizeObserver.disconnect();
    this.engine.stopRenderLoop(this.renderFrame);
    this.disposeCurrentScene();
    this.engine.dispose();
    this.inputManager.dispose();
    this.canvas.remove();
    this.stateSubject.next({ phase: 'stopped', sceneKey: null, errorMessage: null });
    this.stateSubject.complete();
    this.destroyedSubject.complete();
    this.scenePreparedSubject.complete();
    this.hostHasSizeSubject.complete();
    this.canvasActiveSubject.complete();
  }

  public setScene(key: SceneKey): void {
    if (this.destroyedSubject.value || !isValidSceneKey(key)) return;
    const state = this.stateSubject.value;
    if (state.sceneKey === key && (state.phase === 'loading' || state.phase === 'ready')) return;

    const transition = ++this.transition;
    this.disposeCurrentScene();
    this.stateSubject.next({ phase: 'loading', sceneKey: key, errorMessage: null });
    if (this.isCurrentTransition(transition)) void this.loadScene(key, transition);
  }

  public setInputEnabled(on: boolean) {
    this.inputManager.setEnabled(on);
  }

  private async loadScene(key: BabylonSceneKey, transition: number): Promise<void> {
    try {
      const scene = new Scene(this.engine);
      this.currentScene = scene;

      const assets = await this.loadSceneFn(scene, key);
      if (!this.isCurrentTransition(transition)) {
        assets.dispose();
        return;
      }
      this.currentAssets = assets;
      assets.addAllToScene();

      await scene.whenReadyAsync();
      if (!this.isCurrentTransition(transition)) return;
      this.scenePreparedSubject.next(true);
    } catch (error) {
      if (this.isCurrentTransition(transition)) this.reportError(error);
    }
  }

  private attachCamera(
    scene: Scene,
    scenePrepared: boolean,
    destroyed: boolean,
    hasError: boolean,
    visible: boolean,
    hostHasSize: boolean,
    isGame: boolean,
    hasFocus: boolean,
    canvasActive: boolean,
    inputEnabled: boolean,
  ) {
    const camera = scene.activeCamera;
    if (!camera) return;
    const canAcceptInput =
      scenePrepared &&
      isGame &&
      visible &&
      hostHasSize &&
      hasFocus &&
      canvasActive &&
      inputEnabled &&
      !destroyed &&
      !hasError;
    if (canAcceptInput) {
      camera.attachControl(this.canvas, true);
      camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    } else camera.detachControl();
  }

  private isCurrentTransition(transition: number): boolean {
    return !this.destroyedSubject.value && this.transition === transition;
  }

  private disposeCurrentScene(): void {
    this.scenePreparedSubject.next(false);
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
    this.stateSubject.next({
      phase: 'error',
      sceneKey,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  private checkCanvasActive() {
    this.canvasActiveSubject.next(this.browserActivity.activeElement === this.canvas);
  }

  private canRenderCurrentScene(): boolean {
    return (
      this.currentScene !== undefined &&
      this.scenePreparedSubject.value &&
      this.browserActivity.isVisible &&
      this.hostHasSizeSubject.value &&
      !this.destroyedSubject.value &&
      !this.hasError
    );
  }

  private updateRenderState(destroyed: boolean, hasError: boolean, scenePrepared: boolean): void {
    if (destroyed || hasError || !scenePrepared || !this.currentScene) return;

    const state = this.stateSubject.value;
    if (!this.canRenderCurrentScene() && state.phase !== 'paused') {
      this.stateSubject.next({ ...state, phase: 'paused' });
    }
  }

  private renderFrame = () => {
    const scene = this.currentScene;
    const transition = this.transition;
    if (!scene || !this.canRenderCurrentScene()) return;

    try {
      // Initial/resumed frames resize before drawing.
      if (this.stateSubject.value.phase !== 'ready') this.engine.resize();
      //  TODO: don't handle in render, run in update loop
      this.inputManager.takeFrame();
      scene.render();

      // Rendering callbacks may replace/dispose the scene or change activity.
      if (
        !this.isCurrentTransition(transition) ||
        this.currentScene !== scene ||
        !this.canRenderCurrentScene()
      )
        return;

      const state = this.stateSubject.value;
      if (state.phase !== 'ready') {
        this.stateSubject.next({ ...state, phase: 'ready' });
      }
    } catch (error) {
      if (this.isCurrentTransition(transition) && this.currentScene === scene) {
        this.reportError(error);
      }
    }
  };
}
