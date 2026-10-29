/** Main-thread presentation notification for an already committed authoritative step. */
export interface GameTickContext {
  readonly tick: number;
  readonly deltaSeconds: number;
  readonly phase: 'completed';
  readonly generation: number;
  readonly publishedTick: number;
  readonly publication: number;
}

/** Presentation only. Commands submitted here can affect a future step. */
export type GameTickHandler = (context: GameTickContext) => void;
