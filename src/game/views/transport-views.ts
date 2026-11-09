import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { BuildingView, WorldView } from '@contracts/world';
import type { MaterialPort } from '@contracts/transport';
import { lanePort, materialPorts, portDirection, TRANSPORT_SETTINGS } from '@content/transport';

const endpoint = (b: BuildingView, port: MaterialPort, radius = 100) => {
  const d = portDirection(b, port);
  return new Vector3(
    b.position.x * 100 + d.column * radius,
    35,
    b.position.z * 100 + d.row * radius,
  );
};

interface ArrowView {
  readonly mesh: LinesMesh;
  readonly start: Vector3;
  readonly end: Vector3;
}

const activeColor = Color3.FromHexString('#9ee1ce');
const waitingColor = Color3.FromHexString('#f4c46f');

/** Bounded projections only. Mesh slots never own or modify logical material. */
export class TransportViews {
  private readonly units = new Map<string, Mesh>();
  private readonly arrows = new Map<string, ArrowView>();
  private readonly waiting = new Map<string, LinesMesh>();
  private readonly materials = new Map<string, StandardMaterial>();

  public constructor(private readonly scene: Scene) {}

  public sync(view: WorldView): void {
    const transport = view.factory?.transport,
      buildings = new Map(view.buildings.map((b) => [b.id, b]));
    const ids = new Set<string>();
    for (const segment of transport?.segments ?? []) {
      const b = buildings.get(segment.id);
      if (!b) continue;
      if (b.buildingId === 'conveyor') {
        const outlet = this.scene.getMeshByName(`${segment.id}:output-port-front`);
        const port = materialPorts('conveyor', segment.turn).output[0],
          direction = portDirection({ rotation: 0 }, port);
        if (outlet) {
          outlet.position.set(direction.column * 65, 0, direction.row * 65);
          outlet.rotation.y = direction.column ? Math.PI / 2 : 0;
        }
      }
      for (let i = 0; i < segment.units.length; i++) {
        const u = segment.units[i],
          id = `${segment.id}:${i}`;
        ids.add(id);
        let mesh = this.units.get(id);
        if (!mesh) {
          mesh = MeshBuilder.CreateBox(
            `transit:${id}`,
            { width: 22, height: 14, depth: 22 },
            this.scene,
          );
          mesh.isPickable = false;
          this.units.set(id, mesh);
        }
        let material = this.materials.get(u.item);
        if (!material) {
          material = new StandardMaterial(`transit-material:${u.item}`, this.scene);
          material.diffuseColor = Color3.FromHexString(
            u.item === 'plate'
              ? '#adc1cd'
              : u.item === 'wire'
                ? '#e4ba65'
                : u.item === 'scrap'
                  ? '#d4a388'
                  : '#87c5ae',
          );
          material.specularColor = Color3.Black();
          this.materials.set(u.item, material);
        }
        mesh.material = material;
        const start = endpoint(b, 'back', 75),
          centre = new Vector3(
            b.position.x * 100,
            b.buildingId === 'sorter' ? 150 : 35,
            b.position.z * 100,
          ),
          port =
            b.buildingId === 'sorter'
              ? lanePort(u.lane)
              : materialPorts('conveyor', segment.turn).output[0],
          end = endpoint(b, port, 75);
        start.y = centre.y;
        end.y = centre.y;
        const progress = u.progress / TRANSPORT_SETTINGS.travelTicks;
        mesh.position.copyFrom(
          progress < 0.5
            ? Vector3.Lerp(start, centre, progress * 2)
            : Vector3.Lerp(centre, end, (progress - 0.5) * 2),
        );
        // Held units remain visibly countable without inventing physical spacing/collisions.
        mesh.position.y += Math.floor(i / 3) * 15;
        mesh.scaling.set(u.item === 'plate' ? 1.3 : 0.7, u.item === 'wire' ? 1.5 : 0.5, 1);
      }
    }
    for (const [id, mesh] of this.units)
      if (!ids.has(id)) {
        mesh.dispose();
        this.units.delete(id);
      }
    const arrowIds = new Set<string>(),
      segmentIds = new Set<string>();
    for (const edge of transport?.connections ?? []) {
      const a = buildings.get(edge.from),
        b = buildings.get(edge.to);
      if (a && b) {
        arrowIds.add(edge.id);
        this.syncArrow(edge.id, endpoint(a, edge.output, 60), endpoint(b, edge.input, 60));
      }
    }
    for (const segment of transport?.segments ?? []) {
      const b = buildings.get(segment.id);
      if (!b) continue;
      segmentIds.add(segment.id);
      const blocked = ['blocked', 'disconnected', 'incompatible'].includes(segment.status);
      let marker = this.waiting.get(segment.id);
      if (blocked && !marker) {
        marker = MeshBuilder.CreateLineSystem(
          `transport-waiting:${segment.id}`,
          {
            lines: [
              [new Vector3(-18, 0, -18), new Vector3(18, 0, 18)],
              [new Vector3(-18, 0, 18), new Vector3(18, 0, -18)],
            ],
          },
          this.scene,
        );
        marker.color.copyFrom(waitingColor);
        marker.isPickable = false;
        this.waiting.set(segment.id, marker);
      }
      if (marker) {
        marker.position.set(
          b.position.x * 100,
          b.buildingId === 'sorter' ? 180 : 80,
          b.position.z * 100,
        );
        marker.setEnabled(blocked);
      }
      for (const port of materialPorts(b.buildingId, segment.turn).output) {
        const id = `${segment.id}:${port}`;
        arrowIds.add(id);
        this.syncArrow(
          id,
          new Vector3(b.position.x * 100, b.buildingId === 'sorter' ? 155 : 55, b.position.z * 100),
          endpoint(b, port, 80).add(new Vector3(0, b.buildingId === 'sorter' ? 120 : 20, 0)),
          blocked,
        );
      }
    }
    for (const [id, arrow] of this.arrows)
      if (!arrowIds.has(id)) {
        arrow.mesh.dispose();
        this.arrows.delete(id);
      }
    for (const [id, marker] of this.waiting)
      if (!segmentIds.has(id)) {
        marker.dispose();
        this.waiting.delete(id);
      }
  }

  private syncArrow(id: string, start: Vector3, end: Vector3, blocked = false): void {
    let arrow = this.arrows.get(id);
    // Status changes only affect colour; upload vertices only when an endpoint changes.
    if (!arrow || !arrow.start.equals(start) || !arrow.end.equals(end)) {
      const direction = end.subtract(start).normalize(),
        side = new Vector3(direction.z, 0, -direction.x),
        tip = end.subtract(direction.scale(18));
      const mesh = MeshBuilder.CreateLines(
        `material:${id}`,
        {
          points: [start, end, tip.add(side.scale(12)), end, tip.subtract(side.scale(12))],
          updatable: true,
          instance: arrow?.mesh,
        },
        this.scene,
      );
      mesh.isPickable = false;
      arrow = { mesh, start, end };
      this.arrows.set(id, arrow);
    }
    arrow.mesh.color.copyFrom(blocked ? waitingColor : activeColor);
  }

  public dispose(): void {
    for (const mesh of this.units.values()) mesh.dispose();
    for (const arrow of this.arrows.values()) arrow.mesh.dispose();
    for (const marker of this.waiting.values()) marker.dispose();
    this.units.clear();
    this.arrows.clear();
    this.waiting.clear();
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
  }
}
