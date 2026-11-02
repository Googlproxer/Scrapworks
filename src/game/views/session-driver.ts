import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PresentationBehavior } from '../lifecycle/presentation-behavior';
import type { WorldFrame } from './world-frame';

/** The only active-frame call into the application-owned gameplay clock. */
export class SessionDriver extends PresentationBehavior {
  public constructor(
    node: TransformNode,
    private readonly frame: WorldFrame,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'SessionDriver');
  }

  protected override onUpdate(): void {
    const { session, seconds, movement, sprint, active } = this.frame;
    const view = session.frame(seconds, movement, sprint, active, this.frame.simulationActive);
    this.frame.presentationActive = this.frame.simulationActive && session.isSimulationActive();
    this.frame.validateOwnership();
    this.frame.view = view;
    session.completeFrame();
    this.frame.validateOwnership();
  }
}
