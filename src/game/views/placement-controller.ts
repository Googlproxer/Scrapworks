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
import { isMachineKind } from '@content/factory';
import { isTransportKind } from '@content/transport';
import { machineGeometry } from './machine-geometry';
import type { GridCell } from '@contracts/world';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { powerTerminal, powerWirePoints } from './power-wire';

export class PlacementController extends PresentationBehavior {
  private building = false;
  private rotation: QuarterTurn = 0;
  private preview?: Mesh;
  private readonly material?: StandardMaterial;
  private key = '';
  private geometryKey = 'legacy';
  private deposits?: WorldView['deposits'];
  private buildings?: WorldView['buildings'];
  private connections?: NonNullable<WorldView['factory']>['connections'];
  private anchor?: { id: string; cell: GridCell };
  private wire?: LinesMesh;
  private selectionKey = '';
  private feedback?: ReturnType<NonNullable<WorldFrame['options']['placement']>['preview']>;

  public constructor(
    node: TransformNode,
    private readonly definition: WorldDefinition,
    private readonly selection: SelectionController,
    private readonly frame: WorldFrame,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'PlacementController');
    if (!frame.options.placement) return;
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

  protected override onUpdate(): void {
    if (!this.frame.options.placement) return;
    if (!this.frame.active) this.building = false;
    else if (actionPressed(this.frame.input, 'build')) this.building = !this.building;
    if (actionPressed(this.frame.input, 'cancel')) this.building = false;
    if (!this.building) this.clearAnchor();
    this.frame.placing = this.building && this.frame.active;
  }

  protected override onLateUpdate(): void {
    const { input, active, options, view } = this.frame;
    const placement = options.placement;
    if (!this.preview || !placement) return;
    if (!active || !this.building || !view) {
      this.clearAnchor();
      this.preview.setEnabled(false);
      if (this.key) options.placementFeedback.next(null);
      this.key = '';
      return;
    }
    const current = placement.current?.();
    if (placement.current && !current) {
      this.clearAnchor();
      this.preview.setEnabled(false);
      if (this.key !== 'unassigned') {
        this.key = 'unassigned';
        options.placementFeedback.next({ valid: false, reason: 'unavailable' });
        this.frame.validateOwnership();
      }
      return;
    }
    const geometryKey = current?.key ?? 'legacy';
    const selectionKey = `${geometryKey}:${current?.slot}:${view.worldId}:${view.worldGeneration}`;
    if (
      selectionKey !== this.selectionKey ||
      (this.anchor && !view.buildings.some((b) => b.id === this.anchor!.id))
    ) {
      this.clearAnchor();
      this.selectionKey = selectionKey;
    }
    if (geometryKey !== this.geometryKey) {
      this.preview.dispose();
      this.preview =
        isMachineKind(geometryKey) || isTransportKind(geometryKey)
          ? machineGeometry(this.scene, geometryKey, 'placement-preview', this.material!)
          : geometryKey === 'power-connection'
            ? MeshBuilder.CreateSphere(
                'placement-preview',
                { diameter: 30, segments: 8 },
                this.scene,
              )
            : MeshBuilder.CreateBox(
                'placement-preview',
                { width: 400, height: 120, depth: 200 },
                this.scene,
              );
      this.preview.name = 'placement-preview';
      this.preview.material = this.material!;
      for (const mesh of [this.preview, ...this.preview.getChildMeshes()]) mesh.isPickable = false;
      this.geometryKey = geometryKey;
    }
    const connecting = geometryKey === 'power-connection';
    if (!connecting && actionPressed(input, 'rotatePlacement'))
      this.rotation = ((this.rotation + 1) % 4) as QuarterTurn;
    const cell = this.selection.cell;
    const cancelling =
      connecting &&
      !!cell &&
      this.anchor?.cell.column === cell.column &&
      this.anchor.cell.row === cell.row;
    const key = `${selectionKey}:${this.anchor?.id}:${view.publication}:${cell?.column}:${cell?.row}:${this.rotation}:${view.player.position.x}:${view.player.position.z}`;
    if (
      key !== this.key ||
      this.deposits !== view.deposits ||
      this.buildings !== view.buildings ||
      this.connections !== view.factory?.connections
    ) {
      this.key = key;
      this.deposits = view.deposits;
      this.buildings = view.buildings;
      this.connections = view.factory?.connections;
      this.feedback = cancelling
        ? { valid: true, reason: null, cells: [cell!] }
        : cell
          ? placement.preview(cell, this.rotation, this.anchor?.id)
          : undefined;
      options.placementFeedback.next({
        valid: this.feedback?.valid ?? false,
        reason: this.feedback ? this.feedback.reason : 'invalid-cell',
        ...(connecting
          ? {
              connection: cancelling
                ? ('cancel' as const)
                : this.anchor
                  ? ('end' as const)
                  : ('start' as const),
            }
          : {}),
      });
      this.frame.validateOwnership();
    }
    this.showPreview(true, this.rotation, this.feedback?.valid ?? false);
    if (cell && actionPressed(input, 'confirm')) {
      if (!connecting) placement.place(cell, this.rotation);
      else if (cancelling) this.clearAnchor();
      else if (this.feedback?.valid) {
        if (this.anchor) {
          placement.place(cell, this.rotation, this.anchor.id);
          this.frame.validateOwnership();
          this.clearAnchor();
        } else {
          const target = view.buildings.find(
            (b) =>
              isMachineKind(b.buildingId) &&
              b.cell.column === cell.column &&
              b.cell.row === cell.row,
          );
          if (target) this.anchor = { id: target.id, cell: { ...cell } };
        }
      }
    }
    this.frame.validateOwnership();
  }

  public showPreview(enabled: boolean, rotation: QuarterTurn, valid: boolean): void {
    if (!this.preview || !this.material) return;
    const cell = this.selection.cell;
    this.preview.setEnabled(enabled && !!cell);
    if (!cell) {
      this.wire?.setEnabled(false);
      return;
    }
    const centre = cellCenter(this.definition.grid, cell);
    if (this.geometryKey === 'power-connection') {
      const view = this.frame.view!;
      const target = view.buildings.find(
        (b) => b.cell.column === cell.column && b.cell.row === cell.row,
      );
      const endpoint = target
        ? powerTerminal(target)
        : new Vector3(centre.x * 100, 100, centre.z * 100);
      this.preview.position.copyFrom(endpoint);
      this.preview.rotation.y = 0;
      this.material.diffuseColor = valid
        ? new Color3(0.1, 0.8, 0.45)
        : new Color3(0.95, 0.16, 0.13);
      const source = view.buildings.find((b) => b.id === this.anchor?.id);
      if (source && source.id !== target?.id) {
        this.wire = MeshBuilder.CreateLines(
          'power-connection-preview',
          {
            points: powerWirePoints(powerTerminal(source), endpoint),
            updatable: true,
            instance: this.wire,
          },
          this.scene,
        );
        this.wire.color.copyFrom(this.material.diffuseColor);
        this.wire.isPickable = false;
        this.wire.setEnabled(enabled);
      } else this.wire?.setEnabled(false);
      return;
    }
    const footprint = this.frame.options.placement?.current?.()?.footprint ?? {
      width: 2,
      depth: 1,
    };
    const width = rotation % 2 ? footprint.depth : footprint.width;
    const depth = rotation % 2 ? footprint.width : footprint.depth;
    this.preview.position.set(
      (centre.x + ((width - 1) * this.definition.grid.metresPerCell) / 2) * 100,
      -this.preview.getBoundingInfo().boundingBox.minimum.y,
      (centre.z + ((depth - 1) * this.definition.grid.metresPerCell) / 2) * 100,
    );
    this.preview.rotation.y = (rotation * Math.PI) / 2;
    this.material.diffuseColor = valid ? new Color3(0.1, 0.8, 0.45) : new Color3(0.95, 0.16, 0.13);
  }

  protected override onDestroy(): void {
    this.wire?.dispose();
    this.preview?.dispose();
    this.material?.dispose();
  }

  private clearAnchor(): void {
    this.anchor = undefined;
    this.wire?.setEnabled(false);
  }
}
