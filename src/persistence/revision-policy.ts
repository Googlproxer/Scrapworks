import { SAVE_RETENTION, type SaveMetadata } from '@contracts/save';

export class SaveConflictError extends Error {
  public constructor() {
    super(
      'This run changed in another tab. Check saves, review its history and reload before saving this run again.',
    );
  }
}

export interface RunHead {
  readonly runId: string;
  readonly token: string;
  readonly sequence: number;
}

export function assertAppend(
  next: SaveMetadata,
  head: RunHead | undefined,
  expectedToken: string | null,
): void {
  if (
    (head?.token ?? null) !== expectedToken ||
    next.previousToken !== expectedToken ||
    next.sequence !== (head?.sequence ?? 0) + 1
  )
    throw new SaveConflictError();
}

export function orderedRevisions(values: readonly SaveMetadata[]): SaveMetadata[] {
  const newest = new Map<string, SaveMetadata>();
  for (const value of values)
    if ((newest.get(value.runId)?.sequence ?? 0) < value.sequence) newest.set(value.runId, value);
  return [...values].sort((a, b) =>
    a.runId === b.runId
      ? b.sequence - a.sequence
      : newest.get(b.runId)!.savedAt.localeCompare(newest.get(a.runId)!.savedAt) ||
        a.runId.localeCompare(b.runId),
  );
}

export function prunedTokens(values: readonly SaveMetadata[], next: SaveMetadata): string[] {
  return orderedRevisions(values.filter((v) => v.runId === next.runId && v.kind === next.kind))
    .slice(SAVE_RETENTION[next.kind])
    .map((v) => v.token);
}

export function assertDelete(values: readonly SaveMetadata[], expected?: readonly string[]): void {
  if (
    expected &&
    JSON.stringify(values.map((v) => v.token).sort()) !== JSON.stringify([...expected].sort())
  )
    throw new SaveConflictError();
}
