import type { MachineKind } from '@contracts/factory';
import { OPENING_CONTENT, OPENING_RECIPES, OPENING_TECHNOLOGIES } from './opening';
import { RECYCLER_OUTCOMES } from './factory';
import { canFabricate } from './first-factory';

/** Actual configured process IO, shared by worker validation and inspection controls. */
export function machineMaterials(
  kind: MachineKind,
  recipeId: string | null,
): {
  readonly input: readonly string[];
  readonly output: readonly string[];
} {
  const unique = (items: readonly string[]) => [...new Set(items)].sort();

  if (kind === 'recycler')
    return {
      input: ['scrap'],
      output: unique(RECYCLER_OUTCOMES.flatMap((r) => r.map((s) => s.item))),
    };
  if (kind === 'extractor') return { input: [], output: ['scrap'] };
  if (kind === 'laboratory')
    return {
      input: unique(OPENING_TECHNOLOGIES.flatMap((t) => t.costs.map((s) => s.item))),
      output: [],
    };
  const tier =
    kind === 'basic-fabricator' ? 'basic' : kind === 'medium-fabricator' ? 'medium' : null;
  const recipe = OPENING_RECIPES.find((r) => r.id === recipeId);
  return tier && recipe && canFabricate(recipe, tier, OPENING_CONTENT.technologies)
    ? {
        input: unique(recipe.inputs.map((s) => s.item)),
        output: unique(recipe.outputs.map((s) => s.item)),
      }
    : { input: [], output: [] };
}
