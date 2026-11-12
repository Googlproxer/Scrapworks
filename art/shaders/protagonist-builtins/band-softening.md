# Narrow blending between Cell lighting levels

12 November 2026. The user judged G very close, requested slightly blended levels while retaining clear steps, then **approved I and requested integration with graphics settings**. The protagonist now uses the same editable source at 0.025 half-width in the game. See the [production implementation record](../../../docs/plans/stylized-rendering-and-quality.md). The source model/texture artwork are unchanged, and other objects' materials remain in their separate asset update work.

## Visual review

[Gallery](../../../docs/reports/rendering/2026-11-12/protagonist-builtins/band-softening/index.html) · [detail comparison](../../../docs/reports/rendering/2026-11-12/protagonist-builtins/band-softening/comparison-detail.png) · [full-body comparison](../../../docs/reports/rendering/2026-11-12/protagonist-builtins/band-softening/comparison-close.png) · [manifest](../../../docs/reports/rendering/2026-11-12/protagonist-builtins/band-softening/manifest.json).

| Candidate | Transition half-width | Purpose |
| --- | --- | --- |
| G | Hard stock thresholds | Unchanged reference, including its warm fill and cast-shadow settings. |
| H | 0.01 | Very narrow feathering of each edge. |
| I | 0.025 | Proposed balance: softer edges with clear flat areas between levels. |
| J | 0.05 | Wider comparison, still retaining stepped shading. |

Widths are in normal/light dot-product units, not percentages of pixels or global image blur. The comparison retains G's mesh, original base-colour bytes, UVs, light directions/intensities/colours, camera, frozen pose, tone values and shadows. 27 Chromium renders cover the four visual candidates, front/three-quarter/back and 6/12 m overhead views, a zero-width control, plus I with shadows off and Walk/Run phases. Focused Firefox checks cover the reference, zero-width control and blended material.

I is the approved selection. H and J remain comparison references. The face, shoulder, forearm and tank-top folds in the detail sheet establish the chosen softness; judge future changes again at gameplay scale.

## Implementation and validation

Stock CellMaterial has fixed lighting levels and no blend-width parameter. The [small lighting extension](feathered-cell.ts) uses Babylon's existing [CustomMaterial](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/materials/src/custom/customMaterial.ts) so native material skinning, textures, shadow binding and fog remain available. It replaces the five-level diffuse calculation, leaving normal/vertex processing and shadow depth rendering with Babylon. The original CellMaterial and installed packages are unmodified.

The original thresholds are `0.03, 0.2, 0.5, 0.95`, with tone multipliers `0.2, 0.35, 0.6, 0.8, 1.0`. Each threshold now has a narrow [smoothstep](https://github.com/KhronosGroup/OpenGL-Refpages/blob/main/gl4/smoothstep.xml) transition. Between those regions, the original tone multipliers remain intact. An explicit zero-width branch restores the hard comparisons. Specular lighting stays zero, matching G.

Where screen derivatives are available, positive widths also receive a half-pixel antialiasing floor from `0.5 * fwidth(NdotL)`, capped at 0.075 so neighbouring transition regions remain separated. The uniform blend still works without derivative support. The delivered compatibility checks use WebGL 2; other backends are not qualified here. This softens lighting edges without blurring the base texture or silhouette.

The CustomMaterial zero-width control matched stock G **pixel-for-pixel** in the front, three-quarter and near-overhead Chromium captures: mean absolute RGB error zero in all three. This checks that adopting the material extension did not change the starting palette or lighting. Captures also verify the complete 104,972-triangle mesh, eight skin influences and 2048-square base image; successful Chromium/Firefox runs recorded no material/page/console errors.

The blend width is an art-direction parameter and stays fixed across graphics presets. The integrated dialog controls shadows and render resolution independently. Ambient occlusion remains deferred. These visual experiments establish no performance-tier claim.

The adapted lighting levels originate in Babylon.js 9.35.0 CellMaterial. [Apache-2.0 licence text](LICENSE.babylon.md), attribution and modification notes accompany the editable source. Original character provenance remains in the [runtime asset record](../../characters/Protag/v3/runtime/README.md).

```powershell
node tools/art/render-protagonist-materials.ts --bands
```

Add `--serve` to retain the local gallery server. The fixture and tooling strict TypeScript checks from the [original experiment guide](README.md#reproduce-locally) also cover this extension. Image reports remain ignored/local; the manifest records shader/source/image hashes and the zero-width comparison.
