import type { WorldView } from '@contracts/world';

type Editable<T> = T extends object ? { -readonly [P in keyof T]: Editable<T[P]> } : T;

/** Deliberately mutable detached data for presentation fixture construction only. */
export function editableView(view: WorldView): Editable<WorldView> {
  return structuredClone(view) as Editable<WorldView>;
}
