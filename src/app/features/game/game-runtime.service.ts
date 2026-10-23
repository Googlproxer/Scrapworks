import {
  afterNextRender,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  Service,
  signal,
} from '@angular/core';
import type {
  GameClient,
  GameClientOptions,
  InspectorState,
  UiKeyInput,
} from '@contracts/game-client';
import type { GameState, SceneKey } from '@contracts/game-state';
import type { ActionFrame, ButtonControl, ControllerInfo } from '@contracts/input';
import type { WorldDefinition, WorldView } from '@contracts/world';
import { environment } from '../../../environments/environment';
import { ControlSettingsService } from '../controls/control-settings.service';
import { validatePlacement } from '@simulation/placement';
import { GameSession } from './session/game-session';
import { GAME_CLIENT_FACTORY } from './game-client-factory';

@Service({ autoProvided: false })
export class GameRuntimeService {
  private readonly stateValue = signal<GameState>({
    phase: 'idle',
    sceneKey: null,
    errorMessage: null,
  });

  private readonly createClient = inject(GAME_CLIENT_FACTORY);
  private readonly injector = inject(Injector);
  private client?: GameClient;
  private host?: HTMLElement;
  private unsubscribe?: () => void;
  private generation = 0;
  private dispatchRevision = 0;
  private captureRevision = 0;
  private disposed = false;

  public readonly state = this.stateValue.asReadonly();
  public readonly currentSceneKey = computed(() => this.state().sceneKey);
  public readonly isReady = computed(() => this.state().phase === 'ready');
  public readonly isLoading = computed(() => this.state().phase === 'loading');
  public readonly errorMessage = computed(() => this.state().errorMessage);
  public readonly world = signal<WorldView | null>(null);
  public readonly selection = signal<string | null>(null);
  public readonly controllers = signal<readonly ControllerInfo[]>([]);
  private readonly requestedController = signal<string | null>(null);
  public readonly selectedController = this.requestedController.asReadonly();
  public readonly capturingBinding = signal(false);
  private readonly inspectorValue = signal<InspectorState>({ phase: 'closed', errorMessage: null });
  public readonly inspectorState = this.inspectorValue.asReadonly();
  public readonly inspectorActive = computed(() =>
    ['loading', 'open'].includes(this.inspectorState().phase),
  );
  public readonly settings = inject(ControlSettingsService);
  private readonly actionListeners = new Set<(frame: ActionFrame) => void>();
  private session?: GameSession;
  private definition?: WorldDefinition;
  private readonly tickSubscriptions = new Set<() => void>();
  private unsubscribeControllers?: () => void;
  private stopCapture?: () => void;
  private uiFocused = false;
  private inspectorReturnFocus?: HTMLElement;

  private currentInputRequest = true;

  constructor() {
    effect(() => {
      // Read even while unmounted so later preference changes remain observed.
      const profile = this.settings.profile();
      ++this.dispatchRevision;
      this.session?.clearInput();
      this.client?.input?.updateBindings(profile);
    });
    inject(DestroyRef).onDestroy(() => {
      this.disposed = true;
      this.unmount();
    });
  }

  public mount(host: HTMLElement): void {
    if (this.disposed || (this.host === host && this.client)) return;
    this.unmount();
    const generation = ++this.generation;
    this.host = host;
    this.stateValue.set({ phase: 'loading', sceneKey: null, errorMessage: null });

    try {
      const options: GameClientOptions = {
        bindings: this.settings.profile(),
        developerFixture: !!environment.dev,
        onActionFrame: (frame) => {
          if (generation !== this.generation || this.inspectorActive()) return;
          const revision = this.dispatchRevision;
          for (const listener of this.actionListeners) {
            listener(frame);
            if (generation !== this.generation || revision !== this.dispatchRevision) break;
          }
        },
        onWorldView: (view) => {
          if (generation === this.generation) this.world.set(view);
        },
        onSelection: (selection) => {
          if (generation === this.generation) this.selection.set(selection);
        },
        onInspectorState: (state) => {
          if (generation !== this.generation) return;
          const wasActive = this.inspectorActive();
          ++this.dispatchRevision;
          this.inspectorValue.set(state);
          if (this.inspectorActive()) this.session?.setPaused(true);
          this.updateInputContext();
          if (wasActive && !this.inspectorActive()) {
            const focus = this.inspectorReturnFocus;
            this.inspectorReturnFocus = undefined;
            afterNextRender(
              () => {
                if (generation === this.generation && !this.inspectorActive() && focus?.isConnected)
                  focus.focus();
              },
              { injector: this.injector },
            );
          }
        },
        session: {
          initialize: (definition) => {
            if (generation !== this.generation) return;
            if (!this.session || this.session.failed || this.definition?.id !== definition.id) {
              this.definition = definition;
              this.session = new GameSession(definition, { developerFixture: !!environment.dev });
            }
            this.session.clearInput();
            this.session.resetTiming();
          },
          registerTickHandler: (handler, order) => {
            const session = this.session;
            if (generation !== this.generation || !session) return () => undefined;
            const remove = session.registerTickHandler((context) => {
              if (
                generation === this.generation &&
                this.session === session &&
                this.gameplayAllowed()
              )
                handler(context);
            }, order);
            const unsubscribe = () => {
              remove();
              this.tickSubscriptions.delete(unsubscribe);
            };
            this.tickSubscriptions.add(unsubscribe);
            return unsubscribe;
          },
          frame: (seconds, movement, sprint, active) => {
            if (!this.session) throw new Error('The world is not initialized.');
            if (generation !== this.generation) return this.session.view;
            const canAdvance = active && this.gameplayAllowed();
            this.session.setPaused(!canAdvance);
            this.session.setMovement(canAdvance ? movement : { x: 0, z: 0 }, sprint);
            this.session.advance(seconds);
            return this.session.view;
          },
          place: (cell, rotation) => {
            if (generation === this.generation && this.gameplayAllowed()) {
              this.session?.enqueue({ type: 'place', cell, rotation, buildingId: 'test-building' });
            }
          },
          preview: (cell, rotation) => {
            if (generation !== this.generation || !this.session || !this.definition)
              return { valid: false, reason: 'World not ready', cells: [] };
            return validatePlacement(
              this.definition,
              this.session.view,
              cell,
              rotation,
              !!environment.dev,
            );
          },
        },
      };
      const client = this.createClient(host, options);
      if (this.disposed || generation !== this.generation) {
        client.destroy();
        return;
      }
      this.client = client;
      const unsubscribe = client.subscribe((state) => {
        if (generation === this.generation && this.client === client) {
          ++this.dispatchRevision;
          this.stateValue.set(state);
          if (state.phase !== 'ready' || state.sceneKey !== 'Game') this.session?.setPaused(true);
          this.updateInputContext();
        }
      });
      if (generation === this.generation && this.client === client) this.unsubscribe = unsubscribe;
      else {
        unsubscribe();
        return;
      }
      client.setInputEnabled(this.currentInputRequest);
      if (generation !== this.generation || this.client !== client) return;
      const unsubscribeControllers = client.input?.subscribeControllers((controllers) => {
        if (generation === this.generation && this.client === client) {
          this.controllers.set(controllers);
          const requested = this.requestedController();
          if (requested !== null) {
            const controller = controllers.find((candidate) => candidate.id === requested);
            if (!controller) this.requestedController.set(null);
            else if (!controller.selected) this.selectController(requested);
          }
        }
      });
      if (generation !== this.generation || this.client !== client) {
        unsubscribeControllers?.();
        return;
      }
      this.unsubscribeControllers = unsubscribeControllers;
      this.updateInputContext();
    } catch (error) {
      if (generation !== this.generation) return;
      this.unmount();
      console.error(error);
      if (this.disposed) return;
      this.host = host;
      this.stateValue.set({
        phase: 'error',
        sceneKey: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public unmount(): void {
    if (!this.host && !this.client) return;
    ++this.generation;
    ++this.dispatchRevision;
    for (const unsubscribe of this.tickSubscriptions) unsubscribe();
    const client = this.client;
    const unsubscribe = this.unsubscribe;
    this.client = undefined;
    this.host = undefined;
    this.unsubscribe = undefined;
    this.stopCapture?.();
    this.stopCapture = undefined;
    this.capturingBinding.set(false);
    this.inspectorValue.set({ phase: 'closed', errorMessage: null });
    this.inspectorReturnFocus = undefined;
    this.unsubscribeControllers?.();
    this.unsubscribeControllers = undefined;
    this.controllers.set([]);
    this.session?.clearInput();
    this.session?.setPaused(true);
    unsubscribe?.();
    try {
      client?.destroy();
    } finally {
      this.stateValue.set({ phase: 'stopped', sceneKey: null, errorMessage: null });
    }
  }

  public setScene(key: SceneKey): void {
    if (!this.client || !this.isReady()) return;
    ++this.dispatchRevision;
    this.session?.setPaused(true);
    try {
      this.client.setScene(key);
    } catch (error) {
      this.stateValue.set({
        phase: 'error',
        sceneKey: key,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public setInputEnabled(on: boolean) {
    ++this.dispatchRevision;
    this.currentInputRequest = on;
    if (!on) this.session?.setPaused(true);
    if (!this.client) return;
    try {
      this.client.setInputEnabled(on);
      this.updateInputContext();
    } catch (error) {
      this.stateValue.set({
        phase: 'error',
        sceneKey: this.state().sceneKey,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public retry(): void {
    const host = this.host;
    if (!host || this.state().phase !== 'error' || this.disposed) return;
    this.unmount();
    this.mount(host);
  }

  public async toggleInspector(): Promise<void> {
    if (!environment.dev || (!this.isReady() && !this.inspectorActive())) return;
    if (!this.inspectorActive()) {
      const active = this.host?.ownerDocument.activeElement;
      this.inspectorReturnFocus = active instanceof HTMLElement ? active : undefined;
    }
    await this.client?.toggleInspector?.();
  }

  public subscribeActions(listener: (frame: ActionFrame) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  public setUiFocused(focused: boolean): void {
    ++this.dispatchRevision;
    this.uiFocused = focused;
    if (focused) this.session?.setPaused(true);
    this.updateInputContext();
  }

  private updateInputContext(): void {
    this.client?.input?.setContext(
      this.inspectorActive()
        ? null
        : !this.currentInputRequest ||
            this.uiFocused ||
            this.currentSceneKey() !== 'Game' ||
            this.state().phase !== 'ready'
          ? 'ui'
          : 'gameplay',
    );
  }

  public focusViewport(): void {
    ++this.dispatchRevision;
    this.uiFocused = false;
    this.updateInputContext();
    this.client?.input?.focus();
  }

  private gameplayAllowed(): boolean {
    return (
      this.currentInputRequest &&
      !this.uiFocused &&
      !this.capturingBinding() &&
      !this.inspectorActive() &&
      this.isReady() &&
      this.currentSceneKey() === 'Game'
    );
  }

  public selectController(id: string | null): void {
    ++this.dispatchRevision;
    this.session?.clearInput();
    const previous = this.requestedController();
    this.requestedController.set(id);
    if (this.client?.input?.selectController(id) === false) this.requestedController.set(previous);
  }

  public captureBinding(listener: (control: ButtonControl) => void): () => void {
    this.stopCapture?.();
    const capture = ++this.captureRevision;
    const generation = this.generation;
    ++this.dispatchRevision;
    this.session?.setPaused(true);
    this.capturingBinding.set(true);
    const unsubscribe = this.client?.input?.captureBinding((control) => {
      if (
        generation === this.generation &&
        capture === this.captureRevision &&
        this.capturingBinding()
      )
        listener(control);
    });
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      unsubscribe?.();
      if (capture === this.captureRevision) {
        ++this.dispatchRevision;
        this.capturingBinding.set(false);
      }
    };
    this.stopCapture = stop;
    return stop;
  }

  public handleUiKeyboard(input: UiKeyInput): boolean {
    return this.client?.input?.handleUiKeyboard(input) ?? false;
  }
  public handleUiPointer(input: { button: number; down: boolean }): boolean {
    return this.client?.input?.handleUiPointer(input) ?? false;
  }
}
