# Runtime asset decisions

Audited 11–12 November 2026 for [M10 Step A](../plans/portfolio-assets-and-final-qualification.md#step-a-audit-and-choose-asset-work), starting from `9e2a7dc`. **The audit is complete; the selected world-art work and final qualification remain open.** The user additionally requested removal of the old menu backdrop; its replacement and asset credits were implemented during this audit.

The complete local [report](../reports/asset-audit/2026-11-11/README.md), [screenshot gallery](../reports/asset-audit/2026-11-11/index.html), [machine contact sheet](../reports/asset-audit/2026-11-11/machine-contact-sheet.png), inventories, hashes and camera metadata stay ignored under `docs/reports/`. This document retains the decisions needed for subsequent implementation.

The user subsequently requested [concept art for all selected assets and gameplay views](../../art/concepts/m10-2026-11-12/README.md). That first-pass set provides four gameplay proposals and 32 individual asset/group sheets, awaiting review. It establishes visual references for later asset and renderer/shader work, not Step B implementation credit.

The subsequent [shader and graphics-quality implementation](../plans/stylized-rendering-and-quality.md) follows the existing-material comparisons and user approval of I. The protagonist now uses that finish, with shared authored lighting and independently adjustable shadows/render resolution. The user specified the protagonist as the benchmark while other objects are updated separately; those materials/assets and final qualification remain open.

## Review boundary

- Fresh production builds and 52 world captures: damaged, fully restored and mixed-health prepared states; all **19** placeable kinds; water, vegetation, deposits, blockers, protagonist and connections.
- Chromium: default follow camera plus catalogue targets at the normal 12 m radius, quarter-turn orbit views, supported 6/24 m zoom, and a 390 × 844 viewport. The catalogue pins the presentation camera target without moving the player. Pitch remains 45 degrees; extreme pitches were not qualified.
- Firefox: default production views of the same three prepared states. The complete orbit/catalogue matrix was reviewed in Chromium, not duplicated in Firefox.
- Prepared resources, research, buildings and health are visual fixtures, not earned gameplay, pacing evidence or final performance acceptance. These diagnostics remain local/manual and outside CI.
- Compared with the [approved flat finish](README.md#preferred-finish-across-all-artwork), retained world/machinery concepts and the recent UI sprite set. Older world concepts inform composition; their heavier shading is not the target finish. The sprite set still awaits user approval.

## Decisions by asset group

| Asset/group | Decision | Finding and selected work | Source and provenance |
| --- | --- | --- | --- |
| Protagonist mesh, identity, scale and rig | **Keep** | Preserve the complete 104,972-triangle mesh, 65 joints, eight influences and approximately 1.89 m standing height. Polygon optimisation remains with the user. | `art/characters/Protag/v3/`; [runtime preparation](../../art/characters/Protag/v3/runtime/README.md). User confirmed a free-plan Meshy export modified in Blender; CC BY 4.0 attribution is now shipped, separately from Mixamo rigging/animation credit. Asset-specific original URL/model identifier remains unavailable. |
| Protagonist surface and grounding | **Polish** | Detailed PBR/normal shading differs from the broad machine/terrain colours. Simplify material response without altering identity or geometry; add a restrained ground-contact cue and check dense-machine occlusion. | Same retained model/textures; no replacement character selected. |
| Idle, Walk, Run; retained disabled turns | **Keep** | Existing movement covers the current demo interactions. No demonstrated interaction requires a new action clip. Salvage/crafting already communicate work through UI; do not add a supplied tool or equipment merely to justify an animation. Keep TurnLeft/TurnRight disabled. | User-supplied Mixamo archive and conversion records. No new animation acquisition selected. |
| Damaged/restored soil | **Polish** | A nearly featureless brown/green plane makes recovery read mostly as a colour change. Add broad soil/rock/grass patch shapes and restrained health-boundary blending while retaining the authored grid/map and simulation health. | Original `src/game/views/environment-views.ts`; repository MIT code. |
| Water/lake | **Polish** | Current water is a flat rectangular set of green/blue cells with no shoreline, depth or reflection shapes. Add a readable bank and a few flat water/reflection shapes; preserve source cells, volume, extraction/return ownership and every installation position. | Same original environment source; eight authored water cells. No external water shader or texture required. |
| Vegetation | **Replace presentation geometry** | Repeated tiny crossed triangles do not convey established recovery. Select a small original low-poly set of grass clumps and low shrubs with grouped flat foliage/shadow planes and health-dependent coverage. Preserve walking/placement visibility and occupied-cell suppression; no map expansion or new collision. | Replace the original procedural two-triangle tufts in `environment-views.ts`; retain editable new sources under `art/world/` if Blender assets are used. |
| Scrap/coal deposits and static blocker | **Replace placeholder geometry** | Plain boxes/cylinders and a white blocker communicate fixtures rather than salvage or geology. Select original clustered mixed scrap, a coal mound and an angular rock silhouette at the existing IDs, positions and logical collision footprints. | Editor templates in complete `assets/game.scene/`, instantiated by `entity-view.ts`. Existing original scene source; replacement provenance must be retained under `art/world/`. |
| Machines | **Polish 16; replace greenhouse shell** | Preserve useful function silhouettes. Apply shared broad material planes and a few construction/repair cues; avoid fine bolts/textures that disappear at normal camera size. Greenhouse needs a recognizable roof/frame and visible planting space. See per-kind table below. | Original `machine-geometry.ts` and `entity-view.ts`, repository MIT; [procedural provenance](../../art/machinery/runtime-prototypes.md). No third-party model pack selected. |
| Conveyors and sorter | **Polish** | Keep low rollers, side chutes, directional arrows, countable transit markers and the blocked X. Improve belt/rail separation and port contrast while keeping markers visible above housings. | Original `machine-geometry.ts`, `transport-views.ts`; repository MIT. |
| Power/material/fluid ports and connections | **Polish** | Thin overlapping lines are difficult to trace. Retain curved power leads, material arrowheads and non-colour blocked X; strengthen endpoint shapes and distinguish fluid lines. Align wires to the actual terminal geometry: current source places a normal terminal top around 67.5 cm while `powerTerminal()` targets 100 cm. | Original `power-wire.ts`, `entity-views.ts`, `transport-views.ts`, `environment-views.ts`. The terminal-height difference is source-derived, not a new browser measurement. Preserve saved topology and port directions. |
| Placement/selection feedback | **Keep; polish contrast** | The filled cell and ghost support construction. Check occupied/valid/invalid states against both brown and green terrain after new art; retain footprint outlines/shape cues beyond colour. | Original `selection-controller.ts` / `placement-controller.ts`. |
| Physics test bodies | **Polish** | Plain orange boxes and blue cylinder/platform remain visually generic. Give existing bodies a coherent crate/platform finish without changing mass, movement, collider, authored identity or save state. | Original `physics-body-views.ts`; authored markers remain in Game scene. |
| Logo and cursor | **Keep** | Logo already supplies the cream/navy/coral flat identity; responsive derivatives are small. Cursor has a native fallback. | Generated originals and exact prompts under `art/branding/` and `art/ui/`; deterministic preparation tools. |
| Old blue/green backdrop | **Replace — delivered** | User requested discarding it and recalled a possible Phaser origin, which was not established. Removed `menu-backdrop-v1.png`, replaced runtime bytes with an original restoration landscape, retained exact generation/preparation provenance. | [New source/prompt/record](../../art/ui/menu-backdrop.json); built-in imagegen, no reference inputs. Old source recovery is recorded by Git commit/hash, without a duplicate archive. |
| Favicon | **Replace — delivered after concept approval** | On 12 November the user explicitly approved the gear-and-leaf concept and requested immediate application. The old icon is replaced by transparent 16/32/64 px derivatives, with explicit document sizes and a versioned URL to refresh browser caches. | [Approved source and preparation record](../../art/branding/favicon.json); original concept derives from the current generated Scrapworks logo. The old 354-byte icon is recoverable from the recorded Git revision. |
| Current UI and new UI artwork | **Keep accepted direction; integrate in later UI work** | Current runtime controls remain largely plain/text-based. The accepted UI concepts/kit supply the intended finish; 31 sprites cover all 28 item/placeable IDs plus MiniFab and two water states, but await review and are not shipped. Avoid replacing those sources or treating them as implemented. | `art/ui/concepts/2026-11-10/`, `art/ui/kit/v1/`, `art/ui/sprites/v1/`; exact prompts/vector sources and preparation records retained. |
| Fonts, audio, external textures | **Keep current scope** | Runtime uses system fonts, no shipped music/SFX files and no additional downloaded terrain/machine texture pack. There is no missing audio/font licence to infer from the concept kit. | Current public files, runtime imports and exported scene manifests. Software notices are handled separately below. |

## Every placeable kind

The seven M6 machine kinds, ten M8 utility kinds and two M7 transport kinds account for all 19. Every row has a normal-camera capture named `machine-<kind>.png` in the local gallery.

| Kind | Decision | Concrete visual work |
| --- | --- | --- |
| Solar panel | Polish | Keep tilted array/support; separate frame, blue cell plane and base so dividers survive normal zoom. |
| Wind turbine | Polish | Keep mast/rotor silhouette; separate hub, blades and support with broad material areas. |
| Recycler | Polish | Keep hopper/outlet; show an open feed volume and distinct working body/repair panels. |
| Basic Fabricator | Polish | Keep open press silhouette; make the working gap, press plate and base distinct. |
| Medium Fabricator | Polish | Keep housing/arm identity; clearly separate assembly space from enclosure. |
| Extractor | Polish | Keep drill/gantry; strengthen the visible auger/ground interface without concealing deposit identity. |
| Laboratory | Polish | Keep sample pair/readout; distinguish bench, samples and screen rather than one teal material. |
| Battery | Polish | Keep bank/terminal silhouette; distinguish case, terminals and a restrained charge/status area. |
| Coal generator | Polish | Keep boiler/chimney; distinguish fuel/water connections and casing with flat planes. |
| Air scrubber | Polish | Keep filter/fan silhouette; make the intake/fan visibly different from water storage. |
| Greenhouse | **Replace shell** | Original pitched frame, restrained glazing and visible plant beds within the existing one-cell footprint. Retain fluid/power ports and collision. |
| Water pump | Polish | Keep motor/intake; clearly separate motor casing, pipe and intake mouth. |
| Pipe | Polish | Keep low straight route; remove visual ambiguity between base, pipe and fluid-port ends. |
| Pipe junction | Polish | Keep crossing shape; readable junction hub and every facing connection. |
| Water treatment | Polish | Keep paired filter vessels; separate tanks, connecting pipes and treatment outlet. |
| Water tank | Polish | Keep vertical reservoir; add broad rim/base planes and a compact gauge cue. |
| Water return | Polish | Keep outlet-mouth silhouette; readable mouth/shore interface and direction. |
| Conveyor | Polish | Keep low walkable geometry; distinct belt/rollers/rails, visible arrows and held units. |
| Sorter | Polish | Keep asymmetric three chutes; separate housing/chutes and preserve above-housing arrows/blocked X. |

## Work order and implementation constraints

1. Replace deposit/blocker placeholders and the greenhouse shell; replace crossed-triangle vegetation. These provide the largest improvement in object meaning and the restoration payoff.
2. Polish terrain/water and shared lighting/material response alongside those replacements. As the user clarified on 12 November, the flat finish requires deliberate renderer/shader work in addition to assets; geometry and texture changes alone are insufficient. Use the concepts as the shared target for both. Keep scenery quiet around the cream/coral protagonist and avoid concealing paths or ports. Preserve gradual ecological recovery independently of equipment technology.
3. Polish remaining machines, connections, placement and physics-body finish. Prefer shared palette materials, vertex colours, merged geometry or instancing where suitable; do not multiply draw calls for details that vanish at 12–24 m.
4. The approved project-derived favicon is now applied. Integrate reviewed UI art in its own UI work and re-check the narrow viewport. At 390 px the open objective guide and control strips obscure most of the world, including the character; assets alone cannot resolve this. The current hide-guide control helps, but narrow-view readability is not approved.
5. Keep the protagonist's complete mesh. Material-only work and future measured texture/animation preparation may be investigated without conflating them with the user's polygon optimisation. Keep Idle/Walk/Run and disabled-turn policy.
6. Run the asset plan's comparable Chromium/Firefox performance and affected regression gates after selected assets settle, then refresh the artifact/material. No new tiers, mechanics, map edits or balance changes are selected by this audit.

## Packaging and attribution findings

Before the requested backdrop replacement, the six public art files totalled **7,852,520 bytes**; the protagonist accounted for 7,762,852 bytes (98.9%). After replacement they total **7,964,824 bytes**; the backdrop grew from 4,218 to **116,522 bytes**. The separate legacy favicon was 354 bytes. Following concept approval, its replacement supplies 16/32/64 px PNGs totalling **6,663 bytes**. A Brotli sidecar for the protagonist is **3,716,877 bytes**; already-compressed WebP/PNG files use their originals.

The actual GLB contains one mesh/material, 67,570 exported vertices, 104,972 triangles, 65 joints, five clips and three embedded 2048 × 2048 WebP images, with no external image/buffer URLs. A three-image RGBA8 estimate is 48 MiB before mipmaps, not measured process/GPU memory. The user-approved full mesh remains unchanged; its source Blender, rig archive and runtime hashes match the retained export report. No new frame/memory performance claim follows from these counts.

The export policy removed five unused generated library files (1,547,767 bytes); complete authored scene sources remain intact. Source projects, rig archives, retired artwork and the unintegrated UI kit/sprites do not appear in the production browser tree. The one large duplicate found by source hashing is the retained original logo in `art/` and the Editor library, not a duplicate shipped scene texture.

The new [asset credits](../../public/attributions.html) link from the main menu, name Meshy with CC BY 4.0 and modifications, separately credit Mixamo, and describe original procedural/generated art including the applied gear-and-leaf favicon. Original asset-specific Meshy acquisition details remain incomplete. The unverified legacy favicon is no longer shipped. This is not a claim that every historical source has a complete rights receipt.

An audit check found Angular's generated software notices outside `browser/`, where portable static delivery omitted them. The build wrapper now copies those notices and the project MIT licence into the browser root before compression. The credits page links both. No public publication occurred; the earlier ZIP is a historical pre-audit artifact and was not silently replaced.

## Verification and open acceptance

Fresh production build/export, strict tool and local-audit types, focused build-tool tests, template lint, documentation links and exported/build asset validation passed. Chromium and Firefox checked the replacement menu at desktop, 390 px, 320 px and landscape sizes, keyboard access to separate-tab credits, AXE checks, notice downloads and New Game. Detailed receipts remain local.

This does not close M10.1 or M10. The selected world presentation, affected final performance/readability qualification, refreshed portfolio artifact and the user's later human pacing playtest remain outstanding. The approved favicon is delivered independently of those remaining packages. Fibery was read to verify scope; this audit did not write to the external tracker.
