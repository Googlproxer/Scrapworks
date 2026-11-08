import type { MiniFabStatus } from './session-event';
import type { ItemStack } from './simulation';
import type { WorldPosition } from './world';

export interface CraftOperation {
  id: string;
  recipe: string;
  remaining: number;
}

export interface HandcraftJob extends CraftOperation {
  inputs: ItemStack[];
  unitsLeft: number;
}

/** Simulation-owned player components. Inventory and research ledgers have one owner. */
export interface OpeningData {
  salvage: { target: string; remaining: number } | null;
  handcraft: HandcraftJob | null;
  handcraftVisible: boolean;
  handcraftSuspended: boolean;
  researchQueue: string[];
  fieldEnabled: boolean;
  moved: boolean;
  minifab: {
    owned: boolean;
    request: { recipe: string; left: number } | null;
    job: CraftOperation | null;
    input: ItemStack[];
    output: ItemStack[];
    outputRecipe: string | null;
    charge: number;
    capacityLevel: number;
    gearing: number;
    windBudget: number;
    status: MiniFabStatus;
  };
}

export interface GroundItemView {
  readonly id: string;
  /** Drop location in metres, including elevation; fixed until collected. */
  readonly position: WorldPosition;
  readonly item: string;
  readonly quantity: number;
}

/** Small detached player projection; never serializes the ECS population. */
export interface OpeningView {
  readonly state: {
    readonly salvage: { readonly target: string; readonly remaining: number } | null;
    readonly handcraft:
      | (CraftOperationView & {
          readonly inputs: readonly ItemStackView[];
          readonly unitsLeft: number;
        })
      | null;
    readonly handcraftVisible: boolean;
    readonly handcraftSuspended: boolean;
    readonly researchQueue: readonly string[];
    readonly fieldEnabled: boolean;
    readonly moved: boolean;
    readonly minifab: {
      readonly owned: boolean;
      readonly request: { readonly recipe: string; readonly left: number } | null;
      readonly job: CraftOperationView | null;
      readonly input: readonly ItemStackView[];
      readonly output: readonly ItemStackView[];
      readonly outputRecipe: string | null;
      readonly charge: number;
      readonly capacityLevel: number;
      readonly gearing: number;
      readonly windBudget: number;
      readonly status: MiniFabStatus;
    };
  };
  readonly bag: { readonly slots: readonly (ItemStackView | null)[] };
  readonly tool: string | null;
  readonly ledgers: Readonly<
    Record<
      string,
      {
        readonly consumed: Readonly<Record<string, number>>;
        readonly work: number;
        readonly unlocked: boolean;
      }
    >
  >;
  readonly extracted: Readonly<Record<string, number>>;
}

interface ItemStackView {
  readonly item: string;
  readonly quantity: number;
}

interface CraftOperationView {
  readonly id: string;
  readonly recipe: string;
  readonly remaining: number;
}

export type OpeningCommand =
  | { type: 'salvage'; target: string | null }
  | { type: 'pickup'; target: string }
  | { type: 'equip'; item: string | null }
  | { type: 'research'; enabled: boolean }
  | { type: 'research-queue'; action: 'add' | 'remove'; technology: string }
  | { type: 'research-queue'; action: 'move'; technology: string; index: number }
  | { type: 'handcraft-ui'; visible: boolean; suspended?: boolean }
  | { type: 'craft'; recipe: string; quantity: number }
  | { type: 'minifab'; recipe: string | null; quantity: number }
  | { type: 'wind'; degrees: number }
  | { type: 'dismantle'; item: string };

export type OpeningRejection =
  'invalid-request' | 'locked' | 'missing-input' | 'capacity' | 'busy' | 'depleted';
