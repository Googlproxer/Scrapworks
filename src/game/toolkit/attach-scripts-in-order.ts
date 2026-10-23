import type { GameplayScript } from './gameplay-script';

export interface OrderedGameplayScript {
  readonly script: GameplayScript;
  readonly order: number;
}

/** Register once in explicit order; Toolkit dispatches every subsequent lifecycle callback. */
export function attachScriptsInOrder(scripts: readonly OrderedGameplayScript[]): void {
  for (const { script } of [...scripts].sort((left, right) => left.order - right.order))
    script.attach();
}
