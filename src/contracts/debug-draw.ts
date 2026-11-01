/** Presentation settings only; these never cross the simulation worker boundary. */
export interface DebugDrawSettings {
  readonly enabled: boolean;
  readonly disabledCategories: readonly string[];
}

export interface DebugDrawStatus {
  readonly available: boolean;
  readonly categories: readonly string[];
}
