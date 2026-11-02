import type { ItemStack } from '@contracts/simulation';

/** First handcrafted tool goes directly into its independent empty equipment slot. */
export function handcraftBagOutput(
  recipe: { id: string; outputs: readonly ItemStack[] },
  tool: string | null,
): readonly ItemStack[] {
  return recipe.id === 'scrap-prybar' && tool === null ? [] : recipe.outputs;
}
