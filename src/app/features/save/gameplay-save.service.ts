import {
  afterNextRender,
  computed,
  DestroyRef,
  inject,
  InjectionToken,
  Injector,
  Service,
  signal,
} from '@angular/core';
import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import type { SaveRepository } from '@contracts/save';
import { SaveCoordinator } from '../../../persistence/save-coordinator';
import { GameRuntimeService } from '../game/game-runtime.service';
import { SaveConfirmationComponent } from './save-confirmation/save-confirmation.component';

export const GAMEPLAY_SAVE_REPOSITORY = new InjectionToken<SaveRepository>(
  'Gameplay save repository',
);

@Service({ autoProvided: false })
export class GameplaySaveService {
  private readonly runtime = inject(GameRuntimeService);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private confirmation?: DialogRef<boolean, SaveConfirmationComponent>;
  private cancelStage?: () => void;
  private readonly coordinator = new SaveCoordinator(
    inject(GAMEPLAY_SAVE_REPOSITORY),
    {
      binding: () => this.runtime.saveBinding(),
      hold: () => this.runtime.holdForSave(),
      capture: () => this.runtime.captureForSave(),
      replace: (save) => this.runtime.replaceForSave(save, () => this.stageUi()),
    },
    (message) => this.confirm(message),
    () => crypto.randomUUID(),
    () => new Date().toISOString(),
  );
  private readonly statusValue = signal(this.coordinator.status);
  private readonly pending = signal(0);
  public readonly status = this.statusValue.asReadonly();
  public readonly busy = computed(
    () => this.pending() > 0 || !['idle', 'error'].includes(this.status().phase),
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
    const subscription = this.coordinator.changes$.subscribe((status) =>
      this.statusValue.set(status),
    );
    void this.coordinator.refresh();
    inject(DestroyRef).onDestroy(() => {
      this.confirmation?.close(false);
      this.cancelStage?.();
      subscription.unsubscribe();
      this.coordinator.dispose();
    });
  }

  private operation(work: () => Promise<void>): Promise<void> {
    this.pending.update((value) => value + 1);
    return work().finally(() => this.pending.update((value) => value - 1));
  }

  public save(): Promise<void> {
    return this.operation(() => this.coordinator.save());
  }

  public load(): Promise<void> {
    return this.operation(() => this.coordinator.load());
  }

  public newGame(): Promise<void> {
    return this.operation(() => this.coordinator.newGame());
  }

  public delete(): Promise<void> {
    return this.operation(() => this.coordinator.delete());
  }

  public refresh(): Promise<void> {
    return this.coordinator.refresh();
  }

  private async confirm(message: string): Promise<boolean> {
    const ref = this.dialog.open<boolean, string, SaveConfirmationComponent>(
      SaveConfirmationComponent,
      {
        data: message,
        role: 'alertdialog',
        ariaLabelledBy: 'save-confirm-title',
        restoreFocus: true,
      },
    );
    this.confirmation = ref;
    try {
      return !!(await firstValueFrom(ref.closed));
    } finally {
      if (this.confirmation === ref) this.confirmation = undefined;
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
