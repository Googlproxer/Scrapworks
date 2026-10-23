import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';

export default class FitMenuLogo {
  private readonly designAspect = 16 / 9;
  private baseScale: Vector3 | null = null;

  public constructor(public mesh: Mesh) {}

  public onStart(): void {
    // Remember the scale you authored in the Editor.
    this.baseScale = this.mesh.scaling.clone();
    this.onUpdate();
  }

  public onUpdate(): void {
    if (!this.baseScale) return;

    const scene = this.mesh.getScene();
    const camera = scene.activeCamera;
    if (!camera) return;

    const aspect = scene.getEngine().getAspectRatio(camera);
    if (!Number.isFinite(aspect) || aspect <= 0) return;

    // Narrower screens shrink the logo; wider screens keep its size.
    const factor = Math.min(1, aspect / this.designAspect);

    this.mesh.scaling.copyFrom(this.baseScale).scaleInPlace(factor);
  }

  public onStop(): void {
    // Restore the authored scale when stopping Editor Play.
    if (this.baseScale) {
      this.mesh.scaling.copyFrom(this.baseScale);
      this.baseScale = null;
    }
  }
}
