/** Development check: already frozen shared subtrees are not traversed again. */
export function freezePresentation(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freezePresentation(child);
}
