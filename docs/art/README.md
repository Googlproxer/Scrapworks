# Scrapworks Art Document

Updated 23 October 2026. Active production direction: fully 3D world and character with the established flat painted finish.

This document owns visual identity, camera/readability, and 3D asset preparation. The [GDD](../design/GDD.md) owns gameplay; the [TDD](../design/TDD.md) owns architecture.

Art projects, source assets, references and provenance are organised under the root [art/ directory](../../art/README.md). This document contains visual guidance.

## Current repository assets

- The retained [modelling references](../../art/characters/References/) and model sources preserve character identity. The approved flat finish is described below; the earlier south-idle illustration has been retired, with its exact edit prompt retained in the [generation log](../../art/generation.json).
- The retired [MPFB character experiment](../../art/README.md#recovering-retired-mpfb-sources) is recoverable from Git with its editable Blender/rigged GLB sources, licensing and original validation. Its source mesh statistics are distinct from the separately authored runtime model.
- The [retained model source](../../art/characters/Protag-v1.glb) and editable Blender project are canonical character sources. The active Game scene supplies a neutral binding for the [runtime derivative](../../art/characters/protagonist-runtime-v2/README.md); obsolete static import copies have been removed.
- World and machinery comparisons remain useful visual concepts. The [generation log](../../art/generation.json) and individual branding/UI records preserve exact provenance; historical reference inputs are identified by their recovery commit.


## Agreed visual direction

- A damaged planet gradually recovers into a green environment.
- Use a fully 3D world and protagonist, viewed from an angled overhead camera on a square construction grid.
- Preserve broad flat colour areas, restrained highlights, simplified texture, and readable material/shadow shapes.
- Machinery progresses from improvised salvage through modern and refined industrial forms to seamless advanced technology.
- Preserve the adult female engineer's identity and the tank top/lowered-jumpsuit design, with empty hands and no supplied equipment.
- Keep the character, ports, placement footprints, and interactive objects legible at normal gameplay scale.

## Camera and painted finish

The authored perspective camera starts at 45 degrees and a 12 metre radius with field of view 0.8 radians. Pitch is bounded to 20–75 degrees, radius to 6–24 metres; right dragging rotates and free panning is disabled. Compare orthographic projection in the same fixture when assessing placement/readability; it remains a 3D option. The two-metre construction grid uses a subdued soil palette.

Gameplay dimensions are metres; Editor scene coordinates are centimetres. Logical footprints and ground-plane positions remain independent of rendered mesh bounds. Character scale, pivots, occlusion, and selection must be checked in the browser, including at different camera rotations and viewport sizes.

Translate the preferred flat finish into 3D geometry, material response, textures, and controlled lighting. Check the finish across camera rotations. UI images and bitmap textures remain valid assets.

## Preferred finish across all artwork

The approved flatter colour treatment is the preferred finish for the whole game, including characters, machines, terrain, vegetation, water, effects, and interface artwork.

Use broad base-colour areas, a small number of clearly separated shadow shapes, and restrained highlights. A base tone and a shadow tone per material are a useful starting point, with another tone where readability needs it. Simplify surface texture and small details while preserving silhouettes, major folds, construction features, and facial identity. Keep painted contours restrained and consistent.

Volume should remain clear through perspective, overlapping forms, and deliberate light and shadow shapes. Reduce smooth realistic gradient modelling, gloss, fabric grain, fine hair strands, and tiny wrinkle shading. Apply the same degree of simplification to every technological and ecological stage.

| Artwork                     | Application of the preferred finish                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Characters                  | Broad clothing and skin colours, simple folds and shadows, recognisable faces and silhouettes |
| Machinery                   | Clear panel and material shapes, simple shadow planes, legible ports and construction details |
| Terrain and vegetation      | Grouped soil, rock, grass, and foliage shapes with limited texture detail                     |
| Water and glass             | A few deliberate reflection and transparency shapes that preserve the objects beneath them    |
| Smoke and other effects     | Compact stylised shapes with controlled opacity, motion, and fading                           |
| Interface artwork and icons | Simple colour areas and consistent contours that remain readable at small sizes               |

Smooth environmental recovery should still come from gradual changes to ground coverage, colour, plant density, water condition, and air clarity. Runtime blending and opacity changes can preserve those transitions while individual assets retain the preferred flatter finish.

Future generation briefs should use the approved protagonist as a finish reference. Earlier world and machinery concepts remain useful for composition and design, but their more heavily shaded treatment should be brought into the preferred style when those assets are next revised.

## Machinery progression

| Stage               | Agreed appearance                                                           | Proposed material and construction cues                                                        |
| ------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Improvised salvage  | Hacked together from mismatched parts, exposed random wiring, and duct tape | Rust, repair patches, irregular panels, bolts, and improvised connections                      |
| Modern industrial   | Purpose-built, robust industrial machinery                                  | Steel housings, pipes, guards, deliberate assemblies, and limited safety markings              |
| Refined industrial  | Clean, sleek, smooth industrial forms                                       | Painted panels, rounded edges, enclosed wiring, orderly connections, and restrained indicators |
| Advanced technology | Seamless, exceptionally sleek, ultra-modern technology                      | Continuous pale shells, integrated joints, recessed channels, and subtle cool status lights    |

The same machine function should remain recognisable across generations. Preserve its footprint, input and output ports, orientation, and main functional silhouette in the comparison images. Refinement comes from shape, construction quality, materials, and detailing, expressed through the same flat painted finish at every stage. Keep advanced lighting compact enough to preserve geometry.

The proposed approach keeps technological appearance and ecological health independent. Advanced machinery does not automatically restore its surroundings, and a healthy area can still contain older equipment. Existing machinery keeps its generation until upgraded or replaced; researching a technology should not instantly restyle the entire factory.

## Environmental restoration

Preserve terrain shapes and recognisable landmarks so the player sees the same place recovering. The proposed progression begins with dusty, desaturated soil, murky water, lifeless vegetation, and restrained pollution haze. Small patches of pioneering growth give way to grass and shrubs, followed by established vegetation and clearer water and air.

Gradually change soil colour, vegetation coverage and variety, water appearance, and air clarity. Adjacent areas at different health levels should blend naturally. Keep vegetation arranged so walking routes, machines, and the protagonist remain legible.

Progression comparison art may pair healthier land with more advanced machinery to show the range of appearances. This is a comparison layout, not a requirement that those changes happen together during gameplay.

## Protagonist sample design

The protagonist sample depicts an adult woman with feminine facial features, a defined waist, practical proportions, and chestnut hair in a compact ponytail. The agreed outfit is a tank top with the upper half of the jumpsuit hanging around her waist. The current colour proposal is a pale cream tank top and coral jumpsuit, with its upper torso folded down over the hips and sleeves loosely tied at the front. Navy reinforced lower-leg panels and dark work boots preserve the established lower-body design.

The outfit begins as worn but functional clothing. Her hands are empty, and she carries no supplied tools, machinery, or backpack full of equipment. The tank top and lowered jumpsuit are agreed; the specific colours, hairstyle, and material detailing remain proposals for review. Later refinements should preserve her identifying silhouette and accents.

The south-facing idle image is a visual reference. Preserve identity, clothing silhouette and the flat finish when preparing the 3D model; model fitting and animation remain separate work.

Preserve the protagonist's major folds and facial identity while applying the shared finish rules above. The original south-idle edit prompt remains in the [generation log](../../art/generation.json); the retired illustration is no longer a required working-tree asset.

## Character readability

Combine a distinctive silhouette, a reserved accent colour, and clear light and dark separation. Keep machinery and scenery accents quieter around the character. Use a compact ground shadow during gameplay, with tall objects allowing the player to remain visible when passing behind them.

Review the same character against dusty soil, dark machinery, dense greenery, and pale advanced buildings. Check her at the expected gameplay size, not only in a large character illustration. Her identifying shapes and accent colour should survive later equipment upgrades.

## Runtime model and texture preparation

- Keep canonical editable sources and licensing separate from generated runtime exports. Preserve original files and validation records when creating optimised derivatives.
- Validate units, ground pivot, orientation, skeleton/skin binding, materials, alpha modes, normals, and reimport behavior before integrating a model.
- Prepare readable idle and walk animation when the movement milestone needs it. A rigged static import does not establish finished animation; a simple placeholder is sufficient for earlier fixture checks.
- Choose texture resolution and material complexity from the expected camera and measured target-device behavior. Source-library textures, preview images, alternate normal formats, and authoring project files do not automatically belong in browser output.
- Match machine footprints, connection ports and orientation across visual generations. Animation and effect lifetimes follow simulation views without changing rules.
