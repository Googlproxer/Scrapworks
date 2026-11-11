import { GameSessionOwner } from './game-session-owner';
import { GameStartupResources } from './game-startup-resources';
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

import type { WorldCommand } from '@contracts/world';
import type { EquipmentId } from '@contracts/factory';
import { validateFactoryPlacement } from '@simulation/factory-placement';
import { machineAtCell, validatePowerConnection } from '@simulation/power-connection';
import { distanceToCell } from '@core/world-grid';
import { OPENING_SETTINGS } from '@content/opening';
import type { Inspection } from '@contracts/simulation';
import { environment } from '@environments/environment';
import { assertSameAuthoredMap } from '@core/authored-map';
import { MACHINE_FOOTPRINT } from '@content/factory';
import { TOOLBAR_SLOTS } from '@contracts/toolbar';
import { ControlSettingsService } from '../controls/control-settings.service';
import { GAME_CLIENT_LOADER, type GameClientFactory } from './game-client-factory';
import { AFTER_PAINT } from '../../shared/loading/after-paint';
import type { LoadingStatus } from '@contracts/loading';
import { SIMULATION_PORT_FACTORY } from './simulation-port-factory';
import type { DebugDrawSettings, DebugDrawStatus } from '@contracts/debug-draw';
import type { SaveSnapshot } from '@contracts/save';
import type { SaveBinding, SaveReplacementResult } from '../../../persistence/save-coordinator';
import type { WorldSessionBridge } from '@contracts/game-client';
import { filter, firstValueFrom, Subject } from 'rxjs';

@Service({ autoProvided: false })
export class GameRuntimeService {
  private readonly stateValue = signal<GameState>({
    phase: 'idle',
    sceneKey: null,
    errorMessage: null,
  });

  private readonly loadClient = inject(GAME_CLIENT_LOADER);
  private readonly afterPaint = inject(AFTER_PAINT);
  private cancelPaint?: () => void;
  private pendingScene?: SceneKey;
  private readonly createSimulationPort = inject(SIMULATION_PORT_FACTORY);
  private readonly injector = inject(Injector);
  private unsubscribe?: () => void;
  private readonly sessions = new GameSessionOwner(this.createSimulationPort, !!environment.dev);
  private readonly resources = new GameStartupResources();
  private cancelPreloadPaint?: () => void;
  private preloadStarted = false;
  public readonly preloadMessage = computed(() => {
    const data = this.resources.status(),
      worker = this.sessions.warmState();
    if (data.character === 'failed' || data.definition === 'failed' || worker === 'failed')
      return 'Some data will load when you start.';
    return data.character === 'ready' &&
      data.definition === 'ready' &&
      ['ready', 'claimed'].includes(worker)
      ? 'Game data downloaded.'
      : 'Preparing game data…';
  });
  private saveHolds = 0;
  private saveConfirmationInputs = 0;
  private readonly savePreview = signal<import('@contracts/world').WorldView | null>(null);
  public readonly preparingSave = computed(() => this.savePreview() !== null);
  private sessionBridge?: WorldSessionBridge;
  private pendingSaveFocus?: {
    readonly session: import('../../../session/game-session').GameSession;
    readonly craft: boolean;
  };
  public readonly runId = this.sessions.runId;
  private readonly restoreValue = signal(0);
  public readonly restoreRevision = this.restoreValue.asReadonly();
  private readonly renderer = new RendererConnection();
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
  private readonly loadingValue = signal<LoadingStatus | null>({
    task: 'Starting Scrapworks…',
    progress: null,
  });
  public readonly loading = this.loadingValue.asReadonly();
  public readonly isBusy = computed(() => this.loading() !== null);
  public readonly currentSceneKey = computed(() => this.state().sceneKey);
  public readonly isReady = computed(() => this.state().phase === 'ready');
  public readonly isLoading = computed(() => this.state().phase === 'loading');
  public readonly errorMessage = computed(() => this.state().errorMessage);
  public readonly world = computed(() => this.savePreview() ?? this.sessions.world());
  public readonly toolbar = computed(() => this.world()?.opening?.state.toolbar);
  public readonly activePlaceable = computed(() => {
    const toolbar = this.toolbar();
    return toolbar?.slots[toolbar.active] ?? null;
  });
  private readonly selectionValue = signal<WorldSelection>(null);
  public readonly selection = this.selectionValue.asReadonly();
  private readonly placementValue = signal<PlacementFeedback | null>(null);
  public readonly placementFeedback = this.placementValue.asReadonly();
  public readonly placementLabel = computed(() => {
    const feedback = this.placementFeedback();
    if (!feedback) return null;
    if (feedback.valid) {
      if (feedback.connection === 'cancel') return 'Click again to cancel this connection.';
      if (feedback.connection === 'start') return 'Click a machine to start a power connection.';
      if (feedback.connection === 'end') return 'Click to connect; first cell again cancels.';
      return 'Placement available';
    }
    return {
      'invalid-cell': 'Point at a world cell.',
      'out-of-bounds': 'Choose a cell inside the world.',
      terrain: 'This terrain cannot hold a building.',
      occupied: 'This space is occupied.',
      'player-overlap': 'Move clear of the machine’s collision body.',
      'out-of-reach': feedback.connection
        ? 'Move within two metres of an endpoint.'
        : 'Bring part of the footprint within two metres.',
      'machine-required': 'Point at a placed machine.',
      'same-machine': 'Choose a different machine.',
      'cable-too-long': 'Power connections reach up to twelve metres.',
      'already-connected': 'These machines are already connected.',
      unavailable: 'Assign and select a carried placeable on the toolbar.',
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
  private readonly machineInspectionValue = signal<string | null>(null);
  public readonly machineInspectionId = this.machineInspectionValue.asReadonly();
  private readonly interactionMessages = new Subject<string>();
  public readonly interactionMessages$ = this.interactionMessages.asObservable();
  private unsubscribeInspection?: () => void;
  private inspectionRevision = 0;
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
      const id = this.machineInspectionId();
      if (!id) return;
      const world = this.world();
      const building = world?.buildings.find((entry) => entry.id === id);
      if (
        !building ||
        !world ||
        !this.definition ||
        distanceToCell(this.definition.grid, world.player.position, building.cell) >
          OPENING_SETTINGS.reach + 1e-9 ||
        this.currentSceneKey() !== 'Game' ||
        !!this.errorMessage()
      )
        this.closeMachineInspection();
    });
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
      this.loadingValue.set(null);
      this.pendingScene = undefined;
      this.client?.setInputEnabled(false);
      this.updateInputContext();
    });
    inject(DestroyRef).onDestroy(() => {
      this.disposed = true;
      this.unmount();
      failures.unsubscribe();
      this.interactionMessages.complete();
      this.sessions.destroy();
      this.resources.dispose();
    });
  }

  public mount(host: HTMLElement): void {
    if (this.resources.configure(host.ownerDocument.baseURI)) this.preloadStarted = false;
    if (this.disposed || (this.host === host && (this.client || this.isLoading()))) return;
    this.unmount();
    const generation = this.renderer.begin(host);
    this.stateValue.set({ phase: 'loading', sceneKey: null, errorMessage: null });
    this.loadingValue.set({ task: 'Loading 3D renderer…', progress: null });
    this.cancelPaint = this.afterPaint(() => {
      if (generation !== this.generation || this.disposed) return;
      try {
        void this.loadClient().then(
          (factory) => {
            if (generation !== this.generation || this.disposed || this.host !== host) return;
            this.loadingValue.set({ task: 'Starting 3D renderer…', progress: null });
            this.mountClient(host, generation, factory);
          },
          (error: unknown) => this.mountFailed(host, generation, error),
        );
      } catch (error) {
        this.mountFailed(host, generation, error);
      }
    });
  }

  private mountClient(host: HTMLElement, generation: number, factory: GameClientFactory): void {
    try {
      const options: GameClientOptions = {
        resources: this.resources,
        onMenuReady: () => this.preloadMenu(generation),
        bindings: this.settings.profile(),
        developerFixture: !!environment.dev,
        debugDrawSettings: this.debugDrawSettings(),
        actions: {
          dispatch: (frame) => {
            if (this.saveHolds && (!this.saveConfirmationInputs || frame.context !== 'ui')) return;
            if (generation !== this.generation || this.inspectorActive()) return;
            if (frame.context === 'gameplay' && !this.gameplayAllowed()) return;
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
              for (let slot = 0; slot < TOOLBAR_SLOTS; slot++) {
                const action = frame.states[`slot${slot + 1}`];
                if (action?.kind === 'button' && action.pressed) this.selectPlaceable(slot, false);
              }
              for (const [name, step] of [
                ['previousSlot', -1],
                ['nextSlot', 1],
              ] as const) {
                const action = frame.states[name];
                if (action?.kind === 'button' && action.pressed)
                  this.selectPlaceable(
                    ((this.toolbar()?.active ?? 0) + step + TOOLBAR_SLOTS) % TOOLBAR_SLOTS,
                    false,
                  );
              }
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
            if (this.saveHolds) return;
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
            if (this.saveHolds) return this.sessions.pin(this.session.readView());
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
            if (this.saveHolds) return;
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
          isSimulationActive: () => !this.saveHolds && this.simulationAllowed(),
        },
        placement: {
          current: () => {
            const item = this.activePlaceable();
            return item
              ? { key: item, slot: this.toolbar()?.active, footprint: MACHINE_FOOTPRINT }
              : null;
          },
          place: (cell, rotation, anchor) => {
            if (generation === this.generation && this.gameplayAllowed()) {
              if (this.activePlaceable() === 'power-connection') {
                const view = this.session?.readView();
                const target = view && machineAtCell(view.buildings, cell);
                if (anchor && target)
                  this.command({ type: 'factory-connect-active', from: anchor, to: target.id });
                return;
              }
              this.command({
                type: 'factory-place-active',
                cell,
                rotation,
              });
            }
          },
          preview: (cell, rotation, anchor) => {
            if (generation !== this.generation || !this.session || !this.definition)
              return { valid: false, reason: 'unavailable', cells: [] };
            const equipment = this.activePlaceable();
            const view = this.session.readView();
            if (!equipment || !(view.inventory[equipment] > 0))
              return { valid: false, reason: 'unavailable', cells: [cell] };
            if (equipment === 'power-connection')
              return validatePowerConnection(
                this.definition,
                view,
                anchor ?? null,
                machineAtCell(view.buildings, cell)?.id ?? '',
              );
            return validateFactoryPlacement(this.definition, view, equipment, cell, rotation);
          },
        },
      };

      const onDebugDrawStatus = (status: DebugDrawStatus) => {
        if (generation === this.generation) this.debugDrawStatusValue.set(status);
      };

      const onSelection = (selection: WorldSelection) => {
        if (generation !== this.generation) return;
        if (!this.gameplayAllowed()) return;
        const entityId = selection?.kind === 'entity' ? selection.id : null;
        const previousId = this.selectedEntityId();
        this.selectionValue.set(selection);
        if (
          entityId &&
          this.world()?.buildings.some(
            (building) => building.id === entityId && building.buildingId !== 'test-building',
          )
        ) {
          this.openMachineInspection(entityId);
          return;
        }
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

      this.sessionBridge = options.session;
      const client = this.renderer.create(factory, options);
      if (this.disposed || generation !== this.generation) {
        client.destroy();
        return;
      }
      const unsubscribe = this.renderer.connect({
        loading: (status) => {
          // Lifecycle readiness owns dismissal, including a pause before the first frame.
          if (status && this.isBusy()) this.loadingValue.set(status);
        },
        state: (state) => {
          if (generation === this.generation && this.client === client) {
            if (
              this.pendingScene &&
              state.sceneKey !== this.pendingScene &&
              state.phase !== 'error'
            )
              return;
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
            if (this.state().phase === 'ready' || this.state().phase === 'error') {
              this.loadingValue.set(null);
              this.pendingScene = undefined;
            } else if (state.phase === 'loading' && !this.isBusy()) {
              this.loadingValue.set({ task: 'Loading scene…', progress: null });
            }
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
      this.mountFailed(host, generation, error);
    }
  }

  private mountFailed(host: HTMLElement, generation: number, error: unknown): void {
    if (generation !== this.generation || this.disposed) return;
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

  public unmount(): void {
    this.cancelPreloadPaint?.();
    this.cancelPreloadPaint = undefined;
    if (!this.host && !this.client) return;
    this.cancelPaint?.();
    this.cancelPaint = undefined;
    this.pendingScene = undefined;
    this.loadingValue.set(null);
    this.closeMachineInspection();
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

  private preloadMenu(generation: number): void {
    if (this.preloadStarted || this.cancelPreloadPaint) return;
    this.cancelPreloadPaint = this.afterPaint(() => {
      this.cancelPreloadPaint = undefined;
      if (
        this.preloadStarted ||
        this.disposed ||
        generation !== this.generation ||
        this.currentSceneKey() !== 'MainMenu' ||
        !this.host ||
        this.host.ownerDocument.hidden ||
        this.session
      )
        return;
      this.preloadStarted = true;
      this.resources.preload();
      this.sessions.prewarm();
    });
  }

  public setScene(key: SceneKey): void {
    if (!this.client || !this.isReady()) return;
    if (key === this.currentSceneKey()) return;
    this.closeMachineInspection();
    this.inputCoordinator.invalidate();
    this.session?.setPaused(true);
    this.pendingScene = key;
    this.stateValue.set({ phase: 'loading', sceneKey: key, errorMessage: null });
    this.loadingValue.set({
      task: key === 'Game' ? 'Loading game scene…' : 'Loading main menu…',
      progress: null,
    });
    this.updateInputContext();
    const client = this.client;
    const generation = this.generation;
    this.cancelPaint?.();
    this.cancelPaint = this.afterPaint(() => {
      if (generation !== this.generation || this.client !== client || this.pendingScene !== key)
        return;
      try {
        client.setScene(key);
      } catch (error) {
        this.pendingScene = undefined;
        this.loadingValue.set(null);
        this.stateValue.set({
          phase: 'error',
          sceneKey: key,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    });
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
      this.inspectorActive() || (this.saveHolds > 0 && !this.saveConfirmationInputs)
        ? null
        : this.saveConfirmationInputs
          ? 'ui'
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
      !this.saveHolds &&
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

  public command(command: WorldCommand): import('@contracts/session-event').CommandSubmission {
    if (this.saveHolds || !this.simulationAllowed() || !this.session)
      return { status: 'unavailable' };
    this.session.setPaused(false);
    const sequence = this.session.enqueue(command);
    return sequence === null
      ? { status: 'unavailable' }
      : { status: 'queued', sequence, generation: this.session.generation };
  }

  public selectPlaceable(slot: number, returnToWorld = true): void {
    this.command({ type: 'toolbar-select', slot });
    if (returnToWorld) this.focusViewport();
  }

  public assignPlaceable(slot: number, item: EquipmentId | null): void {
    this.command({ type: 'toolbar-assign', slot, item });
  }

  public salvageNearby(): void {
    this.openingUi.salvageNearby();
  }

  public openMachineInspection(id: string): void {
    const world = this.world(),
      building = world?.buildings.find((entry) => entry.id === id);
    if (!this.gameplayAllowed() || !world || !building || !this.definition) return;
    if (
      distanceToCell(this.definition.grid, world.player.position, building.cell) >
      OPENING_SETTINGS.reach + 1e-9
    ) {
      this.interactionMessages.next('Move within two metres to inspect this machine.');
      return;
    }
    this.setUiFocused(true);
    const revision = ++this.inspectionRevision;
    const session = this.session;
    this.machineInspectionValue.set(id);
    this.unsubscribeInspection?.();
    this.unsubscribeInspection = undefined;
    this.selectionValue.set({ kind: 'entity', id });
    this.inspectionValue.set(null);
    const generation = this.generation;
    if (session)
      this.unsubscribeInspection = session.subscribeDetails(id, (value) => {
        if (
          generation === this.generation &&
          this.session === session &&
          revision === this.inspectionRevision &&
          this.machineInspectionId() === id
        )
          this.inspectionValue.set(value);
      });
  }

  public closeMachineInspection(): void {
    if (!this.machineInspectionId()) return;
    ++this.inspectionRevision;
    this.machineInspectionValue.set(null);
    this.unsubscribeInspection?.();
    this.unsubscribeInspection = undefined;
    this.inspectionValue.set(null);
  }

  public toggleFieldKit(): void {
    if (this.machineInspectionId()) return;
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

  public saveBinding(): SaveBinding | null {
    this.world();
    const session = this.session,
      runId = this.runId();
    return session?.isReady && runId
      ? {
          runId,
          generation: session.generation,
          version: session.stateRevision,
          pending: session.hasPendingInput,
        }
      : null;
  }

  public canFocusCrafting(): boolean {
    return this.inputCoordinator.enabledRequested;
  }

  public holdForSave(): () => void {
    this.saveHolds++;
    this.frameSeconds = 0;
    const release = this.session?.hold();
    this.inputCoordinator.invalidate();
    this.updateInputContext();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      this.saveHolds--;
      this.frameSeconds = 0;
      this.inputCoordinator.invalidate();
      this.updateInputContext();
      release?.();
      if (!this.saveHolds) this.focusPreparedWorld();
    };
  }

  /** Keep authority held while allowing the top save dialog to receive UI-only actions. */
  public holdForSaveConfirmation(): () => void {
    const release = this.holdForSave();
    this.saveConfirmationInputs++;
    this.inputCoordinator.invalidate();
    this.updateInputContext();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      this.saveConfirmationInputs--;
      this.inputCoordinator.invalidate();
      this.updateInputContext();
      release();
    };
  }

  public async captureForSave() {
    const session = this.session;
    if (!session?.isReady) throw new Error('No ready game to save.');
    const capture = await session.capture();
    if (capture.world.entities.some((entity) => entity.building?.buildingId === 'test-building'))
      throw new Error('Remove development test buildings before saving this world.');
    if (this.session !== session || this.disposed)
      throw new Error('The game changed while saving.');
    return capture.world;
  }

  public async replaceForSave(
    save: SaveSnapshot | null,
    stageUi: () => Promise<void>,
  ): Promise<SaveReplacementResult> {
    const client = this.client,
      bridge = this.sessionBridge,
      generation = this.generation;
    if (!client || !bridge || !this.isReady())
      throw new Error('Wait for the viewport to be ready before loading.');
    // Selection owns startup from this point, even if the menu's paint callback
    // has not run yet. Continue must not race it into creating another idle port.
    this.cancelPreloadPaint?.();
    this.cancelPreloadPaint = undefined;
    this.preloadStarted = true;
    this.resources.preload();
    this.sessions.prewarm();
    if (!save && !this.session) {
      const ready = firstValueFrom(
        client.state$.pipe(
          filter(
            (state) =>
              (state.sceneKey === 'Game' && state.phase === 'ready') ||
              ['error', 'stopped'].includes(state.phase),
          ),
        ),
      );
      this.setScene('Game');
      const state = await ready;
      if (state.phase !== 'ready') throw new Error('The new game could not be prepared.');
      return { removedResearch: [] };
    }
    if (!client.prepareWorld) throw new Error('The viewport cannot prepare a restored world.');
    const release = this.holdForSave();
    let candidate: import('../../../session/game-session').GameSession | undefined;
    let presentation: import('@game/client-api').PreparedWorld | undefined;
    const previousKit = this.fieldKitOpen();
    let committed = false;
    let cancelled = false;
    try {
      await this.session?.settled();
      const definition = await this.resources.definition(true);
      if (save) assertSameAuthoredMap(save.world.definition, definition);
      const ready = this.sessions.prepare(definition, save).then((value) => {
        if (cancelled || this.disposed || generation !== this.generation) {
          value.dispose();
          throw new Error('The game changed while preparing its simulation.');
        }
        candidate = value;
      });
      const stageBridge: WorldSessionBridge = {
        ...bridge,
        initialize: async () => undefined,
        registerCompletedTickHandler: (handler, order) =>
          candidate!.registerCompletedTickHandler(handler, order),
        frame: (...args) => (committed ? bridge.frame(...args) : candidate!.readView()),
        completeFrame: () => {
          if (committed) bridge.completeFrame();
        },
        suspend: () => {
          if (committed) bridge.suspend();
        },
        isSimulationActive: () => committed && bridge.isSimulationActive(),
      };
      const rendering = client.prepareWorld(definition, stageBridge, ready).then((value) => {
        if (cancelled || this.disposed || generation !== this.generation) {
          value.dispose();
          throw new Error('The viewport changed while preparing game assets.');
        }
        return value;
      });
      [, presentation] = await Promise.all([ready, rendering]);
      if (this.disposed || generation !== this.generation || this.client !== client)
        throw new Error('The viewport changed while loading.');
      const staged = candidate!;
      const originalQueue =
        save?.world.entities.find((entity) => entity.id === save.world.resources.playerId)?.opening
          ?.researchQueue ?? [];
      const restoredQueue = staged.readView().opening?.state.researchQueue ?? [];
      const removedResearch = originalQueue.filter((id) => !restoredQueue.includes(id));
      const craft = !!staged.readView().opening?.state.handcraft;
      this.savePreview.set(staged.readView());
      this.openingUi.restoreCrafting(craft);
      this.restoreValue.update((value) => value + 1);
      await stageUi();
      if (this.disposed || generation !== this.generation || this.client !== client)
        throw new Error('The viewport changed while preparing the crafting panel.');
      // Both prepared owners are ready; no asynchronous work crosses this commit boundary.
      this.closeMachineInspection();
      presentation.commit();
      if (this.disposed || generation !== this.generation || this.client !== client)
        throw new Error('The viewport changed while committing the saved world.');
      this.unsubscribeInspection?.();
      this.unsubscribeInspection = undefined;
      this.inspectionValue.set(null);
      this.selectionValue.set(null);
      this.placementValue.set(null);
      this.sessions.commit(staged, save?.runId ?? crypto.randomUUID());
      this.savePreview.set(null);
      this.inputCoordinator.setUiFocused(craft);
      committed = true;
      this.updateInputContext();
      this.pendingSaveFocus = { session: staged, craft };
      return { removedResearch };
    } catch (error) {
      cancelled = true;
      if (!committed) {
        this.savePreview.set(null);
        presentation?.dispose();
        candidate?.dispose();
        this.openingUi.restoreCrafting(previousKit);
      }
      throw error;
    } finally {
      release();
    }
  }

  /** Gameplay/native preflight without changing active simulation or presentation ownership. */
  public async validateForSave(save: SaveSnapshot): Promise<void> {
    const definition = await this.resources.definition(true);
    assertSameAuthoredMap(save.world.definition, definition);
    const candidate = await this.sessions.prepare(definition, save, 'validation');
    candidate.dispose();
    if (this.disposed) throw new Error('The game page closed during backup validation.');
  }

  private focusPreparedWorld(): void {
    const pending = this.pendingSaveFocus;
    this.pendingSaveFocus = undefined;
    if (!pending || this.disposed || !this.inputCoordinator.enabledRequested) return;
    afterNextRender(
      () => {
        if (
          this.session !== pending.session ||
          !this.isReady() ||
          !this.inputCoordinator.enabledRequested ||
          this.saveHolds
        )
          return;
        if (pending.craft)
          this.host?.ownerDocument.querySelector<HTMLElement>('[data-kit-heading]')?.focus();
        else this.inputCoordinator.focus();
      },
      { injector: this.injector },
    );
  }
}
