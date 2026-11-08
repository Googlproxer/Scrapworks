import { OPENING_CONTENT, OPENING_TECHNOLOGIES } from '@content/opening';
import { requireInvariant as check } from '@contracts/simulation';

const legacyTechnologies = new Set([
  'improvised-tools',
  'material-recovery',
  'mechanical-assembly',
  'electrical-assembly',
  'mini-fabrication',
]);
const legacyItems = new Set([
  'scrap',
  'plate',
  'wire',
  'mechanical-part',
  'electrical-part',
  'prybar',
]);
const legacyRecipes = new Set([
  'scrap-prybar',
  'metal-plate',
  'recovered-wire',
  'mechanical-part',
  'electrical-part',
  'base-minifab',
]);

function object(value: unknown): Record<string, unknown> {
  check(
    !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
    'Invalid legacy save object',
  );
  return value as Record<string, unknown>;
}

/** The explicit M4 content upgrade; normal snapshot/gameplay/native validation still follows. */
export function upgradeOpeningSave(value: unknown): unknown {
  const original = object(value);
  if (original['contentVersion'] !== 'opening-1') return value;
  const copy = object(structuredClone(original)),
    resources = object(copy['resources']);
  const ledgers = object(resources['research']);
  for (const [id, value] of Object.entries(ledgers)) {
    check(legacyTechnologies.has(id), 'Unknown legacy technology');
    for (const item of Object.keys(object(object(value)['consumed'])))
      check(legacyItems.has(item), 'Unknown legacy contribution');
  }
  for (const field of ['productionTotals', 'extractionTotals'])
    for (const item of Object.keys(object(resources[field])))
      check(
        legacyItems.has(item) || (field === 'productionTotals' && item === 'minifab'),
        'Unknown legacy history',
      );
  check(
    Array.isArray(copy['entities']) && copy['entities'].length <= 250000,
    'Invalid legacy entities',
  );

  const stacks = (value: unknown) => {
    check(Array.isArray(value), 'Invalid legacy stacks');
    for (const stack of value)
      if (stack !== null)
        check(legacyItems.has(String(object(stack)['item'])), 'Unknown legacy item');
  };

  for (const value of copy['entities']) {
    const entity = object(value);
    if (entity['inventory']) stacks(object(entity['inventory'])['slots']);
    if (entity['pile']) stacks([entity['pile']]);
    if (!entity['opening']) continue;
    const opening = object(entity['opening']);
    check(
      Object.hasOwn(opening, 'fieldTechnology') && !Object.hasOwn(opening, 'researchQueue'),
      'Invalid legacy research state',
    );
    const target = opening['fieldTechnology'];
    check(
      target === null || (typeof target === 'string' && legacyTechnologies.has(target)),
      'Unknown legacy target',
    );
    if (typeof target === 'string') {
      const ledger = object(ledgers[target]);
      check(
        ledger['unlocked'] === false &&
          OPENING_TECHNOLOGIES.find((entry) => entry.id === target)!.requires.every(
            (id) => object(ledgers[id])['unlocked'] === true,
          ),
        'Invalid legacy active research',
      );
    }
    const mini = object(opening['minifab']);
    stacks(mini['input']);
    stacks(mini['output']);
    for (const value of [opening['handcraft'], mini['job'], mini['request']])
      if (value !== null)
        check(legacyRecipes.has(String(object(value)['recipe'])), 'Unknown legacy recipe');
    if (mini['outputRecipe'] !== null)
      check(legacyRecipes.has(String(mini['outputRecipe'])), 'Unknown legacy output');
    delete opening['fieldTechnology'];
    opening['researchQueue'] = target === null ? [] : [target];
  }
  copy['contentVersion'] = OPENING_CONTENT.version;
  return copy;
}
