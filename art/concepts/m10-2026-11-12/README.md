# M10 visual concepts

Created 12 November 2026 from the [runtime asset audit](../../../docs/art/runtime-asset-decisions.md). This is a first-pass image-only review set: **four gameplay concepts and 32 individual asset/group sheets**. The gameplay images carry a visible `CONCEPT ART` label. They are proposed views of the art direction, not captures of implemented geometry or shaders.

The user subsequently approved the favicon concept and requested immediate application. Its [transparent source and runtime preparation](../../branding/favicon.json) are now delivered separately; the remaining concepts still await review/implementation.

Open the [review gallery](index.html) for every full-size image, or use the [gameplay overview](gameplay-overview.png), [machinery overview](machinery-overview.png) and [world/feedback/prop overview](world-overview.png). Original PNGs stay in `gameplay/` and `assets/`; smaller WebP previews make the gallery quicker to browse.

## Finish and shader ownership

The user clarified that the flat finish requires **renderer/shader work as well as 3D assets**. These images are a shared target for geometry, textures, stylised lighting, material response and shaders. Replacing meshes or painting textures alone will not produce this result. This clarification is also recorded in the authoritative [Art Document](../../../docs/art/README.md#camera-and-painted-finish) and project memory.

Use broad base/shadow planes, restrained highlights, readable working cavities and a coherent cream/navy/blue-steel/coral palette. Terrain and foliage remain quieter than the protagonist and working equipment. Restoration changes ground coverage, low plants, water clarity and shape cues; it does not automatically upgrade machine technology.

The current protagonist's identity, clothing, body proportions and full geometry remain the implementation constraint. Her character sheet proposes surface/grounding treatment, not a replacement model, polygon reduction or new action clips.

## Gameplay concepts

| Image | Review focus |
| --- | --- |
| [Damaged opening](gameplay/01-opening.png) | Empty-handed opening; recognizable scrap, rock, physical props, damaged soil and compact selection brackets. |
| [Working factory on damaged ground](gameplay/02-factory.png) | Compact machinery, functional silhouettes, open hoppers, readable transport and attached power leads on damaged ground. |
| [Restored waterworks](gameplay/03-restored-waterworks.png) | Pitched greenhouse frames, visible planting beds, low restored vegetation, bank/reflection planes and a distinct shore return. |
| [Recovery, construction and blocked transport](gameplay/04-construction.png) | Independent ecological recovery, readable placement ghost/check, blocked transport X and power leads routed around a landmark. |

The source camera/layout comes from the actual audit screenshots and accepted HUD concept; the generated compositions remain approximate. The factory sources are prepared visual fixtures, not evidence of earned progress. Existing HUD functions are illustrated in the accepted cream/navy/coral direction; no UI integration is delivered here.

## All 19 placeable kinds

| Concept | File |
| --- | --- |
| Solar panel | [Individual sheet](assets/solar-panel.png) |
| Wind turbine | [Individual sheet](assets/wind-turbine.png) |
| Mixed-output recycler | [Individual sheet](assets/recycler.png) |
| Basic Fabricator | [Individual sheet](assets/basic-fabricator.png) |
| Medium Fabricator | [Individual sheet](assets/medium-fabricator.png) |
| Scrap extractor | [Individual sheet](assets/extractor.png) |
| Laboratory | [Individual sheet](assets/laboratory.png) |
| Grid battery | [Individual sheet](assets/battery.png) |
| Coal generator | [Individual sheet](assets/coal-generator.png) |
| Air scrubber | [Individual sheet](assets/air-scrubber.png) |
| Greenhouse | [Individual sheet](assets/greenhouse.png) |
| Water pump | [Individual sheet](assets/water-pump.png) |
| Pipe | [Individual sheet](assets/pipe.png) |
| Pipe junction | [Individual sheet](assets/pipe-junction.png) |
| Water treatment | [Individual sheet](assets/water-treatment.png) |
| Water tank | [Individual sheet](assets/water-tank.png) |
| Water return | [Individual sheet](assets/water-return.png) |
| Conveyor | [Individual sheet](assets/conveyor.png) |
| Sorter | [Individual sheet](assets/sorter.png) |

## Environment, character, feedback, props and branding

| Concept | File |
| --- | --- |
| Protagonist finish and grounding | [Individual sheet](assets/protagonist-finish.png) |
| Terrain and recovery | [Individual sheet](assets/terrain.png) |
| Water and shoreline | [Individual sheet](assets/water.png) |
| Grass and low shrubs | [Individual sheet](assets/vegetation.png) |
| Mixed scrap deposit | [Individual sheet](assets/scrap-deposit.png) |
| Coal deposit | [Individual sheet](assets/coal-deposit.png) |
| Rock blocker | [Individual sheet](assets/rock-blocker.png) |
| Ports and connections | [Individual sheet](assets/connections.png) |
| Placement and selection | [Individual sheet](assets/placement-feedback.png) |
| Salvage crate family | [Individual sheet](assets/crate-family.png) |
| Movable barrel | [Individual sheet](assets/barrel.png) |
| Moving platform | [Individual sheet](assets/moving-platform.png) |
| Favicon study | [Individual sheet](assets/favicon.png) |

The crate-family sheet covers light/heavy 0.9 m boxes and the smaller 0.7 m stacking box; barrel and moving platform have their own sheets. The vegetation sheet individually shows four grass-clump and two low-shrub variants. The connection sheet compares power, material and water shapes; placement compares selected, valid and blocked states.

## Review and implementation boundary

These concepts await user review. The existing simulation/content contracts own footprints, collision, ports, resources, power requirements and topology. Diagram dimensions/arrows, decorative valves/indicators, output pictograms and depicted connections are visual annotations, not authoritative implementation instructions. In particular, conveyors remain power-free and extractors retain their existing raw-resource outputs; concept details do not add mechanics.

Concept generation changed no runtime scene, model, shader, save format, balance or gameplay rule. The favicon was subsequently approved and applied as a separate asset update. No new tiers, map expansion, tall forest, supplied protagonist equipment or animation requirement is selected here.

Review the overall finish and camera-scale readability first, then individual silhouettes/material choices. Final asset modelling and the shader pass must preserve the active Editor world and pass the existing performance/readability/regression gates after implementation. A concept's clear appearance is not performance or accessibility qualification.

## Prompts, references and provenance

All images used the **built-in imagegen tool**, one call per asset or gameplay image, with targeted revision calls where needed. [generation.json](generation.json) retains every exact initial/revision prompt, actual reference paths, generated original locations, selected version and preserved input mappings. The final set contains 36 selected images from 43 generation calls.

Current-game screenshot inputs and their machine contact sheet are preserved under [references/](references/). Intermediate images used as edit inputs and the environment board used for gameplay generation are retained under `references/iterations/`; these are active generation provenance. Existing character renders, logo, UI concepts and sprite references remain in their canonical `art/` locations. The character reference's Meshy/Mixamo history remains owned by its [runtime provenance record](../../characters/Protag/v3/runtime/README.md); this concept set does not replace that record.

Original generated PNGs are copied into the project without repainting. The [preparation source](prepare-gallery.ts) only decodes, inventories, resizes previews and assembles review contact sheets; it does not create or edit the artwork. [image-integrity.json](image-integrity.json) records final original sizes, dimensions and SHA-256 hashes.

## Rebuild the review gallery

From the repository root:

```powershell
node art/concepts/m10-2026-11-12/prepare-gallery.ts
node node_modules/typescript/bin/tsc -p art/concepts/m10-2026-11-12/tsconfig.json
node tools/cleanup/check-docs.ts
```

The first command requires every declared final image, rebuilds the small previews/three overviews/gallery and checks decoding. `--partial` is available during generation only. This local review preparation does not invoke image generation, install dependencies, change the runtime or add CI gameplay diagnostics.
