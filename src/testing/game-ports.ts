import { BehaviorSubject } from 'rxjs';
import type { GameState } from '@contracts/game-state';
import type { LoadingStatus } from '@contracts/loading';
import type { DebugDrawStatus } from '@contracts/debug-draw';
import type {
  GameInputPort,
  InspectorState,
  PlacementFeedback,
  WorldSelection,
  WorldSessionBridge,
} from '@contracts/game-client';
import type { GameClientOptions } from '@game/client-api';

/** Required capabilities for tests that never create a gameplay world. */
export function menuClientOptions(): GameClientOptions {
  return {
    actions: { dispatch: () => undefined },
    session: {
      initialize: async () => undefined,
      frame: () => {
        throw new Error('Test must supply a gameplay frame port.');
      },
      completeFrame: () => undefined,
      suspend: () => undefined,
      isSimulationActive: () => false,
      registerCompletedTickHandler: () => () => undefined,
    },
  };
}

export function clientNotifications() {
  return {
    loading$: new BehaviorSubject<LoadingStatus | null>(null),
    state$: new BehaviorSubject<GameState>({
      phase: 'loading',
      sceneKey: 'MainMenu',
      errorMessage: null,
    }),
    selection$: new BehaviorSubject<WorldSelection>(null),
    placementFeedback$: new BehaviorSubject<PlacementFeedback | null>(null),
    inspectorState$: new BehaviorSubject<InspectorState>({ phase: 'closed', errorMessage: null }),
    debugDrawStatus$: new BehaviorSubject<DebugDrawStatus>({ available: false, categories: [] }),
  };
}

export function testScenePorts(session: WorldSessionBridge = menuClientOptions().session) {
  return {
    session,
    selection: new BehaviorSubject<WorldSelection>(null),
    placementFeedback: new BehaviorSubject<PlacementFeedback | null>(null),
  };
}

export function testInputPort(): GameInputPort {
  return {
    setContext: () => undefined,
    updateBindings: () => undefined,
    selectController: () => true,
    subscribeControllers: (listener) => {
      listener([]);
      return () => undefined;
    },
    captureBinding: () => () => undefined,
    handleUiKeyboard: () => false,
    handleUiPointer: () => false,
    focus: () => undefined,
  };
}
