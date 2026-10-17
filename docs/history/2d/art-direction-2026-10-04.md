# Scrapworks Art Document

Historical 2D production brief, archived 17 October 2026. Shared visual identity remains relevant; sprite dimensions, pixel projection, and directional-frame requirements are historical. Use the [current Art Document](../../art/README.md) for 3D production. References to absent experimental assets are retained as plain labels.

Updated 4 October 2026. Art direction retained; repository paths and implementation status refreshed.

This document defines the visual direction, environmental and technological progression, protagonist design, and first sample asset specifications for Scrapworks. Gameplay belongs in the [GDD](../../design/GDD.md), and implementation architecture belongs in the [TDD](../../design/TDD.md). Agreed direction is distinguished from proposed details being tested through sample images.

## Current repository assets

Source artwork and exact prompts are grouped under `characters/`, `world/`, `machinery/`, `branding/`, and `ui/`. The [generation log](../../../art/generation.json) retains comparison-sheet prompts and selected revisions; image references are relative to this folder.

The [current south-idle pose](../../../art/characters/protagonist-south-idle-v2.png) is used in the placeholder Game scene. The [logo record](../../../art/branding/title-logo-generation.json) and [cursor record](../../../art/ui/mouse-cursor-generation.json) link source images and prompts to their prepared runtime files in `public/assets/`. Runtime assets stay separate from the larger source samples.

The world and machinery comparisons remain concepts. The multi-pose protagonist sheets still need alignment and animation cleanup; their presence does not imply completed directional animation or factory gameplay.

The [MPFB 3D protagonist](../../../art/characters/3d/protagonist-mpfb-v1/README.md), created 10 October 2026, uses an MPFB-generated body, fitted eyes, ponytail and clothing, with an MPFB game-engine rig. Its editable Blender file, rigged GLB, preset, bundled source assets and rendered review views are provided for the 3D experiment.

The smooth 3D protagonist prototype (historical reference; absent from this checkout), created 10 October 2026, is an unrigged Blender/GLB mesh study for investigating a move to 3D. It includes material textures, actual mesh renders and a modelling turnaround. Facial likeness, hair and garment refinement remain open; it has not replaced the current 2D runtime asset or established a new rendering implementation.

The oblique world progression study (historical reference; absent from this checkout) explores an alternative grid projection using the same four restoration stages and familiar landmarks. Its generation record (historical reference; absent from this checkout) and exact prompts (historical reference; absent from this checkout) preserve the reference and selected revision. It is a concept alternative; the agreed camera direction remains recorded below.

The [terrain tileset](../../../art/world/tilesets/README.md) supplies dirt, stone, water, and grass at 64 by 52 pixels, with edge and corner transitions for all six terrain pairs. Its [prepared atlas](../../../public/assets/tilesets/terrain.png) and [Tiled tileset](../../../map/tilesets/terrain.tsx) include configured Terrain Sets for painting connected terrain. The [example map](../../../map/terrain-transitions-preview.tmx) shows the transitions; runtime map loading remains planned.

## Agreed visual direction

- Move smoothly from a derelict planet toward a green paradise.
- Use an angled overhead camera on a square world grid.
- Use flat hand-painted 2D art with proper 3D perspective and depth across the whole game.
- Progress machinery from improvised salvage through modern industrial and refined industrial to seamless ultra-modern technology.
- The protagonist is a female engineer in a distinctive work suit. Emphasise femininity in her design.
- She wears a tank top with the upper half of her jumpsuit hanging around her waist.
- Keep the protagonist easy to locate and distinguish from the world at normal gameplay scale.

## Camera and painted finish

Maintain consistent object volume, foreshortening, occlusion, scale, and lighting across all assets. Paint clear forms and material differences rather than relying on small surface detail.

The first sample proposal uses an elevated camera approximately 55 degrees above the ground plane, looking along one grid axis with north at the top. An approximately orthographic projection keeps world-grid edges parallel and supports consistent tile placement; square world tiles can look compressed on screen because of the viewing angle. Objects show their tops and front faces. Camera elevation and projection should be refined together after reviewing the samples.

Use consistent upper-left lighting expressed through simple shadow planes and restrained highlights. Keep the camera and lighting consistent across progression comparisons and sprite frames.

## Preferred finish across all artwork

The approved style reference is the [flat-shaded protagonist south idle](../../../art/characters/protagonist-south-idle-v2.png). Its flatter colour treatment is the preferred finish for the whole game, including characters, machines, terrain, vegetation, water, effects, and interface artwork.

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

Future generation briefs should use the approved protagonist as a finish reference. Earlier world, machinery, and sprite samples remain useful for composition and design, but their more heavily shaded treatment should be brought into the preferred style when those assets are next revised.

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

The current iteration focuses only on one south-facing idle pose. Preserve the established face, ponytail, feminine proportions, elevated camera, and painted finish while refining her clothing. Additional directions and sprite sheets are deferred during this character design pass.

Her current flat-shading sample establishes the preferred finish for the whole game. Preserve its major folds, facial identity, and perspective while following the shared finish rules above. Its exact [edit prompt](../../../art/characters/protagonist-south-idle-flat-prompt.txt) is retained as a generation record.

## Character readability

Combine a distinctive silhouette, a reserved accent colour, and clear light and dark separation. Keep machinery and scenery accents quieter around the character. Use a compact ground shadow during gameplay, with tall objects allowing the player to remain visible when passing behind them.

Review the same character against dusty soil, dark machinery, dense greenery, and pale advanced buildings. Check her at the expected gameplay size, not only in a large character illustration. Her identifying shapes and accent colour should survive later equipment upgrades.

## First sample deliverables

- A simple transparent protagonist sprite sheet to establish identity, direction, and movement.
- A four-panel comparison of the same factory clearing across the environmental and machinery range.
- A four-panel comparison of the same recycling machine across its four visual generations.

The generation brief is stored in [art/prompts.md](../../../art/prompts.md), and the exact prompts, reference paths, and selected revisions are recorded in [art/generation.json](../../../art/generation.json). The samples were created with the built-in image generation tool. These are prototype and concept assets for review.

## Proposed sprite sheet specification

This specification is retained for a later animation pass. The current request is a single south-facing idle pose, not a new sprite sheet.

Target a 1024 by 1024 transparent PNG with four columns and four rows, using 256 by 256 cells. The 16 sprites must depict the same character with consistent scale, camera, lighting, clothing details, and ground anchor.

| Row | Direction                   |
| --- | --------------------------- |
| 0   | South, toward the viewer    |
| 1   | West, toward the left       |
| 2   | East, toward the right      |
| 3   | North, away from the viewer |

| Column | Pose                               |
| ------ | ---------------------------------- |
| 0      | Neutral idle                       |
| 1      | Left-foot-forward walking contact  |
| 2      | Feet passing beneath the body      |
| 3      | Right-foot-forward walking contact |

The proposed walk playback is columns 1, 2, 3, 2 within the selected direction row. Keep each sprite centred horizontally, with its ground anchor 32 pixels above the cell bottom and its height approximately 176 pixels. All hair, hands, and boots must stay inside the cell. The sheet contains no labels, grid lines, floor, props, or shadows; the game can add a separate ground shadow.

Inspect alpha transparency, actual dimensions, cell spacing, stable anchors, directional views, and pose consistency before treating the sheet as an animation asset. Generated layout and anatomy may need refinement. Final gameplay display size and additional diagonal directions remain open.

## Generated samples and review status

| Sample                                                                                  | Actual dimensions | Review status                                                                                       |
| --------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| [Current protagonist south idle](../../../art/characters/protagonist-south-idle-v2.png) | 1024 by 1536      | Approved finish reference; single pose with a tank top and lowered jumpsuit                         |
| [World progression](../../../art/world/world-progression-v2.png)                        | 2087 by 753       | Earlier composition and progression reference; needs the preferred flat finish in its next revision |
| [Recycler generations](../../../art/machinery/recycler-generations-v2.png)              | 2089 by 753       | Earlier machinery design reference; needs the preferred flat finish in its next revision            |
| [Protagonist sprite draft](../../../art/characters/protagonist-sprites-v2.png)          | 1254 by 1254      | Transparent four-direction, 16-pose concept sheet requiring layout and animation cleanup            |

The world comparison retains the major landmarks and the character across its four panels. The machinery comparison makes the final shell and enclosed connections visibly distinct from the earlier industrial forms. These are art references, not individual tile or machine assets ready for import.

The sprite PNG has a genuine alpha channel: sampled empty background pixels have zero alpha, and sampled body pixels are nearly opaque. Its canvas does not match the requested 1024 by 1024 specification and is not divisible by four. A correction pass did not enforce exact dimensions. Fixed cell spacing, consistent foot anchors, walking pose order, and visible edge fringing still need cleanup before use as an animation sheet. No animation import or playback has been verified.

The world comparisons and earlier sprite draft show the previous fully worn jumpsuit and are retained as historical samples. The current protagonist study is the single south-facing idle image with the tank top, lowered jumpsuit, and flatter shading. It has an alpha channel with transparent sampled corner pixels. Readability in the comparison art is encouraging, but the final camera zoom, gameplay display size, lighting variations, and visibility behind scenery still need a playable check.
