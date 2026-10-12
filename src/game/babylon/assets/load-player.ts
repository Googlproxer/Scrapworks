import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { Scene } from '@babylonjs/core/scene';
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic';

registerBuiltInLoaders();

export function loadPlayer(scene: Scene) {
  return LoadAssetContainerAsync('/assets/models/Protag-v1.glb', scene);
}
