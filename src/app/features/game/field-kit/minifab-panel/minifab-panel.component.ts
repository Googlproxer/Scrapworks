import { Component, computed, signal } from '@angular/core';
import { chargeCapacity, OPENING_CONTENT } from '@content/opening';
import { OpeningPanel } from '../opening-panel';

import { minifabStatus } from '../../../ui/opening-labels';
import { WindingHandleComponent } from '../../winding-handle/winding-handle.component';

@Component({
  selector: 'app-minifab-panel',
  imports: [WindingHandleComponent],
  templateUrl: './minifab-panel.component.html',
  styleUrl: '../field-kit.component.scss',
  host: { role: 'region', 'aria-labelledby': 'minifab-title' },
})
export class MiniFabPanelComponent extends OpeningPanel {
  public readonly minifabStatus = minifabStatus;
  public readonly miniRecipeId = signal('metal-plate');

  public readonly miniBatch = signal(1);

  public readonly miniRecipe = computed(() =>
    this.recipes.find((recipe) => recipe.id === this.miniRecipeId())!,
  );
  public readonly batchLimit = computed(
    () => OPENING_CONTENT.items[this.miniRecipe().outputs[0].item].stackLimit,
  );

  public readonly capacity = computed(() =>
    chargeCapacity(this.opening()?.state.minifab.capacityLevel ?? 0),
  );

  public chooseMiniRecipe(event: Event): void {
    this.miniRecipeId.set((event.target as HTMLSelectElement).value);
    this.miniBatch.set(1);
  }

  public chooseMiniBatch(event: Event): void {
    this.miniBatch.set(Number((event.target as HTMLSelectElement).value));
  }
}
