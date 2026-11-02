import type { ArcRotateCamera, Scene } from '@babylonjs/core';
import type { WorldView } from '../src/contracts/world.ts';
import type * as Axe from 'axe-core';

/** Read-only debug surfaces inspected by the local browser probes. */
interface DebugPage {
  gameRuntimeService: {
    world(): WorldView;
    isReady(): boolean;
    client: { currentScene: Scene & { activeCamera: ArcRotateCamera } };
  };
}

export interface TurningSample {
  time: number;
  phase: string;
  player: WorldView['player'];
  visualHeading: number;
  visualPosition: number[];
  weights: Record<string, number>;
  clips: Record<string, { isStarted: boolean; isPlaying: boolean; animatableWeights: number[] }>;
}

declare global {
  const ng: { getComponent(element: Element | null): DebugPage };
  const axe: typeof Axe;

  interface Window {
    turningEvidence: { phase: string; running: boolean; samples: TurningSample[] };
  }

  var productionProbe: {
    tick: number;
    first: { x: number; z: number } | null | undefined;
    position: { x: number; z: number } | null | undefined;
    moving?: boolean;
    mappingUpdates?: number;
  };
}
