import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { PhysicsBodyView } from '@contracts/physics';
import type { WorldView } from '@contracts/world';
import { attachDebugDraw } from '../debug/draw/debug-draw';
import type { DebugAttachment } from '../debug/draw/types';

interface BodyPresentation {
  readonly signature: string;
  readonly mesh: Mesh;
  readonly material: StandardMaterial;
  readonly debug: DebugAttachment;
  previous: Vector3;
  target: Vector3;
  previousRotation: Quaternion;
  targetRotation: Quaternion;
  interpolation: number;
}

/** Scene resources and interpolation only. No physics engine or simulation handles. */
export class PhysicsBodyViews {
  private readonly bodies = new Map<string, BodyPresentation>();
  private readonly interpolating = new Set<BodyPresentation>();
  private readonly scene: Scene;

  public constructor(scene: Scene) {
    this.scene = scene;
  }

  public sync(view: Pick<WorldView, 'bodies' | 'changes'>, full: boolean): void {
    if (full) {
      const ids = new Set(view.bodies?.map((body) => body.id));
      for (const id of this.bodies.keys()) if (!ids.has(id)) this.remove(id);
    } else for (const id of view.changes?.removedIds ?? []) this.remove(id);
    for (const body of (full ? view.bodies : view.changes?.bodies) ?? []) this.update(body);
  }

  private update(body: PhysicsBodyView): void {
    const target = new Vector3(body.position.x * 100, body.position.y * 100, body.position.z * 100);
    const rotation = new Quaternion(
      body.rotation.x,
      body.rotation.y,
      body.rotation.z,
      body.rotation.w,
    );
    let record = this.bodies.get(body.id);
    const signature = JSON.stringify([body.collision, body.motion]);
    if (record && record.signature !== signature) {
      this.remove(body.id);
      record = undefined;
    }
    if (!record) {
      const shape = body.collision;
      const mesh =
        shape.shape === 'box'
          ? MeshBuilder.CreateBox(
              `physics:${body.id}`,
              { width: shape.width * 100, height: shape.height * 100, depth: shape.depth * 100 },
              this.scene,
            )
          : MeshBuilder.CreateCylinder(
              `physics:${body.id}`,
              { height: shape.height * 100, diameter: shape.radius * 200, tessellation: 24 },
              this.scene,
            );
      const material = new StandardMaterial(`physics:${body.id}:material`, this.scene);
      material.diffuseColor =
        body.motion === 'kinematic' ? new Color3(0.17, 0.55, 0.7) : new Color3(0.68, 0.38, 0.13);
      material.specularColor = Color3.Black();
      mesh.material = material;
      mesh.metadata = { worldEntity: body.id };
      mesh.position.copyFrom(target);
      mesh.rotationQuaternion = rotation.clone();
      const debug = attachDebugDraw(mesh, { category: 'collision' }, (draw) => {
        if (shape.shape === 'box')
          draw.box('bounds', {
            dimensions: { x: shape.width, y: shape.height, z: shape.depth },
            color: '#ff9900',
          });
        else {
          draw.circle('top', {
            center: { x: 0, y: shape.height / 2, z: 0 },
            radius: shape.radius,
            color: '#ff9900',
          });
          draw.circle('bottom', {
            center: { x: 0, y: -shape.height / 2, z: 0 },
            radius: shape.radius,
            color: '#ff9900',
          });
          for (const [index, x, z] of [
            [0, shape.radius, 0],
            [1, -shape.radius, 0],
            [2, 0, shape.radius],
            [3, 0, -shape.radius],
          ] as const)
            draw.line(`side:${index}`, {
              start: { x, y: -shape.height / 2, z },
              end: { x, y: shape.height / 2, z },
              color: '#ff9900',
            });
        }
      });
      record = {
        signature,
        mesh,
        material,
        debug,
        previous: target.clone(),
        target,
        previousRotation: rotation.clone(),
        targetRotation: rotation,
        interpolation: 1,
      };
      this.bodies.set(body.id, record);
      return;
    }
    if (record.target.equals(target) && record.targetRotation.equals(rotation)) return;
    record.previous.copyFrom(record.mesh.position);
    record.previousRotation.copyFrom(record.mesh.rotationQuaternion!);
    record.target.copyFrom(target);
    record.targetRotation.copyFrom(rotation);
    record.interpolation = 0;
    this.interpolating.add(record);
  }

  public present(seconds: number, stepSeconds: number): void {
    if (seconds <= 0) return;
    for (const record of this.interpolating) {
      record.interpolation = Math.min(1, record.interpolation + Math.max(0, seconds) / stepSeconds);
      Vector3.LerpToRef(record.previous, record.target, record.interpolation, record.mesh.position);
      Quaternion.SlerpToRef(
        record.previousRotation,
        record.targetRotation,
        record.interpolation,
        record.mesh.rotationQuaternion!,
      );
      if (record.interpolation === 1) this.interpolating.delete(record);
    }
  }

  private remove(id: string): void {
    const record = this.bodies.get(id);
    if (!record) return;
    this.interpolating.delete(record);
    record.debug.dispose();
    record.mesh.dispose();
    record.material.dispose();
    this.bodies.delete(id);
  }

  public dispose(): void {
    for (const id of this.bodies.keys()) this.remove(id);
  }
}
