import type { Observable } from 'rxjs';
import type { LoadingStatus } from '@contracts/loading';
import type {
  ActionFrameSink,
  GameInputPort,
  InspectorState,
  PlacementFeedback,
  PlacementPort,
  WorldSelection,
  WorldSessionBridge,
} from '@contracts/game-client';
import type { BindingProfile } from '@contracts/input';
import type { GameState, SceneKey } from '@contracts/game-state';
import type { DebugDrawSettings, DebugDrawStatus } from '@contracts/debug-draw';

/** Main-thread integration API. Deterministic contracts contain no reactive-library types. */
export interface GameClientOptions {
  readonly session: WorldSessionBridge;
  readonly actions: ActionFrameSink;
  readonly placement?: PlacementPort;
  readonly bindings?: BindingProfile;
  readonly developerFixture?: boolean;
  readonly debugDrawSettings?: DebugDrawSettings;
}

export interface GameClient {
  readonly input: GameInputPort;
  readonly state$: Observable<GameState>;
  readonly loading$: Observable<LoadingStatus | null>;
  readonly selection$: Observable<WorldSelection>;
  readonly placementFeedback$: Observable<PlacementFeedback | null>;
  readonly inspectorState$: Observable<InspectorState>;
  readonly debugDrawStatus$: Observable<DebugDrawStatus>;
  destroy(): void;
  setScene(key: SceneKey): void;
  setInputEnabled(on: boolean): void;
  setDebugDrawSettings(settings: DebugDrawSettings): void;
  toggleInspector(): Promise<void>;
}
