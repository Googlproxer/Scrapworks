import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { QuarterTurn, WorldDefinition } from '@contracts/world';
import { cellCenter } from '@core/world-grid';
import { actionPressed } from '../input/action-state';
import { GameplayScript } from '../toolkit/gameplay-script';
import type { SelectionController } from './selection-controller';
import type { WorldFrame } from './world-frame';

export class PlacementController extends GameplayScript {
  private building = false;
  private rotation: QuarterTurn = 0;
  private readonly preview: Mesh;
  private readonly material: StandardMaterial;

  public constructor(
    node: TransformNode,
    private readonly definition: WorldDefinition,
    private readonly selection: SelectionController,
    private readonly frame: WorldFrame,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'PlacementController');
    this.preview = MeshBuilder.CreateBox(
      'placement-preview',
      { width: 400, height: 120, depth: 200 },
      this.scene,
    );
    this.preview.isPickable = false;
    this.preview.setEnabled(false);
    this.material = new StandardMaterial('placement-feedback', this.scene);
    this.material.specularColor = Color3.Black();
    this.material.alpha = 0.45;
    this.preview.material = this.material;
  }

  protected override onLateUpdate(): void {
    const { input, session, active, options } = this.frame;
    if (!active || !session) {
      this.showPreview(false, this.rotation, false);
      return;
    }
    if (options.developerFixture && actionPressed(input, 'build')) this.building = !this.building;
    if (this.building && actionPressed(input, 'cancel')) this.building = false;
    if (this.building && actionPressed(input, 'rotatePlacement'))
      this.rotation = ((this.rotation + 1) % 4) as QuarterTurn;
    const cell = this.selection.cell;
    const feedback = cell ? session.preview(cell, this.rotation) : null;
    this.showPreview(this.building, this.rotation, feedback?.valid ?? false);
    // Preview uses a completed view; authority revalidates confirmation on a future tick.
    if (this.building && cell && actionPressed(input, 'confirm'))
      session.place(cell, this.rotation);
    if (this.building && this.frame.isCurrent())
      options.onSelection?.(
        feedback?.valid
          ? 'Placement available'
          : `Cannot place: ${feedback?.reason ?? 'outside world'}`,
      );
    this.frame.validateOwnership();
  }

  public showPreview(enabled: boolean, rotation: QuarterTurn, valid: boolean): void {
    const cell = this.selection.cell;
    this.preview.setEnabled(enabled && !!cell);
    if (!cell) return;
    const centre = cellCenter(this.definition.grid, cell);
    this.preview.position.set(
      centre.x * 100 + (rotation % 2 ? 0 : 100),
      60,
      centre.z * 100 + (rotation % 2 ? 100 : 0),
    );
    this.preview.rotation.y = (rotation * Math.PI) / 2;
    this.material.diffuseColor = valid ? new Color3(0.1, 0.8, 0.45) : new Color3(0.95, 0.16, 0.13);
  }

  protected override onDestroy(): void {
    this.preview.dispose();
    this.material.dispose();
  }
}
