import type { ItemStack, InventoryData, WorldResources } from './simulation';
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
  fieldTechnology: string | null;
  fieldEnabled: boolean;
  moved: boolean;
  message: string;
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
    status: string;
  };
}

export interface GroundItemView {
  id: string;
  position: WorldPosition;
  item: string;
  quantity: number;
}

/** Small detached player projection; never serializes the ECS population. */
export interface OpeningView {
  state: OpeningData;
  bag: InventoryData;
  tool: string | null;
  ledgers: WorldResources['research'];
  extracted: Readonly<Record<string, number>>;
}

export type OpeningCommand =
  | { type: 'salvage'; target: string | null }
  | { type: 'pickup'; target: string }
  | { type: 'equip'; item: string | null }
  | { type: 'research'; technology: string | null; enabled: boolean }
  | { type: 'handcraft-ui'; visible: boolean; suspended?: boolean }
  | { type: 'craft'; recipe: string; quantity: number }
  | { type: 'minifab'; recipe: string | null; quantity: number }
  | { type: 'wind'; degrees: number }
  | { type: 'dismantle'; item: string };

export type OpeningRejection =
  'invalid-request' | 'locked' | 'missing-input' | 'capacity' | 'busy' | 'depleted';
