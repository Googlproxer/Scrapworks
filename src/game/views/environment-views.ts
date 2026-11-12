import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { WorldDefinition, WorldView } from '@contracts/world';
import type { WorldFrame } from './world-frame';
import { circleOverlapsCell } from '@core/world-grid';
import { PresentationBehavior } from '../lifecycle/presentation-behavior';
import { LayeredTerrain } from '../rendering/terrain/layered-terrain';
import { terrainBlockedCells } from '../rendering/terrain/terrain-layout';

/** Presentation only: layered land and CC0 scatter, retaining the existing water/fog rules. */
export class EnvironmentViews extends PresentationBehavior {
  private readonly surface: LayeredTerrain;
  private waterLines?: LinesMesh;
  private signature = '';
  private linesKey = '';
  private publication = -1;
  private generation = -1;

  public constructor(
    node: TransformNode,
    private readonly definition: WorldDefinition,
    private readonly frame: WorldFrame,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'EnvironmentViews');
    this.surface = new LayeredTerrain(node, definition);
    this.surface.update(
      definition.terrain.map(() => 0),
      this.blocked(),
    );
  }

  private blocked(view?: WorldView): Set<number> {
    const definition = this.definition,
      grid = definition.grid;
    const occupied = terrainBlockedCells(definition, [
      ...definition.blockers,
      ...(view?.deposits ?? definition.deposits),
      ...(view?.buildings ?? []),
    ]);
    for (const body of view?.bodies ?? definition.bodies ?? []) {
      const shape = body.collision;
      const radius =
        shape.shape === 'cylinder' ? shape.radius : Math.hypot(shape.width, shape.depth) / 2;
      const firstX = Math.max(
        0,
        Math.floor((body.position.x - radius - grid.origin.x) / grid.metresPerCell),
      );
      const lastX = Math.min(
        grid.columns - 1,
        Math.floor((body.position.x + radius - grid.origin.x) / grid.metresPerCell),
      );
      const firstZ = Math.max(
        0,
        Math.floor((body.position.z - radius - grid.origin.z) / grid.metresPerCell),
      );
      const lastZ = Math.min(
        grid.rows - 1,
        Math.floor((body.position.z + radius - grid.origin.z) / grid.metresPerCell),
      );
      for (let row = firstZ; row <= lastZ; row++)
        for (let column = firstX; column <= lastX; column++)
          if (circleOverlapsCell(grid, body.position, radius, { row, column }))
            occupied.add(row * grid.columns + column);
    }
    return occupied;
  }

  protected override onUpdate(): void {
    const view = this.frame.view,
      environment = view?.factory?.environment;
    if (!view || !environment) return;
    if (
      view.publication !== undefined &&
      view.publication === this.publication &&
      (view.worldGeneration ?? -1) === this.generation
    )
      return;
    this.publication = view.publication ?? -1;
    this.generation = view.worldGeneration ?? -1;
    const occupied = this.blocked(view);
    const signature = JSON.stringify([environment.health, [...occupied].sort((a, b) => a - b)]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.surface.update(environment.health, occupied);
    }
    const linesKey = JSON.stringify(environment.connections);
    if (linesKey !== this.linesKey) {
      this.linesKey = linesKey;
      this.waterLines?.dispose();
      this.waterLines = undefined;
      const lines = environment.connections.flatMap((edge) => {
        const a = view.buildings.find((b) => b.id === edge.from),
          b = view.buildings.find((b) => b.id === edge.to);
        return a && b
          ? [
              [
                new Vector3(a.position.x * 100, 35, a.position.z * 100),
                new Vector3(b.position.x * 100, 35, b.position.z * 100),
              ],
            ]
          : [];
      });
      if (lines.length) {
        this.waterLines = MeshBuilder.CreateLineSystem('water-connections', { lines }, this.scene);
        this.waterLines.parent = this.surface.ground.parent;
        this.waterLines.color = Color3.FromHexString('#72cde0');
        this.waterLines.isPickable = false;
      }
    }
    const health = environment.average / 100;
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity =
      0.000018 * (1 - health) + (environment.weather.kind === 'rain' ? 0.000018 : 0);
    this.scene.fogColor = Color3.Lerp(
      new Color3(0.52, 0.45, 0.34),
      new Color3(0.62, 0.74, 0.77),
      health,
    );
  }

  protected override onDestroy(): void {
    this.waterLines?.dispose();
    this.surface.dispose();
    this.scene.fogMode = Scene.FOGMODE_NONE;
  }
}
