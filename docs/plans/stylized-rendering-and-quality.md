# Stylised rendering and graphics quality

Researched and implemented 12 November 2026 against Babylon.js 9.35.0. **The user approved I's protagonist finish and requested integration with graphics quality controls.** The protagonist is the acceptance benchmark; other objects are being updated separately. Research preceded implementation as requested.

**Initial evaluation:** the [editable comparison fixture and findings](../../art/shaders/protagonist-builtins/README.md) preserve 43 Chromium views plus Firefox checks of matte PBR, StandardMaterial and stock CellMaterial. G's softer-fill five-level Cell was the closest stock result. That first comparison did not change production rendering.

**Visual selection:** the user judged G very close, requested slightly blended levels, then selected I. The [H/I/J experiment](../../art/shaders/protagonist-builtins/band-softening.md) preserves the three transition widths and the zero-width control that matches stock G pixel-for-pixel in the tested views.

The [art direction](../art/README.md#camera-and-painted-finish), [asset audit](../art/runtime-asset-decisions.md) and [gameplay/asset concepts](../../art/concepts/m10-2026-11-12/README.md) supply the target: broad painted colours, a small number of shadow tones, restrained highlights and clear silhouettes. The concept images are references, not evidence that a particular shader will reproduce them.

## Recommendation

Use **I's five-level Cell appearance with 0.025 half-width blending**. The runtime reuses the editable CustomMaterial extension and retains G's warm fill and sun. Babylon's Node Material Editor remains an alternative if future world-material requirements justify it. No external shader package was added.

Use one directional sunlight plus weak hemispheric fill. Add Babylon's standard shadow generator as a separate quality-controlled feature. Keep the painted surface lighting on every preset, including when cast shadows are disabled. Ambient occlusion, outlines, bloom, realistic reflections and extra render passes are not prerequisites for the style.

## Production integration

- [Protagonist material binding](../../src/game/rendering/protagonist-material.ts) reuses the [approved editable shader](../../art/shaders/protagonist-builtins/feathered-cell.ts). The existing GLB/images, full 104,972-triangle mesh, UVs, 65 joints and eight skin influences are retained. [Character loading](../../src/game/assets/load-character.ts) disables the glTF hardware-sRGB buffer for this gamma-sampling material; no image repaint, extra texture extraction/download or model export is needed. The unused source PBR channels remain in the asset/container.
- The active Editor Game scene owns G's directional sun and warm hemispheric fill. [WorldRendering](../../src/game/rendering/world-rendering.ts) binds presentation and owns quality-dependent shadows, registering new entity/physics/character meshes and removing disposed meshes. Transparent feedback, wires and helpers are excluded from solid casting. Existing world-object materials are unchanged; the shared light and optional shadows affect them normally.
- The directional shadow projection follows the protagonist, expands with camera zoom and fades near its edge. Positions, the 1.2 cm normal bias and 100 m camera far plane respect the Editor centimetre boundary. The separate depth bias is dimensionless (`0.0004`), not a metre value. One map is used; no CSM, AO, bloom, outline or reflection pipeline was added.
- Graphics is available from the main controls and pause menu. [The Signal Forms dialog](../../src/app/features/graphics/graphics-settings/graphics-settings.component.ts) has Apply/Restore defaults/Close, labelled native selects, CDK focus restoration and reserved status space. Its explicit CDK dialog name avoids the bundled Firefox audit engine's crash while traversing an `aria-labelledby` accessible-name reference; the dialog remains named Graphics.
- [Graphics preferences](../../src/app/features/graphics/graphics-settings.service.ts) use a validated version-1 `graphics` record in `ScrapworksSettings.preferences`, independently of `controls` and gameplay saves. Serialised writes and revision guards retain the latest request. Failed/malformed storage leaves usable settings and a visible message. Requested quality is retained when device texture limits require a lower effective shadow level.
- [BabylonGameClient](../../src/game/babylon-game-client.ts) applies only the canvas hardware scale and presentation settings. Preferences are reapplied for renderer retry and staged scene commits. They do not rebuild or alter simulation state, saves, movement or gameplay rules. Disabling shadows disposes their render target/generator; the authored grid's independent TileMaskTexture remains. Changes to render resolution retain the same shadow resource when its quality is unchanged.
- The character container owns the custom material. Its unique shader source registrations/effects are released on disposal; the scene owner releases shadow resources and mesh-observer subscriptions before its meshes. Native lifecycle ordering remains on the existing render loop.

| Preset | Shadow quality | 3D resolution |
| --- | --- | --- |
| Low | Off | 75% |
| Medium (default) | Medium, 1024 map | 100% |
| High | High, 2048 map | 100% |
| Custom | Off / Low 512 / Medium 1024 / High 2048 | 50 / 75 / 100% |

PCF is used on WebGL 2, with Poisson filtering as the WebGL 1 fallback. Low uses lower filtering quality; Medium/High preserve the approved medium PCF filter with different map resolutions. The shader finish stays fixed at I, including with shadows off. Resolution is relative to the CSS-sized 3D canvas; Angular text/controls remain at normal browser resolution. These configurations are user controls, not qualified hardware performance tiers.

Production evidence is local in the [game/dialog captures and report](../reports/rendering/2026-11-12/production-I/). The manually invoked [browser check](../../tests/acceptance/graphics-browser.ts) covers the actual build in Chromium/Firefox: material/skin/texture settings, map disposal, render buffer size, one render loop, menu access, stable controls, focus, desktop/mobile axe and reload persistence. Focused tests cover preference validation/fallbacks, IndexedDB ownership/write order, Signal Forms/axe/layout and native scene/shadow lifecycles. Production build and lint are also required. No gameplay playthrough, performance route or new job was added to CI.

## Audited baseline before integration

| Area | Current implementation | Consequence |
| --- | --- | --- |
| Engine | [WebGL Engine](../../src/game/babylon-game-client.ts), antialias requested at creation; installed core/materials 9.35.0 | Evaluate on the existing backend; no WebGPU migration is required. |
| Lighting | One authored hemispheric light in [Game scene](../../assets/game.scene/lights/light.json) | Its `shadowEnabled` flag does not create a shadow generator; a directional key light is needed for the proposed sun shadows. |
| Opaque world | [Entity materials](../../src/game/views/entity-view.ts) and [environment materials](../../src/game/views/environment-views.ts) use StandardMaterial, with black specular response | Reuse existing palette data; terrain health vertex colours and vegetation's double-sided presentation must survive. |
| Protagonist | [GLB asset loading](../../src/game/assets/load-character.ts) retains imported PBR materials | Test material conversion explicitly: preserve base colour/alpha, UVs, animation and up to eight skin influences. Keep the complete mesh and character identity. |
| Camera | Authored radius 12 m, runtime range 6–24 m; authored far plane is 1,000,000 cm = 10 km | Fit the far plane to the actual visible world before testing depth effects or cascaded shadows. Validate all zoom/pitch extremes. |
| Settings | [Control settings](../../src/app/features/controls/control-settings.service.ts) already persist local preferences; no graphics settings layer exists | Add a separate graphics preference schema and renderer handoff, independent of control bindings and gameplay saves. |

## Existing shader options researched

| Candidate | Fit and limitations | Decision |
| --- | --- | --- |
| [Babylon CellMaterial](https://doc.babylonjs.com/toolsAndResources/assetLibraries/materialsLibrary/cellShadingMat/) | Official, Apache-2.0, already installed in `@babylonjs/materials`. Offers diffuse colours/textures and two/five lighting levels. Local source includes bones, vertex colours, fog and shadows. Its fixed lighting thresholds/brightness may still produce more gradient shading than the art needs. | First existing shader to evaluate. Import the installed package, not a CDN. |
| [Babylon's official toon tutorial](https://forum.babylonjs.com/t/create-your-own-toon-shader-video-series/6295) using [NodeMaterial](https://doc.babylonjs.com/features/featuresDeepDive/materials/node_material/nodeMaterial) | Existing two-tone diffuse, highlight and rim-light examples; graph authoring gives control over tone colours and thresholds. The tutorial is historical, so revalidate its graph on 9.35.0. Skinning, terrain vertex colours, fog and shadow receiving must be wired deliberately. | Second comparison candidate; strongest route if stock CellMaterial cannot match the target. Retain an editable local graph rather than a runtime dependency on a remote snippet. |
| [babylon-mtoon-material](https://github.com/virtual-cast/babylon-mtoon-material) | MIT port with shade colours, rim/outline controls, bones and shadows. Its published compatibility table reaches Babylon 5.19; its README explicitly excludes vertex colours and prepass support. | Useful visual reference, unsuitable as an assumed drop-in for the whole Babylon 9.35 world. Do not add it without a separately justified port/compatibility effort. |
| [Babylon material plugins](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/materialPlugins/) | Supported extension mechanism for existing Standard/PBR materials; not a ready-made toon shader. Could retain native material features while changing selected lighting calculations. | Fallback if both existing approaches fail a concrete compatibility requirement. Quantising the final screen colour would also damage palette/texture detail; modify lighting rather than applying a global posterise filter. |

**Installed CellMaterial caveat:** in `node_modules/@babylonjs/materials/cell/cell.fragment.js`, the `CELLBASIC` branch evaluates `diffuseBase.rgb * vec3(level, level, level)` without assigning the result. The corresponding WGSL branch does assign it. This is a source-level finding, not a measured browser result. The installed default is also `computeHighLevel = false`, despite the documentation describing true as the default. Set the mode explicitly in the comparison; do not silently patch `node_modules` or promise that the two-tone path works. If selected, resolve through a verified upstream version or a documented, licensed project-owned derivative with focused validation.

## What produces the finish

- **Geometry normals:** hard edges can define machine/rock planes; retain deliberate smooth normals on skin and rounded forms. Flat normals alone do not supply two-tone lighting. Do not globally facet the protagonist.
- **Opaque surface lighting:** begin with a base tone and a tinted shade tone, with an optional third tone for legibility. Use a narrow antialiased band transition to reduce crawling edges. Suppress realistic gloss and excessive normal-map detail; preserve authored palette and identity. Tune sunlight/fill together so fill does not wash out the bands.
- **Cast shadows:** readable, lightly softened shapes under the character, machines and foliage. Treat received shadow as part of the same shade palette, avoiding repeated multiplication that makes it muddy or black. Keep sun direction fixed in world space while the camera rotates.
- **Terrain, water and glass:** horizontal ground needs authored colour/masks and coverage variation; a lighting ramp cannot create the concept's terrain shapes by itself. Water needs its own restrained colour/reflection-shape treatment. Greenhouse glass needs deliberate alpha handling. Neither requires screen-space reflections or refraction in the baseline.
- **Readability:** placement ghosts, outlines, connection markers and interactive highlights need explicit material rules. Preserve health/weather colour and fog transitions, port visibility and non-colour valid/blocked cues.

For custom vertex deformation or alpha rejection, check both the visible material and its shadow/depth pass. Babylon documents [ShadowDepthWrapper and a normal-bias limitation for wrapped NodeMaterials](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows#custom-shadow-map); test this when selecting the graph route. Standard skinning alone should use the engine's existing shadow support where it suffices. Animation, cutout foliage and any future wind deformation must cast matching silhouettes.

## Shadow strategy

Start with one tightly bounded [ShadowGenerator](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows). Register actual character, machine and scenery meshes as casters and appropriate ground/objects as receivers. Exclude placement ghosts, selection helpers, wires and transparent glass panes from solid casting by default; test alpha-cutout vegetation separately. Add/remove casters as buildings appear/disappear and dispose resources with their scene.

The authored map is compact (40 by 40 metres), so first measure a single map fitted to the relevant visible/casting region. Compare edge quality at maximum zoom and during camera motion. [Cascaded shadows](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows_csm/) are an optional later answer to insufficient coverage/resolution: they require directional light and WebGL 2, and add rendering cost. Do not enable four cascades as the baseline. Check thin geometry, acne, detached shadows and shimmering in the actual Editor centimetre scale; copied metre-scale bias values are not appropriate without conversion/testing.

## Original quality-control proposal

These are **starting configurations for measurement**, not qualified hardware promises. Keep art direction independent of preset.

| Preset | Painted materials and sun/fill | Real-time cast shadows | Screen-space ambient occlusion |
| --- | --- | --- | --- |
| Low | Same core style | Off | Off |
| Medium | Same core style | 1024 map; modest PCF filtering where supported | Off |
| High | Same core style | 2048 map; higher PCF quality; compare PCSS only if its cost/look is worthwhile | Off initially; enable a subtle option only after visual and performance qualification |
| Custom | Same core style | User selection | User selection |

Expose **real-time shadows: Off / Low / Medium / High**, with Low initially testing a 512 map. Also expose **3D render resolution: 50 / 75 / 100%**. Preset changes can reset those controls; an individual adjustment changes the preset to Custom. A later qualified AO option must have an independent Off switch. Simple contact shading/blob grounding can be evaluated as a cheaper fallback; expose it separately if retained so users can disable it too.

Keep Angular text and controls at their normal CSS resolution; scale only the world render buffer. Retain the current engine antialiasing for the first comparison. Decide on a user-facing AA control after checking the actual post-process stack: constructor/context MSAA cannot be treated as an arbitrary live toggle, while FXAA is a separate post-process. Avoid stacking AA methods without a demonstrated benefit.

Persist validated/versioned graphics preferences separately from saves. Distinguish requested from effective quality when device capabilities require a fallback, and show that fallback without overwriting the user's preference. Do not infer a performance tier solely from a GPU name or silently change quality during play. Start from a conservative preset until target hardware is measured.

Turning a feature Off must release/skip its render targets and passes, not merely reduce its visible strength. Apply settings as one coherent renderer update, with guarded resource recreation and full scene-retry/disposal coverage. A graphics change must not rebuild simulation state, alter world health/time, reset the camera or discard an in-progress session. Reserve settings status/help space so controls remain anchored.

## Implementation and acceptance sequence

1. **Local comparison:** use the same camera, palette and representative fixture for current rendering, stock CellMaterial and the existing node-based toon approach. Include the animated protagonist, a machine with rounded/hard planes, terrain at damaged/healthy states, vegetation, water/glass and placement/connection feedback. Capture matching views with cast shadows off/on at normal and maximum zoom. Assess colours in a consistent linear/gamma workflow. Select a material only after reviewing these results.
2. **Production integration:** author the directional light in the active Editor scene; add one scene-owned presentation/rendering controller at the [WorldScene](../../src/game/views/world-scene.ts) lifecycle boundary. Centralise reusable material families and shadow registration rather than scattering engine settings through simulation or individual scripts. Retain editable shader/graph sources and exact licence/provenance under root `art/`, runtime bindings in the renderer, and regenerate scene exports through the existing workflow.
3. **Graphics preferences:** implement the separate settings schema, renderer connection and accessible Angular controls. Test capability fallbacks, malformed preferences, live Off/on changes, construction/dismantling, animated casters, load/retry and disposal without leaking render targets or observers. Verify keyboard/focus behaviour and stable UI layout.
4. **Qualification:** compare Low/Medium/High on local normal and dense factory fixtures in Chromium and Firefox, recording effective render size, backend, GPU/device, draw calls, memory and comparable frame-time percentiles. Check camera motion, band/shadow aliasing, character animation, ports, fog, water/glass and narrow viewports. Use the existing [final qualification gates](portfolio-assets-and-final-qualification.md), including measurement limits; do not claim physical-GPU performance from software rendering. All gameplay/performance runs remain local and manually invoked. CI may cover focused settings/resource-lifecycle/fixture checks, never full or virtual gameplay playthroughs.

The approved protagonist finish and graphics controls are integrated. This does not complete the user's ongoing world-object assets, broader world-material qualification or M10 final performance/readability qualification. Those remain open until the remaining assets settle; no milestone/tracker completion or public deployment is claimed.
