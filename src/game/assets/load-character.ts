import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '../../scene-registrations';
import type { Scene } from '@babylonjs/core/scene';
import type { CharacterSource } from '../startup-resources';

export type CharacterLoader = (
  scene: Scene,
  onProgress?: (value: number) => void,
  source?: CharacterSource,
) => Promise<AssetContainer>;

export const loadCharacter: CharacterLoader = (scene, onProgress, source) =>
  LoadAssetContainerAsync(
    source?.bytes.slice() ??
      new URL(
        'assets/models/protagonist-v3.glb',
        scene.getEngine().getRenderingCanvas()!.ownerDocument.baseURI,
      ).href,
    scene,
    {
      // Approved Cell lighting expects gamma-encoded texture samples, not a
      // hardware-decoded sRGB buffer. The GLB/image bytes remain unchanged.
      pluginOptions: { gltf: { useSRGBBuffers: false } },
      ...(source ? { rootUrl: source.rootUrl, name: source.name, pluginExtension: '.glb' } : {}),
      onProgress: (event) => {
        if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
      },
    },
  );
