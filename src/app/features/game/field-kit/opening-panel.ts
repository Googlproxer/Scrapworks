import { computed, inject } from '@angular/core';
import type { OpeningRecipe } from '@content/opening';
import { ITEM_NAMES, OPENING_RECIPES, OPENING_TECHNOLOGIES } from '@content/opening';
import type { ItemStack } from '@contracts/simulation';
import { GameRuntimeService } from '../game-runtime.service';

/** Readonly presentation selectors shared by focused field-kit panels. */
export abstract class OpeningPanel {
  public readonly runtime = inject(GameRuntimeService);
  public readonly opening = computed(() => this.runtime.world()?.opening);
  public readonly recipes = OPENING_RECIPES;
  public readonly technologies = OPENING_TECHNOLOGIES;
  public readonly usedSlots = computed(() => this.opening()?.bag.slots.filter(Boolean).length ?? 0);

  public name(item: string): string {
    return ITEM_NAMES[item] ?? item;
  }

  public recipeName(id: string): string {
    return this.recipes.find((recipe) => recipe.id === id)?.name ?? id;
  }

  public materials(items: readonly Readonly<ItemStack>[]): string {
    return items.map((item) => `${item.quantity} ${this.name(item.item)}`).join(', ') || 'Empty';
  }

  public amount(item: string): number {
    return this.runtime.world()?.inventory[item] ?? 0;
  }

  public seconds(value: number): string {
    return Math.max(0, value).toFixed(1);
  }

  public recipeUnlocked(recipe: OpeningRecipe): boolean {
    return !!this.opening()?.ledgers[recipe.technology]?.unlocked;
  }
}
