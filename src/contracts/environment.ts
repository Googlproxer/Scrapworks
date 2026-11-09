import type { MaterialPort } from './transport';

export type UtilityKind =
  | 'water-pump'
  | 'pipe'
  | 'pipe-junction'
  | 'water-treatment'
  | 'water-tank'
  | 'water-return'
  | 'greenhouse'
  | 'battery'
  | 'coal-generator'
  | 'air-scrubber';

export type CardinalDirection = 'north' | 'east' | 'south' | 'west';
export type WeatherKind = 'clear' | 'rain' | 'dunkelflaute';

/** Litres retain their extraction source and quality through every split and merge. */
export interface WaterBatch {
  source: string;
  volume: number;
  quality: number;
}

export interface WaterSource {
  id: string;
  cells: number[];
  volume: number;
  extracted: number;
  consumed: number;
  returned: number;
  refilled: number;
  transferredIn: number;
  transferredOut: number;
}

export interface UtilityData {
  water: WaterBatch[];
  clean: WaterBatch[];
  source: string | null;
  overflow: CardinalDirection | null;
  charge: number;
  fuelEnergy: number;
  phase: 'off' | 'starting' | 'running' | 'stopping';
  transition: number;
  hold: number;
  positive: number;
  negative: number;
  generated: number;
}

export interface FluidConnection {
  id: string;
  from: string;
  output: MaterialPort;
  to: string;
  input: MaterialPort;
}

export interface WeatherState {
  random: number;
  kind: WeatherKind;
  endTick: number;
  nextKind: Exclude<WeatherKind, 'clear'>;
  nextTick: number;
  nextDuration: number;
}

export interface EnvironmentResources {
  health: number[];
  sources: WaterSource[];
  weather: WeatherState;
  connections: FluidConnection[];
  nextUpdate: number;
  completed: boolean;
  completedTick: number | null;
}

export interface EnvironmentSummary {
  readonly columns: number;
  readonly health: readonly number[];
  readonly sources: readonly Readonly<WaterSource>[];
  readonly connections: readonly Readonly<FluidConnection>[];
  readonly weather: Readonly<WeatherState>;
  readonly average: number;
  readonly restored: number;
  readonly completed: boolean;
  readonly storedEnergy: number;
  readonly storageCapacity: number;
  readonly renewableAvailable: number;
  readonly renewableUsed: number;
  readonly coalUsed: number;
  readonly batteryRate: number;
  readonly forecastRenewable: number;
  readonly pollutionRate: number;
  readonly restorationRate: number;
}

export type FluidCommand =
  | { type: 'fluid-connect'; from: string; output: MaterialPort; to: string; input: MaterialPort }
  | { type: 'fluid-disconnect'; connection: string }
  | { type: 'fluid-overflow'; target: string; direction: CardinalDirection | null };
