# Scrapworks 3D cleanup plan

Prepared 17 October 2026. Status: documentation, art/export and development-tooling cleanup delivered; runtime implementation remains open. The verified preservation records, source-tracking/reference audit and [user implementation checklist](3d-implementation-checklist.md) make the handoff explicit. See [the baseline and progress record](3d-cleanup-baseline.md) for dated evidence and remaining environment/repository steps.

Make Scrapworks a browser-first 3D game with one active rendering and authoring path. Keep Angular for the interface, Babylon.js for the world, Babylon.js Editor for scene and world-layout authoring, plain TypeScript for gameplay, and Dexie/IndexedDB for local saves. Retire the Phaser/Tiled runtime direction while preserving useful artwork, design decisions, and historical evidence. The user owns actual game/runtime implementation; cleanup work may add supporting tools and maintain documentation without changing gameplay source.

The cleanup should leave a maintainable 3D foundation. The next gameplay milestone is an empty-handed player who can walk to scrap, collect it, craft a material, save, reload, and continue. Completing research, machines, transport, or restoration is outside this cleanup.

[Documentation index](../README.md) · [Implementation roadmap](README.md) · [Existing migration plan](3d-migration.md)

## Starting point

The 17 October review established the following baseline:

| Area        | Current state                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application | Angular 22, TypeScript 6, shared viewport and renderer-neutral client contract, scoped runtime, loading/error states, and retry/remount behavior.                      |
| Rendering   | `/` uses Phaser 4.2.1; `/3d` uses Babylon.js 9.30.0 and Editor-authored MainMenu/Game scenes.                                                                          |
| Authoring   | A Scrapworks `.bjseditor` project, scene sources, export wrapper, and desktop MCP setup exist. Automatic export/reload and world-marker compilation remain unfinished. |
| Gameplay    | The simulation is a string-queue/logging scaffold. Phaser movement changes the sprite directly; the Babylon protagonist is static.                                     |
| Persistence | Dexie stores test records. The dialog does not save or restore a playable world.                                                                                       |
| Validation  | Production build, application lint, 33 Chromium tests, and 30 lint-tooling tests passed. These checks cover the existing foundation.                                   |
| Packaging   | Current build output: approximately 470.2 MiB. Initial JavaScript: 9.26 MB raw, estimated 1.61 MB transferred. The output includes grass textures around 96 MB each.   |
| Repository  | Substantial Editor integration is uncommitted, including authored scene assets and tooling. Preserve that work before reorganising it.                                 |

Packaging figures describe the current output directory, not a measured first-load download or a guaranteed clean-export result. Establish a fresh-export comparison before attributing every file to an active scene. The review ran the exporter and installed Angular tooling directly because Corepack could not download the configured Yarn release; repeat the documented Yarn workflow when its bootstrap is available.

## Technology and ownership

| Responsibility       | Owner and rule                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application UI       | Angular and CDK: menus, inventory, crafting, research, save/load, errors, and accessibility.                                                                   |
| World presentation   | Babylon: rendering, camera, picking, animation, visual effects, and input adaptation.                                                                          |
| Authored layout      | One Editor project inside Scrapworks: cameras, lights, materials, static geometry, and world markers. Attached scripts handle presentation and scene bindings. |
| Gameplay             | Plain TypeScript: authoritative movement, occupancy, inventory, production, research, pollution, and simulation time.                                          |
| Persistence          | Versioned, validated plain snapshots through a Dexie repository. Scene serialization is not a gameplay save.                                                   |
| Coordinates          | Gameplay uses metres on an X/Z ground plane; Editor scenes use centimetres. Convert at the presentation/authoring boundary.                                    |
| Graphics and physics | Keep the existing WebGL path. Add WebGPU, Havok, or navigation systems when a defined requirement justifies them. Conveyor contents remain simulation data.    |

Keep the shared `GameClient`, `GameRuntimeService`, and viewport boundaries. Extend their plain contracts only when a concrete lifecycle or gameplay requirement needs it. Distinguish renderer lifecycle `GameState` from future authoritative `WorldState`.

Use an elevated perspective camera as the initial 3D baseline. Orthographic projection remains a valid 3D option to compare in the same fixture; it is not automatically obsolete because the renderer changes. Retain the preferred flat colour treatment, readable silhouettes, technological progression, and environmental restoration art direction.

## Implementation order

Each phase should produce a small, independently reviewable change with its own evidence. Keep documentation accurate during the transition: Babylon is the selected direction while Phaser remains the default until Phase 4 passes. The user implements runtime/game behavior; tooling and documentation cleanup can proceed within that boundary.

### Phase 0 Preserve and record the baseline

- [x] Review the existing modified and untracked files; checkpoint the Editor project, complete scene directories, plugin, export tooling, loader, and dependency changes together. The checksum-verified file/history snapshot preserves the work without staging or committing it.
- [x] Record installed versions and successful commands with a date. Separate current evidence from older dated results.
- [x] Record source assets, exported assets, build contents, initial JavaScript, and requests made by MainMenu and Game. See the [asset/export audit](../reports/assets/2026-10-17/README.md). Distinguish disk size, transfer size, and assets actually requested.
- [x] Verify authored inputs are not accidentally ignored and generated scenes, script registry, caches, build output and browser-test artifacts stay ignored and untracked. The [repository audit](../reports/cleanup/2026-10-17/README.md) records the current result.
- [ ] Review, track and commit the authored inputs, art relocation, docs and tools with the existing user changes. This is a separate repository step; cleanup checkpoints do not stage or commit them. Verify a clean dependency install when the pinned Yarn release is available.
- [x] Inventory local tools referenced from outside the repository and document which are optional workstation dependencies. See [the workstation inventory](babylon-editor-setup.md#workstation-dependencies). Keep `L:/Angular/babylon` as a template/reference; do not absorb its Electron runtime into Scrapworks.

**Completion:** the existing prototype can be reproduced from its authored inputs and dependencies, and its current behavior and packaging can be compared after cleanup.

### Phase 1 Reconcile current and historical documentation

Delivered on 17 October 2026, with local links/anchors and diagram consistency checked. Keep current implementation claims updated as later runtime work lands. See [the progress record](3d-cleanup-baseline.md).

Keep the established GDD/TDD/art split. The roadmap owns milestone order; the migration plan owns renderer-transition details; the setup guide owns executable Editor/export/MCP instructions. Update cross-links instead of maintaining several conflicting copies of the same checklist.

| File or group                                                                                                                                                                                                                                              | Planned treatment                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Root README](../../README.md)                                                                                                                                                                                                                             | Present the 3D target and truthful current routes; document authored versus generated assets and commands that export before Angular runs. After cutover, describe Babylon as the sole runtime and move Phaser-specific setup explanations into history.                                                                |
| [Documentation index](../README.md)                                                                                                                                                                                                                        | Lead with the selected 3D direction, current implementation, and this cleanup sequence. Separate active guidance from historical 2D references. Replace undated claims of the latest 24-test suite with dated current evidence.                                                                                         |
| [GDD](../design/GDD.md)                                                                                                                                                                                                                                    | Confirm the 3D presentation direction where needed while retaining empty inventory, manual opening, cumulative production, research payment, and environmental trade-offs. Keep architecture and asset specifications in their own documents.                                                                           |
| [TDD](../design/TDD.md)                                                                                                                                                                                                                                    | Replace the active Phaser/sprite stack and ownership descriptions with Babylon/Editor boundaries. Retain the plain simulation, fixed-step, transaction, and persistence design. State which systems are implemented, scaffolded, or planned.                                                                            |
| [Roadmap](README.md)                                                                                                                                                                                                                                       | Update the folder map, milestone summaries, renderer references, and dependencies for 3D. Remove duplicate detailed checklists in favour of links to milestone files, retaining its overview and diagram sources. Preserve gameplay completion requirements.                                                            |
| [Milestone 1](milestone-01-project-and-integration.md)                                                                                                                                                                                                     | Describe the shared Angular/Babylon lifecycle foundation and remaining 3D checks. Keep 4 October Phaser and lint results as dated historical evidence, rather than changing their numbers in place. Add the later evidence separately.                                                                                  |
| [Milestone 2](milestone-02-simulation-foundation.md)                                                                                                                                                                                                       | Replace active Phaser integration instructions with the Babylon adapter/session boundary; keep authoritative world data, typed commands, fixed steps, and independent simulation checks.                                                                                                                                |
| [Milestone 3](milestone-03-character-and-manual-opening.md)                                                                                                                                                                                                | Replace sprite offsets and 2D projection implementation with ground-plane picking, camera transforms, 3D character binding, logical footprints, and simulation-owned movement. Preserve salvage, crafting, capacity, and exactly-once production checks.                                                                |
| [Milestone 4](milestone-04-first-local-save.md), [5](milestone-05-research.md), [6](milestone-06-first-working-machines.md), [7](milestone-07-transport.md), [8](milestone-08-restoration-and-energy-choices.md), and [9](milestone-09-save-resilience.md) | Retain renderer-independent rules. Replace sprite-specific presentation instructions and old starting-point descriptions where present. Clarify that meshes, materials, scene handles, and Editor components are excluded from saved state. Do not mark unfinished gameplay complete.                                   |
| [Milestone 10](milestone-10-portfolio-prototype.md)                                                                                                                                                                                                        | Replace runtime sprite preparation with model scale, pivots, materials, animation, footprints, and camera readability. Update the architecture explanation and performance checks; separate old shell evidence from future full-game acceptance.                                                                        |
| [3D migration plan](3d-migration.md)                                                                                                                                                                                                                       | Reconcile against current source and this sequence. Retain completed evidence, remaining authoring/lifecycle work, and renderer cutover checks. Align its removal gate with Phase 4 below; animation polish and the manual opening can continue after the old renderer is removed.                                      |
| [Phase 1 walkthrough](../history/3d/phase-1-walkthrough-2026-10-11.md)                                                                                                                                                                                     | Classify as a completed historical walkthrough. Its code-built scene snippets must not appear to be the current Editor-based implementation recipe. Link prominently to the current loader and setup guide; preserve useful rationale and completed checks.                                                             |
| [Phase 2 walkthrough](3d-phase-2-walkthrough.md)                                                                                                                                                                                                           | Keep as active implementation guidance, updating excerpts against the authored loader and actual input/disposal ownership. Empty suggested files are not completed systems.                                                                                                                                             |
| [Editor setup guide](babylon-editor-setup.md) and [asset-source README](../../assets/README.md)                                                                                                                                                            | Maintain the authoritative current commands, scene units, generated-file rules, supported material registrations, version workarounds, and MCP verification procedure. Update the workflow when watching/reload is implemented.                                                                                         |
| [Art document](../art/README.md)                                                                                                                                                                                                                           | Keep the approved visual identity and progression. Replace active 2D production requirements with a 3D production brief. Move sprite-sheet dimensions, directional-frame requirements, and pixel tile footprints into clearly labelled historical sections. Identify source models separately from runtime derivatives. |
| [Art prompts](../../art/prompts.md)                                                                                                                                                                                                                        | Preserve the exact old prompts as the historical 2D generation brief. Add clearly separate current concept/reference guidance; distinguish concept images, textures, UI images, and actual runtime models. Keep original generation records unchanged.                                                                  |
| [Tiled plan](tiled-world-integration.md)                                                                                                                                                                                                                   | Archive as `docs/history/2d/tiled-world-integration.md`, with its date and superseded status. Leave a short forwarding page at its old path, repair relative links in the moved content, and link to the Editor path. Preserve useful terrain/walkability/buildability semantics without requiring a Tiled runtime.     |
| [Tileset README](../../art/world/tilesets/README.md), maps, and terrain verification records                                                                                                                                                               | Keep as historical 2D authoring/art records, with an explicit status and link to active 3D guidance. Preserve exact dimensions, prompts, generation/verification JSON, source maps, and provenance. They are not current 3D implementation prerequisites.                                                               |
| [3D character source README](../../art/characters/3d/protagonist-mpfb-v1/README.md) and associated records                                                                                                                                                 | Preserve source statistics, licensing, Blender files, and validation reports. Add clear source-versus-runtime identity where needed; do not describe a rigged model without clips as finished character animation.                                                                                                      |
| [Diagram index](../diagrams/README.md), embedded Mermaid, `.mmd`, SVG, and PNG outputs                                                                                                                                                                     | Update authoritative Mermaid blocks in TDD/roadmap, then regenerate standalone sources and images with the existing tool. Replace active Phaser labels with the Babylon adapter and Editor-to-world-definition flow. Keep implemented and planned systems distinguishable.                                              |
| [AGENTS.md](../../AGENTS.md) and [package metadata](../../package.json)                                                                                                                                                                                    | Document Babylon/Editor ownership and maintainability rules; retain narrowly scoped Phaser rules while its code exists, then remove them at cutover. Replace Phaser product description/keywords as part of the direction cleanup; remove the dependency only after runtime references are gone.                        |

Create a small `docs/history/README.md` when introducing the history folder. Keep source Blender projects, artwork, art references and co-located provenance under root `art/`, retaining the existing character/world/machinery/branding/UI categories. Keep `docs/art/README.md` as the visual design document. The root [art index](../../art/README.md) documents source-versus-Editor/runtime ownership and the historical-path mapping. Repair any broken links to earlier experimental character folders rather than creating empty replacement directories.

Audit links in prose, Mermaid labels, art metadata, scripts, and README navigation before moving files. History pages should state what superseded them and link to the active guidance. Active pages may mention Phaser/Tiled for dated evidence or transition notes, but must not instruct new gameplay work to use them. UI images, textures, and a 3D orthographic camera remain valid.

Source layout change delivered 17 October 2026:

- [x] Move the 159 source/resource files from `docs/art/` into root `art/`, including Blender projects and backups, models, linked MPFB assets, previews, exact prompts and provenance. Retain their existing internal hierarchy.
- [x] Leave visual guidance in `docs/art/README.md`; add an art-resource index and repair links, live metadata paths, reproduction scripts and inventory/export-policy references.
- [x] Preserve original dated report paths as evidence, with an explicit [old/new path and SHA-256 record](../../art/relocation-2026-10-17.json). Rebase only navigation, preserving exact generation prompts and source/licence content.
- [x] Document the relocated MPFB secondary-library setting without rewriting the preserved `.blend` files. Keep Editor imports, runtime copies, maps and gameplay source in place.

**Completion:** a reader can follow the active documentation into a single 3D implementation path, while still finding the original 2D work and its provenance under `art/`.

### Phase 2 Reduce and control exported assets

The [17 October audit](../reports/assets/2026-10-17/README.md) delivers source/hash inventories, the export policy, fresh build comparisons, and browser request evidence. Original sources remain intact; code-level import changes are reserved for the user.

- [x] Build an inventory connecting every deployed asset to its source, size, license, scene/material references, and runtime purpose. Inspect both authored references and browser requests before deleting or relocating anything.
- [x] Review the `assets/ambientcg/Grass001/` source pack. Keep original authoring inputs and provenance outside the deployable export set where appropriate; export only runtime-required texture variants at a resolution justified by the camera and target hardware.
- [x] Choose one canonical authoring model and a documented runtime derivative. Audit the copies of `Protag-v1.glb` under `assets/models/` and `public/assets/models/`, plus packed copies, and remove deployment duplication once their consumers are identified.
- [x] Preserve editable Blender/model sources, exact generation prompts, and original validation reports. Optimisation creates new derivatives with their own checks.
- [x] Establish explicit production export selection through supported exporter configuration or a small export-manifest adapter. If the packer copies all authoring assets, separate source-library material from export inputs without breaking Editor paths.
- [ ] User implementation: evaluate broad `@babylonjs/core` and `@babylonjs/materials` registrations after the route cutover. Keep serialized types required by supported Editor scenes; measure any explicit-registration/deferred-loading change against compatibility. Existing imports and required consumers have already been inspected and retained by cleanup.
- [x] Inspect actual consumers before removing addons, GUI, loader, material, or Recast packages. Distinguish application features from dependencies required by the current Editor tools.
- [x] Produce a fresh export/build in verified workspace-local generated directories and compare disk contents and scene requests with Phase 0. Do not hide assets solely by deleting generated files that the next export restores.

Broad registration imports were inspected and left unchanged: compiled JavaScript hashes and request measurements are identical. Experiments changing imports/lazy boundaries would alter user-owned application code and remain a separate task. The current serialized runtime character is retained; this pass creates no new model or texture derivative.

Record initial-menu and first-world transfer figures separately from installed/build size. Report changes against the baseline; any new enforceable bundle or asset limits should be explicit project decisions.

**Completion:** exported files have identified runtime purposes, the oversized grass source pack is excluded or replaced with appropriate derivatives, and the two scenes still load without missing resources.

### Phase 3 Stabilise the 3D development workflow and fixture

The [17 October workflow validation](../reports/workflow/2026-10-17/README.md) delivers saved-input watching, staged export/rollback and explicit no-body physics checks through tooling. The user implements the remaining runtime lifecycle/input, fixture and world-definition work below.

- [x] Make saved Editor assets and attached presentation scripts trigger export during development, with browser reload only after successful export. Exclude generated outputs/caches from watch inputs and coalesce overlapping saves.
- [x] Report export failures visibly and preserve the last successful output. Keep normal build/test commands responsible for generating their inputs, and document the equivalent sequence for direct Angular targets.
- [x] Keep the export wrapper's current physics workaround narrowly scoped and documented. Fail clearly if a future scene adds physics bodies without an intentional physics setup.
- [ ] Finish the Phase 2 input/lifecycle work: viewport focus, modal input blocking, clearing held controls, hidden-tab/zero-size suspension, reset timing, graphics failure/recovery, and teardown. Preserve the existing generation guards, transition tokens, first-frame readiness, one loop, and late-load disposal.
- [ ] Implement the empty input/activity/clock modules only where required by those responsibilities; remove unused placeholders rather than treating their existence as progress.
- [ ] Author one flat 10 by 10 fixture with a two-metre grid, spawn, deposit marker, and blocker. Validate camera control, ground picking, grid bounds, and object placement. The protagonist may remain static for this checkpoint.
- [ ] Compile marker metadata into a versioned plain `WorldDefinition`, without executing presentation scripts. Reject duplicate IDs and invalid coordinates/footprints; prove the centimetre/metre conversion at the boundary. This defines initial layout, not mutable gameplay or a save format.
- [ ] Recheck desktop MCP project/scene identity and a harmless query when the Editor is open. Keep the existing plugin and installed-Editor coupling documented rather than expanding it into gameplay infrastructure.

**Completion:** saved authoring changes reach the browser reliably; the small fixture has consistent plain layout data; focus, errors, suspension, and repeated mount/unmount behave correctly.

### Phase 4 Make Babylon the default and remove the 2D runtime

The cutover gate is a working 3D shell and authored fixture, including Phase 3 lifecycle/input and coordinate checks. It does not require a finished research tree, animated protagonist, or complete manual opening. This shortens the period in which both renderers must be maintained.

- [ ] Load the Babylon game feature and its renderer through an appropriate lazy boundary, then make it the default `/` implementation. Preserve `/3d` as a compatibility redirect to `/` and verify direct navigation and reload.
- [ ] Remove the default factory's Phaser import and the eager Babylon route import as part of the route/factory change; verify the production dependency graph rather than relying on a lazy component declaration alone.
- [ ] Remove Phaser bootstrap, bridge, scenes, game objects, obsolete event contracts, renderer-specific tests, and the Phaser package after checking all consumers.
- [ ] Retain and adapt shared lifecycle, scoped injection, actual Play Game/Retry, resizing, teardown, asynchronous failure, and accessibility coverage. Replace valuable behavior coverage before deleting the old renderer tests.
- [ ] Remove 2D player/terrain assets from browser-served folders once unused. Preserve historical sources, Tiled maps, prompts, and verification tooling in their organised locations, repairing links to any relocated runtime copies.
- [ ] Update path aliases, lint rules/fixtures, package description/keywords, README commands, agent guidance, and dependency lockfile to match the final source tree.
- [ ] Run a fresh build and confirm Phaser is absent from both application imports and emitted dependencies. Confirm historical 2D sources are not copied into the browser output.

**Completion:** both entry URLs lead to one Babylon runtime; there is no Phaser application dependency; shared behavior remains covered; archived 2D work is discoverable without entering the runtime.

### Phase 5 Close the cleanup and resume gameplay

The current documentation/reference handoff is delivered in the [cleanup report](../reports/cleanup/2026-10-17/README.md). The checks below distinguish that completed work from final validation after user-owned runtime changes. The [implementation checklist](3d-implementation-checklist.md) supplies files, order and acceptance criteria.

- [x] Reconcile current status tables and checklists with delivered work. Archive the obsolete code-built Phase 1 walkthrough with a forwarding page; preserve the earlier 2D archive and leave unfinished runtime requirements open.
- [x] Audit retained Phaser, Tiled, sprite, pixel-projection, old-path and dated-test references. Classifications are recorded in the cleanup report; repeat after cutover removes current consumers.
- [x] Verify current local links/anchors, moved records, art paths and eight matching Mermaid sources/exports. Existing diagram visual checks remain in the dated documentation baseline; no diagrams changed in this handoff.
- [ ] After runtime changes, repeat production export/build, application lint, browser integration/accessibility and lint-tooling checks. Test marker/grid conversion independently of rendering, then refresh documentation checks and inspect any newly regenerated diagrams.
- [ ] After cutover, record final initial-menu/first-world requests, output size, renderer cleanup behavior and remaining issues with a date. Keep the existing asset/workflow measurements as historical comparisons.
- [ ] User implementation: label or hide experimental save controls until real snapshots exist, preserving the test-data database. Do not present random test records as saved progress.

**Completion:** one active 3D stack, an accurate current document set, an explicit historical archive, reproducible asset generation, and measured runtime packaging. Cleanup completion does not mean that gameplay or world saving is complete.

## First gameplay checkpoint after cleanup

Resume Milestones 2 through 4 with a narrow vertical slice:

1. Add plain `WorldState`, typed commands/results, and a fixed-step session with pause/resume behavior.
2. Create a new world from the authored definition, with empty player inventory, no supplied equipment/machines, and no researched technology.
3. Move through the Babylon input adapter while the simulation owns position, normalized speed, collision, and interaction reach.
4. Salvage one deposit and craft one basic material with atomic inventory changes and exactly-once production accounting.
5. Capture, validate, save, reload, and continue that world through the Dexie repository.

Keep the existing research rule ready for later: cumulative production establishes eligibility, current stock pays the research cost exactly once, and spending never reduces production history. Character animation, additional machines, transport, and restoration follow their existing milestones once this opening works.

## Suggested review batches

| Batch | Deliverable                                                                                  |
| ----- | -------------------------------------------------------------------------------------------- |
| 1     | Existing Editor integration checkpoint and dated baseline.                                   |
| 2     | Current 3D docs, historical 2D archive/forwarding links, and regenerated diagrams.           |
| 3     | Asset/export inventory, runtime derivatives, packaging corrections, and measured comparison. |
| 4     | Automatic authoring workflow, lifecycle/input completion, and validated authored fixture.    |
| 5     | Babylon default route, Phaser removal, adapted tests, and updated dependencies/guidance.     |
| 6     | Final documentation/reference audit, validation record, and gameplay handoff.                |

Keep working authoring and browser checkpoints between batches. Reuse existing lifecycle mechanisms and renderer-independent gameplay plans; introduce new modules only where the next checkpoint needs them.
