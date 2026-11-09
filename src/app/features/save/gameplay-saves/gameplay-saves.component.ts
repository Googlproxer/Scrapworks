import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
import { GameplaySaveService } from '../gameplay-save.service';

@Component({
  imports: [NgTemplateOutlet, DatePipe, FormField],
  selector: 'app-gameplay-saves',
  templateUrl: './gameplay-saves.component.html',
  styleUrl: './gameplay-saves.component.scss',
  host: { '[class.expanded]': 'expanded()' },
})
export class GameplaySavesComponent {
  private static nextId = 0;
  public readonly id = `gameplay-saves-${++GameplaySavesComponent.nextId}`;
  public readonly compact = input(false);
  public readonly expanded = signal(false);
  public readonly saves = inject(GameplaySaveService);
  public readonly nameForm = form(this.saves.runName, (path) => {
    required(path.name);
    maxLength(path.name, 80);
  });
  public readonly importForm = form(this.saves.importName, (path) => {
    required(path.name);
    maxLength(path.name, 80);
  });
  public readonly canDeleteRevision = computed(() => {
    const selected = this.saves.status().slot;
    return (
      !!selected &&
      this.saves.history().some((m) => m.kind === selected.kind && m.sequence > selected.sequence)
    );
  });

  public chooseRun(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const run = this.saves
      .runs()
      .find((m) => m.runId === (event.target as HTMLSelectElement).value);
    if (run) this.saves.select(run.token);
  }

  public chooseRevision(event: Event): void {
    if (event.target instanceof HTMLSelectElement) this.saves.select(event.target.value);
  }

  public async chooseFile(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    if (file) await this.saves.inspectFile(file);
    input.value = '';
  }

  public onToggle(event: Event): void {
    if (event.target instanceof HTMLDetailsElement) this.expanded.set(event.target.open);
  }
}
