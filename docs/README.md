# Scrapworks documentation

Updated 24 October 2026. The technical design describes Toolkit core scripts and independent gameplay ticks. Dated migration acceptance remains in the migration plan.

Scrapworks is a browser-first 3D factory-restoration game. Angular owns the interface, Babylon.js owns world presentation, Babylon.js Editor owns authored scenes/layout, and plain TypeScript owns world state, movement and placement rules. Factory progression and versioned local saves remain planned.

## Active guidance

- [3D cleanup record](plans/3d-cleanup.md): active asset boundaries, source provenance and renderer acceptance checks.
- [Cleanup baseline and progress](plans/3d-cleanup-baseline.md): verified preservation checkpoint, dated validation, and remaining work.
- [Asset/export audit](reports/assets/2026-10-17/README.md): source/consumer inventories, export policy, before/after browser measurements, and deployment cleanup results.
- [Game Design Document](design/GDD.md): empty-handed opening, progression, research, environmental trade-offs, and prototype scope.
- [Technical Design Document](design/TDD.md): ownership, current implementation, planned simulation/persistence, and architecture diagrams.
- [Art Document](art/README.md): current 3D production brief, visual identity, readability, and source/runtime asset distinctions.
- [Implementation roadmap](plans/README.md): milestone order and detailed gameplay checklists, reconciled with migration progress.
- [3D migration details](plans/3d-migration.md): renderer, authored world, lifecycle, camera and migration acceptance.
- [Editor/MCP setup](plans/babylon-editor-setup.md): executable authoring, export, and desktop-tool workflow.
- [Runtime walkthrough](plans/3d-phase-2-walkthrough.md): current lifecycle/input/session ownership and historical implementation links.
- [Authoring workflow validation](reports/workflow/2026-10-23/README.md): real export/reload, failed-save retention and corrected-save recovery.

## Current implementation

Use the [migration plan](plans/3d-migration.md) for the current implementation and validation checkpoint, supported by the [acceptance checklist](plans/3d-implementation-checklist.md). The [17 October cleanup handoff report](reports/cleanup/2026-10-17/README.md) preserves the former implementation order and dated environment evidence.

Babylon is the only renderer: `/` loads Editor-authored MainMenu and Game scenes and `/3d` redirects to it. Angular owns menu imagery and controls. Active Game authoring contains the 10 by 10 world markers, reusable geometry, camera and neutral character binding; the retired static rig and Babylon title are [recoverable from Git commit `6cd9f6f`](../assets/README.md#recovering-retired-scene-sources).

The plain simulation now owns world data, fixed-step movement, collision and fixture placement checks. New worlds have empty inventory/equipment/research. Manual salvage, crafting, research, automation and gameplay saving remain unimplemented; Dexie still stores separate test records. Saved world markers compile without executing scripts and publish atomically with the scenes. Automatic export/reload and failure retention remain available through `yarn dev`.

`WorldScene` composes focused Toolkit scripts for player input and presentation, camera, selection and placement. Plain `PlayerMotor` owns authoritative movement. Optional script tick hooks join the existing independent 20 Hz session scheduler; no physics scheduler or second frame loop is introduced. [Factory ECS](design/TDD.md#future-factory-ecs), with Miniplex the first candidate to evaluate, is deferred to the first-working-machines milestone.

The [17 October validation record](plans/3d-cleanup-baseline.md) is dated historical evidence. Current migration validation is recorded separately. The user authorized this runtime migration on 23 October and explicitly required Phase 7 to update milestone progress and stop, without resuming the later gameplay milestones.

## Organisation and history

- `design/`: gameplay and technical design.
- `plans/`: current roadmap, checklists, migration, setup, and cleanup progress.
- [art/](art/README.md): the current visual design document.
- [../art/](../art/README.md): source Blender projects, artwork, references, exact prompts, licensing and validation records at the repository root.
- [diagrams/](diagrams/README.md): editable Mermaid sources and matching SVG/PNG exports.
- [history/](history/README.md): superseded 2D implementation instructions and dated evidence.

The [historical Tiled plan](history/2d/tiled-world-integration.md), [earlier sprite production brief](history/2d/art-direction-2026-10-04.md), [original art prompts](../art/prompts.md), and [tileset records](../art/world/tilesets/README.md) preserve the 2D work. Their pixel dimensions and sprite-sheet requirements are historical. The approved flat finish, character identity, and environmental/machinery progression still inform 3D production.

Authored Editor assets live in `assets/`; generated browser scenes and plain world definitions live in ignored `public/scene/`. `public/assets/` contains live browser assets. Historical art/maps remain outside deployment; retired authored scenes are preserved in Git as described above. The [export tools and policy](../tools/scenes/README.md) retain manifest-declared dependencies without shipping the whole source library.
