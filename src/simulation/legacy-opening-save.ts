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
  if (original['contentVersion'] === 'factory-1') {
    const copy = object(structuredClone(original));

    const newContent = new Set(['conveyor', 'sorter', 'assemble-conveyor', 'assemble-sorter']);

    const rejectContent = (id: unknown): void => {
      check(!newContent.has(String(id)), 'Unknown M6 transport content');
    };

    // Inspect content references, not arbitrary authored world/entity IDs with the same spelling.
    const rejectNew = (value: unknown, field = ''): void => {
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (field === 'slots' && typeof entry === 'string') rejectContent(entry);
          rejectNew(entry);
        }
      } else if (value && typeof value === 'object') {
        check(!Object.hasOwn(value, 'transport'), 'Unexpected M6 transport state');
        for (const [key, entry] of Object.entries(value)) {
          if (['item', 'buildingId', 'recipe', 'outputRecipe'].includes(key)) rejectContent(entry);
          if (
            ['productionTotals', 'extractionTotals', 'consumed'].includes(key) &&
            entry &&
            typeof entry === 'object'
          )
            Object.keys(entry).forEach(rejectContent);
          rejectNew(entry, key);
        }
      }
    };

    rejectNew(copy);
    copy['contentVersion'] = OPENING_CONTENT.version;
    return copy;
  }
  if (original['contentVersion'] === 'research-1') return upgradeResearchSave(original);
  if (original['contentVersion'] !== 'opening-1') return value;
  const copy = object(structuredClone(original)),
    resources = object(copy['resources']);
  check(!Object.hasOwn(resources, 'factory'), 'Unexpected legacy factory resources');
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
    check(
      entity['kind'] !== 'building' && !Object.hasOwn(entity, 'machine'),
      'Unexpected legacy machine',
    );
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
  resources['factory'] = { connections: [] };
  return copy;
}

/** Exact M5 namespace only: new equipment/components cannot masquerade as historical data. */
function upgradeResearchSave(original: Record<string, unknown>): unknown {
  const copy = object(structuredClone(original)),
    resources = object(copy['resources']);
  check(
    copy['version'] === 3 && !Object.hasOwn(resources, 'factory'),
    'Invalid M5 factory namespace',
  );
  const items = new Set([...legacyItems, 'research-kit']);
  const recipes = new Set([...legacyRecipes, 'basic-research-kit']);

  const stock = (value: unknown) => {
    check(Array.isArray(value), 'Invalid M5 stock');
    for (const stack of value)
      if (stack !== null) check(items.has(String(object(stack)['item'])), 'Unknown M5 item');
  };

  for (const field of ['productionTotals', 'extractionTotals'])
    for (const item of Object.keys(object(resources[field])))
      check(
        items.has(item) || (field === 'productionTotals' && item === 'minifab'),
        'Unknown M5 history',
      );
  check(
    Array.isArray(copy['entities']) && copy['entities'].length <= 250000,
    'Invalid M5 entities',
  );
  for (const entry of copy['entities']) {
    const e = object(entry);
    check(e['kind'] !== 'building' && !Object.hasOwn(e, 'machine'), 'Unexpected M5 machine');
    if (e['inventory']) stock(object(e['inventory'])['slots']);
    if (e['pile']) stock([e['pile']]);
    if (!e['opening']) continue;
    const opening = object(e['opening']),
      mini = object(opening['minifab']);
    stock(mini['input']);
    stock(mini['output']);
    for (const job of [opening['handcraft'], mini['job'], mini['request']])
      if (job !== null) check(recipes.has(String(object(job)['recipe'])), 'Unknown M5 recipe');
    if (mini['outputRecipe'] !== null)
      check(recipes.has(String(mini['outputRecipe'])), 'Unknown M5 output');
  }
  for (const ledger of Object.values(object(resources['research'])))
    for (const item of Object.keys(object(object(ledger)['consumed'])))
      check(items.has(item), 'Unknown M5 contribution');
  resources['factory'] = { connections: [] };
  copy['contentVersion'] = OPENING_CONTENT.version;
  return copy;
}
