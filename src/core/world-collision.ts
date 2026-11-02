import type {
  CollisionShape,
  GridDefinition,
  WorldEntityDefinition,
  WorldPosition,
} from '@contracts/world';

export type WorldCollider = CollisionShape & { readonly center: WorldPosition };

/** Shared by authoritative movement and its debug drawing; never reads renderer geometry. */
export function entityCollider(grid: GridDefinition, entity: WorldEntityDefinition): WorldCollider {
  const rotated = entity.rotation % 2 !== 0;
  const width = (rotated ? entity.footprint.depth : entity.footprint.width) * grid.metresPerCell;
  const depth = (rotated ? entity.footprint.width : entity.footprint.depth) * grid.metresPerCell;
  const shape = entity.collision ?? { shape: 'box', width, depth, height: 1.2 };
  const center = {
    x: entity.position.x + (width - grid.metresPerCell) / 2,
    y: entity.position.y + shape.height / 2,
    z: entity.position.z + (depth - grid.metresPerCell) / 2,
  };
  return shape.shape === 'cylinder'
    ? { ...shape, center }
    : {
        ...shape,
        center,
        width: entity.collision && rotated ? shape.depth : shape.width,
        depth: entity.collision && rotated ? shape.width : shape.depth,
      };
}
