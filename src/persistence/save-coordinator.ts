import { Subject } from 'rxjs';
import {
  MANUAL_SLOT,
  type SaveRepository,
  type SaveMetadata,
  type SaveSnapshot,
} from '@contracts/save';
import type { SimulationSnapshot } from '@contracts/simulation';
import { decodeSave, saveMetadata } from './save-codec';

export interface SaveBinding {
  readonly runId: string;
  readonly generation: number;
  readonly version: number;
  readonly pending: boolean;
}

export interface SaveHost {
  binding(): SaveBinding | null;
  hold(): () => void;
  capture(): Promise<SimulationSnapshot>;
  replace(save: SaveSnapshot | null): Promise<void>;
}

export interface SaveStatus {
  readonly phase: 'checking' | 'idle' | 'saving' | 'loading' | 'deleting' | 'new-game' | 'error';
  readonly message: string;
  readonly slot: SaveMetadata | null;
}

/** Serialized application operations, independent of UI, renderer and database implementation. */
export class SaveCoordinator {
  private readonly source = new Subject<SaveStatus>();
  public readonly changes$ = this.source.asObservable();
  public status: SaveStatus = { phase: 'checking', message: 'Checking local save…', slot: null };
  private tail = Promise.resolve();
  private closed = false;
  private committed: SaveBinding | null = null;

  public constructor(
    private readonly repository: SaveRepository,
    private readonly host: SaveHost,
    private readonly confirm: (message: string) => Promise<boolean>,
    private readonly id: () => string,
    private readonly now: () => string,
  ) {}

  public get dirty(): boolean {
    const current = this.host.binding(),
      saved = this.committed;
    return (
      !!current &&
      (!saved ||
        current.runId !== saved.runId ||
        current.generation !== saved.generation ||
        current.version !== saved.version ||
        current.pending)
    );
  }

  private update(phase: SaveStatus['phase'], message: string, slot = this.status.slot): void {
    if (this.closed) return;
    this.status = { phase, message, slot };
    this.source.next(this.status);
  }

  private valid(binding: SaveBinding | null): void {
    const current = this.host.binding();
    if (
      this.closed ||
      current?.generation !== binding?.generation ||
      current?.runId !== binding?.runId
    )
      throw new Error('This request belongs to an earlier game session.');
  }

  private queue(work: () => Promise<void>): Promise<void> {
    const result = this.tail.then(async () => {
      if (this.closed) return;
      try {
        await work();
      } catch (error) {
        this.update(
          'error',
          error instanceof Error ? error.message : 'Local save operation failed.',
        );
      }
    });
    this.tail = result;
    return result;
  }

  public refresh(): Promise<void> {
    return this.queue(async () => {
      const slots = await this.repository.list();
      if (slots[0]?.token !== this.status.slot?.token) this.committed = null;
      this.update('idle', '', slots[0] ?? null);
    });
  }

  public save(): Promise<void> {
    const binding = this.host.binding();
    return this.queue(async () => {
      this.valid(binding);
      if (!binding) throw new Error('Start a game before saving.');
      this.update('saving', 'Saving…');
      const slot = (await this.repository.list())[0];
      if (slot?.token !== this.status.slot?.token) this.committed = null;
      this.valid(binding);
      if (slot && slot.runId !== binding.runId) {
        const release = this.host.hold();
        try {
          if (!(await this.confirm('Overwrite the manual save from a different run?'))) {
            this.update('idle', 'Save canceled.', slot);
            return;
          }
        } finally {
          release();
        }
      }
      this.valid(binding);
      const world = await this.host.capture();
      this.valid(binding);
      const boundary = this.host.binding();
      const snapshot = decodeSave({
        slot: MANUAL_SLOT,
        schema: 1,
        runId: binding.runId,
        worldId: world.resources.worldId,
        contentVersion: world.contentVersion,
        savedAt: this.now(),
        token: this.id(),
        tick: world.resources.tick,
        world,
      });
      await this.repository.save(snapshot, slot?.token ?? null);
      const current = this.host.binding();
      const sameSession =
        current?.generation === binding.generation && current.runId === binding.runId;
      if (sameSession) this.committed = boundary;
      this.update(
        'idle',
        sameSession ? 'Game saved.' : 'Previous game saved; current progress is unsaved.',
        saveMetadata(snapshot),
      );
    });
  }

  public load(): Promise<void> {
    return this.replace(false);
  }

  public newGame(): Promise<void> {
    return this.replace(true);
  }

  private replace(fresh: boolean): Promise<void> {
    const binding = this.host.binding();
    return this.queue(async () => {
      this.valid(binding);
      const release = this.host.hold();
      try {
        this.update(
          fresh ? 'new-game' : 'loading',
          fresh ? 'Preparing new game…' : 'Loading save…',
        );
        if (
          this.dirty &&
          !(await this.confirm(
            'Discard unsaved progress and ' +
              (fresh ? 'start a new game?' : 'load the manual save?'),
          ))
        ) {
          this.update('idle', 'Operation canceled.');
          return;
        }
        this.valid(binding);
        const save = fresh ? null : await this.repository.load();
        if (!fresh && !save) {
          this.committed = null;
          this.update('loading', '', null);
          throw new Error('The manual save slot is empty.');
        }
        this.valid(binding);
        await this.host.replace(save ?? null);
        this.committed = fresh ? null : this.host.binding();
        this.update(
          'idle',
          fresh ? 'New game started.' : 'Game loaded.',
          save ? saveMetadata(save) : this.status.slot,
        );
      } finally {
        release();
      }
    });
  }

  public delete(): Promise<void> {
    return this.queue(async () => {
      this.update('deleting', 'Deleting save…');
      const slot = (await this.repository.list())[0];
      if (!slot) throw new Error('The manual save slot is empty.');
      const release = this.host.hold();
      try {
        if (
          !(await this.confirm(
            'Permanently delete the manual save? Your current game will remain open.',
          ))
        ) {
          this.update('idle', 'Deletion canceled.', slot);
          return;
        }
        if (this.closed) return;
        await this.repository.delete(slot.token);
        this.committed = null;
        this.update('idle', 'Save deleted.', null);
      } finally {
        release();
      }
    });
  }

  public dispose(): void {
    this.closed = true;
    this.source.complete();
    void this.tail.finally(() => this.repository.close());
  }
}
