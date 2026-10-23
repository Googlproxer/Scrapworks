import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import type { GameClient, GameClientOptions, GameInputPort } from '@contracts/game-client';
import { isValidSceneKey, type GameState, type SceneKey } from '@contracts/game-state';
import { assertWorldDefinition, type WorldDefinition } from '@contracts/world';
import { BehaviorSubject, Subscription } from 'rxjs';
import { loadEditorScene } from './assets/load-editor-scene';
import { InputManager } from './input/input-manager';
import { BrowserActivity } from './lifecycle/browser-activity';
import { FrameClock } from './timing/frame-clock';
import { loadInspector } from './debug/inspector-loader';
import { SceneInspector, type InspectorLoader } from './debug/scene-inspector';
import type { Context } from '@contracts/input';
import { WorldScene } from './views/world-scene';
import { FrameOwnershipChanged } from './views/world-frame';

export class BabylonGameClient implements GameClient {
  private readonly stateSubject = new BehaviorSubject<GameState>({
    phase: 'loading',
    sceneKey: null,
    errorMessage: null,
  });
  private readonly clock = new FrameClock();
  private readonly canvas: HTMLCanvasElement;
  private readonly ownerDocument: Document;
  private readonly ownerWindow: Window;
  private engine!: Engine;
  private inputManager!: InputManager;
  private browserActivity!: BrowserActivity;
  private resizeObserver?: ResizeObserver;
  private currentScene?: Scene;
  private currentAssets?: AssetContainer;
  private world?: WorldScene;
  private definition?: WorldDefinition;
  private worldAbort?: AbortController;
  private transition = 0;
  private destroyed = false;
  private scenePrepared = false;
  private hostHasSize = false;
  private contextLost = false;
  private suspendingWorld = false;
  private recoveryFrame?: number;
  private readonly subscriptions: Subscription[] = [];
  private readonly handlers: (() => void)[] = [];
  private readonly pendingSceneDisposals = new Set<Promise<void>>();
  private pointer?: { x: number; y: number };
  private requestedInputContext: Context | null = 'ui';
  private readonly inspector = new SceneInspector(
    () => this.inspectorLoader(),
    (state) => {
      this.inputManager?.setContext(this.inspectorActive ? null : this.requestedInputContext);
      if (this.inspectorActive) this.suspendWorld();
      this.options.onInspectorState?.(state);
      if (this.inputManager) this.attachCamera();
    },
  );
  public readonly input: GameInputPort;

  private get inspectorActive(): boolean {
    return ['loading', 'open'].includes(this.inspector.state.phase);
  }

  public get hasError(): boolean {
    return this.stateSubject.value.phase === 'error';
  }
  public get currentKey(): SceneKey | null {
    return this.stateSubject.value.sceneKey;
  }

  public constructor(
    host: HTMLElement,
    private readonly loadSceneFn = loadEditorScene,
    private readonly options: GameClientOptions = {},
    private readonly inspectorLoader: InspectorLoader = loadInspector,
  ) {
    this.ownerDocument = host.ownerDocument;
    const ownerWindow = host.ownerDocument.defaultView;
    if (!ownerWindow) throw new Error('The viewport document has no window.');
    this.ownerWindow = ownerWindow;
    this.canvas = this.ownerDocument.createElement('canvas');
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Scrapworks 3D viewport');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    host.append(this.canvas);
    try {
      this.engine = new Engine(this.canvas, true);
      this.engine.canvasTabIndex = 0;
      this.browserActivity = new BrowserActivity(this.ownerDocument);
      this.inputManager = new InputManager(this.engine, options.bindings, this.ownerDocument);
      this.input = {
        setContext: (context) => {
          this.requestedInputContext = context;
          this.inputManager.setContext(this.inspectorActive ? null : context);
          if (context !== 'gameplay') this.suspendWorld();
        },
        updateBindings: (profile) => this.inputManager.updateBindings(profile),
        selectController: (id) => this.inputManager.selectController(id),
        subscribeControllers: (listener) => this.inputManager.subscribeControllers(listener),
        captureBinding: (listener) => this.inputManager.subscribeRawInput(listener),
        handleUiKeyboard: (event) => this.inputManager.handleUiKeyboard(event),
        handleUiPointer: (event) => this.inputManager.handleUiPointer(event),
        focus: () => this.canvas.focus(),
      };
      const listen = <K extends keyof HTMLElementEventMap>(
        name: K,
        listener: (event: HTMLElementEventMap[K]) => void,
      ) => {
        this.canvas.addEventListener(name, listener);
        this.handlers.push(() => this.canvas.removeEventListener(name, listener));
      };
      listen('focus', () => this.reconcileActivity());
      listen('blur', () => this.reconcileActivity());
      listen('pointermove', (event) => {
        this.inputManager.markPointerActivity();
        const rect = this.canvas.getBoundingClientRect();
        this.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      });
      listen('pointerdown', (event) => {
        this.inputManager.markPointerActivity();
        this.canvas.focus();
        const rect = this.canvas.getBoundingClientRect();
        this.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      });
      listen('contextmenu', (event) => {
        if (this.inputManager.enabled) event.preventDefault();
      });
      listen('wheel', () => this.inputManager.markPointerActivity());
      this.resizeObserver = new ResizeObserver(() => {
        if (this.destroyed) return;
        this.hostHasSize = host.clientWidth > 0 && host.clientHeight > 0;
        if (this.hostHasSize && !this.contextLost) this.engine.resize();
        this.reconcileActivity();
      });
      this.hostHasSize = host.clientWidth > 0 && host.clientHeight > 0;
      this.resizeObserver.observe(host);
      this.subscriptions.push(
        this.browserActivity.visibleObs.subscribe(() => this.reconcileActivity()),
        this.browserActivity.hasFocusObs.subscribe(() => this.reconcileActivity()),
        this.inputManager.enabledObs.subscribe(() => this.attachCamera()),
      );
      const contextObserver = this.engine.onContextLostObservable.add(() => {
        if (this.destroyed || this.contextLost) return;
        this.contextLost = true;
        ++this.transition;
        this.suspendWorld(false);
        this.inputManager.clear();
        this.reportError(
          new Error('Graphics context was lost. Choose Retry to restore the 3D viewport.'),
        );
        this.inputManager.setContext('ui');
        this.engine.stopRenderLoop(this.renderFrame);
        this.recoveryFrame = this.ownerWindow.requestAnimationFrame(this.recoveryTick);
      });
      this.handlers.push(() => this.engine.onContextLostObservable.remove(contextObserver));
      this.engine.resize();
      this.engine.runRenderLoop(this.renderFrame);
      this.setScene('MainMenu');
    } catch (error) {
      this.destroyed = true;
      this.cleanup();
      this.stateSubject.complete();
      throw error;
    }
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
    this.cleanup();
    this.stateSubject.next({ phase: 'stopped', sceneKey: null, errorMessage: null });
    this.stateSubject.complete();
  }

  private cleanup(): void {
    if (this.recoveryFrame !== undefined) this.ownerWindow.cancelAnimationFrame(this.recoveryFrame);
    this.recoveryFrame = undefined;
    this.resizeObserver?.disconnect();
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    for (const remove of this.handlers) remove();
    this.handlers.length = 0;
    this.engine?.stopRenderLoop(this.renderFrame);
    this.suspendWorld(false);
    this.disposeCurrentScene();
    this.inspector.dispose();
    this.inputManager?.dispose();
    this.browserActivity?.release();
    this.canvas.remove();
    // Inspector's React/service teardown must complete before its scene and engine disappear.
    // Everything that drives frames or accepts input has already stopped synchronously.
    if (this.pendingSceneDisposals.size) {
      const engine = this.engine;
      void Promise.allSettled([...this.pendingSceneDisposals]).then(() => engine?.dispose());
    } else this.engine?.dispose();
  }

  public setScene(key: SceneKey): void {
    if (this.destroyed || this.contextLost || !isValidSceneKey(key)) return;
    const state = this.stateSubject.value;
    if (state.sceneKey === key && ['loading', 'ready', 'paused'].includes(state.phase)) return;
    const transition = ++this.transition;
    this.suspendWorld();
    if (!this.isCurrentTransition(transition)) return;
    this.disposeCurrentScene();
    this.pointer = undefined;
    this.inputManager.clear();
    this.stateSubject.next({ phase: 'loading', sceneKey: key, errorMessage: null });
    this.reconcileActivity();
    if (this.isCurrentTransition(transition)) void this.loadScene(key, transition);
  }

  public setInputEnabled(on: boolean): void {
    this.inputManager.setEnabled(on);
    if (!on) this.suspendWorld();
    this.attachCamera();
  }

  public async toggleInspector(): Promise<void> {
    if (this.inspectorActive) {
      await this.inspector.close();
      return;
    }
    if (!this.canRender() || !this.currentScene) return;
    const host = this.canvas.parentElement;
    if (host) await this.inspector.toggle(this.currentScene, host);
  }

  private async loadScene(key: SceneKey, transition: number): Promise<void> {
    const scene = new Scene(this.engine);
    this.currentScene = scene;
    try {
      const assets = await this.loadSceneFn(scene, key);
      if (!this.isCurrentTransition(transition)) {
        assets.dispose();
        return;
      }
      this.currentAssets = assets;
      assets.addAllToScene();
      if (key === 'Game') {
        const abort = new AbortController();
        this.worldAbort = abort;
        const response = await fetch(
          new URL('scene/worlds/game.json', this.ownerDocument.baseURI),
          { signal: abort.signal },
        );
        if (!response.ok) throw new Error(`World definition failed to load (${response.status}).`);
        const definition: unknown = await response.json();
        assertWorldDefinition(definition);
        if (!this.isCurrentTransition(transition)) return;
        this.options.session?.initialize(definition);
        const world = await WorldScene.create(scene, definition, this.options);
        if (!this.isCurrentTransition(transition)) {
          world.dispose();
          return;
        }
        this.definition = definition;
        this.world = world;
      }
      await scene.whenReadyAsync();
      if (!this.isCurrentTransition(transition)) return;
      this.scenePrepared = true;
      this.clock.reset();
      this.reconcileActivity();
    } catch (error) {
      if (this.isCurrentTransition(transition)) this.reportError(error);
    }
  }

  private isCurrentTransition(transition: number): boolean {
    return !this.destroyed && this.transition === transition;
  }
  private canRender(): boolean {
    return (
      !!this.currentScene &&
      this.scenePrepared &&
      this.hostHasSize &&
      this.browserActivity.isVisible &&
      !this.destroyed &&
      !this.hasError &&
      !this.contextLost
    );
  }

  private reconcileActivity(): void {
    if (!this.inputManager) return;
    const eligible =
      this.scenePrepared &&
      this.currentKey === 'Game' &&
      this.hostHasSize &&
      this.ownerDocument.activeElement === this.canvas &&
      !this.destroyed &&
      !this.hasError;
    this.inputManager.setViewportActive(eligible);
    this.attachCamera();
    if (!this.canRender()) {
      this.suspendWorld();
      if (this.scenePrepared && !this.hasError && !this.destroyed) {
        const state = this.stateSubject.value;
        if (state.phase !== 'paused') this.stateSubject.next({ ...state, phase: 'paused' });
      }
    }
    if (!this.browserActivity.hasFocus) this.suspendWorld();
  }

  private attachCamera(): void {
    const camera = this.currentScene?.activeCamera;
    if (!camera) return;
    if (this.canRender() && this.inputManager.enabled) {
      camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
      camera.attachControl(this.canvas, true);
    } else camera.detachControl();
  }

  private suspendWorld(publish = true): void {
    this.clock.reset();
    if (this.suspendingWorld) return;
    this.suspendingWorld = true;
    try {
      if (this.definition && this.options.session) {
        const view = this.options.session.frame(0, { x: 0, z: 0 }, false, false);
        if (publish) this.options.onWorldView?.(view);
      }
    } finally {
      this.suspendingWorld = false;
    }
  }

  private disposeCurrentScene(): void {
    this.scenePrepared = false;
    const inspectorCleanup = this.inspector.close();
    this.worldAbort?.abort();
    this.worldAbort = undefined;
    const assets = this.currentAssets,
      scene = this.currentScene,
      world = this.world;
    this.currentAssets = undefined;
    this.currentScene = undefined;
    this.world = undefined;
    this.definition = undefined;
    const release = () => {
      world?.dispose();
      assets?.dispose();
      scene?.dispose();
    };
    if (inspectorCleanup) {
      const pending = inspectorCleanup.finally(release);
      this.pendingSceneDisposals.add(pending);
      void pending
        .finally(() => this.pendingSceneDisposals.delete(pending))
        .catch((error: unknown) => console.error('Scene cleanup failed', error));
    } else release();
  }

  private reportError(error: unknown): void {
    const transition = this.transition;
    const sceneKey = this.currentKey;
    this.suspendWorld(false);
    if (!this.isCurrentTransition(transition)) return;
    this.disposeCurrentScene();
    this.inputManager.clear();
    this.stateSubject.next({
      phase: 'error',
      sceneKey,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    this.reconcileActivity();
  }

  private recoveryTick = () => {
    if (this.destroyed || !this.contextLost) return;
    this.renderFrame();
    if (!this.destroyed)
      this.recoveryFrame = this.ownerWindow.requestAnimationFrame(this.recoveryTick);
  };

  private renderFrame = () => {
    if (this.destroyed) return;
    const transition = this.transition;
    try {
      const frame = this.inputManager.takeFrame();
      // UI polling is independent of scene readiness and rendering capability.
      this.options.onActionFrame?.(frame);
      if (!this.isCurrentTransition(transition) || !this.inputManager.isCurrent(frame)) return;
      const scene = this.currentScene;
      if (!scene || !this.canRender()) {
        this.suspendWorld();
        return;
      }
      const seconds = Math.min(0.25, this.clock.sample(this.ownerWindow.performance.now()));
      const active = frame.context === 'gameplay' && this.inputManager.enabled;
      const world = this.world;
      if (world) {
        const rect = this.canvas.getBoundingClientRect();
        const pointer = this.inputManager.usingController ? undefined : this.pointer;
        world.beginFrame(
          frame,
          seconds,
          active,
          { x: pointer?.x ?? rect.width / 2, y: pointer?.y ?? rect.height / 2 },
          () =>
            this.isCurrentTransition(transition) &&
            this.currentScene === scene &&
            this.canRender() &&
            this.inputManager.isCurrent(frame),
        );
      }
      if (this.stateSubject.value.phase !== 'ready') this.engine.resize();
      try {
        scene.render();
      } finally {
        world?.endFrame();
      }
      if (world && !world.initialized) return;
      if (!this.isCurrentTransition(transition) || this.currentScene !== scene || !this.canRender())
        return;
      const state = this.stateSubject.value;
      if (state.phase !== 'ready') this.stateSubject.next({ ...state, phase: 'ready' });
    } catch (error) {
      if (!(error instanceof FrameOwnershipChanged) && this.isCurrentTransition(transition))
        this.reportError(error);
    }
  };
}
