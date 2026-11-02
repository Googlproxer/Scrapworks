import type { Subject } from 'rxjs';
import type {
  PlacementPort,
  PlacementFeedback,
  WorldSelection,
  WorldSessionBridge,
} from '@contracts/game-client';

/** Only the capabilities needed by world presentation, owned by its client. */
export interface WorldScenePorts {
  readonly session: WorldSessionBridge;
  readonly placement?: PlacementPort;
  readonly developerFixture?: boolean;
  readonly selection: Subject<WorldSelection>;
  readonly placementFeedback: Subject<PlacementFeedback | null>;
}
