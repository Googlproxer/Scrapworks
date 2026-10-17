# Scrapworks documentation

Updated 17 October 2026.

Scrapworks is a browser-first 3D factory-restoration game. Angular owns the interface, Babylon.js owns world presentation, Babylon.js Editor owns authored scenes/layout, and plain TypeScript will own gameplay and versioned local saves.

## Active guidance

- [3D cleanup plan](plans/3d-cleanup.md): ordered cleanup, documentation treatment, asset/export audit, and the renderer-removal gate.
- [Cleanup baseline and progress](plans/3d-cleanup-baseline.md): verified preservation checkpoint, dated validation, and remaining work.
- [Asset/export audit](reports/assets/2026-10-17/README.md): source/consumer inventories, export policy, before/after browser measurements, and deployment cleanup results.
- [Game Design Document](design/GDD.md): empty-handed opening, progression, research, environmental trade-offs, and prototype scope.
- [Technical Design Document](design/TDD.md): ownership, current implementation, planned simulation/persistence, and architecture diagrams.
- [Art Document](art/README.md): current 3D production brief, visual identity, readability, and source/runtime asset distinctions.
- [Implementation roadmap](plans/README.md): milestone order and detailed gameplay checklists for the user to implement.
- [3D migration details](plans/3d-migration.md): completed renderer foundation and remaining authoring/lifecycle/camera work.
- [Editor/MCP setup](plans/babylon-editor-setup.md): executable authoring, export, and desktop-tool workflow.
- [Phase 2 walkthrough](plans/3d-phase-2-walkthrough.md): unfinished focus, input ownership, suspension, and graphics recovery work.

## Current implementation

Use [your implementation checklist](plans/3d-implementation-checklist.md) for the remaining application/game changes, with concrete files and acceptance checks. The [cleanup handoff report](reports/cleanup/2026-10-17/README.md) records source tracking, reference classifications and environment limits.

Both renderers remain in the checkout: `/` runs Phaser and `/3d` loads the Editor-authored Babylon MainMenu and Game scenes. The shared runtime and viewport handle mounting, lifecycle state, failures, retry, and cleanup. The 3D fixture includes a static rigged protagonist.

The simulation is a queue/logging scaffold; Dexie stores test records. There is no authoritative world, manual gameplay loop, research, automation, or gameplay-save round trip. Automatic scene export/reload and failure retention are implemented by `yarn dev`; see the [workflow validation](reports/workflow/2026-10-17/README.md). World-marker compilation and Phase 2 input/activity work remain for user implementation. Documentation cleanup does not change those statuses.

The [17 October validation record](plans/3d-cleanup-baseline.md) replaces undated latest-test claims. Older results remain in dated historical records. The user owns actual game implementation; cleanup work may add supporting tools without changing gameplay source.

## Organisation and history

- `design/`: gameplay and technical design.
- `plans/`: current roadmap, checklists, migration, setup, and cleanup progress.
- [art/](art/README.md): the current visual design document.
- [../art/](../art/README.md): source Blender projects, artwork, references, exact prompts, licensing and validation records at the repository root.
- [diagrams/](diagrams/README.md): editable Mermaid sources and matching SVG/PNG exports.
- [history/](history/README.md): superseded 2D implementation instructions and dated evidence.

The [historical Tiled plan](history/2d/tiled-world-integration.md), [earlier sprite production brief](history/2d/art-direction-2026-10-04.md), [original art prompts](../art/prompts.md), and [tileset records](../art/world/tilesets/README.md) preserve the 2D work. Their pixel dimensions and sprite-sheet requirements are historical. The approved flat finish, character identity, and environmental/machinery progression still inform 3D production.

Authored Editor assets live in `assets/`; generated browser scenes live in ignored `public/scene/`. `public/assets/` keeps its original files, while Angular excludes unused GLB/map/atlas/template copies from deployment. The [export tools and policy](../tools/scenes/README.md) retain manifest-declared scene dependencies without shipping the whole source library. Use the [cleanup tools](../tools/cleanup/README.md) to preserve work and check links/diagrams.
