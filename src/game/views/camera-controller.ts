import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ActionFrame } from '@contracts/input';
import { actionHeld } from '../input/action-state';
import type { EntityViews } from './entity-views';
import { GameplayScript } from '../toolkit/gameplay-script';
import type { WorldFrame } from './world-frame';

export class CameraController extends GameplayScript {
  public readonly camera: ArcRotateCamera;
  public constructor(
    node: TransformNode,
    private readonly player: TransformNode,
    private readonly entities: EntityViews,
    private readonly frame: WorldFrame,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'CameraController');
    const scene = node.getScene();
    const camera = scene.activeCamera;
    if (!(camera instanceof ArcRotateCamera))
      throw new Error('Game requires an authored ArcRotateCamera.');
    this.camera = camera;
    camera.lowerBetaLimit = Math.PI / 9;
    camera.upperBetaLimit = (Math.PI * 5) / 12;
    camera.lowerRadiusLimit = 600;
    camera.upperRadiusLimit = 2400;
    camera.allowUpsideDown = false;
    camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    camera.movement.input.inputMap = [
      { source: 'pointer', button: 2, interaction: 'rotate' },
      { source: 'wheel', interaction: 'zoom' },
    ];
    const pointers = camera.inputs.attached['pointers'];
    if (pointers && 'buttons' in pointers) (pointers as { buttons: number[] }).buttons = [2];
    camera.panningSensibility = 0;
  }
  protected override onUpdate(): void {
    if (this.frame.active) this.controls(this.frame.input, this.frame.seconds);
  }
  protected override onLateUpdate(): void {
    if (this.frame.view) this.follow(this.frame.seconds);
  }
  public projectMovement(value: { x: number; y: number }): { x: number; z: number } {
    // Current orbit angles include this frame's controller changes before Babylon updates its matrix.
    const forward = new Vector3(-Math.cos(this.camera.alpha), 0, -Math.sin(this.camera.alpha));
    const right = new Vector3(forward.z, 0, -forward.x);
    return {
      x: forward.x * value.y + right.x * value.x,
      z: forward.z * value.y + right.z * value.x,
    };
  }
  public controls(frame: ActionFrame, seconds: number): void {
    const orbit = frame.states['orbit'];
    if (orbit?.kind === 'vector2') {
      this.camera.alpha -= orbit.value.x * seconds * 1.8;
      this.camera.beta -= orbit.value.y * seconds * 1.2;
    }
    this.camera.radius +=
      ((actionHeld(frame, 'zoomOut') ? 1 : 0) - (actionHeld(frame, 'zoomIn') ? 1 : 0)) *
      seconds *
      700;
    this.camera.radius = Math.max(600, Math.min(2400, this.camera.radius));
    this.camera.beta = Math.max(Math.PI / 9, Math.min((Math.PI * 5) / 12, this.camera.beta));
  }

  public follow(seconds: number): void {
    const target = this.player.position.add(new Vector3(0, 85, 0));
    const cameraTarget = this.camera.getTarget();
    // Move the orbit with its target, preserving the authored/player-selected angles and radius.
    this.camera.setTarget(
      Vector3.Lerp(cameraTarget, target, 1 - Math.exp(-seconds * 8)),
      false,
      false,
      true,
    );

    this.camera.getViewMatrix(true);
    for (const entity of this.entities.values()) entity.mesh.visibility = 1;
    const direction = target.subtract(this.camera.position),
      length = direction.length();
    const hit = this.scene.pickWithRay(
      new Ray(this.camera.position, direction.normalize(), length),
      (mesh) => !!mesh.metadata?.worldEntity,
    );
    if (hit?.hit && hit.pickedMesh) hit.pickedMesh.visibility = 0.25;
  }
}
