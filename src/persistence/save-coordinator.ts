import { Subject } from 'rxjs';
import type { SaveKind, SaveMetadata, SaveRepository, SaveSnapshot } from '@contracts/save';
import type { SimulationSnapshot } from '@contracts/simulation';
import { createSave, decodeSave, parseBackup, saveMetadata } from './save-codec';
import { SaveConflictError } from './revision-policy';

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
  validate(save: SaveSnapshot): Promise<void>;
  replace(save: SaveSnapshot | null): Promise<void>;
}

export interface SaveStatus {
  readonly phase:
    | 'checking'
    | 'idle'
    | 'saving'
    | 'loading'
    | 'deleting'
    | 'new-game'
    | 'importing'
    | 'exporting'
    | 'error';
  readonly message: string;
  readonly slot: SaveMetadata | null;
  readonly revisions: readonly SaveMetadata[];
  readonly legacy: boolean;
  readonly inspected: SaveMetadata | null;
}

interface Operation {
  readonly work: () => Promise<void>;
  readonly finish: () => void;
}

export const AUTOSAVE_SECONDS = 120;

/** Serialized application operations. Explicit requests run before coalesced autosaves. */
export class SaveCoordinator {
  private readonly source = new Subject<SaveStatus>();
  public readonly changes$ = this.source.asObservable();
  public status: SaveStatus = {
    phase: 'checking',
    message: 'Checking local saves…',
    slot: null,
    revisions: [],
    legacy: false,
    inspected: null,
  };
  public name = 'Untitled run';
  private readonly operations: Operation[] = [];
  private automatic?: Operation;
  private draining = false;
  private replacements = 0;
  private completion = Promise.resolve();
  private closed = false;
  private committed: SaveBinding | null = null;
  private committedToken: string | null = null;
  private readonly expected = new Map<string, SaveMetadata | null>();
  private readonly conflicts = new Set<string>();
  private readonly disabledAutosaves = new Set<string>();
  private recoveredFrom: string | null = null;
  private inspection?: SaveSnapshot;
  private inspectionVersion = 0;
  private inspectingHistory = false;
  private activeSeconds = 0;
  private timerSession = '';

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

  private update(
    phase: SaveStatus['phase'],
    message: string,
    patch: Partial<SaveStatus> = {},
  ): void {
    if (this.closed) return;
    this.status = { ...this.status, phase, message, ...patch };
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

  private queue(work: () => Promise<void>, automatic = false): Promise<void> {
    return new Promise<void>((finish) => {
      if (this.closed) {
        finish();
        return;
      }
      const operation = { work, finish };
      if (automatic) {
        this.automatic?.finish();
        this.automatic = operation;
      } else this.operations.push(operation);
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    let finished!: () => void;
    this.completion = new Promise<void>((resolve) => {
      finished = resolve;
    });
    // Defer automatic work for a microtask so same-turn explicit actions take precedence.
    await Promise.resolve();
    try {
      while (!this.closed) {
        const operation = this.operations.shift() ?? this.automatic;
        if (!operation) break;
        if (operation === this.automatic) this.automatic = undefined;
        try {
          await operation.work();
        } catch (error) {
          this.update(
            'error',
            error instanceof Error ? error.message : 'Local save operation failed.',
          );
        } finally {
          operation.finish();
        }
      }
    } finally {
      this.draining = false;
      if (this.closed) this.repository.close();
      finished();
    }
  }

  public settled(): Promise<void> {
    return this.completion;
  }

  private cancelAutomatic(): void {
    this.automatic?.finish();
    this.automatic = undefined;
  }

  private latest(runId: string, values = this.status.revisions): SaveMetadata | null {
    return (
      values.filter((m) => m.runId === runId).sort((a, b) => b.sequence - a.sequence)[0] ?? null
    );
  }

  private async readCatalog(selected = this.status.slot?.token): Promise<void> {
    const revisions = await this.repository.list(),
      legacy = await this.repository.legacy();
    const slot = revisions.find((m) => m.token === selected) ?? revisions[0] ?? null;
    this.status = { ...this.status, revisions, slot, legacy };
  }

  public refresh(): Promise<void> {
    return this.queue(async () => {
      await this.readCatalog();
      if (
        this.committedToken &&
        !this.status.revisions.some((m) => m.token === this.committedToken)
      ) {
        this.committed = null;
        this.committedToken = null;
      }
      const binding = this.host.binding();
      if (binding) {
        const latest = this.latest(binding.runId),
          known = this.expected.get(binding.runId);
        if (known !== undefined && known?.token !== latest?.token) {
          this.conflicts.add(binding.runId);
          this.committed = null;
        } else if (known === undefined) this.expected.set(binding.runId, latest);
      }
      this.update(
        'idle',
        this.conflicts.has(binding?.runId ?? '')
          ? 'This run changed elsewhere. Load a revision before saving it again.'
          : '',
      );
    });
  }

  public select(token: string): void {
    const slot = this.status.revisions.find((m) => m.token === token);
    if (slot) {
      this.inspectingHistory = true;
      this.update(this.status.phase, this.status.message, { slot });
    }
  }

  /** Called with completed simulation time only; paused/hidden sessions publish no new steps. */
  public advanceActive(seconds: number): void {
    const binding = this.host.binding();
    if (
      !binding ||
      this.closed ||
      this.replacements > 0 ||
      !Number.isFinite(seconds) ||
      seconds < 0
    )
      return;
    const key = `${binding.runId}/${binding.generation}`;
    if (this.timerSession !== key) {
      this.timerSession = key;
      this.activeSeconds = 0;
    }
    if (this.conflicts.has(binding.runId) || this.disabledAutosaves.has(binding.runId)) return;
    this.activeSeconds += seconds;
    if (this.activeSeconds < AUTOSAVE_SECONDS) return;
    this.activeSeconds = 0;
    if (!this.dirty) return;
    void this.queue(async () => {
      this.valid(binding);
      if (this.dirty) await this.write(binding, 'auto');
    }, true);
  }

  public save(): Promise<void> {
    const binding = this.host.binding();
    this.cancelAutomatic();
    return this.queue(async () => {
      this.valid(binding);
      if (!binding) throw new Error('Start a game before saving.');
      await this.write(binding, 'manual');
    });
  }

  private snapshot(
    world: SimulationSnapshot,
    binding: SaveBinding,
    kind: SaveKind,
    fallbackName = false,
  ): SaveSnapshot {
    const previous = this.expected.get(binding.runId);
    const name = this.name.trim();
    return createSave(world, binding.runId, this.id(), this.now(), {
      name:
        (kind === 'auto' || fallbackName) && (!name || name.length > 80)
          ? (previous?.name ?? 'Untitled run')
          : name,
      kind,
      sequence: (previous?.sequence ?? 0) + 1,
      previousToken: previous?.token ?? null,
      recoveredFrom: this.recoveredFrom,
      origin: previous?.origin ?? null,
    });
  }

  private async write(binding: SaveBinding, kind: SaveKind): Promise<void> {
    if (this.conflicts.has(binding.runId)) throw new SaveConflictError();
    this.update('saving', kind === 'auto' ? 'Autosaving…' : 'Saving…');
    const world = await this.host.capture();
    this.valid(binding);
    const boundary = this.host.binding();
    const snapshot = this.snapshot(world, binding, kind);
    try {
      await this.repository.save(snapshot, this.expected.get(binding.runId)?.token ?? null);
    } catch (error) {
      if (error instanceof SaveConflictError) {
        this.conflicts.add(binding.runId);
        if (this.host.binding()?.runId === binding.runId) this.committed = null;
      }
      throw error;
    }
    this.expected.set(binding.runId, saveMetadata(snapshot));
    const current = this.host.binding(),
      sameSession = current?.generation === binding.generation && current.runId === binding.runId;
    if (sameSession) {
      this.committed = boundary;
      this.committedToken = snapshot.token;
      this.activeSeconds = 0;
      this.disabledAutosaves.delete(binding.runId);
    }
    if (kind === 'manual') this.inspectingHistory = false;
    await this.readCatalog(
      kind === 'auto' && this.inspectingHistory ? this.status.slot?.token : snapshot.token,
    );
    this.update(
      'idle',
      sameSession
        ? kind === 'auto'
          ? 'Autosave committed.'
          : 'Game saved.'
        : 'Previous game saved; current progress is unsaved.',
    );
  }

  public load(token = this.status.slot?.token): Promise<void> {
    return this.replace(false, token);
  }

  public newGame(): Promise<void> {
    return this.replace(true);
  }

  private replace(fresh: boolean, token?: string): Promise<void> {
    const binding = this.host.binding();
    this.cancelAutomatic();
    this.replacements++;
    return this.queue(async () => {
      this.valid(binding);
      const release = this.host.hold();
      try {
        this.update(
          fresh ? 'new-game' : 'loading',
          fresh ? 'Preparing new game…' : 'Loading selected revision…',
        );
        if (
          this.dirty &&
          !(await this.confirm(
            'Discard unsaved progress and ' + (fresh ? 'start a new game?' : 'load this revision?'),
          ))
        ) {
          this.update('idle', 'Operation canceled.');
          return;
        }
        this.valid(binding);
        const save = fresh ? null : token ? await this.repository.load(token) : undefined;
        if (!fresh && !save) {
          this.committed = null;
          await this.readCatalog();
          throw new Error('The selected save revision is no longer available. Check saves again.');
        }
        this.valid(binding);
        // Read the head before replacement. A later concurrent commit still fails the write CAS.
        const revisions = fresh ? this.status.revisions : await this.repository.list();
        this.valid(binding);
        await this.host.replace(save ?? null);
        this.committed = fresh ? null : this.host.binding();
        this.committedToken = save?.token ?? null;
        this.recoveredFrom = save?.token ?? null;
        this.inspectingHistory = false;
        this.activeSeconds = 0;
        this.timerSession = '';
        if (save) {
          this.name = save.name;
          this.expected.set(save.runId, this.latest(save.runId, revisions));
          this.conflicts.delete(save.runId);
          this.disabledAutosaves.delete(save.runId);
        } else this.name = 'Untitled run';
        this.update('idle', fresh ? 'New game started.' : 'Game loaded.', {
          revisions,
          slot: save ? saveMetadata(save) : this.status.slot,
        });
      } finally {
        release();
      }
    }).finally(() => {
      this.replacements--;
    });
  }

  public delete(scope: 'run' | 'revision' = 'run'): Promise<void> {
    const selected = this.status.slot;
    const expected = this.status.revisions
      .filter((m) => m.runId === selected?.runId)
      .map((m) => m.token);
    this.cancelAutomatic();
    return this.queue(async () => {
      if (!selected) throw new Error('Choose a saved run first.');
      const release = this.host.hold();
      try {
        if (
          !(await this.confirm(
            `Permanently delete ${scope === 'run' ? 'this run and all its revisions' : 'this revision'}? Your current game will remain open.`,
          ))
        )
          return;
        if (this.closed) return;
        this.update('deleting', 'Deleting saved data…');
        await this.repository.delete(selected.token, scope, expected);
        if (selected.token === this.committedToken) {
          this.committed = null;
          this.committedToken = null;
        }
        if (scope === 'run' && this.host.binding()?.runId === selected.runId) {
          this.expected.set(selected.runId, null);
          this.conflicts.delete(selected.runId);
          this.disabledAutosaves.add(selected.runId);
          this.committed = null;
          this.committedToken = null;
          this.recoveredFrom = null;
        }
        await this.readCatalog();
        this.update(
          'idle',
          'Saved data deleted. If this run is still open, Save game enables its autosaves again.',
        );
      } finally {
        release();
      }
    });
  }

  public deleteLegacy(): Promise<void> {
    return this.queue(async () => {
      if (
        !(await this.confirm(
          'Permanently delete incompatible pre-M9 saves? Current M9 runs and active play will remain available.',
        ))
      )
        return;
      if (this.closed) return;
      await this.repository.deleteLegacy();
      this.update('idle', 'Pre-M9 saves deleted.', { legacy: false });
    });
  }

  public inspect(text: string): Promise<void> {
    const version = ++this.inspectionVersion;
    this.inspection = undefined;
    this.update('importing', 'Validating backup…', { inspected: null });
    return this.queue(async () => {
      if (version !== this.inspectionVersion) return;
      const save = parseBackup(text);
      await this.host.validate(save);
      if (this.closed || version !== this.inspectionVersion) return;
      this.inspection = save;
      this.update(
        'idle',
        'Backup validated. Import creates a new run; Load activates it separately.',
        { inspected: saveMetadata(save) },
      );
    });
  }

  public rejectImport(message: string): void {
    this.inspectionVersion++;
    this.inspection = undefined;
    this.update('error', message, { inspected: null });
  }

  public import(name: string): Promise<void> {
    const inspected = this.inspection;
    return this.queue(async () => {
      if (!inspected) throw new Error('Choose and validate a backup first.');
      this.update('importing', 'Importing as a new run…');
      const save = createSave(inspected.world, this.id(), this.id(), this.now(), {
        name: name.trim(),
        origin: { runId: inspected.runId, token: inspected.token },
      });
      await this.repository.save(save, null);
      this.inspectingHistory = true;
      this.inspection = undefined;
      await this.readCatalog(save.token);
      this.update('idle', 'Backup imported as a new run. Load this revision to activate it.', {
        inspected: null,
      });
    });
  }

  public async backup(token?: string): Promise<SaveSnapshot | undefined> {
    const binding = this.host.binding();
    let output: SaveSnapshot | undefined;
    await this.queue(async () => {
      this.update('exporting', token ? 'Validating saved backup…' : 'Capturing emergency backup…');
      let save: SaveSnapshot;
      if (token) {
        const stored = await this.repository.load(token);
        if (!stored) throw new Error('The selected revision is no longer available.');
        save = stored;
      } else {
        this.valid(binding);
        if (!binding) throw new Error('Start a game before downloading current progress.');
        const world = await this.host.capture();
        this.valid(binding);
        save = this.snapshot(world, binding, 'manual', true);
      }
      await this.host.validate(save);
      if (this.closed) return;
      output = decodeSave(save);
      this.update('idle', 'Backup ready to download. Browser save status is unchanged.');
    });
    return output;
  }

  public dispose(): void {
    this.closed = true;
    this.cancelAutomatic();
    for (const operation of this.operations.splice(0)) operation.finish();
    this.source.complete();
    if (!this.draining) this.repository.close();
  }
}
