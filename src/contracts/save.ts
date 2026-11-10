import type { SimulationSnapshot } from './simulation';

export const SAVE_SCHEMA = 2;

export const SAVE_RETENTION = { manual: 3, auto: 5 } as const;

export type SaveKind = keyof typeof SAVE_RETENTION;

export interface SaveOrigin {
  readonly runId: string;
  readonly token: string;
}

export interface SaveMetadata {
  readonly schema: typeof SAVE_SCHEMA;
  readonly slot: string;
  readonly runId: string;
  readonly name: string;
  readonly kind: SaveKind;
  readonly sequence: number;
  readonly previousToken: string | null;
  readonly recoveredFrom: string | null;
  readonly origin: SaveOrigin | null;
  readonly worldId: string;
  readonly mapKey: string;
  readonly contentVersion: string;
  readonly physicsVersion: string;
  readonly savedAt: string;
  readonly token: string;
  readonly tick: number;
}

/** Durable player save. Session input/transport envelopes are deliberately excluded. */
export interface SaveSnapshot extends SaveMetadata {
  readonly world: SimulationSnapshot;
}

export interface SaveCatalogIssue {
  /** Adapter-owned identity for deliberate cleanup; never a playable revision token. */
  readonly id: string;
  readonly label: string;
  readonly message: string;
}

export interface SaveCatalog {
  readonly revisions: readonly SaveMetadata[];
  readonly issues: readonly SaveCatalogIssue[];
}

export interface SaveRepository {
  catalog(): Promise<SaveCatalog>;
  deleteDamaged(id: string): Promise<void>;
  /** All retained metadata, newest first; payload corruption cannot hide history. */
  list(): Promise<readonly SaveMetadata[]>;
  load(token?: string): Promise<SaveSnapshot | undefined>;
  /** Compare the run's latest commit, then atomically append, advance heads and prune. */
  save(snapshot: SaveSnapshot, expectedToken: string | null): Promise<void>;
  delete(
    token: string,
    scope?: 'run' | 'revision',
    expectedTokens?: readonly string[],
  ): Promise<void>;
  legacy(): Promise<boolean>;
  deleteLegacy(): Promise<void>;
  close(): void;
}
