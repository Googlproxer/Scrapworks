# Protagonist: Babylon built-in material tests

12 November 2026. **The user approved I and requested application to the game with graphics quality controls.** The runtime now reuses [this editable shader source](feathered-cell.ts) at half-width 0.025. The [H/I/J comparison](band-softening.md) preserves the refinement and the [implementation record](../../../docs/plans/stylized-rendering-and-quality.md) describes integration/verification. The source model, mesh, skin weights and texture artwork remain unchanged. Other objects are undergoing separate asset updates; the protagonist is the acceptance benchmark.

The [rendering research/quality proposal](../../../docs/plans/stylized-rendering-and-quality.md) supplies the context. The [protagonist finish concept](../../concepts/m10-2026-11-12/assets/protagonist-finish.png) is the broad style target, without requiring a pixel-perfect match. Character identity, mesh, UVs and skin weights remain those of the [runtime v3 asset](../../characters/Protag/v3/runtime/README.md); its provenance and attribution remain unchanged.

The 13 November [layered-terrain/KayKit pass](../../world/kaykit-forest-v1/README.md) also reuses this lighting function for untextured ground/scatter materials. A null texture selects native untextured StandardMaterial handling. Terrain-specific procedural colour and diffuse headroom remain in its separate binding; the approved protagonist parameters are unchanged.

## Review outputs

The local report contains [the full review gallery](../../../docs/reports/rendering/2026-11-12/protagonist-builtins/index.html), [close comparison](../../../docs/reports/rendering/2026-11-12/protagonist-builtins/comparison-close.png), [overhead comparison](../../../docs/reports/rendering/2026-11-12/protagonist-builtins/comparison-overhead.png) and [capture manifest](../../../docs/reports/rendering/2026-11-12/protagonist-builtins/manifest.json). Reports are intentionally ignored and can be regenerated from this tracked source.

43 Chromium renders cover seven variants, front/three-quarter/back, the 6 m and 12 m overhead cameras, Cell shadow on/off and frozen Walk/Run poses. Two additional Firefox captures accompany four focused material compatibility checks. These are real Babylon WebGL renders, not AI-generated approximations or Blender material previews. The overhead fixture uses a plain two-metre grid and scale blocks, not the authored game world.

| ID | Candidate | Lighting/material differences |
| --- | --- | --- |
| A | Current configuration | Original imported PBR, hemispheric light only, no shadows. |
| B | Original PBR with sun | Original base/normal/metallic-roughness textures, common sun/fill and PCF shadows. |
| C | Matte PBR | Base image retained; bump/metallic/ambient texture channels removed, metalness/specular zero, roughness one. |
| D | Diffuse StandardMaterial | Original base image, black specular, common sun/fill. |
| E | Stock CellMaterial, five-level | `computeHighLevel = true`, common sun/fill. |
| F | Stock CellMaterial, basic | `computeHighLevel = false`, common sun/fill. Diagnostic only; the installed WebGL shader's missing assignment is retained. |
| G | Stock CellMaterial, softer fill | Same five-level shader as E; sunlight 0.85, warm fill 0.75, more lifted ground fill and shadow darkness 0.25. |

B–F share sunlight intensity 1 and cool fill intensity 0.3. Shadows use one 2048 PCF map with medium filtering. A separate sun/fill change is intentional for G and explicitly recorded; it is not a material-only comparison. The concept's lighter painted finish motivated that iteration.

## Initial comparison findings and limits

- G was the closest stock candidate to the intended broad, warm painted finish. E kept deeper contrast and C was smoother. The user then selected I's narrow blending of G's levels for production; the original stock comparison remains historical evidence.
- Stock CellMaterial produces visible hard/irregular bands on rounded skin and detailed geometry. Judge face/arm detail in the full-size front and three-quarter views, then decide how much matters at overhead scale. No bespoke ramp, shader patch, geometry faceting, outline or post-process colour filter was used to hide that behaviour.
- Directly reusing the glTF PBR texture's sRGB GPU upload in Standard/Cell made the first exploratory renders artificially dark. The delivered comparison extracts the **exact embedded WebP bytes** and re-uploads them without hardware sRGB decoding for those material families. UV transforms, orientation and texture artwork are retained. Original PBR keeps its original loader/material path. This follows the material colour-space distinction described in [Babylon's colour-space guide](https://babylonjs.medium.com/how-to-take-control-of-color-space-in-babylon-js-4e13c50bf948); the local manifest records the image hash and upload policy.
- Full-mesh checks retain 104,972 triangles, eight skin influences and a 2048-square base image. Idle, Walk and Run are paused at specified phases; no locomotion or turn policy was changed. Captures wait for visible and shadow shader compilation and render browser frames before taking screenshots.
- The capture run reported no page/console/material compilation errors. Chromium used SwiftShader WebGL 2; Firefox reported an AMD/ANGLE WebGL 2 renderer. These images and compatibility checks establish **no performance tier or target-hardware frame-time qualification**.
- Shadow-off samples retain the surface lighting. This fixture toggles rendering for comparison and keeps its resources allocated for subsequent samples; it is not the production quality-settings implementation, which must actually release/skip disabled feature resources.

## Reproduce locally

The editable [fixture](fixture.ts) and [presets/types](presets.ts) use installed Babylon 9.35.0 APIs/materials. The [TypeScript capture tool](../../../tools/art/render-protagonist-materials.ts) bundles them into an ignored local report, opens a loopback-only server, captures actual Playwright canvases and assembles labelled sheets without changing the rendered image content.

```powershell
node node_modules/typescript/bin/tsc -p art/shaders/protagonist-builtins/tsconfig.json
node node_modules/typescript/bin/tsc -p tools/tsconfig.json
node tools/art/render-protagonist-materials.ts
```

Use `--serve` to keep the local gallery server available after capture. If the Playwright browser cache is redirected, set `PLAYWRIGHT_BROWSERS_PATH` to the existing cache. No browser downloads, production build, Editor export or CI change is required. Keep this manually invoked and local. `manifest.json` records source/GLB/texture/shader hashes, exact cameras, lighting, browser backends and individual image integrity.
