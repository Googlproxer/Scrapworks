import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { WorldDefinition, WorldView } from '@contracts/world';
import { GameplayScript } from '../toolkit/gameplay-script';
import { EntityView } from './entity-view';
import type { WorldFrame } from './world-frame';

export class EntityViews extends GameplayScript {
  private readonly entities = new Map<string, EntityView>();
  private publication = -1;
  private generation = -1;
  public constructor(
    node: TransformNode,
    private readonly definition: WorldDefinition,
    private readonly frame: WorldFrame,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'EntityViews');
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
    )
      return;
    this.publication = view.publication ?? -1;
    this.generation = view.worldGeneration ?? -1;
    if (!view.changes || view.changes.full) {
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
        if (entity) entity.sync(item, building);
        else this.entities.set(item.id, new EntityView(this.scene, item, building, template));
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
        if (entity) entity.sync(item, building);
        else this.entities.set(item.id, new EntityView(this.scene, item, building, template));
      }
    }
    for (const [id, entity] of this.entities)
      if (!ids.has(id)) {
        entity.dispose();
        this.entities.delete(id);
      }
  }

  protected override onDestroy(): void {
    for (const entity of this.entities.values()) entity.dispose();
    this.entities.clear();
  }
}
