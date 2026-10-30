import type {
  ContentDefinition,
  InventoryData,
  ItemStack,
  Reservation,
} from '@contracts/simulation';
import { requireInvariant as check } from '@contracts/simulation';

export const emptyInventory = (capacity = 24): InventoryData => ({
  slots: Array.from({ length: capacity }, () => null),
  reservations: [],
});
export function quantity(inventory: InventoryData, item: string): number {
  return inventory.slots.reduce((n, slot) => n + (slot?.item === item ? slot.quantity : 0), 0);
}
export function available(inventory: InventoryData, item: string): number {
  return (
    quantity(inventory, item) -
    inventory.reservations.reduce(
      (n, r) => n + r.items.reduce((v, s) => v + (s.item === item ? s.quantity : 0), 0),
      0,
    )
  );
}
function canSpend(
  inventory: InventoryData,
  item: string,
  count: number,
  ignored?: Reservation,
): boolean {
  let needed = count;
  for (const reservation of inventory.reservations)
    if (reservation !== ignored)
      for (const stack of reservation.items) if (stack.item === item) needed += stack.quantity;
  for (const slot of inventory.slots)
    if (slot?.item === item) {
      needed -= slot.quantity;
      if (needed <= 0) return true;
    }
  return false;
}
function withdraw(inventory: InventoryData, item: string, count: number): void {
  for (let n = 0; n < inventory.slots.length && count; n++) {
    const slot = inventory.slots[n];
    if (slot?.item !== item) continue;
    const take = Math.min(count, slot.quantity);
    slot.quantity -= take;
    count -= take;
    if (!slot.quantity) inventory.slots[n] = null;
  }
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
export function transfer(
  source: InventoryData,
  destination: InventoryData,
  items: readonly ItemStack[],
  content: ContentDefinition,
): boolean {
  check(source !== destination, 'Transfer requires independent inventories');
  if (items.length === 1) {
    const { item, quantity: count } = items[0];
    check(item.length > 0 && Number.isSafeInteger(count) && count > 0, 'Invalid item quantity');
    if (!Object.hasOwn(content.items, item) || !canSpend(source, item, count)) return false;
    const limit = content.items[item].stackLimit;
    let capacity = 0;
    for (const slot of destination.slots) {
      capacity += slot === null ? limit : slot.item === item ? limit - slot.quantity : 0;
      if (capacity >= count) break;
    }
    if (capacity < count) return false;
    // Both sides have passed preflight. Mutate only the affected stacks.
    withdraw(source, item, count);
    let left = count;
    for (const slot of destination.slots)
      if (slot?.item === item) {
        const put = Math.min(left, limit - slot.quantity);
        slot.quantity += put;
        left -= put;
        if (!left) break;
      }
    for (let n = 0; n < destination.slots.length && left; n++)
      if (!destination.slots[n]) {
        const put = Math.min(left, limit);
        destination.slots[n] = { item, quantity: put };
        left -= put;
      }
    return true;
  }
  const from = planTransaction(source, items, [], content);
  const to = planTransaction(destination, [], items, content);
  if (!from || !to) return false;
  source.slots = from;
  destination.slots = to;
  return true;
}
export function reserve(inventory: InventoryData, reservation: Reservation): boolean {
  check(reservation.id.length > 0 && reservation.owner.length > 0, 'Invalid reservation identity');
  check(!inventory.reservations.some((r) => r.id === reservation.id), 'Duplicate reservation');
  if (reservation.items.length === 1) {
    const stack = reservation.items[0];
    check(
      stack.item.length > 0 && Number.isSafeInteger(stack.quantity) && stack.quantity > 0,
      'Invalid item quantity',
    );
    if (!canSpend(inventory, stack.item, stack.quantity)) return false;
  } else
    for (const [item, count] of totals(reservation.items))
      if (!canSpend(inventory, item, count)) return false;
  inventory.reservations.push({
    id: reservation.id,
    owner: reservation.owner,
    items: reservation.items.map((item) => ({ ...item })),
  });
  return true;
}
export function commitReservation(
  inventory: InventoryData,
  id: string,
  content: ContentDefinition,
): boolean {
  return commitReserved(inventory, id, content, false);
}
/** Atomically pay one operation and retain the same owned reservation for the
 * next operation. Failure pays nothing; callers explicitly choose repetition. */
export function commitReservationAndRenew(
  inventory: InventoryData,
  id: string,
  content: ContentDefinition,
): boolean {
  return commitReserved(inventory, id, content, true);
}
function commitReserved(
  inventory: InventoryData,
  id: string,
  content: ContentDefinition,
  renew: boolean,
): boolean {
  const reservation = inventory.reservations.find((r) => r.id === id);
  if (!reservation) return false;
  if (reservation.items.length === 1) {
    const stack = reservation.items[0];
    check(
      stack.item.length > 0 && Number.isSafeInteger(stack.quantity) && stack.quantity > 0,
      'Invalid item quantity',
    );
    if (
      !Object.hasOwn(content.items, stack.item) ||
      !Number.isSafeInteger(stack.quantity * (renew ? 2 : 1)) ||
      !canSpend(inventory, stack.item, stack.quantity * (renew ? 2 : 1), reservation)
    )
      return false;
    withdraw(inventory, stack.item, stack.quantity);
    if (!renew) inventory.reservations.splice(inventory.reservations.indexOf(reservation), 1);
    return true;
  }
  const spending = totals(reservation.items);
  // Preflight every item before mutating stock. A reservation already owns these
  // quantities; committing does not require copying unrelated inventory slots.
  for (const [item, count] of spending) {
    const otherHeld = inventory.reservations.reduce(
      (n, r) =>
        n +
        (r === reservation
          ? 0
          : r.items.reduce((sum, stack) => sum + (stack.item === item ? stack.quantity : 0), 0)),
      0,
    );
    if (
      !Object.hasOwn(content.items, item) ||
      !Number.isSafeInteger(count * (renew ? 2 : 1)) ||
      quantity(inventory, item) - otherHeld < count * (renew ? 2 : 1)
    )
      return false;
  }
  for (const [item, count] of spending) {
    let left = count;
    for (let n = 0; n < inventory.slots.length && left; n++) {
      const slot = inventory.slots[n];
      if (slot?.item !== item) continue;
      const take = Math.min(left, slot.quantity);
      slot.quantity -= take;
      left -= take;
      if (!slot.quantity) inventory.slots[n] = null;
    }
  }
  if (!renew) inventory.reservations.splice(inventory.reservations.indexOf(reservation), 1);
  return true;
}
export function eligible(
  inventory: InventoryData,
  recipe: string,
  content: ContentDefinition,
): boolean {
  const definition = content.recipes[recipe];
  return (
    Object.hasOwn(content.recipes, recipe) &&
    [...totals(definition.inputs)].every(([item, count]) => available(inventory, item) >= count)
  );
}
export function materialValue(items: readonly ItemStack[], content: ContentDefinition): number {
  return [...totals(items)].reduce((n, [item, count]) => {
    check(Object.hasOwn(content.items, item), 'Unknown material');
    return n + count * content.items[item].solidValue;
  }, 0);
}
/** Explicit policy order; native query iteration never decides stock priority. */
export function spendByPriority(
  inventory: InventoryData,
  requests: readonly {
    priority: 'manual' | 'minifab' | 'research';
    id: string;
    items: readonly ItemStack[];
  }[],
  content: ContentDefinition,
): string[] {
  const order = { manual: 0, minifab: 1, research: 2 };
  return [...requests]
    .sort(
      (a, b) => order[a.priority] - order[b.priority] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .filter((request) => transact(inventory, request.items, [], content))
    .map((r) => r.id);
}
