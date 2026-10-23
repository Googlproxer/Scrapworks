import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { GridCell, WorldDefinition } from '@contracts/world';
import { cellCenter, sceneToMetres, worldToCell } from '@core/world-grid';
import { actionPressed } from '../input/action-state';
import { GameplayScript } from '../toolkit/gameplay-script';
import type { WorldFrame } from './world-frame';

export class SelectionController extends GameplayScript {
  public cell: GridCell | null = null;
  public entity: string | null = null;
  private readonly selector: Mesh;
  private readonly material: StandardMaterial;

  public constructor(
    node: TransformNode,
    private readonly definition: WorldDefinition,
    private readonly frame: WorldFrame,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'SelectionController');
    const ground = this.scene.getMeshByName('ground');
    if (ground) {
      ground.metadata = { ...ground.metadata, terrain: true };
      ground.isPickable = true;
    }
    this.selector = MeshBuilder.CreateGround(
      'cell-selection',
      { width: 198, height: 198 },
      this.scene,
    );
    this.selector.isPickable = false;
    this.material = new StandardMaterial('selection', this.scene);
    this.material.diffuseColor = new Color3(0.1, 0.75, 0.8);
    this.material.specularColor = Color3.Black();
    this.material.alpha = 0.3;
    this.material.disableLighting = true;
    this.material.emissiveColor = this.material.diffuseColor;
    this.selector.material = this.material;
    this.selector.setEnabled(false);
  }

  protected override onLateUpdate(): void {
    if (!this.frame.active) {
      this.selector.setEnabled(false);
      return;
    }
    this.pick(this.frame.pointer.x, this.frame.pointer.y);
    if (actionPressed(this.frame.input, 'interact'))
      this.frame.options.onSelection?.(
        this.entity ?? (this.cell ? `Cell ${this.cell.column + 1}, ${this.cell.row + 1}` : null),
      );
    this.frame.validateOwnership();
  }

  public pick(x: number, y: number): void {
    const hit = this.scene.pick(x, y, (mesh) => mesh.metadata?.terrain === true);
    this.cell = hit?.pickedPoint
      ? worldToCell(this.definition.grid, sceneToMetres(hit.pickedPoint))
      : null;
    const entity = this.scene.pick(x, y, (mesh) => !!mesh.metadata?.worldEntity);
    this.entity = entity?.pickedMesh?.metadata?.worldEntity ?? null;
    this.selector.setEnabled(!!this.cell);
    if (this.cell) {
      const centre = cellCenter(this.definition.grid, this.cell);
      this.selector.position.set(centre.x * 100, 1, centre.z * 100);
    }
  }

  protected override onDestroy(): void {
    this.selector.dispose();
    this.material.dispose();
  }
}
