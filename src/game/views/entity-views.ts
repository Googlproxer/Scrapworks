import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { WorldDefinition, WorldView } from '@contracts/world';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PresentationBehavior } from '../lifecycle/presentation-behavior';
import { EntityView } from './entity-view';
import type { WorldFrame } from './world-frame';
import { PhysicsBodyViews } from './physics-body-views';

export class EntityViews extends PresentationBehavior {
  private readonly entities = new Map<string, EntityView>();
  private publication = -1;
  private generation = -1;
  private readonly ground = new Map<string, Mesh>();
  private groundMaterial?: StandardMaterial;
  private groundViews: WorldView['ground'];
  private readonly physics: PhysicsBodyViews;

  public constructor(
    node: TransformNode,
    private readonly definition: WorldDefinition,
    private readonly frame: WorldFrame,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'EntityViews');
    this.physics = new PhysicsBodyViews(this.scene);
    for (const name of ['obstacle', 'player-placeholder'])
      this.scene.getMeshByName(name)?.setEnabled(false);
    this.sync({ deposits: definition.deposits, buildings: [] });
  }

  public values(): IterableIterator<EntityView> {
    return this.entities.values();
  }

  protected override onUpdate(): void {
    const view = this.frame.view;
    if (!view) return;
    if (
      view.publication !== undefined &&
      view.publication === this.publication &&
      view.worldGeneration === this.generation
    ) {
      this.physics.present(
        this.frame.presentationActive ? this.frame.seconds : 0,
        view.stepSeconds,
      );
      return;
    }
    // Several worker replies can update the cache before the next render frame.
    const reset =
      this.publication < 0 ||
      this.generation !== (view.worldGeneration ?? -1) ||
      (view.publication !== undefined && view.publication !== this.publication + 1);
    this.publication = view.publication ?? -1;
    this.generation = view.worldGeneration ?? -1;
    this.syncGround(view);
    this.physics.sync(view, reset || !view.changes || view.changes.full);
    this.physics.present(this.frame.presentationActive ? this.frame.seconds : 0, view.stepSeconds);
    if (reset || !view.changes || view.changes.full) {
      this.sync(view);
      return;
    }
    for (const id of view.changes.removedIds) {
      this.entities.get(id)?.dispose();
      this.entities.delete(id);
    }
    for (const [items, template, building] of [
      [view.changes.deposits ?? [], this.scene.getMeshByName('player-placeholder'), false],
      [view.changes.buildings ?? [], null, true],
    ] as const)
      for (const item of items) {
        const entity = this.entities.get(item.id);
        if (entity) entity.sync(item);
        else
          this.entities.set(
            item.id,
            new EntityView(this.scene, item, building, this.definition.grid, template),
          );
      }
  }

  public sync(view: Pick<WorldView, 'deposits' | 'buildings'>): void {
    const ids = new Set<string>();
    for (const [items, template, building] of [
      [this.definition.blockers, this.scene.getMeshByName('obstacle'), false],
      [view.deposits, this.scene.getMeshByName('player-placeholder'), false],
      [view.buildings, null, true],
    ] as const) {
      for (const item of items) {
        ids.add(item.id);
        const entity = this.entities.get(item.id);
        if (entity) entity.sync(item);
        else
          this.entities.set(
            item.id,
            new EntityView(this.scene, item, building, this.definition.grid, template),
          );
      }
    }
    for (const [id, entity] of this.entities)
      if (!ids.has(id)) {
        entity.dispose();
        this.entities.delete(id);
      }
  }

  protected override onDestroy(): void {
    this.physics.dispose();
    for (const entity of this.entities.values()) entity.dispose();
    this.entities.clear();
    for (const mesh of this.ground.values()) mesh.dispose();
    this.ground.clear();
    this.groundMaterial?.dispose();
  }

  private syncGround(view: WorldView): void {
    if (view.ground === this.groundViews) return;
    this.groundViews = view.ground;
    const ids = new Set<string>();
    for (const item of view.ground ?? []) {
      ids.add(item.id);
      let mesh = this.ground.get(item.id);
      if (!mesh) {
        this.groundMaterial ??= new StandardMaterial('ground-item-material', this.scene);
        this.groundMaterial.diffuseColor = new Color3(0.75, 0.57, 0.2);
        mesh = MeshBuilder.CreateBox(
          `ground:${item.id}`,
          { width: 35, height: 20, depth: 35 },
          this.scene,
        );
        mesh.material = this.groundMaterial;
        mesh.metadata = { worldEntity: item.id };
        mesh.isPickable = true;
        this.ground.set(item.id, mesh);
      }
      mesh.position.set(item.position.x * 100, item.position.y * 100 + 10, item.position.z * 100);
    }
    for (const [id, mesh] of this.ground)
      if (!ids.has(id)) {
        mesh.dispose();
        this.ground.delete(id);
      }
  }
}
