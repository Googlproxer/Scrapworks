import type { OpeningRecipe, OpeningTechnology } from './opening';
import type { ItemStack } from '../contracts/simulation';

const stack = (item: string, quantity: number): ItemStack => ({ item, quantity });

const technology = (
  id: string,
  name: string,
  requires: string[],
  costs: ItemStack[],
  seconds: number,
): OpeningTechnology => ({ id, name, requires, costs, eligibility: costs, seconds });

/** Provisional playtest balance. Research unlocks a capability, never free equipment. */
export const FIRST_FACTORY_TECHNOLOGIES: readonly OpeningTechnology[] = [
  technology(
    'electrical-engineering',
    'Electrical engineering',
    ['mechanical-assembly', 'electrical-assembly'],
    [stack('mechanical-part', 2), stack('electrical-part', 2)],
    30,
  ),
  technology(
    'solar-power',
    'Solar power',
    ['electrical-engineering'],
    [stack('plate', 6), stack('wire', 4), stack('electrical-part', 2)],
    40,
  ),
  technology(
    'wind-power',
    'Wind power',
    ['electrical-engineering'],
    [stack('plate', 6), stack('mechanical-part', 3), stack('electrical-part', 1)],
    40,
  ),
  technology(
    'mixed-recycling',
    'Mixed recycling',
    ['mechanical-assembly', 'electrical-assembly'],
    [stack('plate', 6), stack('mechanical-part', 3), stack('electrical-part', 2)],
    45,
  ),
  technology(
    'basic-fabrication',
    'Basic fabrication',
    ['mechanical-assembly'],
    [stack('plate', 4), stack('mechanical-part', 2)],
    25,
  ),
  technology(
    'medium-fabrication',
    'Medium fabrication',
    ['basic-fabrication', 'electrical-assembly'],
    [stack('mechanical-part', 2), stack('electrical-part', 2)],
    35,
  ),
  technology(
    'extraction',
    'Extraction',
    ['mechanical-assembly'],
    [stack('plate', 4), stack('mechanical-part', 3)],
    35,
  ),
  technology(
    'laboratory-research',
    'Laboratory research',
    ['medium-fabrication', 'electrical-assembly'],
    [stack('mechanical-part', 2), stack('electrical-part', 3)],
    45,
  ),
  technology(
    'sorting-logistics',
    'Sorting and conveyors',
    ['mixed-recycling', 'mechanical-assembly', 'laboratory-research'],
    [stack('research-kit', 4)],
    60,
  ),
];

export const RESEARCH_KIT_RECIPE: OpeningRecipe = {
  id: 'basic-research-kit',
  name: 'Basic research kit',
  technology: 'laboratory-research',
  inputs: [stack('mechanical-part', 1), stack('electrical-part', 1)],
  outputs: [stack('research-kit', 1)],
  seconds: 8,
  handcraft: true,
  minifab: true,
};

export interface EquipmentBlueprint {
  readonly id: string;
  readonly name: string;
  readonly technology: string;
  readonly inputs: readonly ItemStack[];
}

/** Reachability/cost definitions only. Placement, equipment jobs and power arrive in M6. */
export const EQUIPMENT_BLUEPRINTS: readonly EquipmentBlueprint[] = [
  {
    id: 'power-connection',
    name: 'Power connection',
    technology: 'electrical-engineering',
    inputs: [stack('plate', 1), stack('wire', 2)],
  },
  {
    id: 'solar-panel',
    name: 'Solar panel',
    technology: 'solar-power',
    inputs: [stack('plate', 4), stack('wire', 2), stack('electrical-part', 2)],
  },
  {
    id: 'wind-turbine',
    name: 'Wind turbine',
    technology: 'wind-power',
    inputs: [stack('plate', 4), stack('mechanical-part', 3), stack('electrical-part', 1)],
  },
  {
    id: 'recycler',
    name: 'Mixed-output recycler',
    technology: 'mixed-recycling',
    inputs: [stack('plate', 6), stack('mechanical-part', 3), stack('electrical-part', 2)],
  },
  {
    id: 'basic-fabricator',
    name: 'Basic Fabricator',
    technology: 'basic-fabrication',
    inputs: [stack('plate', 4), stack('mechanical-part', 2)],
  },
  {
    id: 'medium-fabricator',
    name: 'Medium Fabricator',
    technology: 'medium-fabrication',
    inputs: [stack('plate', 4), stack('mechanical-part', 2), stack('electrical-part', 2)],
  },
  {
    id: 'extractor',
    name: 'Extractor',
    technology: 'extraction',
    inputs: [stack('plate', 4), stack('mechanical-part', 3), stack('electrical-part', 1)],
  },
  {
    id: 'laboratory',
    name: 'Laboratory',
    technology: 'laboratory-research',
    inputs: [
      stack('plate', 4),
      stack('wire', 2),
      stack('mechanical-part', 2),
      stack('electrical-part', 3),
    ],
  },
];

/** Each lab is supplied locally; no remote inventory or physical lab is implemented here. */
export const RESEARCH_LAB_RULES = Object.freeze({ inputSlots: 4, rate: 4 });

/** Unpriced branches are descriptions, never executable zero-cost technologies. */
export const RESEARCH_ROADMAP = [
  {
    id: 'advanced-fabrication',
    name: 'Advanced fabrication',
    requires: ['medium-fabrication', 'laboratory-research'],
    note: 'Later slice: exactly three or four distinct inputs; lower tiers retain their roles.',
  },
  {
    id: 'storage',
    name: 'Energy storage',
    requires: ['electrical-engineering'],
    note: 'Later storage and renewable variability; costs are undecided.',
  },
  {
    id: 'water-treatment',
    name: 'Water treatment',
    requires: ['laboratory-research', 'mixed-recycling'],
    note: 'Later specialist liquid processing; costs are undecided.',
  },
  {
    id: 'greenhouse',
    name: 'Greenhouse restoration',
    requires: ['water-treatment', 'storage'],
    note: 'Later peaceful restoration on a coal-free path; costs are undecided.',
  },
  {
    id: 'coal-power',
    name: 'Coal power — optional',
    requires: ['electrical-engineering'],
    note: 'Optional high output with emissions; never required for green progression.',
  },
  {
    id: 'pollution-mitigation',
    name: 'Pollution mitigation — optional',
    requires: ['coal-power', 'water-treatment'],
    note: 'Later optional mitigation; never gates green technology.',
  },
  {
    id: 'minifab-upgrades',
    name: 'MiniFab upgrades',
    requires: ['mini-fabrication'],
    note: 'Later separate research and crafted modules: gearing, capacity, buffers, hazards/liquids, onboard power/grid and autonomous input/output min/max controls.',
  },
] as const;

export type FabricationTier = 'basic' | 'medium' | 'advanced';

export function supportsFabrication(inputs: readonly ItemStack[], tier: FabricationTier): boolean {
  const arity = new Set(inputs.map((input) => input.item)).size;
  return tier === 'basic'
    ? arity === 1
    : tier === 'medium'
      ? arity === 2
      : arity === 3 || arity === 4;
}

/** Factory selection fixture contract; deterministic personal scrap recovery stays separate. */
export function canFabricate(
  recipe: OpeningRecipe,
  tier: FabricationTier,
  unlocked: readonly string[],
): boolean {
  return (
    unlocked.includes(recipe.technology) &&
    recipe.outputs.length > 0 &&
    !['metal-plate', 'recovered-wire'].includes(recipe.id) &&
    supportsFabrication(recipe.inputs, tier)
  );
}
