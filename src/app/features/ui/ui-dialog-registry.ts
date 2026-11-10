import { DestroyRef, inject, Service } from '@angular/core';
import type { DialogRef } from '@angular/cdk/dialog';
import { take } from 'rxjs';

/** Shared top-dialog targeting for ordinary UI and non-destructive save confirmations. */
@Service()
export class UiDialogRegistry {
  private readonly dialogs = new Set<Pick<DialogRef, 'close' | 'overlayRef'>>();

  public constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const dialog of [...this.dialogs]) dialog.close();
      this.dialogs.clear();
    });
  }

  public register(ref: Pick<DialogRef, 'close' | 'overlayRef' | 'closed'>): () => void {
    this.dialogs.add(ref);
    const subscription = ref.closed.pipe(take(1)).subscribe(() => this.dialogs.delete(ref));
    return () => {
      subscription.unsubscribe();
      this.dialogs.delete(ref);
    };
  }

  public closeTop(): boolean {
    const top = [...this.dialogs].at(-1);
    top?.close();
    return !!top;
  }

  public get activeElement(): HTMLElement | null {
    return [...this.dialogs].at(-1)?.overlayRef.overlayElement ?? null;
  }
}
