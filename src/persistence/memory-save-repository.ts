import type { SaveRepository, SaveSnapshot } from '@contracts/save';
import { decodeSave, saveMetadata } from './save-codec';

export class SaveConflictError extends Error {
  public constructor() {
    super('The save slot changed. Review it and try again.');
  }
}

export class MemorySaveRepository implements SaveRepository {
  private value?: SaveSnapshot;
  private closed = false;

  private check(): void {
    if (this.closed) throw new Error('Save storage is closed.');
  }

  public async list() {
    this.check();
    return this.value ? [saveMetadata(decodeSave(this.value))] : [];
  }

  public async load() {
    this.check();
    return this.value ? decodeSave(this.value) : undefined;
  }

  public async save(snapshot: SaveSnapshot, expectedToken: string | null): Promise<void> {
    this.check();
    const next = decodeSave(snapshot);
    if ((this.value?.token ?? null) !== expectedToken) throw new SaveConflictError();
    this.value = next;
  }

  public async delete(expectedToken: string): Promise<void> {
    this.check();
    if (this.value?.token !== expectedToken) throw new SaveConflictError();
    this.value = undefined;
  }

  public close(): void {
    this.closed = true;
  }
}
