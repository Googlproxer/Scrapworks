import type {
  BuildingView,
  CommandResult,
  DepositDefinition,
  WorldCommand,
  WorldDefinition,
} from './world';
import type { OpeningData, OpeningView } from './opening';
import type { OpeningEvent, RuntimeEvent } from './session-event';
import type { ReadonlyData, EditableData } from './readonly-data';
import type { PhysicsBodyDefinition, PhysicsSnapshot, WorldRotation } from './physics';
import type { FactoryResources, FactorySummary, MachineData } from './factory';

export type EntityKind = 'player' | 'deposit' | 'pile' | 'building' | 'body';

export interface ItemStack {
  item: string;
  quantity: number;
}

export interface InventoryData {
  slots: (ItemStack | null)[];
}

export interface TransformData {
  position: { x: number; y: number; z: number };
  facing: number;
  moving: boolean;
  sprinting: boolean;
  rotation?: EditableData<WorldRotation>;
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
  building?: EditableData<BuildingView>;
  opening?: OpeningData;
  physics?: EditableData<PhysicsBodyDefinition>;
  machine?: MachineData;
}

export interface WorldResources {
  factory?: FactoryResources;
  worldId: string;
  playerId: string;
  tick: number;
  stepSeconds: number;
  nextEntityId: number;
  research: Record<string, { consumed: Record<string, number>; work: number; unlocked: boolean }>;
  productionTotals: Record<string, number>;
  extractionTotals: Record<string, number>;
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
  version: 3;
  contentVersion: string;
  definition: EditableData<WorldDefinition>;
  resources: WorldResources;
  entities: EntityData[];
  physics: PhysicsSnapshot;
}

export interface EntityMapping {
  id: string;
  slot: number;
  generation: number;
  kind: EntityKind;
  pile?: { item: string };
  building?: BuildingView;
  deposit?: Pick<DepositDefinition, 'kind' | 'footprint' | 'rotation' | 'collision'>;
  physics?: PhysicsBodyDefinition;
}

export interface Inspection {
  readonly id: string;
  readonly tick: number;
  readonly entity: ReadonlyData<EntityData>;
}

export interface PlayerEndpoint {
  tick: number;
  transform: TransformData;
}

export interface PresentationPacket {
  schema: 2;
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
  research: string[];
  productionTotals: Record<string, number>;
  opening?: OpeningView;
  factory?: FactorySummary;
  /** Slot/generation/quaternion for changed physics bodies only. Base entity rows stay lean. */
  rotations?: ArrayBuffer;
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

export interface SimulationStepResult {
  readonly commandResults: readonly CommandResult[];
  readonly events: readonly OpeningEvent[];
}

interface Envelope {
  protocol: 2;
  id: number;
  generation: number;
  revision: number;
}

type RequestData =
  | {
      operation: 'initialize';
      definition: WorldDefinition;
      developerFixture?: boolean;
      capture?: SimulationCapture;
      playerSave?: boolean;
    }
  | {
      operation: 'advance';
      steps: number;
      input?: SimulationInput;
      inputSequence?: number;
      commands?: SequencedCommand[];
    }
  | {
      operation: 'activity';
      active: boolean;
      commands?: SequencedCommand[];
      preserveWork?: boolean;
    }
  | { operation: 'watch' | 'inspect'; watch: string[] }
  | { operation: 'capture' | 'resync' | 'dispose' };

type CompleteFields<T, K extends PropertyKey> = T extends unknown
  ? T & Partial<Record<Exclude<K, keyof T>, never>>
  : never;

export type RuntimeRequestBody = CompleteFields<
  RequestData,
  | 'definition'
  | 'developerFixture'
  | 'capture'
  | 'playerSave'
  | 'preserveWork'
  | 'steps'
  | 'active'
  | 'input'
  | 'inputSequence'
  | 'commands'
  | 'watch'
>;

export type RuntimeRequest = Envelope & RuntimeRequestBody;

type ReplyData =
  | { operation: 'initialize' | 'resync'; packet: PresentationPacket }
  | { operation: 'advance' | 'activity'; packet?: PresentationPacket }
  | { operation: 'watch'; watch: string[]; details: Inspection[] }
  | { operation: 'inspect'; details: Inspection[] }
  | { operation: 'capture'; capture: SimulationCapture }
  | { operation: 'dispose' };

type ResultData =
  ({ ok: true } & ReplyData) | { ok: false; operation: RuntimeRequest['operation']; error: string };

export type RuntimeReply = Envelope & {
  completedTicks: number[];
  acknowledgements: CommandAcknowledgement[];
  events: RuntimeEvent[];
  ledger: CommandLedger;
  appliedInput: number;
} & CompleteFields<ResultData, 'packet' | 'watch' | 'details' | 'capture' | 'error'>;

export const PRESENTATION_STRIDE = 8;

export const ROTATION_STRIDE = 6;

export const MAX_DETAIL_SUBSCRIPTIONS = 16;

export const MAX_PENDING_COMMANDS = 256;

export const MAX_PENDING_SESSION_EVENTS = 4096;

export function requireInvariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Validate the worker boundary before its payload can mutate the presentation cache. */
export function assertRuntimeReply(value: unknown): asserts value is RuntimeReply {
  const check: typeof requireInvariant = requireInvariant;
  check(!!value && typeof value === 'object', 'Invalid session reply');
  const reply = value as Partial<RuntimeReply>;
  check(
    reply.protocol === 2 &&
      Number.isSafeInteger(reply.id) &&
      Number.isSafeInteger(reply.generation) &&
      Number.isSafeInteger(reply.revision) &&
      typeof reply.ok === 'boolean',
    'Invalid reply envelope',
  );
  check(
    Array.isArray(reply.completedTicks) &&
      reply.completedTicks.every((tick) => Number.isSafeInteger(tick) && tick >= 0),
    'Invalid completed ticks',
  );
  check(
    Array.isArray(reply.acknowledgements) &&
      reply.acknowledgements.every(
        (ack) =>
          ack &&
          Number.isSafeInteger(ack.sequence) &&
          Number.isSafeInteger(ack.tick) &&
          (ack.result === 'cancelled' || (ack.result && typeof ack.result.accepted === 'boolean')),
      ),
    'Invalid acknowledgements',
  );
  check(Array.isArray(reply.events), 'Missing session events');
  const kinds = [
    'command-result',
    'research-completed',
    'handcraft-ended',
    'salvage-attention',
    'materials-recovered',
    'minifab-status',
  ];
  check(
    reply.events.every(
      (event) =>
        event &&
        Number.isSafeInteger(event.id) &&
        Number.isSafeInteger(event.tick) &&
        event.event &&
        kinds.includes(event.event.kind),
    ),
    'Invalid domain events',
  );
  check(
    reply.ledger &&
      ['accepted', 'applied', 'cancelled', 'lastApplied'].every(
        (key) =>
          Number.isSafeInteger(reply.ledger![key as keyof CommandLedger]) &&
          reply.ledger![key as keyof CommandLedger] >= 0,
      ),
    'Invalid command ledger',
  );
  check(Number.isSafeInteger(reply.appliedInput), 'Invalid applied input');
  if (!reply.ok) {
    check(typeof reply.error === 'string', 'Missing reply error');
    return;
  }
  switch (reply.operation) {
    case 'initialize':
    case 'resync':
      check(!!reply.packet, 'Missing publication');
      break;
    case 'watch':
      check(Array.isArray(reply.watch) && Array.isArray(reply.details), 'Missing watched details');
      break;
    case 'inspect':
      check(Array.isArray(reply.details), 'Missing inspection');
      break;
    case 'capture':
      check(!!reply.capture, 'Missing capture');
      break;
    case 'advance':
    case 'activity':
    case 'dispose':
      break;
    default:
      check(false, 'Unknown reply operation');
  }
}
