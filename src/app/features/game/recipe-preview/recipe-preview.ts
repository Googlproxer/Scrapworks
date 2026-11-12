import { Component, computed, input } from '@angular/core';
import { ITEM_NAMES, type OpeningRecipe } from '@content/opening';
import { ItemSprite } from '@app/shared/item-sprite/item-sprite';

@Component({
  imports: [ItemSprite],
  selector: 'app-recipe-preview',
  styleUrl: './recipe-preview.scss',
  templateUrl: './recipe-preview.html',
})
export class RecipePreview {
  public readonly recipe = input.required<OpeningRecipe>();
  public readonly quantity = input(1);
  public readonly showIngredients = input(true);
  public readonly result = computed(
    () => this.recipe().outputs[0] ?? { item: 'mini-fabricator', quantity: 1 },
  );
  public readonly resultName = computed(() => ITEM_NAMES[this.result().item] ?? this.recipe().name);

  public name(item: string): string {
    return ITEM_NAMES[item] ?? item;
  }
}
