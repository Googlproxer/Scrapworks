import { Component, computed, signal } from '@angular/core';
import { OpeningPanel } from './opening-panel';

@Component({
  selector: 'app-handcraft-panel',
  imports: [],
  templateUrl: './handcraft-panel.component.html',
  styleUrl: './field-kit.component.scss',
  host: { role: 'region', 'aria-labelledby': 'craft-title' },
})
export class HandcraftPanelComponent extends OpeningPanel {
  public readonly recipeId = signal('scrap-prybar');

  public readonly batch = signal(1);

  public readonly recipeResult = computed(() =>
    this.recipe().id === 'base-minifab'
      ? 'Personal Mini Fabricator'
      : this.materials(this.recipe().outputs),
  );

  public readonly cancelHandcraft = () =>
    this.runtime.command({ type: 'handcraft-ui', visible: false });

  public readonly recipe = computed(() =>
    this.recipes.find((recipe) => recipe.id === this.recipeId())!,
  );

  public chooseRecipe(event: Event): void {
    this.recipeId.set((event.target as HTMLSelectElement).value);
    this.batch.set(1);
  }

  public chooseBatch(event: Event): void {
    this.batch.set(Number((event.target as HTMLSelectElement).value));
  }

  public craft(): void {
    this.runtime.command({ type: 'handcraft-ui', visible: true });
    this.runtime.command({ type: 'craft', recipe: this.recipeId(), quantity: this.batch() });
  }

  public handcraftProgress(): number {
    const job = this.opening()?.state.handcraft;
    return job
      ? 1 - job.remaining / (this.recipes.find((recipe) => recipe.id === job.recipe)?.seconds ?? 1)
      : 0;
  }
}
