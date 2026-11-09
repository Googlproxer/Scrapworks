/** Local side names rotate with the building; front is +Z at rotation zero. */
import type { ReadonlyData } from './readonly-data';

export type MaterialPort = 'front' | 'right' | 'back' | 'left';
export type TransportKind = 'conveyor' | 'sorter';
export type ConveyorTurn = 'straight' | 'left' | 'right';

export interface TransitUnit {
  item: string;
  /** Integer simulation ticks, capped while blocked. */
  progress: number;
  lane: number;
}

export interface TransportData {
  turn: ConveyorTurn;
  filters: [string | null, string | null];
  units: TransitUnit[];
  status: 'idle' | 'moving' | 'blocked' | 'disconnected' | 'incompatible';
}

export interface MaterialConnection {
  id: string;
  from: string;
  output: MaterialPort;
  to: string;
  input: MaterialPort;
  cooldown: number;
  lastItem: string | null;
}

export interface TransportResources {
  connections: MaterialConnection[];
  /** Last accepted incoming edge per destination, for deterministic round-robin merging. */
  cursors: Record<string, string>;
}

export interface TransportSummary {
  readonly connections: readonly Readonly<MaterialConnection>[];
  readonly segments: readonly ({ readonly id: string } & ReadonlyData<TransportData>)[];
}

export type TransportCommand =
  | {
      type: 'transport-connect';
      from: string;
      output: MaterialPort;
      to: string;
      input: MaterialPort;
    }
  | { type: 'transport-disconnect'; connection: string }
  | {
      type: 'transport-configure';
      target: string;
      turn: ConveyorTurn;
      filters: [string | null, string | null];
    }
  | { type: 'transport-collect'; target: string };
