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

export type DialogKey = 'controls' | 'game-menu';

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

  constructor() {
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
  ): void {
    this.gameRuntimeService.requestWorkExit(() => this.openDialog(key, component, config));
  }

  private openDialog<C, D = unknown>(
    key: DialogKey,
    component: ComponentType<C>,
    config?: DialogConfig<D, DialogRef<unknown, C>>,
  ): void {
    // Keys prevent duplicates; refs determine input ownership.
    if (this.openDialogKeys.has(key)) return;
    this.openDialogKeys.add(key);

    this.gameRuntimeService.setInputEnabled(false);
    try {
      const dialog = this.dialog.open<unknown, D, C>(component, {
        injector: this.injector,
        restoreFocus: true,
        ...config,
      });
      this.openDialogs.add(dialog);
      this.dialogRegistry.register(dialog);

      dialog.closed.pipe(take(1)).subscribe(() => {
        this.openDialogKeys.delete(key);
        this.openDialogs.delete(dialog);
        //  only release input once last dialog closed
        if (this.openDialogs.size === 0) this.gameRuntimeService.setInputEnabled(true);
      });
    } catch {
      this.openDialogKeys.delete(key);
      if (this.openDialogs.size === 0) this.gameRuntimeService.setInputEnabled(true);
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
