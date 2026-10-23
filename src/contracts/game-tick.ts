/** The upcoming authoritative gameplay step, independent of any renderer or clock. */
export interface GameTickContext {
  readonly tick: number;
  readonly deltaSeconds: number;
}

/** Synchronous preparation for one gameplay step. Queue commands or update sampled intent here. */
export type GameTickHandler = (context: GameTickContext) => void;
