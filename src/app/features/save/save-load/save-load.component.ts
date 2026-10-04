import { DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
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

  private readonly saveService = inject(SaveService);
  private readonly dialogRef = inject(DialogRef<SaveLoadComponent>);

  public constructor() {
    // Initialise 10 save slots
    const initialSlots: SaveSlot[] = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      name: `Slot ${index + 1}`,
      value: 0,
      occupied: false,
    }));
    this.slots.set(initialSlots);
  }

  public close() {
    // Close the save/load component
    this.dialogRef.close();
  }

  public save(slotId: number) {
    const slot = this.slots().find((s) => s.id === slotId);
    if (slot) {
      const testData = { name: slot.name, value: Math.random() };
      this.saveService.save(testData);
      slot.occupied = true;
      this.slots.set([...this.slots()]);
    }
  }

  public async load(slotId: number) {
    const slot = this.slots().find((s) => s.id === slotId);
    if (slot && slot.occupied) {
      await this.saveService.load(slot.id);
    }
  }

  public async delete(slotId: number) {
    const slot = this.slots().find((s) => s.id === slotId);
    if (slot && slot.occupied) {
      // Delete the data from the database
      await this.saveService.load(slot.id); // Load the data to get the id
      await this.saveService.delete(slot.id); // Assuming you have a delete method in SaveService
      slot.occupied = false;
      slot.value = 0;
      this.slots.set([...this.slots()]);
    }
  }

  public async export() {
    const jsonData = await this.saveService.export();
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
  }

  public async import() {
    // load the jsonData from a file
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const file = target.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
          const jsonData = e.target?.result as string;
          await this.importData(jsonData);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  private async importData(data: string) {
    await this.saveService.import(data);
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
    this.slots.set(updatedSlots);
  }
}
