import { IVector2Like } from '@babylonjs/core';
import { actions, ButtonControl, Vector2Binding } from '../bindings';

export type Context = keyof typeof actions;

export interface RawInput {
  readonly down: ReadonlySet<string>;
  readonly sticks: Readonly<Record<'left' | 'right', IVector2Like>>;
}

export type ButtonState = Readonly<{
  kind: 'button';
  held: boolean;
  pressed: boolean;
  released: boolean;
}>;

export type ActionState = ButtonState | Readonly<{ kind: 'vector2'; value: IVector2Like }>;

export interface ActionFrame {
  readonly context: Context | null;
  readonly revision: number;
  readonly states: Readonly<Record<string, ActionState>>;
}

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
