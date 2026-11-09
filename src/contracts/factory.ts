import type { InventoryData, ItemStack } from './simulation';
import type { GridCell, QuarterTurn } from './world';
import type {
  TransportCommand,
  TransportKind,
  TransportResources,
  TransportSummary,
} from './transport';

export type EquipmentId =
  | 'power-connection'
  | 'solar-panel'
  | 'wind-turbine'
  | 'recycler'
  | 'basic-fabricator'
  | 'medium-fabricator'
  | 'extractor'
  | 'laboratory'
  | TransportKind;

export type PlaceableKind = Exclude<EquipmentId, 'power-connection'>;

export type MachineKind = Exclude<EquipmentId, 'power-connection' | TransportKind>;

export interface FactoryJob {
  recipe: string;
  remaining: number;
  inputs: ItemStack[];
  outputs: ItemStack[];
  /** Completed manufactured output is owned by this bounded pending buffer and credited once. */
  outputCommitted: boolean;
}

export interface MachineData {
  enabled: boolean;
  recipe: string | null;
  deposit: string | null;
  input: InventoryData;
  output: InventoryData;
  job: FactoryJob | null;
  random: { state: number; sequence: number[]; cursor: number };
  requested: number;
  allocated: number;
  status: 'idle' | 'disabled' | 'missing-input' | 'no-power' | 'working' | 'blocked' | 'depleted';
}

export interface PowerConnection {
  id: string;
  from: string;
  to: string;
}

export interface FactoryResources {
  connections: PowerConnection[];
  transport?: TransportResources;
}

export interface FactorySummary {
  readonly transport?: TransportSummary;
  readonly daylight: number;
  readonly wind: number;
  readonly available: number;
  readonly requested: number;
  readonly used: number;
  readonly curtailed: number;
  readonly connections: readonly Readonly<PowerConnection>[];
}

export type FactoryCommand =
  | TransportCommand
  | { type: 'factory-place-active'; cell: GridCell; rotation: QuarterTurn }
  | { type: 'factory-place'; equipment: PlaceableKind; cell: GridCell; rotation: QuarterTurn }
  | { type: 'factory-configure'; target: string; enabled: boolean; recipe: string | null }
  | { type: 'factory-collect-output'; target: string }
  | {
      type: 'factory-transfer';
      target: string;
      buffer: 'input' | 'output';
      direction: 'load' | 'unload';
      item: string;
      quantity: number;
    }
  | { type: 'factory-connect'; from: string; to: string }
  | { type: 'factory-connect-active'; from: string; to: string }
  | { type: 'factory-disconnect'; connection: string }
  | { type: 'factory-dismantle'; target: string };

export function isFactoryCommand(command: { readonly type: string }): command is FactoryCommand {
  return command.type.startsWith('factory-') || command.type.startsWith('transport-');
}
