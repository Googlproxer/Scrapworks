import type { PresentationBehavior } from './presentation-behavior';

export function attachPresentationBehaviors(
  entries: readonly { script: PresentationBehavior; order: number }[],
): void {
  for (const { script, order } of entries) script.attach(order);
}
