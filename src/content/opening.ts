import type { ContentDefinition, ItemStack } from '../contracts/simulation';
import { EQUIPMENT_ITEMS, EQUIPMENT_RECIPES } from './factory';
import { ENVIRONMENT_TECHNOLOGIES } from './environment';
import {
  EQUIPMENT_BLUEPRINTS,
  FIRST_FACTORY_TECHNOLOGIES,
  RESEARCH_KIT_RECIPE,
  RESEARCH_ROADMAP,
} from './first-factory';

export interface OpeningRecipe {
  id: string;
  name: string;
  technology: string;
  inputs: readonly ItemStack[];
  outputs: readonly ItemStack[];
  seconds: number;
  handcraft: boolean;
  minifab: boolean;
}

export interface OpeningTechnology {
  id: string;
  name: string;
  requires: readonly string[];
  costs: readonly ItemStack[];
  eligibility: readonly ItemStack[];
  seconds: number;
}

const stack = (item: string, quantity: number): ItemStack => ({ item, quantity });

/** Stable runtime IDs have an explicit authoring-source mapping below. */
export const OPENING_RECIPES: readonly OpeningRecipe[] = [
  {
    id: 'scrap-prybar',
    name: 'Scrap prybar',
    technology: 'improvised-tools',
    inputs: [stack('scrap', 4)],
    outputs: [stack('prybar', 1)],
    seconds: 4,
    handcraft: true,
    minifab: true,
  },
  {
    id: 'metal-plate',
    name: 'Metal plate',
    technology: 'material-recovery',
    inputs: [stack('scrap', 2)],
    outputs: [stack('plate', 1)],
    seconds: 2,
    handcraft: true,
    minifab: true,
  },
  {
    id: 'recovered-wire',
    name: 'Recovered wire',
    technology: 'material-recovery',
    inputs: [stack('scrap', 1)],
    outputs: [stack('wire', 1)],
    seconds: 1,
    handcraft: true,
    minifab: true,
  },
  {
    id: 'mechanical-part',
    name: 'Mechanical part',
    technology: 'mechanical-assembly',
    inputs: [stack('plate', 2)],
    outputs: [stack('mechanical-part', 1)],
    seconds: 4,
    handcraft: true,
    minifab: true,
  },
  {
    id: 'electrical-part',
    name: 'Electrical part',
    technology: 'electrical-assembly',
    inputs: [stack('plate', 1), stack('wire', 2)],
    outputs: [stack('electrical-part', 1)],
    seconds: 6,
    handcraft: true,
    minifab: true,
  },
  {
    id: 'base-minifab',
    name: 'Mini Fabricator',
    technology: 'mini-fabrication',
    inputs: [
      stack('plate', 2),
      stack('wire', 2),
      stack('mechanical-part', 1),
      stack('electrical-part', 1),
    ],
    outputs: [],
    seconds: 12,
    handcraft: true,
    minifab: false,
  },
  RESEARCH_KIT_RECIPE,
  ...EQUIPMENT_RECIPES,
];

export const OPENING_TECHNOLOGIES: readonly OpeningTechnology[] = [
  {
    id: 'improvised-tools',
    name: 'Improvised tools',
    requires: [],
    costs: [stack('scrap', 4)],
    eligibility: [stack('scrap', 4)],
    seconds: 6,
  },
  {
    id: 'material-recovery',
    name: 'Material recovery',
    requires: ['improvised-tools'],
    costs: [stack('scrap', 8)],
    eligibility: [stack('scrap', 8)],
    seconds: 12,
  },
  {
    id: 'mechanical-assembly',
    name: 'Mechanical assembly',
    requires: ['material-recovery'],
    costs: [stack('plate', 4)],
    eligibility: [stack('plate', 4)],
    seconds: 15,
  },
  {
    id: 'electrical-assembly',
    name: 'Electrical assembly',
    requires: ['material-recovery'],
    costs: [stack('plate', 4), stack('wire', 6)],
    eligibility: [stack('plate', 4), stack('wire', 6)],
    seconds: 20,
  },
  {
    id: 'mini-fabrication',
    name: 'Mini fabrication',
    requires: ['mechanical-assembly', 'electrical-assembly'],
    costs: [stack('mechanical-part', 1), stack('electrical-part', 1)],
    eligibility: [stack('mechanical-part', 1), stack('electrical-part', 1)],
    seconds: 12,
  },
  ...FIRST_FACTORY_TECHNOLOGIES,
  ...ENVIRONMENT_TECHNOLOGIES,
];

export const OPENING_CONTENT: ContentDefinition = {
  version: 'restoration-1',
  items: {
    ...EQUIPMENT_ITEMS,
    scrap: { stackLimit: 100, solidValue: 1 },
    coal: { stackLimit: 100, solidValue: 0 },
    plate: { stackLimit: 100, solidValue: 2 },
    wire: { stackLimit: 100, solidValue: 1 },
    'mechanical-part': { stackLimit: 100, solidValue: 4 },
    'electrical-part': { stackLimit: 100, solidValue: 4 },
    prybar: { stackLimit: 1, solidValue: 4 },
    'research-kit': { stackLimit: 50, solidValue: 8 },
  },
  recipes: Object.fromEntries(OPENING_RECIPES.map((recipe) => [recipe.id, recipe])),
  technologies: OPENING_TECHNOLOGIES.map((technology) => technology.id),
};

export const OPENING_SETTINGS = Object.freeze({
  reach: 2,
  handSalvageSeconds: 3,
  prybarSalvageSeconds: 1,
  starterScrap: 250_000,
  groundMergeRadius: 0.75,
  baseChargeSeconds: 60,
  baseTurns: 5,
  maxDegreesPerSecond: 720,
});

export const ITEM_NAMES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(EQUIPMENT_BLUEPRINTS.map((b) => [b.id, b.name])),
  scrap: 'Mixed scrap',
  coal: 'Coal',
  plate: 'Metal plate',
  wire: 'Recovered wire',
  'mechanical-part': 'Mechanical part',
  'electrical-part': 'Electrical part',
  prybar: 'Scrap prybar',
  'research-kit': 'Basic research kit',
};

export const OPENING_SOURCE_IDS = {
  recipes: {
    ...Object.fromEntries(
      EQUIPMENT_BLUEPRINTS.map((b) => [`assemble-${b.id}`, `recipe.${b.id.replaceAll('-', '_')}`]),
    ),
    'scrap-prybar': 'recipe.prybar',
    'metal-plate': 'recipe.plate',
    'recovered-wire': 'recipe.wire',
    'mechanical-part': 'recipe.mechanical',
    'electrical-part': 'recipe.electrical',
    'base-minifab': 'recipe.minifab',
    'basic-research-kit': 'recipe.basic_research_kit',
  },
  technologies: {
    'improvised-tools': 'tech.improvised_tools',
    'material-recovery': 'tech.material_recovery',
    'mechanical-assembly': 'tech.mechanical_assembly',
    'electrical-assembly': 'tech.electrical_assembly',
    'mini-fabrication': 'tech.mini_fabrication',
    'electrical-engineering': 'future.electrical_engineering',
    'solar-power': 'future.solar',
    'wind-power': 'future.wind',
    'mixed-recycling': 'future.recycling',
    'basic-fabrication': 'future.basic_fabrication',
    'medium-fabrication': 'future.medium_fabrication',
    extraction: 'future.extraction',
    'laboratory-research': 'future.laboratory',
    'sorting-logistics': 'future.logistics',
    storage: 'tech.energy_storage',
    'water-treatment': 'tech.water_treatment',
    greenhouse: 'tech.greenhouse',
    'coal-power': 'future.coal',
    'pollution-mitigation': 'tech.pollution_mitigation',
  },
  items: {
    ...Object.fromEntries(
      EQUIPMENT_BLUEPRINTS.map((b) => [b.id, `item.${b.id.replaceAll('-', '_')}`]),
    ),
    scrap: 'item.scrap',
    coal: 'item.coal',
    plate: 'item.plate',
    wire: 'item.wire',
    'mechanical-part': 'item.mechanical',
    'electrical-part': 'item.electrical',
    prybar: 'item.prybar',
    'research-kit': 'item.basic_research_kit',
  },
} as const;

/** No implicit free recipes or technologies for unpriced future authoring records. */
export const DEFERRED_CONTENT = [
  'recipe.crank_gearing',
  'recipe.charge_storage',
  'future.minifab_coal',
] as const;

export const chargeCapacity = (level: number): number => 60 * 1.5 ** level;

export const upgradeCostMultiplier = (level: number): number => 2 ** (level - 1);

export const turnsToFull = (gearing: number): number => Math.max(1, 5 - gearing);

/** Validate topology/capabilities before any executor can spend stock. */
export function validateOpeningCatalogue(
  recipes = OPENING_RECIPES,
  technologies = OPENING_TECHNOLOGIES,
): void {
  if (
    new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length ||
    new Set(technologies.map((technology) => technology.id)).size !== technologies.length
  )
    throw new Error('Duplicate catalogue ID');
  for (const technology of technologies) {
    if (!Number.isFinite(technology.seconds) || technology.seconds <= 0 || !technology.costs.length)
      throw new Error('Unpriced technology');
    for (const costs of [technology.costs, technology.eligibility]) {
      if (
        new Set(costs.map((cost) => cost.item)).size !== costs.length ||
        costs.some(
          (cost) =>
            !Object.hasOwn(OPENING_CONTENT.items, cost.item) ||
            !Number.isSafeInteger(cost.quantity) ||
            cost.quantity <= 0,
        )
      )
        throw new Error('Invalid research costs');
    }
  }
  const visited = new Set<string>(),
    visiting = new Set<string>();

  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('Cyclic opening catalogue');
    if (visited.has(id)) return;
    const technology = technologies.find((entry) => entry.id === id);
    if (!technology) throw new Error('Unknown opening prerequisite');
    visiting.add(id);
    technology.requires.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };

  technologies.forEach((technology) => visit(technology.id));
  const walked = new Set<string>();

  const walk = (recipe: OpeningRecipe, path: ReadonlySet<string>) => {
    if (path.has(recipe.id)) throw new Error('Cyclic opening recipe');
    if (walked.has(recipe.id)) return;
    const next = new Set(path).add(recipe.id);
    for (const input of recipe.inputs) {
      const precursor = recipes.find(
        (entry) => entry.minifab && entry.outputs.some((output) => output.item === input.item),
      );
      if (precursor) walk(precursor, next);
    }
    walked.add(recipe.id);
  };

  for (const recipe of recipes) {
    walk(recipe, new Set());
    visit(recipe.technology);

    const value = (items: readonly ItemStack[]) =>
      items.reduce((total, item) => {
        const definition = OPENING_CONTENT.items[item.item];
        if (!definition) throw new Error('Unknown opening material');
        return total + definition.solidValue * item.quantity;
      }, 0);

    if (value(recipe.inputs) !== (recipe.id === 'base-minifab' ? 14 : value(recipe.outputs)))
      throw new Error('Opening recipe does not conserve material');
  }

  const unlocked = new Set<string>(),
    materials = new Set(['scrap']);
  let changed = true;
  while (changed) {
    changed = false;
    for (const technology of technologies)
      if (
        !unlocked.has(technology.id) &&
        technology.requires.every((id) => unlocked.has(id)) &&
        [...technology.costs, ...technology.eligibility].every((cost) => materials.has(cost.item))
      ) {
        unlocked.add(technology.id);
        changed = true;
      }
    for (const recipe of recipes)
      if (
        unlocked.has(recipe.technology) &&
        recipe.inputs.every((input) => materials.has(input.item))
      )
        for (const output of recipe.outputs)
          if (!materials.has(output.item)) {
            materials.add(output.item);
            changed = true;
          }
  }
  if (unlocked.size !== technologies.length)
    throw new Error('Unreachable research cost or prerequisite');
  for (const equipment of EQUIPMENT_BLUEPRINTS)
    if (
      !unlocked.has(equipment.technology) ||
      equipment.inputs.some((input) => !materials.has(input.item))
    )
      throw new Error('Unreachable equipment construction');
  const route = new Set(unlocked);
  for (const entry of RESEARCH_ROADMAP) {
    if (!entry.requires.every((id) => route.has(id))) throw new Error('Unreachable roadmap branch');
    route.add(entry.id);
  }
}
