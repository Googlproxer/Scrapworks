import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { GridDefinition, WorldEntityDefinition } from '@contracts/world';
import { entityCollider } from '@core/world-collision';
import { attachDebugDraw } from '../debug/draw/debug-draw';
import type { DebugAttachment } from '../debug/draw/types';
import { machineGeometry } from './machine-geometry';
import { isMachineKind } from '@content/factory';
import { isTransportKind } from '@content/transport';
import type { BuildingView } from '@contracts/world';

/** A scene resource owner, identified by a detached simulation entity ID. */
export class EntityView {
  public readonly mesh: AbstractMesh;
  private readonly material?: StandardMaterial;
  private readonly debug: DebugAttachment;
  private item: WorldEntityDefinition;

  public constructor(
    scene: Scene,
    item: WorldEntityDefinition,
    building: boolean,
    private readonly grid: GridDefinition,
    template?: AbstractMesh | null,
  ) {
    this.item = item;
    const kind = (item as Partial<BuildingView>).buildingId;
    if (building) {
      this.material = new StandardMaterial(`building:${item.id}`, scene);
      const colours: Readonly<Record<string, string>> = {
        'solar-panel': '#416d91',
        'wind-turbine': '#d6d9c8',
        recycler: '#b9854e',
        'basic-fabricator': '#628a75',
        'medium-fabricator': '#477d91',
        extractor: '#ac9a54',
        laboratory: '#6b9290',
      };
      this.material.diffuseColor = Color3.FromHexString(colours[kind ?? ''] ?? '#384a4d');
      this.material.specularColor = Color3.Black();
    }
    this.mesh =
      building && (isMachineKind(kind) || isTransportKind(kind))
        ? machineGeometry(scene, kind, item.id, this.material!)
        : building
          ? MeshBuilder.CreateBox(
              `entity:${item.id}`,
              {
                width: item.footprint.width * grid.metresPerCell * 100,
                height: 120,
                depth: item.footprint.depth * grid.metresPerCell * 100,
              },
              scene,
            )
          : (template?.clone(`entity:${item.id}`, null) ??
            MeshBuilder.CreateBox(`entity:${item.id}`, { size: 150 }, scene));
    if (building) {
      this.mesh.material = this.material!;
    }
    this.mesh.metadata = { worldEntity: item.id };
    this.mesh.isPickable = true;
    this.mesh.setEnabled(true);
    this.sync(item);
    this.debug = attachDebugDraw(this.mesh, { category: 'collision', space: 'world' }, (draw) => {
      const collider = entityCollider(this.grid, this.item);
      const color = '#ff9900';
      if (collider.shape === 'box') {
        draw.box('bounds', {
          center: collider.center,
          dimensions: { x: collider.width, y: collider.height, z: collider.depth },
          color,
        });
      } else {
        const bottom = { ...collider.center, y: collider.center.y - collider.height / 2 };
        const top = { ...bottom, y: bottom.y + collider.height };
        draw.circle('bottom', { center: bottom, radius: collider.radius, color });
        draw.circle('top', { center: top, radius: collider.radius, color });
        for (const [index, x, z] of [
          [0, collider.radius, 0],
          [1, -collider.radius, 0],
          [2, 0, collider.radius],
          [3, 0, -collider.radius],
        ] as const)
          draw.line(`side-${index}`, {
            start: { ...bottom, x: bottom.x + x, z: bottom.z + z },
            end: { ...top, x: top.x + x, z: top.z + z },
            color,
          });
      }
    });
  }

  public sync(item: WorldEntityDefinition & { quantity?: number }): void {
    this.item = item;
    this.mesh.setEnabled(item.quantity === undefined || item.quantity > 0);
    const width = item.rotation % 2 ? item.footprint.depth : item.footprint.width;
    const depth = item.rotation % 2 ? item.footprint.width : item.footprint.depth;
    this.mesh.position.set(
      (item.position.x + ((width - 1) * this.grid.metresPerCell) / 2) * 100,
      item.position.y * 100 -
        this.mesh.getBoundingInfo().boundingBox.minimum.y * this.mesh.scaling.y,
      (item.position.z + ((depth - 1) * this.grid.metresPerCell) / 2) * 100,
    );
    this.mesh.rotation.y = (item.rotation * Math.PI) / 2;
  }

  public dispose(): void {
    this.debug.dispose();
    this.mesh.dispose();
    this.material?.dispose();
  }
}
