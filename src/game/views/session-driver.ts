import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { GameplayScript } from '../toolkit/gameplay-script';
import type { WorldFrame } from './world-frame';

/** The only active-frame call into the application-owned gameplay clock. */
export class SessionDriver extends GameplayScript {
  public constructor(
    node: TransformNode,
    private readonly frame: WorldFrame,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'SessionDriver');
  }

  protected override onUpdate(): void {
    const { session, seconds, movement, sprint, active } = this.frame;
    if (!session) return;
    const view = session.frame(seconds, movement, sprint, active);
    this.frame.validateOwnership();
    this.frame.view = view;
    this.frame.options.onWorldView?.(view);
    this.frame.validateOwnership();
    session.completeFrame?.();
    this.frame.validateOwnership();
  }
}
