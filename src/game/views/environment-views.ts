import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { WorldDefinition } from '@contracts/world';
import type { WorldFrame } from './world-frame';
import { cellCenter } from '@core/world-grid';
import { PresentationBehavior } from '../lifecycle/presentation-behavior';

/** Original code-authored prototype ecology. Geometry never changes collision or simulation. */
export class EnvironmentViews extends PresentationBehavior {
  private readonly terrain: Mesh;
  private readonly vegetation: Mesh;
  private readonly soil: StandardMaterial;
  private readonly plants: StandardMaterial;
  private waterLines?: LinesMesh;
  private signature = '';
  private linesKey = '';

  public constructor(
    node: TransformNode,
    private readonly definition: WorldDefinition,
    private readonly frame: WorldFrame,
  ) {
    super(node, node.getScene(), frame.scriptOptions, 'EnvironmentViews');
    this.terrain = new Mesh('environment-cells', this.scene);
    this.terrain.parent = node;
    this.terrain.isPickable = false;
    this.vegetation = new Mesh('environment-vegetation', this.scene);
    this.vegetation.parent = node;
    this.vegetation.isPickable = false;
    this.soil = new StandardMaterial('environment-soil', this.scene);
    this.soil.specularColor = Color3.Black();
    this.soil.backFaceCulling = false;
    this.terrain.material = this.soil;
    this.plants = new StandardMaterial('environment-plants', this.scene);
    this.plants.diffuseColor = Color3.FromHexString('#568c45');
    this.plants.specularColor = Color3.Black();
    this.plants.backFaceCulling = false;
    this.vegetation.material = this.plants;
    this.draw(
      definition.terrain.map(() => 0),
      new Set(),
    );
  }

  private draw(health: readonly number[], occupied: ReadonlySet<number>): void {
    const ground = new VertexData(),
      plants = new VertexData();
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [],
      normals: number[] = [];
    const stems: number[] = [],
      stemIndices: number[] = [],
      stemNormals: number[] = [];
    const size = this.definition.grid.metresPerCell * 100;
    for (let i = 0; i < health.length; i++) {
      const cell = {
          column: i % this.definition.grid.columns,
          row: Math.floor(i / this.definition.grid.columns),
        },
        centre = cellCenter(this.definition.grid, cell),
        x = centre.x * 100,
        z = centre.z * 100;
      const h = health[i] / 100,
        water = this.definition.terrain[i] === 'water';
      const dry = water ? new Color3(0.23, 0.27, 0.19) : new Color3(0.47, 0.37, 0.27),
        healthy = water ? new Color3(0.16, 0.48, 0.64) : new Color3(0.36, 0.55, 0.27),
        colour = Color3.Lerp(dry, healthy, h);
      const at = positions.length / 3;
      positions.push(
        x - size / 2,
        0.25,
        z - size / 2,
        x + size / 2,
        0.25,
        z - size / 2,
        x + size / 2,
        0.25,
        z + size / 2,
        x - size / 2,
        0.25,
        z + size / 2,
      );
      for (let vertex = 0; vertex < 4; vertex++) {
        colors.push(colour.r, colour.g, colour.b, 1);
        normals.push(0, 1, 0);
      }
      indices.push(at, at + 2, at + 1, at, at + 3, at + 2);
      if (!water && h > 0.25 && !occupied.has(i)) {
        const stem = stems.length / 3,
          height = (h - 0.25) * 50;
        stems.push(
          x - 15,
          2,
          z,
          x,
          2 + height,
          z,
          x + 15,
          2,
          z,
          x,
          2,
          z - 15,
          x,
          2 + height,
          z,
          x,
          2,
          z + 15,
        );
        stemIndices.push(stem, stem + 1, stem + 2, stem + 3, stem + 4, stem + 5);
        for (let vertex = 0; vertex < 6; vertex++) stemNormals.push(0, 1, 0);
      }
    }
    ground.positions = positions;
    ground.indices = indices;
    ground.colors = colors;
    ground.normals = normals;
    ground.applyToMesh(this.terrain, true);
    plants.positions = stems.length ? stems : [0, -100, 0, 0, -100, 0, 0, -100, 0];
    plants.indices = stems.length ? stemIndices : [0, 1, 2];
    plants.normals = stems.length ? stemNormals : [0, 1, 0, 0, 1, 0, 0, 1, 0];
    plants.applyToMesh(this.vegetation, true);
  }

  protected override onUpdate(): void {
    const view = this.frame.view,
      environment = view?.factory?.environment;
    if (!view || !environment) return;
    const occupied = new Set(
      view.buildings.map((b) => b.cell.row * this.definition.grid.columns + b.cell.column),
    );
    const signature = JSON.stringify([environment.health, [...occupied].sort((a, b) => a - b)]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.draw(environment.health, occupied);
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
        this.waterLines.parent = this.terrain.parent;
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
    this.terrain.dispose();
    this.vegetation.dispose();
    this.soil.dispose();
    this.plants.dispose();
    this.scene.fogMode = Scene.FOGMODE_NONE;
  }
}
