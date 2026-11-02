import { DialogRef } from '@angular/cdk/dialog';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap, EMPTY, from, fromEvent, merge, switchMap, take } from 'rxjs';
import { SaveService } from '@app/features/save/save.service';

interface SaveSlot {
  id: number;
  name: string;
  value: number;
  occupied: boolean;
}

@Component({
  imports: [],
  selector: 'app-save-load',
  styleUrl: './save-load.component.scss',
  templateUrl: './save-load.component.html',
})
export class SaveLoadComponent {
  public readonly slots = signal<SaveSlot[]>([]);
  public readonly error = signal<string | null>(null);
  public readonly busy = signal(false);
  private destroyed = false;

  private readonly saveService = inject(SaveService);
  private readonly dialogRef = inject(DialogRef<SaveLoadComponent>);
  private readonly destroyRef = inject(DestroyRef);

  public constructor() {
    // Initialise 10 save slots
    const initialSlots: SaveSlot[] = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      name: `Slot ${index + 1}`,
      value: 0,
      occupied: false,
    }));
    this.slots.set(initialSlots);
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
    });
    void this.execute(() => this.refresh());
  }

  public close() {
    // Close the save/load component
    this.dialogRef.close();
  }

  private async execute(operation: () => Promise<unknown>): Promise<void> {
    if (this.destroyed || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await operation();
    } catch (error) {
      if (!this.destroyed) this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
  }

  public async save(slotId: number): Promise<void> {
    const slot = this.slots().find((s) => s.id === slotId);
    if (!slot) return;
    await this.execute(async () => {
      await this.saveService.save({ id: slot.id, name: slot.name, value: Math.random() });
      await this.refresh();
    });
  }

  public async load(slotId: number): Promise<void> {
    await this.execute(async () => {
      const data = await this.saveService.load(slotId);
      if (data && !this.destroyed)
        this.slots.update((slots) =>
          slots.map((slot) => (slot.id === slotId ? { ...slot, ...data, occupied: true } : slot)),
        );
    });
  }

  public async delete(slotId: number): Promise<void> {
    await this.execute(async () => {
      await this.saveService.delete(slotId);
      await this.refresh();
    });
  }

  public async export() {
    await this.execute(async () => {
      const jsonData = await this.saveService.export();
      if (this.destroyed) return;
      // save the jsonData to a file
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'save-data.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  public async import() {
    // load the jsonData from a file
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    merge(fromEvent(input, 'change'), fromEvent(input, 'cancel'))
      .pipe(
        take(1),
        switchMap(() => {
          const file = input.files?.[0];
          return file ? from(file.text()) : EMPTY;
        }),
        concatMap((data) => this.importData(data)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        error: (error: unknown) => {
          if (!this.destroyed)
            this.error.set(error instanceof Error ? error.message : String(error));
        },
      });
    input.click();
  }

  private async importData(data: string) {
    await this.execute(async () => {
      await this.saveService.import(data);
      await this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    // Update the slots state after import
    // load the data from the database to update the slots
    const allData = await this.saveService.loadAll();
    const updatedSlots = this.slots().map((slot) => {
      const savedData = allData.find((data) => data.id === slot.id);
      return {
        ...slot,
        occupied: !!savedData,
        value: savedData ? savedData.value : 0,
      };
    });
    if (!this.destroyed) this.slots.set(updatedSlots);
  }
}
