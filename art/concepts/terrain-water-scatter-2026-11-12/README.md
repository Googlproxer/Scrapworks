# Terrain water and small scatter concepts

Created 12 November 2026 following the user's terrain/water/scatter brief. [Review all six boards and fifteen Meshy prompts](index.html), open the [overview](overview.png), or use the [copyable prompt pack](meshy-prompts.md) and [structured prompts](meshy-prompts.json).

The user subsequently requested existing asset sources to reduce AI usage. The [candidate shortlist researched on creator pages](existing-assets.md) recommends reviewing KayKit's free nature tier first, with Toolbench, Quaternius and Quiet Grove alternatives. The gallery links these sources directly; retain Meshy prompts for gaps after reviewing existing models. No further images were generated after that request.

The earlier [terrain, water and vegetation concepts](../m10-2026-11-12/README.md) supply the palette and shape language. The approved protagonist I render remains the finish and scale benchmark. These are built-in imagegen concepts for review; no runtime terrain, water, models, shaders, gameplay rules or graphics controls were changed.

On 13 November the user supplied KayKit's free pack and requested a real layered-land/scatter pass, leaving water for later. The [separate implementation/provenance record](../../world/kaykit-forest-v1/README.md) and local production captures now document that follow-up. The images in this concept directory remain the original reference artwork.

## Proposed visual system

**Layered terrain with multi-scale seeded scatter** describes the requested approach. The grids are independent sampling/indexing layers; they do not create stacked physical ground planes or require a prop at every cell centre.

| Layer | Proposed scale | Visual role |
| --- | --- | --- |
| Base surface | Existing 2 m world grid | Four related dry-soil and four restored-groundcover variants, plus two damp and two mineral studies; stable variant choice and quarter-turn rotations. |
| Broad coverage | Roughly 4–6 m patch fields | Offset irregular soil/grass/damp shapes span multiple base cells and interrupt short tile repetition. |
| Rock and shrub grouping | Roughly 6–10 m spatial buckets | Independent offsets, variable cluster occupancy and minimum separation; candidate positions are jittered inside buckets. |
| Local detail | Roughly 0.35–0.8 m candidate spacing | Many tiny stones and low grass/groundcover shapes, with clustered density and deliberate empty spaces. |

These sizes are initial art/placement proposals. Larger grids alone would still repeat: use distinct layer seeds, non-aligned origins, variable occupancy, spatial rejection and broad density variation. They act as a spatial organisation method, not a visible layout pattern. Use a stable presentation seed derived from the authored world and coordinates, independently of simulation random streams.

**Texture rotation needs compatible boundaries.** An individually tileable image may still form seams against a different variant. Use a shared neutral perimeter within compatible texture families or blend the edges; blend between soil/grass families with coverage masks. Verify all allowed variant/quarter-turn neighbours and distance mip levels. The generated swatch board illustrates colour and pattern only; it is not a usable or seam-tested atlas. Keep recognisable rocks, directional highlights, cast shadows and large repeated cracks out of the base albedo.

**Health changes coverage without rearranging the world.** Keep rocks and candidate plant roots stable. Give each candidate a fixed appearance rank and reveal progressively more plants as local health rises, with restrained size transitions. Full-health land supports abundant low grass and some shrubs, plus quiet bare gaps. Keep complete machine footprints, interaction areas and access routes clear; tiny decorative geometry does not add simulation bodies or blocking rules. Do not let decoration imply a new salvage resource.

**Geometry supplies the depth.** R1–R6 are small real stones/stone groups; P1–P6 use folded or wedge-shaped blades and chunky low shrub forms. These are mesh scatter props rather than projected decals or alpha-card grass. Broad ground colour patches remain a surface/mask layer. The final triangle targets are in the prompt pack. Batch/instance by shared geometry/material and spatial chunk when implemented; measure plant density, shadow cost and culling at normal play zoom before setting a final budget. A future density quality option can thin presentation without changing health or simulation.

## Water volume and shaped banks

The current [water source contract](../../../src/contracts/environment.ts) already exposes each connected source's cell list and volume. [Source creation](../../../src/simulation/water.ts) groups cardinally connected water cells. [Current environment settings](../../../src/content/environment.ts) provide `sourceLitresPerCell = 1000`; the [simulation](../../../src/simulation/environment.ts) handles extraction, return and refill. The current [environment view](../../../src/game/views/environment-views.ts) draws a flat coloured overlay and does not yet depict depletion.

For a later presentation implementation:

1. Derive each connected source's capacity from its cell count and the existing source-capacity setting. Compute `fill = clamp(source.volume / capacity, 0, 1)`; do not create a second decorative water resource.
2. Author a continuous low-poly basin and sloping bank from the existing water-cell outline. Keep its rim below/at the walkable ground and within the reserved water footprint. Use a chamfered lip, exposed earth slope, low rock shelves and a continuous floor.
3. Convert fill through an authored, normalised basin-volume/height curve. Sloping shores change wetted area, so simply making height linear with volume is only correct for a constant-area basin. Normalising the curve preserves the current capacity/balance while allowing stylised visual depth.
4. Render one coherent level per connected source. Intersect the water surface with the basin so that both its height and visible area recede, exposing the same fixed shoreline stones and damp bank. Moving an unchanged full-size blue rectangle down would leave misleading water outside the bowl.
5. At zero volume hide the water surface and its waterline effects, exposing the floor. At full volume keep the surface below the land rim. Smooth renderer interpolation may soften simulation cadence; it must not invent stored volume.
6. Keep water quality/clarity separate from volume: the full/low/empty comparison intentionally retains the same land health and water colour. Water-body cells remain reserved/blocked by the existing simulation even when dry; making them traversable/buildable would be a separate gameplay decision.

The cutaway and corner pieces show the desired shape language. For reliable joins, generate/author the continuous bank profile against the water mask rather than relying on AI to supply exact matching modular vertices. Optional S1–S3 Meshy prompts are shape exploration only, with shared profile/ends/UVs fitted in Blender. Keep the runtime water plane and shader separate from bank meshes.

## Review boards

| Board | Focus |
| --- | --- |
| [Layered terrain](images/01-layered-terrain.png) | Continuous surface, independent placement layers, stable rocks and health-dependent vegetation. |
| [Ground variation](images/02-ground-variants.png) | Twelve surface studies and shuffled/rotated broad coverage; production seam work remains. |
| [Water levels](images/03-water-levels.png) | The same basin full, low and empty; exposed banks, floor and a geometry cutaway. |
| [Small rocks](images/04-rock-scatter.png) | Six singles/cluster variants, front/rear studies and a 2 m scale example. |
| [Low-poly plants](images/05-vegetation-scatter.png) | Six deliberately simple 3D silhouettes and a sparse-to-full coverage study. |
| [Gameplay proposal](images/06-gameplay-proposal.png) | The approved protagonist beside low water, healthy land and irregular ground/mesh detail. |

The gameplay view is imagegen concept art, not a Babylon screenshot. Dimensions, example plant/component counts and shore profiles in images are illustrative; the authored grid, simulation contracts and later measured mesh exports remain authoritative. No final density/performance tier or asset approval is claimed.

## Prompts and provenance

All six images use the **built-in imagegen tool**, one call per board. [generation.json](generation.json) preserves exact prompts, input paths, original output paths and the preserved protagonist input. The first three environmental references remain in their canonical earlier concept directory. Original PNGs are copied without repainting.

The [preparation tool](prepare-gallery.ts) decodes the originals, records image/input/prompt hashes in [image-integrity.json](image-integrity.json), resizes previews and assembles the gallery/overview. It does not generate or repaint artwork.

The fifteen [Meshy prompts](meshy-prompts.md) are ready for the user to submit individually. No Meshy generation was submitted. R1/R2/R3/P1/P2/P5/P6 form the recommended first batch; generate further variants after camera-scale review. Keep the existing [source/provenance ownership](../../README.md) when models and Blender derivatives are added.

To rebuild the local review artifacts:

```powershell
node art/concepts/terrain-water-scatter-2026-11-12/prepare-gallery.ts
node node_modules/typescript/bin/tsc -p art/concepts/terrain-water-scatter-2026-11-12/tsconfig.json
node tools/cleanup/check-docs.ts
```

This art review task adds no CI job or gameplay diagnostic.
