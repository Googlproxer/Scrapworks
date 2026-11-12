import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { WorldDefinition } from '@contracts/world';
import { kaykitScatter } from '../../../../art/world/kaykit-forest-v1/runtime/meshes';
import { featheredCell } from '../../../../art/shaders/protagonist-builtins/feathered-cell';
import {
  cornerHealth,
  createTerrainScatter,
  scatterFits,
  type ScatterCandidate,
} from './terrain-layout';
import { terrainMaterial } from './terrain-material';

interface ScatterBatch {
  readonly mesh: Mesh;
  readonly model: number;
  readonly candidates: ScatterCandidate[];
  readonly matrices: Float32Array;
  readonly colours: Float32Array;
}

/** Scene-owned terrain and chunked thin instances; simulation and authored layout stay authoritative. */
export class LayeredTerrain {
  public readonly ground: Mesh;
  public readonly water: Mesh;
  private readonly groundMaterial;
  private readonly waterMaterial: StandardMaterial;
  private readonly scatterMaterials;
  private readonly batches: ScatterBatch[];
  private readonly authoredGround;
  private readonly authoredGroundVisible: boolean;
  private readonly landCells: number[] = [];
  private readonly waterCells: number[] = [];
  private readonly landColours: number[] = [];
  private readonly waterColours: number[] = [];
  private disposed = false;

  public constructor(
    node: TransformNode,
    private readonly definition: WorldDefinition,
  ) {
    const scene = node.getScene();
    this.authoredGround = scene.getMeshByName('ground');
    this.authoredGroundVisible = this.authoredGround?.isVisible ?? false;
    this.ground = new Mesh('environment-cells', scene);
    this.water = new Mesh('environment-water', scene);
    this.groundMaterial = terrainMaterial(scene, definition);
    this.waterMaterial = new StandardMaterial('environment-water-colour', scene);
    this.waterMaterial.specularColor = Color3.Black();
    this.waterMaterial.backFaceCulling = false;
    this.ground.material = this.groundMaterial;
    this.water.material = this.waterMaterial;
    for (const mesh of [this.ground, this.water]) {
      mesh.parent = node;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
    }
    this.makeSurface(this.ground, false);
    this.makeSurface(this.water, true);
    this.scatterMaterials = {
      rock: featheredCell(
        'kaykit-stone-painted',
        scene,
        null,
        Color3.FromHexString('#737772'),
        0.025,
        true,
      ),
      grass: featheredCell(
        'kaykit-grass-painted',
        scene,
        null,
        Color3.FromHexString('#67763b'),
        0.025,
        true,
      ),
      shrub: featheredCell(
        'kaykit-shrub-painted',
        scene,
        null,
        Color3.FromHexString('#606e35'),
        0.025,
        true,
      ),
    };
    // Folded opaque leaf meshes have no alpha cards; light their two visible sides.
    this.scatterMaterials.grass.backFaceCulling = false;
    this.scatterMaterials.grass.twoSidedLighting = true;
    this.batches = this.makeScatter(node, scene);
    // The authored grid plane remains the explicit selection-ray target, but
    // must not draw through the replacement terrain or compete for depth.
    if (this.authoredGround) this.authoredGround.isVisible = false;
  }

  private makeSurface(mesh: Mesh, water: boolean): void {
    const data = new VertexData(),
      positions: number[] = [],
      indices: number[] = [],
      normals: number[] = [];
    const colours = water ? this.waterColours : this.landColours;
    const cells = water ? this.waterCells : this.landCells;
    const grid = this.definition.grid,
      size = grid.metresPerCell * 100;
    for (let i = 0; i < this.definition.terrain.length; i++) {
      if ((this.definition.terrain[i] === 'water') !== water) continue;
      const x = (grid.origin.x + (i % grid.columns) * grid.metresPerCell) * 100;
      const z = (grid.origin.z + Math.floor(i / grid.columns) * grid.metresPerCell) * 100;
      const at = positions.length / 3;
      positions.push(x, 0.25, z, x + size, 0.25, z, x + size, 0.25, z + size, x, 0.25, z + size);
      indices.push(at, at + 2, at + 1, at, at + 3, at + 2);
      for (let vertex = 0; vertex < 4; vertex++) {
        normals.push(0, 1, 0);
        colours.push(0, 1, 1, 1);
      }
      cells.push(i);
    }
    if (!positions.length) {
      mesh.setEnabled(false);
      return;
    }
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.colors = colours;
    data.applyToMesh(mesh, true);
  }

  private makeScatter(node: TransformNode, scene: Scene): ScatterBatch[] {
    const groups = new Map<string, ScatterCandidate[]>();
    for (const candidate of createTerrainScatter(this.definition)) {
      const key = `${candidate.chunk}:${candidate.model}`;
      const group = groups.get(key) ?? [];
      group.push(candidate);
      groups.set(key, group);
    }
    return [...groups.entries()].map(([key, candidates]) => {
      const model = candidates[0].model,
        source = kaykitScatter[model];
      const mesh = new Mesh(`environment-scatter:${key}`, scene);
      mesh.parent = node;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      mesh.metadata = {
        environmentScatter: true,
        kind: source.kind,
        source: source.id,
        chunk: candidates[0].chunk,
      };
      const data = new VertexData();
      data.positions = source.positions.map((value) => value * 100);
      data.normals = [...source.normals];
      data.indices = [...source.indices];
      data.applyToMesh(mesh);
      mesh.material = this.scatterMaterials[source.kind];
      const slots =
        candidates.length * (source.kind === 'shrub' ? 3 : source.kind === 'grass' ? 4 : 1);
      const matrices = new Float32Array(slots * 16),
        colours = new Float32Array(slots * 4);
      mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
      mesh.thinInstanceSetBuffer('color', colours, 4, false);
      mesh.setEnabled(false);
      return { mesh, model, candidates, matrices, colours };
    });
  }

  public update(health: readonly number[], blocked: ReadonlySet<number>): void {
    if (this.disposed) return;
    const grid = this.definition.grid;
    for (const [at, cell] of this.landCells.entries()) {
      const column = cell % grid.columns,
        row = Math.floor(cell / grid.columns);
      for (const [corner, [dx, dz]] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].entries())
        this.landColours[at * 16 + corner * 4] = cornerHealth(
          grid,
          this.definition.terrain,
          health,
          column + dx,
          row + dz,
        );
    }
    if (this.landCells.length)
      this.ground.updateVerticesData(VertexBuffer.ColorKind, this.landColours);
    for (const [at, cell] of this.waterCells.entries()) {
      const h = (health[cell] ?? 0) / 100;
      for (let corner = 0; corner < 4; corner++) {
        const offset = at * 16 + corner * 4;
        this.waterColours[offset] = 0.23 - h * 0.07;
        this.waterColours[offset + 1] = 0.27 + h * 0.21;
        this.waterColours[offset + 2] = 0.19 + h * 0.45;
      }
    }
    if (this.waterCells.length)
      this.water.updateVerticesData(VertexBuffer.ColorKind, this.waterColours);
    for (const batch of this.batches) {
      const source = kaykitScatter[batch.model];
      let count = 0;
      for (const candidate of batch.candidates) {
        const h = (health[candidate.cell] ?? 0) / 100;
        const growth =
          source.kind === 'rock' ? 1 : Math.max(0, Math.min(1, (h - candidate.rank) / 0.18));
        if (growth < 0.01 || !scatterFits(candidate, this.definition, blocked)) continue;
        const parts = source.kind === 'shrub' ? 3 : source.kind === 'grass' ? 4 : 1;
        for (let lobe = 0; lobe < parts; lobe++) {
          const yaw = candidate.yaw + (source.kind === 'grass' ? lobe * 1.71 : 0);
          const c = Math.cos(yaw),
            s = Math.sin(yaw);
          const part =
            source.kind === 'shrub'
              ? lobe === 0
                ? 0.72
                : 0.58
              : source.kind === 'grass'
                ? 0.72
                : 1;
          const side =
            source.kind === 'grass'
              ? candidate.width * 0.08 * growth
              : lobe === 0
                ? 0
                : (lobe === 1 ? -0.22 : 0.22) * candidate.width * growth;
          const sx = (candidate.width / Math.max(source.width, source.depth)) * growth * part;
          const sy =
            (candidate.height / source.height) *
            growth *
            (lobe === 0 ? 1 : source.kind === 'grass' ? 0.68 + lobe * 0.07 : 0.66);
          batch.matrices.set(
            [
              c * sx,
              0,
              -s * sx,
              0,
              0,
              sy,
              0,
              0,
              s * sx,
              0,
              c * sx,
              0,
              (candidate.x + c * side) * 100,
              source.kind === 'rock' ? -0.6 : 0.3,
              (candidate.z - s * side) * 100,
              1,
            ],
            count * 16,
          );
          const tint = (0.88 + candidate.tint * 0.23) * (1 + lobe * 0.035);
          batch.colours.set(
            [tint * (source.kind !== 'rock' && h < 0.4 ? 1.14 : 1), tint, tint * 0.96, 1],
            count * 4,
          );
          count++;
        }
      }
      batch.mesh.thinInstanceCount = count;
      batch.mesh.setEnabled(count > 0);
      if (count) {
        batch.mesh.thinInstanceBufferUpdated('matrix');
        batch.mesh.thinInstanceBufferUpdated('color');
        batch.mesh.thinInstanceRefreshBoundingInfo();
      }
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.authoredGround && !this.authoredGround.isDisposed())
      this.authoredGround.isVisible = this.authoredGroundVisible;
    for (const batch of this.batches) batch.mesh.dispose();
    this.ground.dispose();
    this.water.dispose();
    this.groundMaterial.dispose();
    this.waterMaterial.dispose();
    for (const material of Object.values(this.scatterMaterials)) material.dispose();
  }
}
