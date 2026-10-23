import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ActionFrame } from '@contracts/input';
import { actionHeld } from '../input/action-state';
import { GameplayScript } from '../toolkit/gameplay-script';
import type { CameraController } from './camera-controller';
import type { WorldFrame } from './world-frame';

export class PlayerController extends GameplayScript {
  public constructor(
    node: TransformNode,
    private readonly frame: WorldFrame,
    private readonly camera: CameraController,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'PlayerController');
  }

  public movement(input: ActionFrame): { x: number; z: number } {
    const action = input.states['move'];
    return this.camera.projectMovement(action?.kind === 'vector2' ? action.value : { x: 0, y: 0 });
  }

  protected override onUpdate(): void {
    this.frame.movement = this.frame.active ? this.movement(this.frame.input) : { x: 0, z: 0 };
    this.frame.sprint = this.frame.active && actionHeld(this.frame.input, 'sprint');
  }
}
