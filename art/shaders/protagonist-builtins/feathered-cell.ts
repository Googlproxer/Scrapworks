/**
 * @license Apache-2.0
 * Lighting levels adapted from Babylon.js CellMaterial, Babylon.js contributors.
 * Source: @babylonjs/materials 9.35.0, cell/cell.fragment.js.
 * Modification: narrow smoothstep transitions between the original five levels.
 * See LICENSE.babylon.md and README.md. Approved I uses half-width 0.025.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Scene } from '@babylonjs/core/scene';
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';

/** CustomMaterial registers unique shader sources; release those with their owner. */
class OwnedCellMaterial extends CustomMaterial {
  private released = false;
  public override dispose(_forceDisposeEffect = true, forceDisposeTextures = false): void {
    if (this.released) return;
    this.released = true;
    const shaderName = this._createdShaderName;
    super.dispose(true, forceDisposeTextures);
    delete ShaderStore.ShadersStore[shaderName + 'VertexShader'];
    delete ShaderStore.ShadersStore[shaderName + 'PixelShader'];
  }
}

/** Keep native StandardMaterial bones, fog, textures and shadow integration. */
export function featheredCell(
  name: string,
  scene: Scene,
  texture: BaseTexture | null,
  colour: Color3,
  halfWidth: number,
  backFaceCulling: boolean,
): CustomMaterial {
  if (!Number.isFinite(halfWidth) || halfWidth < 0 || halfWidth > 0.05)
    throw new Error('Band half-width must be between 0 and 0.05');
  const material = new OwnedCellMaterial(name, scene);
  material.diffuseTexture = texture;
  material.diffuseColor = colour.clone();
  material.specularColor = Color3.Black();
  material.backFaceCulling = backFaceCulling;
  const derivatives = scene.getEngine().getCaps().standardDerivatives;
  if (derivatives)
    material.FragmentShader = `#if __VERSION__ < 300
#extension GL_OES_standard_derivatives : enable
#endif
#define SW_BAND_DERIVATIVES
${material.FragmentShader}`;
  material.AddUniform('swBandHalfWidth', 'float', halfWidth);
  material.Fragment_Begin('#define NDOTL\n#define CUSTOMUSERLIGHTING');
  material.Fragment_Definitions(`
float swBandEdge(float threshold, float value) {
    // Width zero is an explicit control against the original stock material.
    if (swBandHalfWidth <= 0.0) return value > threshold ? 1.0 : 0.0;
    // At least a pixel of coverage softens crawling edges at gameplay scale.
    // Limit the transition so flat areas remain between neighbouring bands.
    float pixelHalfWidth = 0.0;
#ifdef SW_BAND_DERIVATIVES
    pixelHalfWidth = 0.5 * fwidth(value);
#endif
    float halfWidth = min(0.075, max(swBandHalfWidth, pixelHalfWidth));
    return smoothstep(threshold - halfWidth, threshold + halfWidth, value);
}
vec3 computeCustomDiffuseLighting(lightingInfo info, vec3 diffuseBase, float shadow) {
    // Original thresholds .03/.2/.5/.95 and levels .2/.35/.6/.8/1.0.
    float level = 0.2;
    level += 0.15 * swBandEdge(0.03, info.ndl);
    level += 0.25 * swBandEdge(0.2, info.ndl);
    level += 0.2 * swBandEdge(0.5, info.ndl);
    level += 0.2 * swBandEdge(0.95, info.ndl);
    return max(info.diffuse * shadow * level, vec3(0.2));
}
#ifdef SPECULARTERM
vec3 computeCustomSpecularLighting(lightingInfo info, vec3 specularBase, float shadow) {
    return vec3(0.0);
}
#endif
`);
  return material;
}
