import type { WorldPosition } from '@contracts/world';

/** Plain player data changed only by the simulation-owned motor. */
export interface PlayerState {
  position: WorldPosition;
  facing: number;
  moving: boolean;
  sprinting: boolean;
}

/** World authority is now private ECS components/resources; plain captures are separate. */
export type { EntityData, WorldResources, SimulationSnapshot } from '@contracts/simulation';
