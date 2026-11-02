import { GameSessionOwner } from './game-session-owner';
import { RendererConnection } from './renderer-connection';
import { GameInputCoordinator } from './game-input-coordinator';
import { OpeningUiController } from './opening-ui-controller';
import type { GameClientOptions } from '@game/client-api';
import type { WorldSelection, PlacementFeedback } from '@contracts/game-client';
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
import type { InspectorState, UiKeyInput } from '@contracts/game-client';
import type { GameState, SceneKey } from '@contracts/game-state';
import type { ActionFrame, ButtonControl } from '@contracts/input';

import type { OpeningCommand } from '@contracts/opening';
import type { Inspection } from '@contracts/simulation';
import { environment } from '@environments/environment';
import { validatePlacement } from '@simulation/placement';
import { ControlSettingsService } from '../controls/control-settings.service';
import { GAME_CLIENT_FACTORY } from './game-client-factory';
import { SIMULATION_PORT_FACTORY } from './simulation-port-factory';
import type { DebugDrawSettings, DebugDrawStatus } from '@contracts/debug-draw';

@Service({ autoProvided: false })
export class GameRuntimeService {
  private readonly stateValue = signal<GameState>({
    phase: 'idle',
    sceneKey: null,
    errorMessage: null,
  });

  private readonly createClient = inject(GAME_CLIENT_FACTORY);
  private readonly createSimulationPort = inject(SIMULATION_PORT_FACTORY);
  private readonly injector = inject(Injector);
  private unsubscribe?: () => void;
  private readonly sessions = new GameSessionOwner(this.createSimulationPort, !!environment.dev);
  private readonly renderer = new RendererConnection(this.createClient);
  private readonly inputCoordinator = new GameInputCoordinator({
    clearInput: () => this.session?.clearInput(),
    pause: () => this.session?.setPaused(true),
  });

  private get client() {
    return this.renderer.client;
  }

  private get host() {
    return this.renderer.host;
  }

  private get generation() {
    return this.renderer.generation;
  }

  private get session() {
    return this.sessions.current;
  }

  private get definition() {
    return this.sessions.definition;
  }

  public readonly events$ = this.sessions.events$;
  private disposed = false;

  public readonly state = this.stateValue.asReadonly();
  public readonly currentSceneKey = computed(() => this.state().sceneKey);
  public readonly isReady = computed(() => this.state().phase === 'ready');
  public readonly isLoading = computed(() => this.state().phase === 'loading');
  public readonly errorMessage = computed(() => this.state().errorMessage);
  public readonly world = this.sessions.world;
  private readonly selectionValue = signal<WorldSelection>(null);
  public readonly selection = this.selectionValue.asReadonly();
  private readonly placementValue = signal<PlacementFeedback | null>(null);
  public readonly placementFeedback = this.placementValue.asReadonly();
  public readonly placementLabel = computed(() => {
    const feedback = this.placementFeedback();
    if (!feedback) return null;
    if (feedback.valid) return 'Placement available';
    return {
      'invalid-cell': 'Point at a world cell.',
      'out-of-bounds': 'Choose a cell inside the world.',
      terrain: 'This terrain cannot hold a building.',
      occupied: 'This space is occupied.',
      'player-overlap': 'Move clear of the building footprint.',
      'out-of-reach': 'Move closer to place here.',
      unavailable: 'Placement is unavailable.',
    }[feedback.reason ?? 'unavailable'];
  });
  public readonly selectedEntityId = computed(() => {
    const selection = this.selection();
    return selection?.kind === 'entity' ? selection.id : null;
  });
  public readonly selectionLabel = computed(() => {
    const selection = this.selection();
    return selection?.kind === 'entity'
      ? selection.id
      : selection
        ? 'Cell ' + (selection.cell.column + 1) + ', ' + (selection.cell.row + 1)
        : null;
  });
  private readonly openingUi = new OpeningUiController({
    world: this.world,
    selectedEntityId: this.selectedEntityId,
    submit: (command) => this.command(command),
    setUiFocused: (focused) => this.setUiFocused(focused),
    focusViewport: () => this.focusViewportNow(),
  });
  public readonly fieldKitOpen = this.openingUi.fieldKitOpen;
  public readonly workExitWarning = this.openingUi.workExitWarning;
  private readonly debugDrawSettingsValue = signal<DebugDrawSettings>({
    enabled: false,
    disabledCategories: [],
  });
  public readonly debugDrawSettings = this.debugDrawSettingsValue.asReadonly();
  private readonly debugDrawStatusValue = signal<DebugDrawStatus>({
    available: false,
    categories: [],
  });
  public readonly debugDrawStatus = this.debugDrawStatusValue.asReadonly();
  private readonly inspectionValue = signal<Inspection | null>(null);
  public readonly inspection = this.inspectionValue.asReadonly();
  private unsubscribeInspection?: () => void;
  public readonly controllers = this.inputCoordinator.controllers;
  public readonly selectedController = this.inputCoordinator.selectedController;
  public readonly capturingBinding = this.inputCoordinator.capturing;
  private readonly inspectorValue = signal<InspectorState>({ phase: 'closed', errorMessage: null });
  public readonly inspectorState = this.inspectorValue.asReadonly();
  public readonly inspectorActive = computed(() =>
    ['loading', 'open'].includes(this.inspectorState().phase),
  );
  public readonly settings = inject(ControlSettingsService);
  private readonly tickSubscriptions = new Set<() => void>();
  private inspectorReturnFocus?: HTMLElement;

  private frameSeconds = 0;
  private retainingRendererSession = false;

  constructor() {
    effect(() => {
      // Read even while unmounted so later preference changes remain observed.
      const profile = this.settings.profile();
      this.inputCoordinator.updateBindings(profile);
    });
    const failures = this.sessions.failures$.subscribe((error) => {
      if (this.disposed) return;
      this.stateValue.set({
        phase: 'error',
        sceneKey: 'Game',
        errorMessage: error.message + ' Retry restarts this world from its authored beginning.',
      });
      this.client?.setInputEnabled(false);
      this.updateInputContext();
    });
    inject(DestroyRef).onDestroy(() => {
      this.disposed = true;
      this.unmount();
      failures.unsubscribe();
      this.sessions.destroy();
    });
  }

  public mount(host: HTMLElement): void {
    if (this.disposed || (this.host === host && this.client)) return;
    this.unmount();
    const generation = this.renderer.begin(host);
    this.stateValue.set({ phase: 'loading', sceneKey: null, errorMessage: null });

    try {
      const options: GameClientOptions = {
        bindings: this.settings.profile(),
        developerFixture: !!environment.dev,
        debugDrawSettings: this.debugDrawSettings(),
        actions: {
          dispatch: (frame) => {
            if (generation !== this.generation || this.inspectorActive()) return;
            const revision = this.inputCoordinator.revision;
            if (frame.context === 'gameplay') {
              const salvage = frame.states['salvage'];
              if (salvage?.kind === 'button' && salvage.pressed) this.salvageNearby();
              if (salvage?.kind === 'button' && salvage.released)
                this.command({ type: 'salvage', target: null });
              const toggle = frame.states['toggleSalvage'];
              if (toggle?.kind === 'button' && toggle.pressed) {
                if (this.world()?.opening?.state.salvage)
                  this.command({ type: 'salvage', target: null });
                else this.salvageNearby();
              }
              const inventory = frame.states['inventory'];
              if (inventory?.kind === 'button' && inventory.pressed) this.toggleFieldKit();
            }
            this.inputCoordinator.dispatch(
              frame,
              () => generation === this.generation && revision === this.inputCoordinator.revision,
            );
          },
        },
        session: {
          suspend: () => {
            if (generation === this.generation) this.session?.setPaused(true);
          },
          initialize: (definition) => {
            if (generation !== this.generation) return Promise.resolve();
            if (!this.session || this.session.failed || this.definition?.id !== definition.id) {
              this.unsubscribeInspection?.();
              this.unsubscribeInspection = undefined;
              this.inspectionValue.set(null);
              this.selectionValue.set(null);
            }
            return this.sessions.initialize(definition);
          },
          registerCompletedTickHandler: (handler, order) => {
            const session = this.session;
            if (generation !== this.generation || !session) return () => undefined;
            const remove = session.registerCompletedTickHandler((context) => {
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
          frame: (seconds, movement, sprint, active, simulationActive = active) => {
            if (!this.session) throw new Error('The world is not initialized.');
            if (generation !== this.generation) return this.session.readView();
            if (this.session.failed) {
              if (active) throw this.session.error;
              return this.session.readView();
            }
            const canAdvance = simulationActive && this.simulationAllowed();
            this.session.setPaused(!canAdvance);
            this.session.setMovement(
              canAdvance && active && !this.inputCoordinator.uiFocused ? movement : { x: 0, z: 0 },
              sprint,
            );
            this.frameSeconds = seconds;
            const view = this.session.readView();
            return this.sessions.pin(view);
          },
          completeFrame: () => {
            const session = this.session;
            if (!session || generation !== this.generation) return;
            const revision = this.inputCoordinator.revision;
            const activityRevision = session.activityRevision;
            session.flushCompleted();
            if (
              generation === this.generation &&
              this.session === session &&
              revision === this.inputCoordinator.revision &&
              activityRevision === session.activityRevision &&
              this.simulationAllowed()
            )
              session.advance(this.frameSeconds);
            this.frameSeconds = 0;
          },
          isSimulationActive: () => this.simulationAllowed(),
        },
        placement: environment.dev
          ? {
              place: (cell, rotation) => {
                if (generation === this.generation && this.gameplayAllowed()) {
                  this.session?.enqueue({
                    type: 'place',
                    cell,
                    rotation,
                    buildingId: 'test-building',
                  });
                }
              },
              preview: (cell, rotation) => {
                if (generation !== this.generation || !this.session || !this.definition)
                  return { valid: false, reason: 'unavailable', cells: [] };
                return validatePlacement(
                  this.definition,
                  this.session.readView(),
                  cell,
                  rotation,
                  !!environment.dev,
                );
              },
            }
          : undefined,
      };

      const onDebugDrawStatus = (status: DebugDrawStatus) => {
        if (generation === this.generation) this.debugDrawStatusValue.set(status);
      };

      const onSelection = (selection: WorldSelection) => {
        if (generation !== this.generation) return;
        const entityId = selection?.kind === 'entity' ? selection.id : null;
        const previousId = this.selectedEntityId();
        this.selectionValue.set(selection);
        // World interaction stays available after removing gathering from the field kit.
        if (
          selection &&
          this.gameplayAllowed() &&
          this.world()?.ground?.some((pile) => pile.id === entityId)
        )
          this.command({ type: 'pickup', target: entityId! });
        if (entityId === previousId) return;
        this.unsubscribeInspection?.();
        this.unsubscribeInspection = undefined;
        this.inspectionValue.set(null);
        if (entityId && this.session)
          this.unsubscribeInspection = this.session.subscribeDetails(entityId, (value) => {
            if (generation === this.generation && this.selectedEntityId() === entityId)
              this.inspectionValue.set(value);
          });
      };

      const onInspectorState = (state: InspectorState) => {
        if (generation !== this.generation) return;
        const wasActive = this.inspectorActive();
        this.inputCoordinator.invalidate();
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
      };

      const client = this.renderer.create(options);
      if (this.disposed || generation !== this.generation) {
        client.destroy();
        return;
      }
      const unsubscribe = this.renderer.connect({
        state: (state) => {
          if (generation === this.generation && this.client === client) {
            this.inputCoordinator.invalidate();
            this.stateValue.set(
              this.session?.failed && state.sceneKey === 'Game'
                ? {
                    phase: 'error',
                    sceneKey: 'Game',
                    errorMessage: `${this.session.error?.message} Retry restarts this world from its authored beginning.`,
                  }
                : state,
            );
            if (state.phase !== 'ready' || state.sceneKey !== 'Game') this.session?.setPaused(true);
            this.updateInputContext();
          }
        },
        selection: onSelection,
        inspectorState: onInspectorState,
        debugDrawStatus: onDebugDrawStatus,
        placementFeedback: (feedback) => this.placementValue.set(feedback),
      });

      if (generation === this.generation && this.client === client) this.unsubscribe = unsubscribe;
      else {
        unsubscribe();
        return;
      }
      client.setInputEnabled(this.inputCoordinator.enabledRequested);
      if (generation !== this.generation || this.client !== client) return;
      this.inputCoordinator.attach(client.input);
      this.updateInputContext();
    } catch (error) {
      if (generation !== this.generation) return;
      this.unmount();
      console.error(error);
      if (this.disposed) return;
      this.renderer.begin(host);
      this.stateValue.set({
        phase: 'error',
        sceneKey: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public unmount(): void {
    if (!this.host && !this.client) return;
    this.openingUi.reset();
    this.renderer.invalidate();
    this.inputCoordinator.invalidate();
    for (const unsubscribe of this.tickSubscriptions) unsubscribe();
    this.unsubscribeInspection?.();
    this.unsubscribeInspection = undefined;
    this.inspectionValue.set(null);
    this.selectionValue.set(null);
    this.placementValue.set(null);
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = undefined;
    this.inputCoordinator.detach();
    this.inspectorValue.set({ phase: 'closed', errorMessage: null });
    this.debugDrawStatusValue.set({ available: false, categories: [] });
    this.inspectorReturnFocus = undefined;
    this.session?.clearInput();
    this.session?.setPaused(true);
    unsubscribe?.();
    try {
      this.renderer.unmount();
    } finally {
      if (!this.retainingRendererSession) {
        this.sessions.disposeWorld();
      }
      this.stateValue.set({ phase: 'stopped', sceneKey: null, errorMessage: null });
    }
  }

  public setScene(key: SceneKey): void {
    if (!this.client || !this.isReady()) return;
    this.inputCoordinator.invalidate();
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
    this.inputCoordinator.invalidate();
    this.inputCoordinator.requestEnabled(on);
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
    this.retainingRendererSession = !!this.session && !this.session.failed;
    try {
      this.unmount();
      this.mount(host);
    } finally {
      this.retainingRendererSession = false;
    }
  }

  public async toggleInspector(): Promise<void> {
    if (!this.inspectorActive() && this.world()?.opening?.state.handcraft) {
      this.requestWorkExit(() => {
        void this.toggleInspectorNow();
      });
      return;
    }
    await this.toggleInspectorNow();
  }

  private async toggleInspectorNow(): Promise<void> {
    if (!environment.dev || (!this.isReady() && !this.inspectorActive())) return;
    if (!this.inspectorActive()) {
      const active = this.host?.ownerDocument.activeElement;
      this.inspectorReturnFocus = active instanceof HTMLElement ? active : undefined;
    }
    await this.client?.toggleInspector?.();
  }

  public setDebugDrawEnabled(enabled: boolean): void {
    if (!environment.dev) return;
    this.debugDrawSettingsValue.update((settings) => ({ ...settings, enabled }));
    this.renderer.configureDebug(this.debugDrawSettings());
  }

  public setDebugDrawCategory(category: string, enabled: boolean): void {
    if (!environment.dev) return;
    this.debugDrawSettingsValue.update((settings) => ({
      ...settings,
      disabledCategories: enabled
        ? settings.disabledCategories.filter((item) => item !== category)
        : [...new Set([...settings.disabledCategories, category])],
    }));
    this.renderer.configureDebug(this.debugDrawSettings());
  }

  public subscribeActions(listener: (frame: ActionFrame) => void): () => void {
    return this.inputCoordinator.subscribe(listener);
  }

  public setUiFocused(focused: boolean): void {
    if (focused === this.inputCoordinator.uiFocused) return;
    if (!focused && this.world()?.opening?.state.handcraft) {
      this.requestWorkExit(() => this.focusViewportNow());
      return;
    }
    this.inputCoordinator.invalidate();
    this.inputCoordinator.setUiFocused(focused);
    if (focused) {
      this.session?.setMovement({ x: 0, z: 0 });
      this.command({ type: 'salvage', target: null });
    }
    this.updateInputContext();
  }

  private updateInputContext(): void {
    this.inputCoordinator.setContext(
      this.inspectorActive()
        ? null
        : !this.inputCoordinator.enabledRequested ||
            this.inputCoordinator.uiFocused ||
            this.currentSceneKey() !== 'Game' ||
            this.state().phase !== 'ready'
          ? 'ui'
          : 'gameplay',
    );
  }

  public focusViewport(): void {
    this.requestWorkExit(() => this.focusViewportNow());
  }

  private focusViewportNow(): void {
    this.command({ type: 'handcraft-ui', visible: false });
    this.inputCoordinator.invalidate();
    this.inputCoordinator.setUiFocused(false);
    this.updateInputContext();
    this.inputCoordinator.focus();
  }

  private gameplayAllowed(): boolean {
    return (
      this.inputCoordinator.enabledRequested &&
      !this.inputCoordinator.uiFocused &&
      !this.capturingBinding() &&
      !this.inspectorActive() &&
      this.isReady() &&
      this.currentSceneKey() === 'Game'
    );
  }

  private simulationAllowed(): boolean {
    return (
      this.inputCoordinator.enabledRequested &&
      !this.capturingBinding() &&
      !this.inspectorActive() &&
      this.isReady() &&
      this.currentSceneKey() === 'Game'
    );
  }

  public command(command: OpeningCommand): import('@contracts/session-event').CommandSubmission {
    if (!this.simulationAllowed() || !this.session) return { status: 'unavailable' };
    this.session.setPaused(false);
    const sequence = this.session.enqueue(command);
    return sequence === null
      ? { status: 'unavailable' }
      : { status: 'queued', sequence, generation: this.session.generation };
  }

  public salvageNearby(): void {
    this.openingUi.salvageNearby();
  }

  public toggleFieldKit(): void {
    this.openingUi.toggleFieldKit();
  }

  public requestWorkExit(continuation: () => void): void {
    this.openingUi.requestWorkExit(continuation);
  }

  public resolveWorkExit(cancel: boolean): void {
    this.openingUi.resolveWorkExit(cancel);
  }

  public selectController(id: string | null): void {
    this.inputCoordinator.selectController(id);
  }

  public captureBinding(listener: (control: ButtonControl) => void): () => void {
    return this.inputCoordinator.captureBinding(listener);
  }

  public handleUiKeyboard(input: UiKeyInput): boolean {
    return this.inputCoordinator.handleKeyboard(input);
  }

  public handleUiPointer(input: { button: number; down: boolean }): boolean {
    return this.inputCoordinator.handlePointer(input);
  }
}
