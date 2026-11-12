import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { CustomMaterial } from '@babylonjs/materials/custom/customMaterial';
import { featheredCell } from '../../../art/shaders/protagonist-builtins/feathered-cell';

/** Reuses the exact approved art source. World materials are a separate asset pass. */
export function applyProtagonistMaterial(character: AssetContainer): void {
  const converted = new Map<PBRMaterial, CustomMaterial>();
  for (const mesh of character.meshes) {
    const original = mesh.material;
    if (!(original instanceof PBRMaterial) || !original.albedoTexture) continue;
    let material = converted.get(original);
    if (!material) {
      material = featheredCell(
        'protagonist-painted-I',
        character.scene,
        original.albedoTexture,
        original.albedoColor,
        0.025,
        original.backFaceCulling,
      );
      material.alpha = original.alpha;
      material.useAlphaFromDiffuseTexture = original.useAlphaFromAlbedoTexture;
      converted.set(original, material);
      // PlayerView's container owns disposal alongside the mesh/skeleton/textures.
      character.materials.push(material);
    }
    mesh.material = material;
  }
}
