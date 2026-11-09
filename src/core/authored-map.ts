import type { WorldDefinition } from '../contracts/world';

/** Object property order is serialization detail; every authored value and array order is identity. */
export function authoredMapKey(definition: WorldDefinition): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
      );
    return value;
  };

  return JSON.stringify(canonical(definition));
}

export function assertSameAuthoredMap(saved: WorldDefinition, current: WorldDefinition): void {
  if (authoredMapKey(saved) !== authoredMapKey(current))
    throw new Error(
      'This save is invalid because the map has changed. Delete the old save or start a New Game.',
    );
}
