import type { EquipmentId, MachineKind } from '../contracts/factory';
import type { OpeningRecipe } from './opening';
import { EQUIPMENT_BLUEPRINTS } from './first-factory';
import { isTransportKind } from './transport';

/** Provisional playtest values, using metres, watts, joules and simulation seconds. */
export const FACTORY_SETTINGS = Object.freeze({
  cableReach: 12,
  daySeconds: 240,
  initialDaySeconds: 60,
  solarWatts: 600,
  windFloorWatts: 250,
  windVariableWatts: 250,
  recyclerSeconds: 8,
  recyclerInput: 8,
  recyclerWindow: 3,
  extractionSeconds: 2,
  extractionQuantity: 4,
});

export const MACHINE_FOOTPRINT = Object.freeze({ width: 1, depth: 1 });

export const MACHINE_COLLISION = Object.freeze({
  shape: 'box' as const,
  width: 1.2,
  depth: 1.2,
  height: 1.5,
});

export const MACHINES: Readonly<
  Record<
    MachineKind,
    {
      readonly watts: number;
      readonly inputSlots: number;
      readonly outputSlots: number;
    }
  >
> = Object.freeze({
  'solar-panel': { watts: 0, inputSlots: 0, outputSlots: 0 },
  'wind-turbine': { watts: 0, inputSlots: 0, outputSlots: 0 },
  recycler: { watts: 120, inputSlots: 2, outputSlots: 6 },
  'basic-fabricator': { watts: 80, inputSlots: 4, outputSlots: 4 },
  'medium-fabricator': { watts: 100, inputSlots: 4, outputSlots: 4 },
  extractor: { watts: 120, inputSlots: 0, outputSlots: 4 },
  laboratory: { watts: 100, inputSlots: 4, outputSlots: 0 },
});

export const isMachineKind = (id: unknown): id is MachineKind =>
  typeof id === 'string' && Object.hasOwn(MACHINES, id);

export const isPlaceable = (id: unknown): id is EquipmentId =>
  id === 'power-connection' || isMachineKind(id) || isTransportKind(id);

const values: Readonly<Record<string, number>> = {
  plate: 2,
  wire: 1,
  'mechanical-part': 4,
  'electrical-part': 4,
};

export const EQUIPMENT_ITEMS = Object.fromEntries(
  EQUIPMENT_BLUEPRINTS.map((b) => [
    b.id,
    {
      stackLimit: b.id === 'power-connection' || b.id === 'conveyor' ? 20 : 5,
      solidValue: b.inputs.reduce((sum, s) => sum + values[s.item] * s.quantity, 0),
    },
  ]),
);

export const EQUIPMENT_RECIPES: readonly OpeningRecipe[] = EQUIPMENT_BLUEPRINTS.map((b) => ({
  id: `assemble-${b.id}`,
  name: b.name,
  technology: b.technology,
  inputs: b.inputs,
  outputs: [{ item: b.id, quantity: 1 }],
  seconds: b.id === 'power-connection' ? 3 : b.id === 'conveyor' ? 4 : 12,
  handcraft: true,
  minifab: true,
}));

/** A shuffled five-result bag has at most two consecutive missing-type outcomes across bags. */
export const RECYCLER_OUTCOMES = [
  [
    { item: 'plate', quantity: 3 },
    { item: 'wire', quantity: 1 },
    { item: 'scrap', quantity: 1 },
  ],
  [
    { item: 'plate', quantity: 1 },
    { item: 'wire', quantity: 4 },
    { item: 'scrap', quantity: 2 },
  ],
  [
    { item: 'plate', quantity: 2 },
    { item: 'wire', quantity: 3 },
    { item: 'scrap', quantity: 1 },
  ],
  [
    { item: 'wire', quantity: 6 },
    { item: 'scrap', quantity: 2 },
  ],
  [
    { item: 'plate', quantity: 3 },
    { item: 'scrap', quantity: 2 },
  ],
] as const;

export function renewableFactors(tick: number): { daylight: number; wind: number } {
  const seconds = tick * 0.05 + FACTORY_SETTINGS.initialDaySeconds;
  return {
    daylight: Math.max(0, Math.sin((2 * Math.PI * seconds) / FACTORY_SETTINGS.daySeconds)),
    wind: 0.5 + 0.5 * Math.sin(seconds / 19) * Math.sin(seconds / 31),
  };
}
