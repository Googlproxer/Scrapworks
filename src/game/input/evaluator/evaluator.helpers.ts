import { type IVector2Like, Vector2 } from '@babylonjs/core';
import type { ButtonControl, Vector2Binding } from '../bindings';
import type { Rules } from './evaluator.types';

export function controlId(control: ButtonControl): string {
  const input = control.device === 'keyboard' ? control.code : control.button;

  return `${control.device}:${input}`;
}

export function compileRules(
  definitions: Readonly<Record<string, 'button' | 'vector2'>>,
  bindings: Readonly<Record<string, readonly (ButtonControl | Vector2Binding)[]>>,
): Rules {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, kind]) => [
      name,
      kind === 'button'
        ? { kind, bindings: bindings[name] as readonly ButtonControl[] }
        : { kind, bindings: bindings[name] as readonly Vector2Binding[] },
    ]),
  );
}

export function clampVector(value: IVector2Like): Vector2 {
  const divisor = Math.max(1, Math.hypot(value.x, value.y));
  return new Vector2(value.x / divisor, value.y / divisor);
}

export function deadzone(value: IVector2Like, radius: number): Vector2 {
  const length = Math.hypot(value.x, value.y);
  if (length <= radius) return Vector2.Zero();

  const magnitude = (Math.min(length, 1) - radius) / (1 - radius);

  return new Vector2((value.x / length) * magnitude, (value.y / length) * magnitude);
}

export function stickId(binding: Extract<Vector2Binding, { kind: 'stick2d' }>): string {
  return `${binding.stick}:${binding.deadzone}`;
}
