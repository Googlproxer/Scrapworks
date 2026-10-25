import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import type { Scene } from '@babylonjs/core/scene';

export type CharacterLoader = (scene: Scene) => Promise<AssetContainer>;

export const loadCharacter: CharacterLoader = (scene) =>
  LoadAssetContainerAsync(
    new URL(
      'assets/models/protagonist-v2.glb',
      scene.getEngine().getRenderingCanvas()!.ownerDocument.baseURI,
    ).href,
    scene,
  );
