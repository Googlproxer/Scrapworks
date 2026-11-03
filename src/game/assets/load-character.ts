import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '../../scene-registrations';
import type { Scene } from '@babylonjs/core/scene';

export type CharacterLoader = (
  scene: Scene,
  onProgress?: (value: number) => void,
) => Promise<AssetContainer>;

export const loadCharacter: CharacterLoader = (scene, onProgress) =>
  LoadAssetContainerAsync(
    new URL(
      'assets/models/protagonist-v3.glb',
      scene.getEngine().getRenderingCanvas()!.ownerDocument.baseURI,
    ).href,
    scene,
    {
      onProgress: (event) => {
        if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
      },
    },
  );
