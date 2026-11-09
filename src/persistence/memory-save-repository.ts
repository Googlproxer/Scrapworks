import type { SaveRepository, SaveSnapshot } from '@contracts/save';
import { decodeSave, saveMetadata } from './save-codec';
import {
  assertAppend,
  assertDelete,
  orderedRevisions,
  prunedTokens,
  SaveConflictError,
  type RunHead,
} from './revision-policy';

export { SaveConflictError } from './revision-policy';

export class MemorySaveRepository implements SaveRepository {
  private readonly values = new Map<string, SaveSnapshot>();
  private readonly heads = new Map<string, RunHead>();
  private closed = false;

  private check(): void {
    if (this.closed) throw new Error('Save storage is closed.');
  }

  public async list() {
    this.check();
    return orderedRevisions([...this.values.values()].map(saveMetadata)).map((m) =>
      structuredClone(m),
    );
  }

  public async load(token?: string) {
    this.check();
    const value = this.values.get(token ?? (await this.list())[0]?.token ?? '');
    return value ? decodeSave(value) : undefined;
  }

  public async save(snapshot: SaveSnapshot, expectedToken: string | null): Promise<void> {
    this.check();
    const next = decodeSave(snapshot);
    assertAppend(next, this.heads.get(next.runId), expectedToken);
    if (this.values.has(next.token)) throw new SaveConflictError();
    this.values.set(next.token, next);
    this.heads.set(next.runId, { runId: next.runId, token: next.token, sequence: next.sequence });
    for (const token of prunedTokens([...this.values.values()], next)) this.values.delete(token);
  }

  public async delete(
    token: string,
    scope: 'run' | 'revision' = 'run',
    expectedTokens?: readonly string[],
  ): Promise<void> {
    this.check();
    const selected = this.values.get(token);
    if (!selected) throw new SaveConflictError();
    const run = [...this.values.values()].filter((v) => v.runId === selected.runId);
    assertDelete(run, expectedTokens);
    if (
      scope === 'revision' &&
      !run.some((r) => r.kind === selected.kind && r.sequence > selected.sequence)
    )
      throw new Error('Delete the run to remove its latest manual or autosave revision.');
    for (const value of scope === 'run' ? run : [selected]) this.values.delete(value.token);
    if (scope === 'run') this.heads.delete(selected.runId);
  }

  public async legacy() {
    this.check();
    return false;
  }

  public async deleteLegacy() {
    this.check();
  }

  public close(): void {
    this.closed = true;
  }
}
