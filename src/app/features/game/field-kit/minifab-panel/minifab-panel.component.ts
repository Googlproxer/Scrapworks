import { Component, computed, linkedSignal, untracked } from '@angular/core';
import { chargeCapacity, OPENING_CONTENT } from '@content/opening';
import { ItemSprite } from '@app/shared/item-sprite/item-sprite';
import { RecipePreview } from '../../recipe-preview/recipe-preview';
import { OpeningPanel } from '../opening-panel';

import { minifabStatus } from '../../../ui/opening-labels';
import { WindingHandleComponent } from '../../winding-handle/winding-handle.component';

@Component({
  selector: 'app-minifab-panel',
  imports: [WindingHandleComponent, ItemSprite, RecipePreview],
  templateUrl: './minifab-panel.component.html',
  styleUrl: './minifab-panel.component.scss',
  host: { role: 'region', 'aria-labelledby': 'minifab-title' },
})
export class MiniFabPanelComponent extends OpeningPanel {
  public readonly minifabStatus = minifabStatus;
  public readonly miniRecipeId = linkedSignal({
    source: () => this.runtime.restoreRevision?.(),
    computation: () =>
      untracked(() => this.opening()?.state.minifab.request?.recipe ?? 'metal-plate'),
  });
  public readonly miniBatch = linkedSignal({
    source: () => this.runtime.restoreRevision?.(),
    computation: () =>
      untracked(() => Math.max(1, this.opening()?.state.minifab.request?.left ?? 1)),
  });

  public readonly miniRecipe = computed(() =>
    this.recipes.find((recipe) => recipe.id === this.miniRecipeId())!,
  );
  public readonly batchLimit = computed(
    () => OPENING_CONTENT.items[this.miniRecipe().outputs[0].item].stackLimit,
  );
  public readonly batchOptions = computed(() => {
    const options =
      this.miniRecipeId() === 'scrap-prybar'
        ? [1]
        : [1, 5, 10, 25, 100].filter((quantity) => quantity <= this.batchLimit());
    return [...new Set([...options, this.miniBatch()])].sort((a, b) => a - b);
  });
  public readonly retainedHandcraftProgress = computed(() => {
    const job = this.opening()?.state.handcraft;
    return job
      ? 1 - job.remaining / (this.recipes.find((recipe) => recipe.id === job.recipe)?.seconds ?? 1)
      : 0;
  });
  public readonly cancelHandcraft = () =>
    this.runtime.command({ type: 'handcraft-ui', visible: false });

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
