import {
  afterNextRender,
  computed,
  effect,
  DestroyRef,
  inject,
  InjectionToken,
  Injector,
  Service,
  signal,
  untracked,
} from '@angular/core';
import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom, Subscription, timer, finalize } from 'rxjs';
import type { SaveRepository } from '@contracts/save';
import { SaveCoordinator } from '../../../persistence/save-coordinator';
import { GameRuntimeService } from '../game/game-runtime.service';
import { SaveConfirmationComponent } from './save-confirmation/save-confirmation.component';
import { backupFilename, MAX_SAVE_BYTES } from '../../../persistence/save-codec';
import { UiDialogRegistry } from '../ui/ui-dialog-registry';
import { UiService } from '../ui/ui.service';
import { OPENING_TECHNOLOGIES } from '@content/opening';

export const GAMEPLAY_SAVE_REPOSITORY = new InjectionToken<SaveRepository>(
  'Gameplay save repository',
);

@Service({ autoProvided: false })
export class GameplaySaveService {
  private readonly runtime = inject(GameRuntimeService);
  private readonly ui = inject(UiService, { optional: true });
  private readonly dialog = inject(Dialog);
  private readonly dialogRegistry = inject(UiDialogRegistry);
  private readonly injector = inject(Injector);
  private confirmation?: DialogRef<boolean, SaveConfirmationComponent>;
  private cancelStage?: () => void;
  private fileReadSerial = 0;
  private readonly coordinator = new SaveCoordinator(
    inject(GAMEPLAY_SAVE_REPOSITORY),
    {
      binding: () => this.runtime.saveBinding(),
      hold: () => this.runtime.holdForSave(),
      capture: () => this.runtime.captureForSave(),
      validate: (save) => this.runtime.validateForSave(save),
      replace: (save) => this.runtime.replaceForSave(save, () => this.stageUi()),
    },
    (message) => this.confirm(message),
    () => crypto.randomUUID(),
    () => new Date().toISOString(),
  );
  private readonly statusValue = signal(this.coordinator.status);
  private readonly pending = signal(0);
  private readonly lifetime = new Subscription();
  public readonly runName = signal({ name: 'Untitled run' });
  public readonly importName = signal({ name: 'Imported run' });
  public readonly storageMessage = signal('Storage capacity has not been checked.');
  public readonly runs = computed(() => {
    const seen = new Set<string>();
    return this.status().revisions.filter((m) => {
      if (seen.has(m.runId)) return false;
      seen.add(m.runId);
      return true;
    });
  });
  public readonly history = computed(() =>
    this.status().revisions.filter((m) => m.runId === this.status().slot?.runId),
  );
  public readonly status = this.statusValue.asReadonly();
  public readonly loadAdjustment = computed(() => {
    const removed = this.status().removedResearch;
    if (!removed.length) return '';
    const names = removed.map(
      (id) => OPENING_TECHNOLOGIES.find((technology) => technology.id === id)?.name ?? id,
    );
    return `Removed queued research with unmet prerequisites: ${names.join(', ')}. All research investment and progress remain. Save to keep the adjusted queue.`;
  });
  public readonly busy = computed(
    () =>
      this.pending() > 0 ||
      (!['idle', 'error'].includes(this.status().phase) && this.status().message !== 'Autosaving…'),
  );
  public readonly hasSession = computed(() => !!this.runtime.runId());
  public readonly runId = this.runtime.runId;
  public readonly unsaved = computed(() => {
    this.status();
    this.runtime.world();
    return this.coordinator.dirty;
  });
  public readonly savedTime = computed(() => {
    const slot = this.status().slot;
    return slot ? new Date(slot.savedAt).toLocaleString() : '';
  });

  public constructor() {
    const subscription = this.coordinator.changes$.subscribe((status) => {
      this.statusValue.set(status);
      if (status.removedResearch.length)
        this.ui?.openNotification({
          key: 'research-queue-adjusted',
          title: 'Research queue updated',
          message: this.loadAdjustment(),
          tone: 'warning',
        });
      if (status.message === 'Game loaded.' || status.message === 'New game started.')
        this.runName.set({ name: this.coordinator.name });
    });
    let observed: { run: string; tick: number } | undefined;
    effect(() => {
      const world = this.runtime.world(),
        binding = this.runtime.saveBinding();
      const name = this.runName().name;
      untracked(() => {
        this.coordinator.name = name;
        if (!world || !binding) {
          observed = undefined;
          return;
        }
        const run = `${binding.runId}/${binding.generation}`;
        const seconds =
          observed?.run === run ? Math.max(0, world.tick - observed.tick) * world.stepSeconds : 0;
        observed = { run, tick: world.tick };
        this.coordinator.advanceActive(seconds);
      });
    });
    void this.coordinator.refresh();
    inject(DestroyRef).onDestroy(() => {
      this.fileReadSerial++;
      this.confirmation?.close(false);
      this.cancelStage?.();
      subscription.unsubscribe();
      this.lifetime.unsubscribe();
      this.coordinator.dispose();
    });
  }

  private operation(work: () => Promise<void>): Promise<void> {
    const focus = document.activeElement;
    this.pending.update((value) => value + 1);
    return work().finally(() => {
      this.pending.update((value) => value - 1);
      if (
        !this.pending() &&
        !this.lifetime.closed &&
        focus instanceof HTMLElement &&
        focus.isConnected
      )
        afterNextRender(
          () => {
            if (
              !this.busy() &&
              document.activeElement === document.body &&
              focus.isConnected &&
              !focus.matches(':disabled')
            )
              focus.focus();
          },
          { injector: this.injector },
        );
    });
  }

  public save(): Promise<void> {
    this.coordinator.name = this.runName().name;
    return this.operation(() => this.coordinator.save());
  }

  public load(token?: string): Promise<void> {
    return this.operation(() => this.coordinator.load(token));
  }

  public newGame(): Promise<void> {
    return this.operation(() => this.coordinator.newGame());
  }

  public delete(scope: 'run' | 'revision' = 'run'): Promise<void> {
    return this.operation(() => this.coordinator.delete(scope));
  }

  public refresh(): Promise<void> {
    return this.coordinator.refresh();
  }

  public select(token: string): void {
    this.coordinator.select(token);
  }

  public deleteLegacy(): Promise<void> {
    return this.operation(() => this.coordinator.deleteLegacy());
  }

  public deleteDamaged(id: string): Promise<void> {
    return this.operation(() => this.coordinator.deleteDamaged(id));
  }

  public import(): Promise<void> {
    return this.operation(() => this.coordinator.import(this.importName().name));
  }

  public inspectFile(file: File): Promise<void> {
    const serial = ++this.fileReadSerial;
    return this.operation(async () => {
      if (file.size > MAX_SAVE_BYTES) {
        this.coordinator.rejectImport('The backup file is too large. Maximum file size is 96 MiB.');
        return;
      }
      try {
        const text = await file.text();
        if (serial === this.fileReadSerial) await this.coordinator.inspect(text);
      } catch {
        if (serial === this.fileReadSerial)
          this.coordinator.rejectImport(
            'The backup file could not be read. Choose it again or try another file.',
          );
      }
    });
  }

  public download(token?: string): Promise<void> {
    return this.operation(async () => {
      const save = await this.coordinator.backup(token);
      if (!save) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(save)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = backupFilename(save);
      link.click();
      this.lifetime.add(
        timer(1000)
          .pipe(finalize(() => URL.revokeObjectURL(url)))
          .subscribe(),
      );
    });
  }

  public async checkStorage(requestPersistence = false): Promise<void> {
    try {
      const storage = navigator.storage;
      if (!storage) {
        this.storageMessage.set(
          'Storage estimates and persistence are unavailable. JSON backups remain available.',
        );
        return;
      }
      const granted =
        requestPersistence && storage.persist
          ? await storage.persist()
          : storage.persisted
            ? await storage.persisted()
            : false;
      const estimate = storage.estimate ? await storage.estimate() : {};
      const usage =
        estimate.usage === undefined
          ? 'Usage unavailable'
          : `${(estimate.usage / 1048576).toFixed(1)} MiB used`;
      const capacity =
        estimate.quota === undefined
          ? ''
          : ` of about ${(estimate.quota / 1048576).toFixed(0)} MiB`;
      this.storageMessage.set(
        `${usage}${capacity}. ${granted ? 'Persistent storage granted.' : 'Persistence is not granted.'} Estimates are advisory; keep JSON backups.`,
      );
    } catch {
      this.storageMessage.set(
        'Storage capability check failed. Try saving or downloading a JSON backup.',
      );
    }
  }

  private async confirm(message: string): Promise<boolean> {
    const release = this.runtime.holdForSaveConfirmation();
    let unregister: (() => void) | undefined;
    let ref: DialogRef<boolean, SaveConfirmationComponent> | undefined;
    try {
      ref = this.dialog.open<boolean, string, SaveConfirmationComponent>(
        SaveConfirmationComponent,
        {
          data: message,
          role: 'alertdialog',
          ariaLabelledBy: 'save-confirm-title',
          restoreFocus: true,
        },
      );
      this.confirmation = ref;
      unregister = this.dialogRegistry.register(ref);
      return !!(await firstValueFrom(ref.closed));
    } finally {
      if (this.confirmation === ref) this.confirmation = undefined;
      unregister?.();
      release();
    }
  }

  private stageUi(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const render = afterNextRender(
        () => {
          this.cancelStage = undefined;
          if (
            this.runtime.world()?.opening?.state.handcraft &&
            !document.querySelector('#field-kit app-handcraft-panel')
          )
            reject(new Error('The saved crafting panel could not be prepared.'));
          else resolve();
        },
        { injector: this.injector },
      );
      this.cancelStage = () => {
        render.destroy();
        reject(new Error('The game page closed while loading.'));
      };
    });
  }
}
