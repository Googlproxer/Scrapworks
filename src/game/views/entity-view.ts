import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { WorldEntityDefinition } from '@contracts/world';

/** A scene resource owner, identified by a detached simulation entity ID. */
export class EntityView {
  public readonly mesh: AbstractMesh;
  private readonly material?: StandardMaterial;

  public constructor(
    scene: Scene,
    item: WorldEntityDefinition,
    building: boolean,
    template?: AbstractMesh | null,
  ) {
    this.mesh = building
      ? MeshBuilder.CreateBox(
          `entity:${item.id}`,
          {
            width: item.footprint.width * 200,
            height: 120,
            depth: item.footprint.depth * 200,
          },
          scene,
        )
      : (template?.clone(`entity:${item.id}`, null) ??
        MeshBuilder.CreateBox(`entity:${item.id}`, { size: 150 }, scene));
    if (building) {
      this.material = new StandardMaterial(`building:${item.id}`, scene);
      this.material.diffuseColor = new Color3(0.22, 0.29, 0.3);
      this.material.specularColor = Color3.Black();
      this.mesh.material = this.material;
    }
    this.mesh.metadata = { worldEntity: item.id };
    this.mesh.isPickable = true;
    this.mesh.setEnabled(true);
    this.sync(item, building);
  }

  public sync(item: WorldEntityDefinition, building: boolean): void {
    const width = item.rotation % 2 ? item.footprint.depth : item.footprint.width;
    const depth = item.rotation % 2 ? item.footprint.width : item.footprint.depth;
    this.mesh.position.set(
      item.position.x * 100 + (building ? (width - 1) * 100 : 0),
      building ? 60 : 75,
      item.position.z * 100 + (building ? (depth - 1) * 100 : 0),
    );
    this.mesh.rotation.y = building ? (item.rotation * Math.PI) / 2 : 0;
  }

  public dispose(): void {
    this.mesh.dispose();
    this.material?.dispose();
  }
}
