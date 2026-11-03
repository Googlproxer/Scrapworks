import {
  OPENING_CONTENT,
  OPENING_RECIPES,
  OPENING_TECHNOLOGIES,
  chargeCapacity,
} from '@content/opening';
import type { OpeningData } from '@contracts/opening';
import type { InventoryData } from '@contracts/simulation';
import { requireInvariant as check } from '@contracts/simulation';
import { planTransaction } from './domain/inventory';
import { handcraftBagOutput } from './domain/work';

/** Validate the complete opening component before replacing a healthy authority. */
export function assertOpening(
  value: unknown,
  bag: InventoryData,
  tool: string | null,
): asserts value is OpeningData {
  const record = (v: unknown, keys?: readonly string[]): Record<string, unknown> => {
    check(!!v && typeof v === 'object' && !Array.isArray(v), 'Invalid opening record');
    check(
      Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null,
      'Opening state must be plain data',
    );
    if (keys)
      check(
        Object.keys(v).every((key) => keys.includes(key)),
        'Unknown opening field',
      );
    return v as Record<string, unknown>;
  };

  const number = (v: unknown, integer = false) => {
    check(
      typeof v === 'number' &&
        Number.isFinite(v) &&
        v >= 0 &&
        (!integer || Number.isSafeInteger(v)),
      'Invalid opening quantity',
    );
    return v;
  };

  const stacks = (v: unknown) => {
    check(Array.isArray(v) && v.length <= 8, 'Invalid opening buffer');
    for (const item of v) {
      const s = record(item, ['item', 'quantity']);
      check(
        typeof s['item'] === 'string' &&
          Object.hasOwn(OPENING_CONTENT.items, s['item']) &&
          number(s['quantity'], true) > 0,
        'Invalid opening buffer item',
      );
    }
  };

  const operation = (v: unknown) => {
    const job = record(v);
    check(
      typeof job['id'] === 'string' && job['id'].length > 0 && job['id'].length < 256,
      'Invalid opening job identity',
    );
    const recipe = OPENING_RECIPES.find((entry) => entry.id === job['recipe']);
    check(recipe && number(job['remaining']) <= recipe.seconds, 'Invalid opening work');
    return recipe;
  };

  const state = record(value, [
    'salvage',
    'handcraft',
    'handcraftVisible',
    'handcraftSuspended',
    'fieldTechnology',
    'fieldEnabled',
    'moved',
    'minifab',
  ]);
  for (const key of ['handcraftVisible', 'handcraftSuspended', 'fieldEnabled', 'moved'])
    check(typeof state[key] === 'boolean', 'Invalid opening flag');
  check(
    state['fieldTechnology'] === null ||
      OPENING_TECHNOLOGIES.some((technology) => technology.id === state['fieldTechnology']),
    'Unknown field technology',
  );
  if (state['salvage'] !== null) {
    const task = record(state['salvage'], ['target', 'remaining']);
    check(
      typeof task['target'] === 'string' &&
        task['target'].length <= 256 &&
        number(task['remaining']) <= 3,
      'Invalid salvage task',
    );
  }
  if (state['handcraft'] !== null) {
    const recipe = operation(state['handcraft']),
      job = record(state['handcraft'], ['id', 'recipe', 'remaining', 'inputs', 'unitsLeft']);
    stacks(job['inputs']);
    check(
      JSON.stringify(job['inputs']) === JSON.stringify(recipe.inputs) &&
        number(job['unitsLeft'], true) > 0 &&
        Number(job['unitsLeft']) <=
          (recipe.outputs[0] ? OPENING_CONTENT.items[recipe.outputs[0].item].stackLimit : 1) &&
        state['handcraftVisible'],
      'Invalid handcraft ownership',
    );
    check(
      planTransaction(bag, [], recipe.inputs, OPENING_CONTENT) &&
        planTransaction(bag, [], handcraftBagOutput(recipe, tool), OPENING_CONTENT),
      'Unprotected handcraft capacity',
    );
  }
  const mini = record(state['minifab'], [
    'owned',
    'request',
    'job',
    'input',
    'output',
    'outputRecipe',
    'charge',
    'capacityLevel',
    'gearing',
    'windBudget',
    'status',
  ]);
  check(
    typeof mini['owned'] === 'boolean' &&
      [
        'unowned',
        'idle',
        'requested',
        'making',
        'ingredients',
        'handcraft',
        'retained-inputs',
        'output-full',
        'completed',
        'cancelled-retained',
      ].includes(String(mini['status'])),
    'Invalid MiniFab',
  );
  check(
    number(mini['capacityLevel'], true) === 0 && number(mini['gearing'], true) === 0,
    'Unimplemented MiniFab upgrade',
  );
  check(
    number(mini['charge']) <= chargeCapacity(Number(mini['capacityLevel'])),
    'Invalid MiniFab charge',
  );
  check(number(mini['windBudget']) <= 180, 'Invalid winding rate allowance');
  stacks(mini['input']);
  stacks(mini['output']);
  if (mini['request'] !== null) {
    const request = record(mini['request'], ['recipe', 'left']);
    const recipe = OPENING_RECIPES.find((entry) => entry.id === request['recipe']);
    check(
      recipe?.minifab &&
        number(request['left'], true) > 0 &&
        Number(request['left']) <= OPENING_CONTENT.items[recipe.outputs[0].item].stackLimit,
      'Invalid MiniFab request',
    );
  }
  if (mini['job'] !== null) {
    record(mini['job'], ['id', 'recipe', 'remaining']);
    const recipe = operation(mini['job']);
    check(
      recipe.minifab &&
        mini['request'] &&
        recipe.inputs.every(
          (input) =>
            (mini['input'] as { item: string; quantity: number }[])
              .filter((item) => item.item === input.item)
              .reduce((sum, item) => sum + item.quantity, 0) >= input.quantity,
        ),
      'Invalid MiniFab operation',
    );
  }
  check(
    mini['outputRecipe'] === null ||
      OPENING_RECIPES.some((recipe) => recipe.minifab && recipe.id === mini['outputRecipe']),
    'Invalid MiniFab output identity',
  );
  check(
    mini['owned'] ||
      (mini['request'] === null &&
        mini['job'] === null &&
        !(mini['input'] as unknown[]).length &&
        !(mini['output'] as unknown[]).length &&
        mini['charge'] === 0),
    'Unowned MiniFab work',
  );
  const input = mini['input'] as { item: string; quantity: number }[];
  const output = mini['output'] as { item: string; quantity: number }[];
  for (const item of input) {
    const maximum = Math.max(
      0,
      ...OPENING_RECIPES.filter((recipe) => recipe.minifab).flatMap((recipe) =>
        recipe.inputs.filter((entry) => entry.item === item.item).map((entry) => entry.quantity),
      ),
    );
    check(
      input
        .filter((entry) => entry.item === item.item)
        .reduce((sum, entry) => sum + entry.quantity, 0) <= maximum,
      'Overfull MiniFab input',
    );
  }
  const outputRecipe = OPENING_RECIPES.find((recipe) => recipe.id === mini['outputRecipe']);
  check((output.length === 0) === (mini['outputRecipe'] === null), 'Invalid held output identity');
  for (const item of output)
    check(
      output
        .filter((entry) => entry.item === item.item)
        .reduce((sum, entry) => sum + entry.quantity, 0) <=
        (outputRecipe?.outputs.find((entry) => entry.item === item.item)?.quantity ?? 0),
      'Overfull MiniFab output',
    );
}
