import type { ContentDefinition, InventoryData, ItemStack } from '@contracts/simulation';
import { requireInvariant as check } from '@contracts/simulation';

export const emptyInventory = (capacity = 24): InventoryData => ({
  slots: Array.from({ length: capacity }, () => null),
});

export function quantity(inventory: InventoryData, item: string): number {
  return inventory.slots.reduce((n, slot) => n + (slot?.item === item ? slot.quantity : 0), 0);
}

export function available(inventory: InventoryData, item: string): number {
  return quantity(inventory, item);
}

function totals(items: readonly ItemStack[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) {
    check(
      item.item.length > 0 && Number.isSafeInteger(item.quantity) && item.quantity > 0,
      'Invalid item quantity',
    );
    const next = (result.get(item.item) ?? 0) + item.quantity;
    check(Number.isSafeInteger(next), 'Item total overflow');
    result.set(item.item, next);
  }
  return result;
}

/** Preflight on detached slots; failure never partially spends or adds stock. */
export function planTransaction(
  inventory: InventoryData,
  remove: readonly ItemStack[],
  add: readonly ItemStack[],
  content: ContentDefinition,
): (ItemStack | null)[] | null {
  const spending = totals(remove);
  const receiving = totals(add);
  for (const [item, count] of spending)
    if (!Object.hasOwn(content.items, item) || available(inventory, item) < count) return null;
  const slots = inventory.slots.map((slot) => (slot ? { ...slot } : null));
  for (const [item, amount] of spending) {
    let left = amount;
    for (let i = 0; i < slots.length && left; i++) {
      const slot = slots[i];
      if (slot?.item !== item) continue;
      const take = Math.min(left, slot.quantity);
      left -= take;
      slot.quantity -= take;
      if (!slot.quantity) slots[i] = null;
    }
  }
  for (const [item, amount] of receiving) {
    const definition = content.items[item];
    if (!Object.hasOwn(content.items, item)) return null;
    let left = amount;
    for (const slot of slots)
      if (slot?.item === item) {
        const count = Math.min(left, definition.stackLimit - slot.quantity);
        slot.quantity += count;
        left -= count;
      }
    for (let i = 0; i < slots.length && left; i++)
      if (!slots[i]) {
        const count = Math.min(left, definition.stackLimit);
        slots[i] = { item, quantity: count };
        left -= count;
      }
    if (left) return null;
  }
  return slots;
}

export function transact(
  inventory: InventoryData,
  remove: readonly ItemStack[],
  add: readonly ItemStack[],
  content: ContentDefinition,
): boolean {
  const slots = planTransaction(inventory, remove, add, content);
  if (!slots) return false;
  inventory.slots = slots;
  return true;
}
