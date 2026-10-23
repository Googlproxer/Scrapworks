import { Dialog, type DialogConfig, type DialogRef } from '@angular/cdk/dialog';
import type { ComponentType } from '@angular/cdk/overlay';
import { DestroyRef, inject, Injector, Service } from '@angular/core';
import { take } from 'rxjs';
import { GameRuntimeService } from '../game/game-runtime.service';

export type DialogKey = 'save-dialog' | 'controls' | 'game-menu';

@Service({ autoProvided: false })
export class UiService {
  private readonly gameRuntimeService = inject(GameRuntimeService);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);

  private readonly openDialogKeys = new Set<DialogKey>();

  private readonly openDialogs = new Set<Pick<DialogRef, 'close'>>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
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
    const top = [...this.openDialogs].at(-1);
    top?.close();
    return !!top;
  }
  public get hasDialogs(): boolean {
    return this.openDialogs.size > 0;
  }
  public get activeElement(): HTMLElement | null {
    const top = [...this.openDialogs].at(-1) as DialogRef | undefined;
    return top?.overlayRef.overlayElement ?? null;
  }
}
