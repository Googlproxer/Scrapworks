import type { SimulationSnapshot } from './simulation';

export const MANUAL_SLOT = 'manual-1';

export interface SaveMetadata {
  readonly slot: typeof MANUAL_SLOT;
  readonly schema: 1;
  readonly runId: string;
  readonly worldId: string;
  readonly contentVersion: string;
  readonly savedAt: string;
  readonly token: string;
  readonly tick: number;
}

/** Durable player save, deliberately excluding the session transport envelope. */
export interface SaveSnapshot extends SaveMetadata {
  readonly world: SimulationSnapshot;
}

export interface SaveRepository {
  list(): Promise<readonly SaveMetadata[]>;
  load(): Promise<SaveSnapshot | undefined>;
  save(snapshot: SaveSnapshot, expectedToken: string | null): Promise<void>;
  delete(expectedToken: string): Promise<void>;
  close(): void;
}
