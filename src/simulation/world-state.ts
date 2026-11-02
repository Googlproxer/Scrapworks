import type { WorldPosition } from '@contracts/world';

/** Plain player data changed only by the simulation-owned motor. */
export interface PlayerState {
  position: WorldPosition;
  facing: number;
  moving: boolean;
  sprinting: boolean;
}
