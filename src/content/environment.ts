import type { UtilityKind } from '../contracts/environment';
import type { EquipmentBlueprint } from './first-factory';
import type { OpeningTechnology } from './opening';
import type { MaterialPort } from '../contracts/transport';
import { MATERIAL_PORTS } from './transport';

export function fluidPorts(kind: string): {
  input: readonly MaterialPort[];
  output: readonly MaterialPort[];
} {
  if (kind === 'water-pump') return { input: [], output: ['back', 'left', 'right'] };
  if (kind === 'water-return') return { input: ['back', 'left', 'right'], output: [] };
  if (kind === 'water-treatment') return { input: ['back', 'left', 'right'], output: ['front'] };
  if (kind === 'greenhouse' || kind === 'coal-generator')
    return { input: MATERIAL_PORTS, output: [] };
  if (kind === 'pipe' || kind === 'pipe-junction' || kind === 'water-tank')
    return { input: MATERIAL_PORTS, output: MATERIAL_PORTS };
  return { input: [], output: [] };
}

/** Provisional M8 balance: metres, seconds, litres, watts, joules and health percentage points. */
export const ENVIRONMENT_SETTINGS = Object.freeze({
  cadenceTicks: 20,
  sourceLitresPerCell: 1000,
  refillPerCell: 0.01,
  rainRefillPerCell: 1,
  pumpRate: 6,
  pipeRate: 8,
  treatmentRate: 4,
  returnRate: 4,
  greenhouseWater: 0.2,
  greenhouseInfluence: 40,
  scrubberInfluence: 24,
  returnInfluence: 4,
  coalWatts: 12000,
  coalJoules: 500000,
  coalWaterPerJoule: 0.0002,
  coalPollutionPerJoule: 0.0006,
  coalStartSeconds: 12,
  coalStopSeconds: 8,
  coalHoldSeconds: 10,
  forecastSeconds: 60,
  forecastLeadTicks: 600,
  batteryJoules: 120000,
  batteryWatts: 1200,
  batteryEfficiency: 0.95,
});

export const UTILITIES: Readonly<Record<UtilityKind, { watts: number; litres: number }>> = {
  'water-pump': { watts: 60, litres: 12 },
  pipe: { watts: 0, litres: 12 },
  'pipe-junction': { watts: 0, litres: 12 },
  'water-treatment': { watts: 160, litres: 24 },
  'water-tank': { watts: 0, litres: 200 },
  'water-return': { watts: 0, litres: 12 },
  greenhouse: { watts: 180, litres: 12 },
  battery: { watts: 0, litres: 0 },
  'coal-generator': { watts: 0, litres: 24 },
  'air-scrubber': { watts: 120, litres: 0 },
};

export const isUtilityKind = (id: unknown): id is UtilityKind =>
  typeof id === 'string' && Object.hasOwn(UTILITIES, id);

export const isPipe = (id: unknown): boolean => id === 'pipe' || id === 'pipe-junction';

const part = (item: string, quantity: number) => ({ item, quantity });

export const ENVIRONMENT_BLUEPRINTS: readonly EquipmentBlueprint[] = [
  {
    id: 'water-pump',
    name: 'Water pump',
    technology: 'water-treatment',
    inputs: [part('plate', 4), part('mechanical-part', 2), part('electrical-part', 1)],
  },
  { id: 'pipe', name: 'Pipe', technology: 'water-treatment', inputs: [part('plate', 1)] },
  {
    id: 'pipe-junction',
    name: 'Pipe junction',
    technology: 'water-treatment',
    inputs: [part('plate', 2), part('mechanical-part', 1)],
  },
  {
    id: 'water-treatment',
    name: 'Water treatment',
    technology: 'water-treatment',
    inputs: [part('plate', 6), part('mechanical-part', 2), part('electrical-part', 2)],
  },
  {
    id: 'water-tank',
    name: 'Water tank',
    technology: 'water-treatment',
    inputs: [part('plate', 6)],
  },
  {
    id: 'water-return',
    name: 'Water return',
    technology: 'water-treatment',
    inputs: [part('plate', 2), part('mechanical-part', 1)],
  },
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    technology: 'greenhouse',
    inputs: [part('plate', 8), part('mechanical-part', 3), part('electrical-part', 3)],
  },
  {
    id: 'battery',
    name: 'Grid battery',
    technology: 'storage',
    inputs: [part('plate', 4), part('wire', 4), part('electrical-part', 3)],
  },
  {
    id: 'coal-generator',
    name: 'Coal generator',
    technology: 'coal-power',
    inputs: [part('plate', 10), part('mechanical-part', 4), part('electrical-part', 3)],
  },
  {
    id: 'air-scrubber',
    name: 'Air scrubber',
    technology: 'pollution-mitigation',
    inputs: [part('plate', 6), part('mechanical-part', 2), part('electrical-part', 3)],
  },
];

const tech = (
  id: string,
  name: string,
  requires: string[],
  kits: number,
  seconds: number,
): OpeningTechnology => ({
  id,
  name,
  requires,
  costs: [part('research-kit', kits)],
  eligibility: [part('research-kit', kits)],
  seconds,
});

export const ENVIRONMENT_TECHNOLOGIES: readonly OpeningTechnology[] = [
  tech('storage', 'Energy storage', ['electrical-engineering', 'laboratory-research'], 4, 50),
  tech('water-treatment', 'Water treatment', ['laboratory-research', 'mixed-recycling'], 6, 60),
  tech('greenhouse', 'Greenhouse restoration', ['water-treatment', 'storage'], 8, 80),
  tech(
    'coal-power',
    'Coal power — optional',
    ['electrical-engineering', 'laboratory-research'],
    4,
    50,
  ),
  tech(
    'pollution-mitigation',
    'Pollution mitigation — optional',
    ['coal-power', 'water-treatment'],
    6,
    60,
  ),
];
