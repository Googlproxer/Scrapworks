import type { BuildingView, DepositDefinition, WorldPosition } from '@contracts/world';

/** Plain player data changed only by the simulation-owned motor. */
export interface PlayerState {
  position: WorldPosition;
  facing: number;
  moving: boolean;
  sprinting: boolean;
}

/** Plain mutable gameplay data, owned exclusively by Simulation. Not a persisted save schema. */
export interface WorldState {
  worldId: string;
  tick: number;
  stepSeconds: number;
  nextEntityId: number;
  player: PlayerState;
  inventory: Record<string, number>;
  equipment: string[];
  research: string[];
  productionTotals: Record<string, number>;
  deposits: DepositDefinition[];
  buildings: BuildingView[];
}
