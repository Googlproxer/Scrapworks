import type { ButtonControl, Vector2Binding } from '@contracts/input';
export type { Context, RawInput, ButtonState, ActionState, ActionFrame } from '@contracts/input';

export type Rule =
  | {
      readonly kind: 'button';
      readonly bindings: readonly ButtonControl[];
    }
  | {
      readonly kind: 'vector2';
      readonly bindings: readonly Vector2Binding[];
    };

export type Rules = Readonly<Record<string, Rule>>;
