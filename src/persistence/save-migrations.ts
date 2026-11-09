import { SAVE_SCHEMA } from '@contracts/save';

export interface EnvelopeMigration {
  readonly from: number;
  readonly to: number;
  readonly migrate: (copy: unknown) => unknown;
}

/** Pure sequential pipeline. M9 starts at schema 2; schema 1 is deliberately unsupported. */
export function migrateEnvelope(
  input: unknown,
  baseline: number = SAVE_SCHEMA,
  current: number = SAVE_SCHEMA,
  steps: readonly EnvelopeMigration[] = [],
): unknown {
  const version = (value: unknown): number => {
    if (
      !value ||
      typeof value !== 'object' ||
      !('schema' in value) ||
      !Number.isSafeInteger(value.schema)
    )
      throw new Error('Invalid save envelope schema.');
    return Number(value.schema);
  };

  let schema = version(input);
  if (schema < baseline)
    throw new Error(
      'This pre-M9 save is unsupported. Compatibility starts with Milestone 9. Delete it deliberately or start a New Game.',
    );
  if (schema > current)
    throw new Error(
      'This save uses a newer unsupported format. Open it with a compatible Scrapworks version.',
    );
  let candidate: unknown = structuredClone(input);
  while (schema < current) {
    const matches = steps.filter((step) => step.from === schema && step.to === schema + 1);
    if (matches.length !== 1) throw new Error('No supported sequential save migration exists.');
    candidate = matches[0].migrate(structuredClone(candidate));
    if (version(candidate) !== schema + 1)
      throw new Error('Save migration produced an invalid version.');
    schema++;
  }
  return candidate;
}
