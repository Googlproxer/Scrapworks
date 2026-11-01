import type { Node } from '@babylonjs/core/node';
import type { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { attachDebugDraw } from '../debug-draw';
import type { DebugAttachment, DebugDrawWriter } from '../types';

/** Lifecycle shared by adapters; decorated metadata belongs to each concrete class. */
export abstract class DebugShapeScript {
  public abstract enabled: boolean;
  public abstract category: string;
  public abstract worldSpace: boolean;
  public abstract depthTest: boolean;
  public abstract color: Color3;
  public abstract opacity: number;
  public abstract offset: Vector3;
  private attachment?: DebugAttachment;

  public constructor(protected readonly node: Node) {}

  public onStart(): void {
    this.onStop();
    this.attachment = attachDebugDraw(
      this.node,
      {
        category: this.category,
        space: this.worldSpace ? 'world' : 'local',
        depthTest: this.depthTest,
      },
      (draw) => {
        if (this.enabled) this.draw(draw);
      },
    );
  }

  public onStop(): void {
    this.attachment?.dispose();
    this.attachment = undefined;
  }

  protected get style() {
    return { color: this.color.toHexString(), opacity: this.opacity };
  }

  protected abstract draw(draw: DebugDrawWriter): void;
}
