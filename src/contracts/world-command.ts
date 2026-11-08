import type { WorldCommand } from './world';

/** Validate untrusted worker input before touching a simulation. */
export function validWorldCommand(value: unknown): value is WorldCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;

  const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 256;

  const batch = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 100;

  switch (command['type']) {
    case 'place': {
      const cell = command['cell'] as { column?: unknown; row?: unknown } | null;
      return (
        command['buildingId'] === 'test-building' &&
        !!cell &&
        Number.isInteger(cell.column) &&
        Number.isInteger(cell.row) &&
        Number.isInteger(command['rotation']) &&
        Number(command['rotation']) >= 0 &&
        Number(command['rotation']) <= 3
      );
    }
    case 'salvage':
      return command['target'] === null || id(command['target']);
    case 'pickup':
      return id(command['target']);
    case 'equip':
      return command['item'] === null || id(command['item']);
    case 'research':
      return typeof command['enabled'] === 'boolean' && command['technology'] === undefined;
    case 'research-queue':
      return (
        id(command['technology']) &&
        (command['action'] === 'add' ||
          command['action'] === 'remove' ||
          (command['action'] === 'move' &&
            Number.isSafeInteger(command['index']) &&
            Number(command['index']) >= 0))
      );
    case 'handcraft-ui':
      return (
        typeof command['visible'] === 'boolean' &&
        (command['suspended'] === undefined || typeof command['suspended'] === 'boolean')
      );
    case 'craft':
      return id(command['recipe']) && batch(command['quantity']);
    case 'minifab':
      return (command['recipe'] === null || id(command['recipe'])) && batch(command['quantity']);
    case 'wind':
      return (
        typeof command['degrees'] === 'number' &&
        Number.isFinite(command['degrees']) &&
        Math.abs(command['degrees']) <= 120
      );
    case 'dismantle':
      return id(command['item']);
    default:
      return false;
  }
}
