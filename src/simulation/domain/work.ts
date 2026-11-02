import type { WorkData, ItemStack } from '@contracts/simulation';
import { requireInvariant as check } from '@contracts/simulation';

/** First handcrafted tool goes directly into its independent empty equipment slot. */
export function handcraftBagOutput(
  recipe: { id: string; outputs: readonly ItemStack[] },
  tool: string | null,
): readonly ItemStack[] {
  return recipe.id === 'scrap-prybar' && tool === null ? [] : recipe.outputs;
}

/** One bounded unit of paid work. A blocked completion accumulates no catch-up debt. */
export function advanceWork(
  work: WorkData,
  delta: number,
  commit: (work: WorkData) => boolean,
): boolean {
  check(
    Number.isFinite(delta) && delta >= 0 && Number.isFinite(work.duration) && work.duration > 0,
    'Invalid work interval',
  );
  if (work.status !== 'active') return false;
  work.remaining = Math.max(0, work.remaining - delta);
  if (work.remaining > 1e-10) return false;
  if (!commit(work)) {
    work.status = 'blocked';
    return false;
  }
  work.completed++;
  work.remaining = work.duration;
  work.status = 'active';
  return true;
}
