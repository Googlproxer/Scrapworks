import type {
  BuildingView,
  CommandResult,
  WorldCommand,
  WorldDefinition,
  WorldPosition,
} from './world';

export type EntityKind = 'player' | 'deposit' | 'pile' | 'building' | 'owner' | 'processor';
export interface ItemStack {
  item: string;
  quantity: number;
}
export interface Reservation {
  id: string;
  owner: string;
  items: ItemStack[];
}
export interface InventoryData {
  slots: (ItemStack | null)[];
  reservations: Reservation[];
}
export interface WorkData {
  recipe: string;
  status: 'active' | 'idle' | 'blocked';
  remaining: number;
  duration: number;
  completed: number;
  input: InventoryData;
  output: InventoryData;
  reserved: ItemStack[];
  held: ItemStack[];
}
export interface TransformData {
  position: WorldPosition;
  facing: number;
  moving: boolean;
  sprinting: boolean;
}
/** Plain owned components. ECS handles and transport slots are deliberately absent. */
export interface EntityData {
  id: string;
  kind: EntityKind;
  transform?: TransformData;
  inventory?: InventoryData;
  equipment?: { tool: string | null };
  deposit?: { kind: 'scrap'; quantity: number };
  pile?: ItemStack;
  building?: BuildingView;
  owner?: string;
  work?: WorkData;
  charge?: { value: number; capacity: number };
}
export interface WorldResources {
  worldId: string;
  playerId: string;
  tick: number;
  stepSeconds: number;
  nextEntityId: number;
  research: Record<string, { consumed: Record<string, number>; work: number; unlocked: boolean }>;
  productionTotals: Record<string, number>;
  extractionTotals: Record<string, number>;
  counters: Record<string, number>;
}
export interface ContentDefinition {
  version: string;
  items: Readonly<Record<string, { stackLimit: number; solidValue: number }>>;
  recipes: Readonly<
    Record<string, { inputs: readonly ItemStack[]; outputs: readonly ItemStack[]; seconds: number }>
  >;
  technologies: readonly string[];
}
export interface SimulationSnapshot {
  version: 1;
  contentVersion: string;
  definition: WorldDefinition;
  resources: WorldResources;
  entities: EntityData[];
  lastCommandResult: CommandResult | null;
}
export interface EntityMapping {
  id: string;
  slot: number;
  generation: number;
  kind: EntityKind;
  building?: BuildingView;
  deposit?: { kind: 'scrap'; footprint: { width: number; depth: number }; rotation: 0 | 1 | 2 | 3 };
}
export interface Inspection {
  id: string;
  tick: number;
  entity: EntityData;
}
export interface PlayerEndpoint {
  tick: number;
  transform: TransformData;
}
export interface PresentationPacket {
  schema: 1;
  version: number;
  base: number;
  full: boolean;
  tick: number;
  nextEntityId: number;
  worldId: string;
  playerId: string;
  mappings: EntityMapping[];
  rows: ArrayBuffer;
  removed: ArrayBuffer;
  details: Inspection[];
  endpoints: PlayerEndpoint[];
  lastCommandResult: CommandResult | null;
  research: string[];
  productionTotals: Record<string, number>;
}
export interface SequencedCommand {
  sequence: number;
  command: WorldCommand;
}
export interface CommandAcknowledgement {
  sequence: number;
  tick: number;
  result: CommandResult | 'cancelled';
}
export interface CommandLedger {
  accepted: number;
  applied: number;
  cancelled: number;
  lastApplied: number;
}
/** Continuation envelope is separate from world data and is not a gameplay-save schema. */
export interface SimulationCapture {
  world: SimulationSnapshot;
  ledger: CommandLedger;
  pending: SequencedCommand[];
}
export interface SimulationInput {
  x: number;
  z: number;
  sprint: boolean;
}
export interface RuntimeRequest {
  protocol: 1;
  id: number;
  generation: number;
  revision: number;
  operation:
    'initialize' | 'advance' | 'activity' | 'watch' | 'inspect' | 'capture' | 'resync' | 'dispose';
  definition?: WorldDefinition;
  developerFixture?: boolean;
  capture?: SimulationCapture;
  steps?: number;
  active?: boolean;
  input?: SimulationInput;
  inputSequence?: number;
  commands?: SequencedCommand[];
  watch?: string[];
}
export interface RuntimeReply {
  protocol: 1;
  id: number;
  generation: number;
  revision: number;
  ok: boolean;
  error?: string;
  packet?: PresentationPacket;
  details?: Inspection[];
  watch?: string[];
  capture?: SimulationCapture;
  completedTicks: number[];
  acknowledgements: CommandAcknowledgement[];
  ledger: CommandLedger;
  appliedInput: number;
}
export const PRESENTATION_STRIDE = 14;
export const MAX_DETAIL_SUBSCRIPTIONS = 16;
export const MAX_PENDING_COMMANDS = 256;
export function requireInvariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
