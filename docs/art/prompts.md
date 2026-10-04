# Scrapworks art generation prompts

Updated 2 October 2026.

These prompts define the current art generation brief. They use the built-in image generation tool. The art direction and sprite specifications are in the [Art Document](README.md). Flat hand-painted shading is the preferred finish across all artwork. The tank top and lowered jumpsuit are agreed; specific palette, lighting, and exact camera elevation remain sample proposals.

Exact tool prompts, including correction passes and reference paths, are recorded in [generation.json](generation.json). Selected images and their review limitations are listed in the Art Document. The machine generation call uses the shared camera and lighting paragraph; the protagonist paragraph applies to character and world images.

## Shared visual specification

Flat hand-painted 2D game art with convincing 3D volume and consistent perspective. Use the [approved flat-shaded protagonist](characters/protagonist-south-idle-v2.png) as the finish reference for characters, machinery, environments, effects, and interface artwork. Use broad base-colour areas and a small number of clearly separated shadow shapes, approximately one base and one shadow tone per material with another tone only where readability needs it. Keep highlights restrained. Simplify texture, gloss, hair strands, and small wrinkle shading. Retain major shapes, material differences, and depth through perspective, overlap, and deliberate shadow planes. Use restrained painted contours.

Elevated overhead camera, approximately 55 degrees above the ground plane, looking along one grid axis. North stays at the top of the image. Use a square world grid with parallel edges and an approximately orthographic projection for consistent tile placement; square world tiles can appear compressed by the camera angle. Show the tops and front faces of objects. Use consistent upper-left light expressed through simple shadow shapes. Clear material shapes and readable silhouettes take priority over tiny detail. Keep this finish consistent across all four machinery generations and all levels of environmental restoration.

The protagonist is an adult female engineer, with feminine facial features, a defined waist, practical proportions, and chestnut hair in a compact ponytail. Her agreed outfit is a tank top with the upper half of her jumpsuit hanging around her waist. The current sample uses a pale cream tank top, coral jumpsuit fabric folded down over the hips with sleeves loosely tied in front, navy reinforced lower-leg panels, and dark boots. Empty hands, no starting tools, no backpack full of equipment. Use a clear painted edge and light/dark separation. Keep her identity, proportions, outfit colours, and ponytail consistent in every frame and scene.

The current iteration is a single south-facing idle pose. The sprite-sheet and world prompts below are retained for later work; exact historical prompts are preserved in generation.json.

The protagonist establishes the shared flatter finish for all artwork. Preserve her perspective and identity. The exact edit prompt that produced the approved finish reference is in [protagonist-south-idle-flat-prompt.txt](characters/protagonist-south-idle-flat-prompt.txt). Earlier world and machinery images are composition and design references; use the approved protagonist for the current shading treatment.

## Protagonist sprite sheet

Use case: stylized-concept.

Asset type: transparent prototype character sprite sheet.

Primary request: Generate a square 1024 by 1024 PNG with a genuinely transparent background. Use an exact 4-column by 4-row grid with 256 by 256 cells, giving 16 complete full-body sprites of the same adult female engineer. No visible grid, labels, text, props, floor, or shadows. The shared visual specification applies, with the same elevated camera and upper-left light for every direction.

Row order from top to bottom: south facing toward the viewer; west facing left; east facing right; north facing away. The north view must show her back, not her face. Column order from left to right: neutral idle; left-foot-forward walking contact; feet passing beneath the body; right-foot-forward walking contact. Arms swing opposite the advancing leg. Keep the ponytail visible and the feminine silhouette recognisable in the directional views. Maintain stable anatomy and clothing details.

Keep each sprite centred horizontally in its cell, with the midpoint between the grounded feet anchored 32 pixels above the cell bottom. Keep the character approximately 176 pixels high and leave clear space around every cell boundary. No sprite, hair, hand, or boot may cross a cell boundary. Maintain identical camera, scale, and ground anchor, with only modest motion within the walking poses. Request actual transparency rather than a painted checkerboard.

This is a prototype sprite sheet. Grid alignment, alpha, scale, and pose consistency must be inspected before treating it as an animation asset. The intended idle animation uses column 0, and the proposed walking sequence is columns 1, 2, 3, 2 within each direction row.

## World progression comparison

Use case: stylized-concept.

Asset type: four-panel environment concept comparison.

Primary request: Paint a wide four-panel board showing the same small factory clearing progressing from a derelict planet toward a green paradise, with machinery developing through all four visual generations. Each panel uses exactly the same elevated overhead camera, scale, composition, terrain shape, and fixed landmarks. Preserve the position of a distinctive cracked boulder, a small water basin, the greenhouse footprint, a recycling machine, and a short conveyor path. Show the same female engineer from the latest south-facing idle sample as a clearly readable small figure at the same position in each panel, wearing her tank top and lowered jumpsuit. Use that sample as the character identity and flat painted-finish reference, not as an edit target. Earlier world comparisons can supply layout and progression references while all assets follow the current shared finish.

Panel 1: dusty, desaturated ochre and grey ground, lifeless vegetation, murky water, a ruined greenhouse, and a recycler improvised from mismatched rusty panels, random exposed wiring, bolts, and duct tape. Visible coal power exhaust, restrained haze.

Panel 2: purpose-built modern industrial machinery with steel housings, purposeful pipes, guarded moving parts, and limited safety markings. Small patches of pioneering grass and moss, clearer water, and some haze remaining.

Panel 3: clean, sleek, smooth industrial machinery with painted panels, rounded edges, enclosed cabling, orderly connections, and restrained indicators. More grass, shrubs, clean water, a functioning greenhouse, and clearer air.

Panel 4: seamless ultra-modern technology with continuous pale ceramic-like shells, dark recessed channels, integrated connections, and subtle cool status lights. A green paradise with lush but readable plants, established vegetation and clear water. Preserve open walking routes and the character's contrast.

Use the shared flat painted style throughout, including terrain, plants, buildings, machinery, water, and smoke. Vegetation density and material refinement increase through believable intermediate stages; the land and landmarks remain recognisably the same place. Preserve strong machine silhouettes. Keep coral as the character's main accent; machinery uses quieter accents. No labels, UI, logos, horizon, or cinematic perspective. This is a concept comparison, not a literal fixed gameplay sequence; technology and restoration are independent systems.

## Machine generation comparison

Use case: stylized-concept.

Asset type: four-panel recycling-machine concept comparison.

Primary request: Paint four versions of the same compact recycling machine, at the same scale and elevated overhead camera, with the same two-by-two-square world footprint, conveyor input, conveyor output, front service face, and visible processing chamber. Use the approved protagonist as the flat painted-finish reference and earlier machinery comparisons as construction and material references, not as edit targets. Place the four machines on identical quiet neutral ground patches, with clear separation, consistent upper-left lighting, and no labels or text.

Left to right: improvised salvage with mismatched rusty plates, exposed random wires, duct tape and repair patches; robust modern industrial construction with steel panels, pipes, bolts and machine guards; clean refined industrial construction with smooth painted housings, rounded edges, enclosed wiring and restrained status indicators; seamless ultra-modern construction with pale continuous shells, integrated joints, recessed dark channels and subtle cool indicator lights.

Keep the machine's function, ports, footprint, and orientation recognisable across all four generations. Preserve convincing 3D depth through perspective and simple shadow planes in the flat hand-painted 2D finish. Use broad colour areas with restrained highlights and minimal texture at every stage. Refinement should come from shape, assembly quality, and materials. Avoid excessive bloom that obscures the machine silhouette. No characters, logos, UI, text, or grid lines.
