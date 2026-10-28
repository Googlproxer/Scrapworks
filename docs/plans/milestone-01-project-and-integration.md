# Milestone 1 Project and integration

Updated 28 October 2026. Status: complete for project integration. The reviewed project changes are committed and the full clean-checkout CI workflow passes with pinned Yarn. Gameplay snapshots remain owned by Milestone 4.

Angular owns UI; Babylon is the sole world renderer and the Editor owns authored scenes. The shared runtime, viewport, plain client contract and asynchronous cleanup guarantees remain. `/3d` redirects to `/`; the [cleanup cutover](3d-cleanup.md#phase-4-make-babylon-the-default-and-remove-the-2d-runtime) is implemented and verified.

[High-level plan](README.md) · [Next milestone](milestone-02-simulation-foundation.md)

## Starting point and current evidence

Superseded integration checklists and packaging audits are recoverable through the [cleanup record](3d-cleanup.md#recovery). Use the migration evidence below for the implemented 3D fixture.

The [23 October migration evidence](../reports/migration/2026-10-23/README.md) records 181 Chromium tests across 19 suites, 27 Node world/export tests, 30 lint-tooling checks, source lint/type checks, a production build and real browser/authoring probes. These validate the migration fixture, not future factory progression or gameplay saves.

## Step 1 Preserve a reproducible project

- [x] Preserve the existing tracked/untracked authoring work in a checksum-verified checkpoint and Git history bundle.
- [x] Record current routes, stack, ownership, and remaining implementation limits.
- [x] Use one active ESLint configuration, with passing rule/format integration checks.
- [x] Record runtime asset/request inventories and deployment measurements in the [migration production evidence](../reports/migration/2026-10-23/README.md).
- [x] Complete clean-install/export reproducibility with pinned Yarn 4.18.1 on the clean GitHub Actions runner; see [full CI evidence](../reports/ci/2026-10-28/README.md).
- [x] Finish the reviewed dependency/authoring commit. The user confirmed review/commit completion; `50cdc89` contains those changes and `e93210d` repairs stale art references exposed by CI.

## Step 2 Retain the shared lifecycle boundary

- [x] Keep Angular features, plain contracts, framework-independent simulation/core, and concrete renderer adapters separate.
- [x] Provide one scoped `GameRuntimeService` to the game page and shared viewport.
- [x] Expose plain replayable loading, ready, error, and stopped states; reject stale callbacks across remounts.
- [x] Mount one canvas/engine/loop per Babylon client, resize through its host, and clean up idempotently.
- [x] Dispose late scene assets after destruction or a superseded transition; publish readiness after a rendered frame.
- [x] Exercise actual Play Game/Retry controls, resizing, failures, and teardown in Chromium.
- [x] Implement focus/modal input ownership, hidden/zero-size suspension, timing reset, and graphics recovery from the [runtime walkthrough](3d-phase-2-walkthrough.md).

## Step 3 Establish the authored fixture

- [x] Keep one `.bjseditor` project with editable MainMenu/Game scenes and browser export/loading.
- [x] Make saved authoring inputs export and reload automatically, with visible failures and no watch feedback loop. See the [23 October tooling/browser validation](../reports/workflow/2026-10-23/README.md).
- [x] Author a flat 10 by 10 grid with two-metre cells, spawn, deposit marker, and blocker.
- [x] Compile plain initial layout with stable IDs, bounds/footprints, and a tested centimetre/metre conversion.
- [x] Validate camera, picking, resize, focus, and repeated mount/unmount on that fixture.
- [x] Make Babylon the default and remove Phaser after the cleanup gate passes; retain `/3d` as a compatibility redirect.

## Step 4 Keep storage and gameplay evidence separate

- [x] Keep the implemented simulation free of renderer and storage dependencies.
- [x] Demonstrate a real IndexedDB controls-settings reload independently of gameplay saves. This does not validate world persistence.
- [x] Implement plain `WorldState`, typed placement commands, and fixed-step behavior in Milestone 2.
Versioned gameplay snapshots remain an unfinished requirement of [Milestone 4](milestone-04-first-local-save.md). Test records and a save dialog do not establish world persistence or block this integration milestone.

## Completion checks

- [x] One default 3D runtime and an authored fixture survive interaction, resize, failure/retry, suspension, and teardown.
- [x] Scene generation and the complete CI workflow succeed from a clean checkout using pinned Yarn; generated outputs remain ignored.
- [x] Runtime packaging excludes unused source-library/2D contents after the asset audit and cutover.
- [x] Active docs and diagrams describe the implemented direction and distinguish unfinished gameplay.

Follow [AGENTS.md](../../AGENTS.md), the [Editor setup](babylon-editor-setup.md), and [cleanup record](3d-cleanup.md). The user authorized the migration implementation and required Phase 7 to reconcile these statuses and stop. No later gameplay implementation follows this update.
