import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { QuarterTurn, WorldDefinition, WorldView } from '@contracts/world';
import { cellCenter } from '@core/world-grid';
import { actionPressed } from '../input/action-state';
import { PresentationBehavior } from '../lifecycle/presentation-behavior';
import type { SelectionController } from './selection-controller';
import type { WorldFrame } from './world-frame';

export class PlacementController extends PresentationBehavior {
  private building = false;
  private rotation: QuarterTurn = 0;
  private readonly preview?: Mesh;
  private readonly material?: StandardMaterial;
  private key = '';
  private deposits?: WorldView['deposits'];
  private buildings?: WorldView['buildings'];
  private feedback?: ReturnType<NonNullable<WorldFrame['options']['placement']>['preview']>;

  public constructor(
    node: TransformNode,
    private readonly definition: WorldDefinition,
    private readonly selection: SelectionController,
    private readonly frame: WorldFrame,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'PlacementController');
    if (!frame.options.developerFixture || !frame.options.placement) return;
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
    const { input, active, options, view } = this.frame;
    const placement = options.placement;
    if (!this.preview || !placement) return;
    if (active && actionPressed(input, 'build')) this.building = !this.building;
    if (actionPressed(input, 'cancel')) this.building = false;
    if (!active || !this.building || !view) {
      this.preview.setEnabled(false);
      if (this.key) options.placementFeedback.next(null);
      this.key = '';
      return;
    }
    if (actionPressed(input, 'rotatePlacement'))
      this.rotation = ((this.rotation + 1) % 4) as QuarterTurn;
    const cell = this.selection.cell;
    const key = `${view.worldGeneration}:${cell?.column}:${cell?.row}:${this.rotation}:${view.player.position.x}:${view.player.position.z}`;
    if (key !== this.key || this.deposits !== view.deposits || this.buildings !== view.buildings) {
      this.key = key;
      this.deposits = view.deposits;
      this.buildings = view.buildings;
      this.feedback = cell ? placement.preview(cell, this.rotation) : undefined;
      options.placementFeedback.next({
        valid: this.feedback?.valid ?? false,
        reason: this.feedback?.reason ?? 'invalid-cell',
      });
      this.frame.validateOwnership();
    }
    this.showPreview(true, this.rotation, this.feedback?.valid ?? false);
    if (cell && actionPressed(input, 'confirm')) placement.place(cell, this.rotation);
    this.frame.validateOwnership();
  }

  public showPreview(enabled: boolean, rotation: QuarterTurn, valid: boolean): void {
    if (!this.preview || !this.material) return;
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
    this.preview?.dispose();
    this.material?.dispose();
  }
}
