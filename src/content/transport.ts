import type {
  ConveyorTurn,
  MaterialPort,
  TransportData,
  TransportKind,
} from '../contracts/transport';
import type { BuildingView } from '../contracts/world';

/** Provisional balance: 2 units/s per edge; 0.5 s travel across a 2 m cell. */
export const TRANSPORT_SETTINGS = Object.freeze({
  capacity: 4,
  travelTicks: 10,
  intervalTicks: 10,
});

export const MATERIAL_PORTS: readonly MaterialPort[] = ['front', 'right', 'back', 'left'];

export const CONVEYOR_TURNS: readonly ConveyorTurn[] = ['straight', 'left', 'right'];

export const isTransportKind = (value: unknown): value is TransportKind =>
  value === 'conveyor' || value === 'sorter';

export const isMaterialPort = (value: unknown): value is MaterialPort =>
  MATERIAL_PORTS.includes(value as MaterialPort);

export const isConveyorTurn = (value: unknown): value is ConveyorTurn =>
  CONVEYOR_TURNS.includes(value as ConveyorTurn);

export const emptyTransport = (): TransportData => ({
  turn: 'straight',
  filters: [null, null],
  units: [],
  status: 'idle',
});

export function materialPorts(
  kind: BuildingView['buildingId'],
  turn: ConveyorTurn = 'straight',
): { input: readonly MaterialPort[]; output: readonly MaterialPort[] } {
  if (kind === 'conveyor')
    return { input: ['back'], output: [turn === 'straight' ? 'front' : turn] };
  if (kind === 'sorter') return { input: ['back'], output: ['left', 'right', 'front'] };
  if (kind === 'extractor') return { input: [], output: ['front'] };
  if (kind === 'laboratory' || kind === 'coal-generator')
    return { input: MATERIAL_PORTS, output: [] };
  if (kind === 'recycler' || kind === 'basic-fabricator' || kind === 'medium-fabricator')
    return { input: ['back', 'left', 'right'], output: ['front'] };
  return { input: [], output: [] };
}

export function portDirection(
  building: Pick<BuildingView, 'rotation'>,
  port: MaterialPort,
): { column: number; row: number } {
  // Babylon's positive Y rotation takes +Z toward +X.
  return [
    { column: 0, row: 1 },
    { column: 1, row: 0 },
    { column: 0, row: -1 },
    { column: -1, row: 0 },
  ][(MATERIAL_PORTS.indexOf(port) + building.rotation) % 4];
}

export function facingPorts(
  a: BuildingView,
  output: MaterialPort,
  b: BuildingView,
  input: MaterialPort,
): boolean {
  const from = portDirection(a, output),
    to = portDirection(b, input);
  return (
    a.id !== b.id &&
    a.cell.column + from.column === b.cell.column &&
    a.cell.row + from.row === b.cell.row &&
    from.column === -to.column &&
    from.row === -to.row
  );
}

export function sorterLane(filters: readonly (string | null)[], item: string): number {
  const index = filters.indexOf(item);
  return index < 0 ? 2 : index;
}

export const lanePort = (lane: number): MaterialPort => (['left', 'right', 'front'] as const)[lane];
