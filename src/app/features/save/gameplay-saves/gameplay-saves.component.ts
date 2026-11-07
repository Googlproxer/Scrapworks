import { Component, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { GameplaySaveService } from '../gameplay-save.service';

@Component({
  imports: [NgTemplateOutlet],
  selector: 'app-gameplay-saves',
  templateUrl: './gameplay-saves.component.html',
  styleUrl: './gameplay-saves.component.scss',
  host: { '[class.expanded]': 'expanded()' },
})
export class GameplaySavesComponent {
  public readonly compact = input(false);
  public readonly expanded = signal(false);
  public readonly saves = inject(GameplaySaveService);

  public onToggle(event: Event): void {
    if (event.target instanceof HTMLDetailsElement) this.expanded.set(event.target.open);
  }
}
