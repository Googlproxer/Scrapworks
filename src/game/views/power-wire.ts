import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { WorldEntityDefinition } from '@contracts/world';

/** Matches the machine model's terminal, including its quarter-turn orientation. */
export function powerTerminal(
  machine: Pick<WorldEntityDefinition, 'position' | 'rotation'>,
): Vector3 {
  const angle = (machine.rotation * Math.PI) / 2;
  return new Vector3(
    machine.position.x * 100 - 48 * Math.cos(angle) - 48 * Math.sin(angle),
    machine.position.y * 100 + 100,
    machine.position.z * 100 + 48 * Math.sin(angle) - 48 * Math.cos(angle),
  );
}

export const powerWirePoints = (from: Vector3, to: Vector3): Vector3[] => [
  from,
  new Vector3((from.x + to.x) / 2, (from.y + to.y) / 2 - 35, (from.z + to.z) / 2),
  to,
];
