import type { GameClientOptions, WorldSessionBridge } from '@contracts/game-client';
import type { ActionFrame } from '@contracts/input';
import type { WorldView } from '@contracts/world';
import type { GameplayScriptOptions } from '../toolkit/gameplay-script';

/** One sampled input snapshot and one completed view shared by the scene's scripts. */
export class WorldFrame {
  public input: ActionFrame = { context: null, revision: 0, states: {} };
  public seconds = 0;
  public active = false;
  public view?: WorldView;
  public pointer = { x: 0, y: 0 };
  public movement = { x: 0, z: 0 };
  public sprint = false;
  public isCurrent: () => boolean = () => false;

  public constructor(public readonly options: GameClientOptions) {}

  public get session(): WorldSessionBridge | undefined {
    return this.options.session;
  }

  public get scriptOptions(): GameplayScriptOptions {
    return {
      ticks: this.session,
      isCurrent: () => this.isCurrent(),
      isGameplayActive: () => this.active && this.isCurrent(),
    };
  }

  public validateOwnership(): void {
    if (!this.isCurrent()) throw new FrameOwnershipChanged();
  }
}

/** Abort Babylon's in-progress render when a synchronous application callback replaces its owner. */
export class FrameOwnershipChanged extends Error {}
