import { Dialog, type DialogConfig, type DialogRef } from '@angular/cdk/dialog';
import type { ComponentType } from '@angular/cdk/overlay';
import { DestroyRef, effect, inject, Injector, Service, untracked } from '@angular/core';
import { take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GameRuntimeService } from '../game/game-runtime.service';
import {
  NotificationCenter,
  type NotificationOptions,
  type NotificationRef,
} from './notifications';
import { OpeningFeedback } from './opening-feedback';
import { UiDialogRegistry } from './ui-dialog-registry';
import { MachineInspectionComponent } from '../game/machine-inspection/machine-inspection.component';

export type DialogKey = 'controls' | 'game-menu' | 'machine-inspection';
export type DialogSimulationPolicy = 'paused' | 'live';

@Service({ autoProvided: false })
export class UiService {
  private readonly notificationCenter = new NotificationCenter();
  private readonly openingFeedback = new OpeningFeedback(this.notificationCenter);
  public readonly notifications = this.notificationCenter.visible;
  public readonly queuedNotificationCount = this.notificationCenter.queuedCount;
  private readonly gameRuntimeService = inject(GameRuntimeService);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly dialogRegistry = inject(UiDialogRegistry);
  private worldGeneration?: number;

  private readonly openDialogKeys = new Set<DialogKey>();

  private readonly openDialogs = new Set<Pick<DialogRef, 'close'>>();
  private readonly pausingDialogs = new Set<Pick<DialogRef, 'close'>>();
  private machineDialog?: DialogRef<unknown, MachineInspectionComponent>;

  constructor() {
    this.gameRuntimeService.interactionMessages$?.pipe(takeUntilDestroyed()).subscribe((message) =>
      this.openNotification({
        key: 'machine-interaction',
        title: 'Machine inspection',
        message,
        tone: 'warning',
      }),
    );
    effect(() => {
      const id = this.gameRuntimeService.machineInspectionId?.();
      untracked(() => {
        if (id && !this.machineDialog) {
          this.machineDialog = this.openDialog(
            'machine-inspection',
            MachineInspectionComponent,
            {
              ariaLabelledBy: 'machine-inspection-title',
              autoFocus: '#machine-inspection-title',
              restoreFocus: false,
            },
            'live',
          );
        } else if (!id) this.machineDialog?.close();
      });
    });
    this.gameRuntimeService.events$
      .pipe(takeUntilDestroyed())
      .subscribe((event) => this.openingFeedback.handle(event));
    effect(() => {
      const world = this.gameRuntimeService.world?.() ?? null;
      if (this.gameRuntimeService.preparingSave?.()) return;
      untracked(() => {
        if (this.worldGeneration !== undefined && world?.worldGeneration !== this.worldGeneration)
          this.notificationCenter.clear();
        this.worldGeneration = world?.worldGeneration;
        this.openingFeedback.update(world);
      });
    });
    effect(() => {
      if (this.gameRuntimeService.errorMessage()) {
        for (const dialog of [...this.openDialogs]) dialog.close();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.notificationCenter.destroy();
      for (const dialog of this.openDialogs) {
        dialog.close();
      }
    });
  }

  public openUIDialog<C, D = unknown>(
    key: DialogKey,
    component: ComponentType<C>,
    config?: DialogConfig<D, DialogRef<unknown, C>>,
    policy: DialogSimulationPolicy = 'paused',
  ): void {
    this.gameRuntimeService.requestWorkExit(() => this.openDialog(key, component, config, policy));
  }

  private openDialog<C, D = unknown>(
    key: DialogKey,
    component: ComponentType<C>,
    config?: DialogConfig<D, DialogRef<unknown, C>>,
    policy: DialogSimulationPolicy = 'paused',
  ): DialogRef<unknown, C> | undefined {
    // Keys prevent duplicates; refs determine input ownership.
    if (this.openDialogKeys.has(key)) return;
    this.openDialogKeys.add(key);

    if (policy === 'paused') this.gameRuntimeService.setInputEnabled(false);
    else this.gameRuntimeService.setUiFocused(true);
    try {
      const dialog = this.dialog.open<unknown, D, C>(component, {
        injector: this.injector,
        restoreFocus: true,
        ...config,
      });
      this.openDialogs.add(dialog);
      if (policy === 'paused') this.pausingDialogs.add(dialog);
      this.dialogRegistry.register(dialog);

      dialog.closed.pipe(take(1)).subscribe(() => {
        this.openDialogKeys.delete(key);
        this.openDialogs.delete(dialog);
        this.pausingDialogs.delete(dialog);
        if (policy === 'paused' && this.pausingDialogs.size === 0)
          this.gameRuntimeService.setInputEnabled(true);
        if (key === 'machine-inspection') {
          this.machineDialog = undefined;
          this.gameRuntimeService.closeMachineInspection();
          if (
            !this.openDialogs.size &&
            !this.gameRuntimeService.fieldKitOpen() &&
            this.gameRuntimeService.isReady() &&
            this.gameRuntimeService.currentSceneKey() === 'Game'
          )
            this.gameRuntimeService.focusViewport();
        }
      });
      return dialog;
    } catch {
      this.openDialogKeys.delete(key);
      if (policy === 'paused' && this.pausingDialogs.size === 0)
        this.gameRuntimeService.setInputEnabled(true);
      if (key === 'machine-inspection') {
        this.gameRuntimeService.closeMachineInspection();
        this.gameRuntimeService.focusViewport();
      }
      return undefined;
    }
  }

  public closeTopDialog(): boolean {
    return this.dialogRegistry.closeTop();
  }

  public openNotification(options: NotificationOptions): NotificationRef {
    return this.notificationCenter.open(options);
  }

  public dismissNotification(id: number): void {
    this.notificationCenter.dismiss(id);
  }

  public holdNotification(id: number, reason: 'pointer' | 'focus', held: boolean): void {
    this.notificationCenter.hold(id, reason, held);
  }

  public get hasDialogs(): boolean {
    return this.openDialogs.size > 0;
  }

  public get activeElement(): HTMLElement | null {
    return this.dialogRegistry.activeElement;
  }
}
