import type { WorldCommand } from './world';
import { isPlaceable } from '@content/factory';
import { TOOLBAR_SLOTS } from './toolbar';
import { isMaterialPort, isConveyorTurn } from '@content/transport';

/** Validate untrusted worker input before touching a simulation. */
export function validWorldCommand(value: unknown): value is WorldCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;

  const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 256;

  const batch = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 100;

  switch (command['type']) {
    case 'fluid-connect':
      return (
        id(command['from']) &&
        id(command['to']) &&
        isMaterialPort(command['output']) &&
        isMaterialPort(command['input'])
      );
    case 'fluid-disconnect':
      return id(command['connection']);
    case 'fluid-overflow':
      return (
        id(command['target']) &&
        (command['direction'] === null ||
          (typeof command['direction'] === 'string' &&
            ['north', 'east', 'south', 'west'].includes(command['direction'])))
      );
    case 'transport-connect':
      return (
        id(command['from']) &&
        id(command['to']) &&
        isMaterialPort(command['output']) &&
        isMaterialPort(command['input'])
      );
    case 'transport-disconnect':
      return id(command['connection']);
    case 'transport-collect':
      return id(command['target']);
    case 'transport-configure':
      return (
        id(command['target']) &&
        isConveyorTurn(command['turn']) &&
        Array.isArray(command['filters']) &&
        command['filters'].length === 2 &&
        command['filters'].every((v) => v === null || id(v))
      );
    case 'toolbar-assign':
    case 'toolbar-select':
      return (
        Number.isSafeInteger(command['slot']) &&
        Number(command['slot']) >= 0 &&
        Number(command['slot']) < TOOLBAR_SLOTS &&
        (command['type'] === 'toolbar-select' ||
          command['item'] === null ||
          isPlaceable(command['item']))
      );
    case 'factory-place-active':
    case 'factory-place': {
      const cell = command['cell'] as { column?: unknown; row?: unknown } | null;
      return (
        (command['type'] === 'factory-place-active' ||
          (isPlaceable(command['equipment']) && command['equipment'] !== 'power-connection')) &&
        !!cell &&
        Number.isSafeInteger(cell.column) &&
        Number.isSafeInteger(cell.row) &&
        Number.isInteger(command['rotation']) &&
        Number(command['rotation']) >= 0 &&
        Number(command['rotation']) <= 3
      );
    }
    case 'factory-configure':
      return (
        id(command['target']) &&
        typeof command['enabled'] === 'boolean' &&
        (command['recipe'] === null || id(command['recipe']))
      );
    case 'factory-transfer':
      return (
        id(command['target']) &&
        id(command['item']) &&
        ['input', 'output'].includes(String(command['buffer'])) &&
        ['load', 'unload'].includes(String(command['direction'])) &&
        Number.isSafeInteger(command['quantity']) &&
        Number(command['quantity']) > 0
      );
    case 'factory-connect':
    case 'factory-connect-active':
      return id(command['from']) && id(command['to']);
    case 'factory-disconnect':
      return id(command['connection']);
    case 'factory-collect-output':
    case 'factory-dismantle':
      return id(command['target']);
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
