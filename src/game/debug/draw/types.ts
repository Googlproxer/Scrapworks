import type { Node } from '@babylonjs/core/node';
import type { Scene } from '@babylonjs/core/scene';
import type { DebugDrawSettings, DebugDrawStatus } from '@contracts/debug-draw';
import type { WorldView } from '@contracts/world';

export interface DebugPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DebugStyle {
  readonly color?: string;
  readonly opacity?: number;
}

export interface DebugLine extends DebugStyle {
  readonly start: DebugPoint;
  readonly end: DebugPoint;
}

export interface DebugRay extends DebugStyle {
  readonly origin?: DebugPoint;
  readonly direction: DebugPoint;
  readonly length: number;
}

export interface DebugCircle extends DebugStyle {
  readonly center?: DebugPoint;
  readonly radius: number;
  readonly plane?: 'xz' | 'xy' | 'yz';
}

export interface DebugSphere extends DebugStyle {
  readonly center?: DebugPoint;
  readonly radius: number;
}

export interface DebugBox extends DebugStyle {
  readonly center?: DebugPoint;
  readonly dimensions: DebugPoint;
}

export interface DebugAxes extends DebugStyle {
  readonly origin?: DebugPoint;
  readonly length: number;
}

export interface DebugDrawWriter {
  line(id: string, options: DebugLine): void;
  ray(id: string, options: DebugRay): void;
  arrow(id: string, options: DebugRay): void;
  circle(id: string, options: DebugCircle): void;
  sphere(id: string, options: DebugSphere): void;
  box(id: string, options: DebugBox): void;
  axes(id: string, options: DebugAxes): void;
}

export interface DebugAttachmentOptions {
  readonly category?: string;
  readonly enabled?: boolean;
  readonly space?: 'local' | 'world';
  readonly depthTest?: boolean;
}

export interface DebugAttachment {
  setEnabled(enabled: boolean): void;
  clear(id?: string): void;
  dispose(): void;
}

export type DebugDrawCallback = (draw: DebugDrawWriter) => void;

export interface SceneDebugDraw {
  attach(
    owner: Node,
    options: DebugAttachmentOptions,
    callback: DebugDrawCallback,
  ): DebugAttachment;
  configure(settings: DebugDrawSettings, isCurrent: () => boolean): void;
  bindWorld(source: () => WorldView | undefined): void;
  subscribe(listener: (status: DebugDrawStatus) => void): () => void;
  dispose(): void;
}

export type DebugDrawFactory = (scene: Scene) => SceneDebugDraw;
