import type { OpeningTechnology } from '@content/opening';

/** Availability depends on completed technologies, never stock, history or queued ancestors. */
export function researchPrerequisitesMet(
  technology: Pick<OpeningTechnology, 'requires'>,
  ledgers: Readonly<Record<string, { readonly unlocked: boolean } | undefined>>,
): boolean {
  return technology.requires.every((id) => ledgers[id]?.unlocked === true);
}
