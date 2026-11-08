import type { EquipmentId } from './factory';

export const TOOLBAR_SLOTS = 8;

/** Assignments reference bag stock; they never own or reserve another copy of an item. */
export interface ToolbarData {
  slots: (EquipmentId | null)[];
  active: number;
}

export function emptyToolbar(): ToolbarData {
  return { slots: Array<EquipmentId | null>(TOOLBAR_SLOTS).fill(null), active: 0 };
}
