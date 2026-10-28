# Scrapworks 3D migration

Updated 23 October 2026. **Implementation Phases 1.5–6 are complete for the migration fixture. Phase 7 is documentation reconciliation only, and is the stopping point of this work.** The root route is Babylon; `/3d` redirects to `/`. The prior input/control-mapping and Phase 2 walkthrough work is integrated.

The [validation report](../reports/migration/2026-10-23/README.md) records fresh tests, production checks, browser evidence, character budgets and measurement limits. Physical controllers and target-hardware performance remain unverified; automated controller coverage is not a substitute for those checks. Later gameplay milestones have not been implemented.

The separately requested [Controls and turning refinements](../reports/migration/2026-10-23/refinements.md) add smooth facing, spatial menu navigation and tabbed/localisable binding presentation. The supplied turn clips remain in the character asset, but runtime turn playback is disabled at the user's subsequent request; smooth rotation and Idle/Walk/Run remain active. These refinements do not resume later gameplay milestones.

[Roadmap](README.md) · [TDD](../design/TDD.md) · [GDD](../design/GDD.md) · [Art guidance](../art/README.md) · [Editor setup](babylon-editor-setup.md)

## Architecture and ownership

Angular owns pages, dialogs, Controls settings and the application session. Babylon owns the canvas, engine, scenes, device adapter, camera, selection and animated views. One Editor project owns scene layout and presentation assets. Contracts, core and simulation are plain TypeScript.

- [GameRuntimeService](../../src/app/features/game/game-runtime.service.ts) owns a [GameSession](../../src/app/features/game/session/game-session.ts), survives renderer Retry, and rejects obsolete callbacks.
- [WorldDefinition](../../src/contracts/world.ts) is a versioned initial layout compiled from markers. [WorldState](../../src/simulation/world-state.ts) is authoritative mutable state; detached `WorldView` records cross the renderer/UI boundary. [GameState](../../src/contracts/game-state.ts) describes renderer lifecycle only.
- [Simulation](../../src/simulation/simulation.ts) processes typed placement commands, then sampled movement, then publishes the completed tick. The session advances at 20 ticks/second, at most five steps per frame, and discards suspended/excess time.
- [BabylonGameClient](../../src/game/babylon-game-client.ts) owns the single frame source. Input updates precede render eligibility checks. Graphics loss stops the engine loop before UI-only recovery polling; Retry disposes that driver before remounting.
- [WorldScene](../../src/game/views/world-scene.ts) now composes Toolkit core scripts and entity views; see the [core object design](../design/TDD.md#core-object-scripts). Interpolation, camera motion and animation cannot advance authoritative position or future factory systems. This 24 October refactor retains the migration's independent 20 Hz session scheduler.
- Gameplay units are metres on X/Z; Editor presentation uses centimetres. Conversion is confined to compilation and presentation. Babylon's left-handed convention remains intact.

The [TDD diagrams](../diagrams/README.md) and [roadmap diagrams](README.md#additional-implementation-diagrams) distinguish the implemented movement session from future factory and gameplay-save systems.

## Phase 0 Baseline and target qualification

The original pre-migration Phase 0 was skipped. Preserve dated evidence rather than implying a baseline was measured retroactively. Fresh migration-scene measurements now exist, with explicit SwiftShader/headless limitations.

- [x] Preserve original character/Blender sources, active concepts and provenance. Retired experiments, 2D sources and superseded reports were subsequently removed from the checkout on 28 October; see [cleanup recovery](3d-cleanup.md#recovery).
- [x] Record fresh build/test/export results, deployment bytes, browser/viewport/display-scale information and runtime character budgets.
- [ ] Qualify physical Xbox, DualShock and DualSense controllers and the intended physical GPU/browser combination.
- [ ] Establish a target-hardware 60 FPS budget and representative growing-factory benchmark. These are not proved by software-rendered RAF samples.
- [ ] Complete a clean dependency install with the pinned package manager and review/commit the working tree. This run used installed dependencies and did not create a commit.

## Phase 1 Babylon foundation

The engine/client and Editor integration remain implemented. The superseded code-built scene walkthrough is recoverable from Git through the [cleanup record](3d-cleanup.md#recovery).

- [x] One owned engine/canvas per host, asynchronous scene loading, replayable lifecycle, first-render readiness, late-completion disposal and idempotent teardown.
- [x] Real Play Game and Retry flows, independent hosts, failed construction/load, repeated mounting and resize coverage.
- [x] Plain renderer contracts and a factory composition boundary, without Babylon values in Angular session contracts.

## Phase 1.5 Editor-authored world and export

- [x] Keep one `scrapworks.bjseditor` project, editable MainMenu/Game scenes and presentation-only attached scripts.
- [x] Author a 10 × 10 fixture with 2-metre cells, one spawn, scrap deposit and blocker. `World Settings`, `Spawn`, `Deposit` and `Blocker` markers are saved under the Game hierarchy.
- [x] Compile marker metadata and hierarchy transforms into `public/scene/worlds/game.json`, version 1, without executing attached scripts.
- [x] Validate IDs, parent references, finite coordinates, units, alignment, bounds, terrain and rotated footprints before publication.
- [x] Publish scenes, compiled world and generated script registry together through staged export/rollback. Invalid saved content preserves the previous working output.
- [x] Require the compiled world in packaging checks and compare it with current authoring inputs; a stale pre-compiler exporter cannot silently pass the audit.
- [x] Verify saved authoring reload, failed-export retention and corrected-save recovery through the [real watcher workflow](../reports/workflow/2026-10-23/README.md).

The compiler and authoring schema are documented in [tools/world](../../tools/world/README.md). Restart `yarn dev` after changing exporter/compiler code so the running watcher reloads its modules.

## Phase 2 Input, controls and lifecycle

- [x] Complete `DeviceSourceManager → InputCapture → ActionEvaluator`, return action frames, consume each frame once and stop dispatch after ownership or client changes.
- [x] Support keyboard, mouse, Xbox, DualShock and DualSense mappings, automatic assignment, connected-controller selection and disconnect fallback. Touch controls are excluded.
- [x] Separate requested ownership from effective gameplay/UI/suspended context. Poll controllers in menus and block held buttons/sticks until release/centre after context changes or rebinding.
- [x] Add scoped Angular navigation, activation and cancellation while preserving native text editing/navigation, preventing duplicate activation and restoring dialog focus.
- [x] Deliver Controls with button/directional alternatives, stick choice/deadzones, conflict feedback, reset defaults and standalone Ctrl/Alt/Tab capture. Escape remains an unconditional exit.
- [x] Persist validated bindings in the separate `ScrapworksSettings` Dexie database. Existing test-save data is untouched. Controller selection applies immediately; binding edits apply on Save.
- [x] Handle captured mouse release outside/after dialogs, suppress the capture click, and preserve controller selection across dialog reopen and renderer Retry.
- [x] Complete resettable frame timing, explicit/ref-counted browser activity, hidden/zero-size pause, paused same-scene handling, accessible status, partial-construction cleanup and context-loss recovery.

See the reconciled [Phase 2 walkthrough](3d-phase-2-walkthrough.md) for implemented ownership and lifetime rules. Physical-device checks remain separate from the passing automated mapping tests.

## Phase 3 Authoritative movement and camera

- [x] Replace the logging scaffold with application-owned world state, typed command/results, detached views and a bounded fixed-step session.
- [x] Start normal worlds with empty inventory, equipment, machines, research and production totals. A map deposit is a resource in the world, not a possession.
- [x] Implement camera-relative movement, normalized diagonals, sprint, circle/footprint collision and map limits: radius 0.35 m, walking 1.5 m/s, sprinting 3 m/s.
- [x] Preserve the authored perspective camera and 0.8-radian FOV. Follow smoothly without changing the selected orbit; clamp pitch to 20–75 degrees and radius to 6–24 metres.
- [x] Use right-button drag/right stick for orbit and wheel/triggers for zoom; keep primary interaction separate.
- [x] Compare orthographic presentation on the same fixture and retain perspective by default. Both screenshots are in the validation evidence.
- [x] Verify deterministic stepping, equal movement across render schedules, bounded catch-up, collision, pause and no suspended-time advancement.

## Phase 4 Current character derivative

- [x] Create a versioned derivative of the user's current `Protag-v1`, preserving its original Blender/export files and separate older MPFB artwork.
- [x] Retarget existing locomotion-pack Idle/Walk/Run and left/right turn clips using bind/rest transforms and remove horizontal root travel. Runtime blends Idle/Walk/Run from published movement and pauses them with gameplay; the retained turn clips are disabled at the user's request. Smooth visual heading remains independent of authoritative movement.
- [x] Load the animated derivative at the Editor-authored `player-visual` anchor and remove the duplicate static rig from the active scene.
- [x] Retain source hashes and the archive's actual provenance. Embedded `mixamo.com` metadata does not establish an acquisition URL or standalone license document.
- [x] Meet runtime budgets after the turn-clip refinement: 4,236,032 bytes (4.04 MiB), 37,655 triangles, 10 materials, 52 joints and textures at most 2048 pixels.
- [x] Remove redundant texture encodings before targeted concealed-geometry removal; verify skin/clothing deformation, feet, root stationarity, transparency, heading, blending and obstruction visibility.

The [asset record](../../art/characters/protagonist-runtime-v2/README.md) contains the editable derivative, reproducible scripts, original hashes, numeric validation and contact sheet. This completes migration locomotion; future interaction animations remain tied to their unimplemented gameplay.

## Phase 5 Picking and development placement

- [x] Terrain-only ray picking and separate entity selection, with CSS/display-scale conversion and rotated-camera tests.
- [x] Controller activity targets the centre of the viewport; mouse activity returns to pointer targeting without idle controller polls overriding it.
- [x] Snapped, quarter-turn previews use the same plain placement validator as command execution: bounds, footprint, reach, occupancy, player overlap and availability.
- [x] Demonstrate accepted/rejected placement in the isolated development configuration with an explicit test-building definition. Production grants no buildings, inventory or research.
- [x] Keep world positions, terrain identity, IDs and footprints plain. Gameplay serialization and restore remain Milestone 4, not scene export.

## Phase 6 Cutover and cleanup

- [x] Make `/` canonical Babylon and `/3d` a redirect. Remove obsolete Boot/Preloader contract values and migrate behavior tests.
- [x] Move title imagery to Angular and retain loading/error/Retry. Add Controls and in-game menu access; hide diagnostic state, focus indicator and test-save UI in production.
- [x] Keep all production Angular templates in separate HTML files; inline templates are confined to tests.
- [x] Remove obsolete public sprites, duplicate static character, generated Tiled export, star/template files and unused event/title runtime code after reference checks.
- [x] Preserve active source art and retain retired scene sources in Git commit `6cd9f6f`, with [recovery instructions](../../assets/README.md#recovering-retired-scene-sources). The historical terrain atlas and old production tooling were subsequently retired in the [28 October cleanup](3d-cleanup.md).
- [x] Repair export/packaging policy, documentation links, outdated input examples, TDD/art/ownership guidance and matching diagram exports.
- [x] Verify production has no Phaser runtime, obsolete asset copies, authoring libraries or development UI. Record current test/build/export results and migration-scene measurements.

## Phase 7 Reconcile milestone progress, then stop

**Documentation only. No resumed gameplay implementation in this phase.**

| Milestone | Verified credit from this migration | Still pending |
| --- | --- | --- |
| 1 Project and integration | Babylon routing, authored fixture, export, lifecycle/input, Controls persistence, production packaging | Clean install and working-tree commit/review; target hardware checks |
| 2 Simulation foundation | Plain state/views/commands, empty initialization, deterministic 20 Hz session, bounded catch-up and pause | Expansion when actual gameplay systems arrive; gameplay-save codec |
| 3 Character/manual opening | Coordinates, movement, picking, collisions, locomotion and deposit data | Salvage, manual crafting, inventory gameplay and their UI/interaction animations |
| 4 First local save | Existing test-data scaffold retained; separate Controls DB verified | Gameplay snapshots, reload/continuation and restore |
| 5 Research | No gameplay credit | Cumulative-production/payment/unlock behavior |
| 6 Machines | Development placement validates footprints only | Real machines, crafting costs, power and production |
| 7 Transport | No gameplay credit | Conveyors, water and transfer accounting |
| 8 Restoration | No gameplay credit | Pollution, restoration, energy/day-night objective |
| 9 Save resilience | No gameplay credit | Revisions, migrations, recovery and gameplay import/export |
| 10 Portfolio prototype | Runtime character, menu/accessibility, production checks and small-scene measurement | Complete acceptance loop, target-hardware/growing-factory benchmarking and portfolio polish |

The detailed milestones and roadmap are reconciled from the evidence above. The migration implementation stops here. A future request is required to resume gameplay work.
