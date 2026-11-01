import type { Node } from '@babylonjs/core/node';
import type { Scene } from '@babylonjs/core/scene';
import { createDebugDraw } from './backend';
import type { DebugAttachmentOptions, DebugDrawCallback, SceneDebugDraw } from './types';

const managers = new WeakMap<Scene, SceneDebugDraw>();

/** One scene owner shared by runtime bindings and Editor presentation scripts. */
export function debugDrawForScene(scene: Scene): SceneDebugDraw {
  let manager = managers.get(scene);
  if (!manager) {
    manager = createDebugDraw(scene);
    managers.set(scene, manager);
  }
  return manager;
}

export function attachDebugDraw(
  owner: Node,
  options: DebugAttachmentOptions,
  callback: DebugDrawCallback,
) {
  return debugDrawForScene(owner.getScene()).attach(owner, options, callback);
}

export type { DebugAttachment, DebugAttachmentOptions, DebugDrawWriter } from './types';
