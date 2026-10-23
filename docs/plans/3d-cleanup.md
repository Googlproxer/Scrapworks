# Scrapworks 3D cleanup record

Updated 23 October 2026. The user authorized the full migration and cleanup. Source changes now use one Babylon runtime and one Editor authoring path; final browser/production acceptance is tracked in the [migration plan](3d-migration.md). At its Phase 7, update milestone progress and stop.

The [17 October cleanup plan](../history/3d/cleanup-plan-2026-10-17.md), [baseline/progress record](3d-cleanup-baseline.md), and dated asset/workflow reports preserve earlier decisions and measurements. Their original user-only implementation boundary and dual-renderer descriptions are historical.

## Current cleanup

- Babylon is the sole renderer at `/`; `/3d` redirects to it. Phaser code and dependency are removed; plain lifecycle keys are MainMenu and Game.
- The unused former event-bus contract is removed. The retired Babylon title-fitting script and its complete authored MainMenu remain in Git commit `6cd9f6f`; Angular now owns the live title layout.
- Angular owns title imagery, menu/loading/error presentation and controls. Complete old Game/MainMenu scenes, including the former static character and Babylon title, are recoverable from that commit using the [retired scene source recovery instructions](../../assets/README.md#recovering-retired-scene-sources).
- Public sprite/old-GLB duplicates, generated Tiled JSON and unused template star/placeholder are removed. The unique final atlas moved byte-for-byte to `art/world/tilesets/terrain-atlas-v2.png`; historical Tiled sources and useful art/provenance remain discoverable.
- Game markers compile to a plain versioned definition in the same staged publication as scene exports. [Marker authoring](../../tools/world/README.md) defines hierarchy/unit validation and fixture coordinates.
- A private plain WorldState and fixed-step session own movement, occupancy and test placement. Normal worlds receive no inventory, equipment, research or machinery. Test-building availability is confined to an explicit developer fixture.

## Phase 4 Make Babylon the default and remove the 2D runtime

This retained anchor links the former cutover gate to its current implementation. Final acceptance requires direct and redirected navigation, real Play Game/Retry, one canvas/engine per client, input/modal ownership, suspension, camera/picking, scene/world failure retention and no Phaser in the emitted production dependency graph.

The saved camera uses 20–75 degree pitch, 6–24 metre zoom and right-button rotation. The 20 metre ground uses a two-metre construction grid. Character source and animation provenance remain separate from runtime derivatives.

## Validation handoff

Run production export/build, Chromium application tests, lint and lint-tooling tests, `test:world`, export/watcher tests, the isolated dev workflow, asset checks and docs checks. Record new packaging and scene-request results separately from the 17 October baseline. Generated scenes, script registry, caches and test output remain ignored; current authored source files must remain trackable, and retired scenes remain recoverable from Git history.

## First gameplay checkpoint after cleanup

This is a future handoff, not authorization to continue implementation during migration Phase 7. Review Milestones 2 and 3 for the foundation/movement work already delivered, then leave manual salvage/crafting, real local saves and subsequent systems unchecked until separately implemented and verified. Preserve cumulative production and exactly-once research payment semantics in the gameplay design.
