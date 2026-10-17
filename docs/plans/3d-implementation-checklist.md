# Your 3D implementation checklist

Prepared 17 October 2026 against Angular 22.2.2 and the current source. You own every application, runtime and gameplay change below. Cleanup has delivered documentation/history, the root `art/` layout, deployment asset selection and the automatic Editor export workflow.

[Cleanup plan](3d-cleanup.md) · [Progress and validation](3d-cleanup-baseline.md) · [Runtime walkthrough](3d-phase-2-walkthrough.md) · [Gameplay milestones](README.md)

Work in this order. The Babylon cutover needs a reliable authored shell and coordinate fixture; it does not need finished animation, research or machines. Keep each checkbox open until its acceptance check passes.

## 0 Review the preserved repository

* [ ] Review `git status` and `git diff`, including the earlier user-authored Editor integration and the art moves. Track the `.bjseditor` project, complete `assets/` scenes/library, root `art/`, tools and docs together. Run `yarn cleanup:audit`; its JSON lists the untracked source/tool paths. Nothing was staged or committed during cleanup.
* [ ] In a clean checkout with package-host access, confirm Yarn 4.18.1 and run `yarn install --immutable`, then `yarn scenes:export` and `yarn build`. The installed-dependency build works, but Corepack's offline cache lacks the pinned release; a fresh bootstrap is unverified. Keep the current lockfile unless an intentional dependency change requires updating it.
* [ ] Open the one Scrapworks Editor project and run `yarn editor:mcp:check`. Check project/scene identity before any scene edit. The Editor was closed during the final documentation handoff.
* [ ] After reviewing/staging authored inputs, run `node tools/cleanup/audit-repository.mjs --require-tracked`. It must report no ignored sources, tracked generated files or remaining untracked source/tool files. Generated scenes, script registry, caches,  `tmp/` and build output stay ignored.

**Acceptance:** a clean checkout contains all authored inputs, installs the locked dependencies and produces both scenes through the project export wrapper. The [checkpoint/provenance notes](../reports/cleanup/2026-10-17/README.md) preserve the earlier work and remaining environment limits.

## 1 Make the save experiment explicit

Start in [app.html](../../src/app/app.html), [app.ts](../../src/app/app.ts), the [save dialog](../../src/app/features/save/save-load/save-load.component.html) and [save service](../../src/app/features/save/save.service.ts).

* [ ] Hide the experimental save entry from the normal player flow, or label the entry and dialog clearly as a test-data tool. The current button says `Open Save Dialog`; its `name`/`value` records do not save game progress.
* [ ] Preserve the existing `GameSaveDatabase` and test records while designing gameplay persistence. Do not clear or silently reinterpret them as world snapshots.

**Acceptance:** a player cannot mistake the existing test-data controls for a working gameplay save. This can be a small independent change before the renderer cutover.

## 2 Finish Babylon input and lifecycle ownership

Start in [BabylonGameClient](../../src/game/babylon/babylon-game-client.ts), [the authored loader](../../src/game/babylon/assets/load-editor-scene.ts), [GameClient](../../src/contracts/game-client.ts), [GameState](../../src/contracts/game-state.ts) and [GameRuntimeService](../../src/app/features/game/game-runtime.service.ts). The existing [viewport input](../../src/game/babylon/input/viewport-input.ts), [browser activity](../../src/game/babylon/lifecycle/browser-activity.ts) and [frame clock](../../src/game/babylon/timing/frame-clock.ts) files are empty placeholders.

* [ ] Implement focused viewport input, held-key clearing and camera attachment under one owner. Require Game scene readiness, visible document, nonzero host size, canvas focus, UI permission and no error. Keep menu controls detached. Move control attachment out of unconditional scene preparation.
* [ ] Add a plain input-permission hook through the contract/runtime and connect it to blocking dialogs. Closing one dialog must not unblock input while another remains open. Keep keyboard Tab navigation and a visible focus indication.
* [ ] Implement hidden-document and zero-size suspension, a paused lifecycle state and resettable frame timing. A scene that finishes loading while hidden must not publish ready before a usable rendered frame. Resume without adding a render loop or stealing focus.
* [ ] Route WebGL/context failure through the existing error and Retry/remount flow. Preserve transition tokens, stale-load disposal, first-frame readiness and idempotent teardown.
* [ ] Use the three placeholder modules only for these responsibilities; remove a placeholder if its responsibility is deliberately consolidated elsewhere. Keep simulation movement and rules outside these modules.

**Acceptance:** the [Phase 2 walkthrough checks](3d-phase-2-walkthrough.md) pass for focus changes, multiple modals, held-key release outside the canvas, hidden/zero-sized load completion, resume without catch-up, context loss, Retry and repeated mount/unmount. Retain existing lifecycle and accessibility coverage.

## 3 Author the fixture and compile its plain definition

Start with [the Editor project](../../scrapworks.bjseditor), [Game scene](../../assets/game.scene/), [the migration sequence](3d-migration.md#user-implementation-sequence-still-pending) and the [TDD](../design/TDD.md). Define the plain schema before adding a compiler; `tools/world/` remains a proposed location, not an implemented module.

* [ ] Author a flat 10 by 10 grid of two-metre cells with a player spawn, scrap deposit and blocker. Keep the static rig if useful; animation is not this gate. Do not grant starting inventory, equipment or machines.
* [ ] Define stable marker IDs, grid origin/bounds, footprints and a versioned plain `WorldDefinition`. Editor units are centimetres: 200 units is a two-metre cell. Convert to gameplay metres once at the authoring/presentation boundary; retain the Editor's existing glTF scaling.
* [ ] Extract authored metadata and transforms without executing attached presentation scripts. Reject duplicate IDs, unsupported versions, nonfinite/out-of-bounds values and invalid alignment/footprints. Handle parent transforms deliberately.
* [ ] Keep authored initial layout, mutable `WorldState` and gameplay snapshots separate. Mesh detail and scene serialization must not become occupancy or save authority.

**Acceptance:** camera control and ground picking identify the expected grid cells; a blocked cell is represented consistently. Plain tests cover origin/bounds, centimetre/metre conversion, parent transforms, duplicate IDs and quarter-turn footprints. Bad authoring fails visibly without replacing usable output.

## 4 Make Babylon the sole runtime

Do this after sections 1–3 pass. Start in [app.routes.ts](../../src/app/app.routes.ts), [the default factory](../../src/app/features/game/game-client-factory.ts), [Babylon bootstrap](../../src/game/babylon/bootstrap.ts), [Phaser bootstrap](../../src/game/bootstrap.ts), [package metadata](../../package.json), [TypeScript paths](../../tsconfig.json) and [lint configuration](../../eslint.config.mjs).

* [ ] Put the game route and Babylon provider behind a real lazy import boundary. Remove the route file's eager Babylon bootstrap import and the root factory token's eager Phaser default. Preserve the existing synchronous `GameClientFactory` boundary inside the loaded feature and per-viewport runtime ownership.
* [ ] Make `/` load Babylon and `/3d` redirect to `/` with full path matching. Check direct navigation and reload for both URLs.
* [ ] Remove Phaser bootstrap, bridge, scenes, game objects and obsolete contract variants after reviewing their consumers. Preserve reusable lifecycle behaviors and tests before deleting renderer-specific tests.
* [ ] Remove the Phaser dependency with the package manager and update the lockfile. Update aliases, lint boundaries/fixtures and agent guidance for the final tree; the existing transition rules are still needed until then.
* [ ] Remove unused 2D browser copies only after their consumers are gone. Preserve original art/provenance in `art/`, historical maps in `map/`, and dated docs in history. Update export-policy entries and their source pointers together if public copies move.

**Acceptance:** both URLs reach one Babylon game, Play Game/Retry/resize/remount and accessibility still work, and production imports/emitted dependencies contain no Phaser. Verify the emitted graph; a lazy page alone does not remove eager renderer imports. Historical sources remain discoverable and outside the browser output.

## 5 Measure optional JavaScript reductions

The [loader](../../src/game/babylon/assets/load-editor-scene.ts) deliberately registers broad Babylon core/material classes so ordinary Editor changes load. The [asset audit](../reports/assets/2026-10-17/README.md) records the unchanged 9.26 MB raw initial JavaScript baseline.

* [ ] Measure the new route graph after cutover before changing registrations.
* [ ] Trial explicit registrations or further deferred imports only if the supported Editor scene/material set is clear. Preserve required Grid/Sky/Water material support, loader types and attached-script dependencies.
* [ ] Recheck GUI, addons, Recast and material consumers before removing packages; some are required by Editor tools despite having no visible gameplay feature.

**Acceptance:** a fresh export/build, both scenes and supported authoring changes pass without missing serialized classes or imports. Record menu and first-world request totals separately from build size. Keep broad registrations if the compatibility cost exceeds the measured benefit; this is not a blocker for the narrow opening.

## 6 Build the first gameplay and save slice

Resume [Milestone 2](milestone-02-simulation-foundation.md), [Milestone 3](milestone-03-character-and-manual-opening.md) and [Milestone 4](milestone-04-first-local-save.md) in order. Their files contain the detailed rules.

* [ ] Replace the string/logging [simulation scaffold](../../src/simulation/simulation.ts) with plain `WorldState`, typed commands/results and one mutable-state owner. Create an empty-handed new world from the authored definition.
* [ ] Add deterministic fixed steps and bounded catch-up, with separate user pause and browser suspension. Reset timing and input on resume/replacement; hidden time gives no offline production.
* [ ] Make simulation state own movement, occupancy, collision and interaction reach. Babylon sends intent and displays views. Add one scrap deposit, atomic salvage and one manual craft with exactly-once consumption/output accounting.
* [ ] Implement a versioned, detached snapshot and repository boundary with a real Dexie/IndexedDB adapter. Await committed writes, validate a candidate before replacement, serialize save/load work, reject stale-session requests and preserve the last good world/save on failure.
* [ ] Reload during a craft and continue it once. Keep cumulative production distinct from spendable stock so later research can consume current stock once without reducing historical production.

**Acceptance:** start empty-handed, walk to scrap, salvage, craft, save mid-craft, reload and continue the same world without duplicating resources or work. A malformed snapshot or failed write preserves the active world and last valid save. Test actual IndexedDB persistence across page reload, not only an in-memory adapter.

## 7 Close the runtime cleanup

* [ ] Run export/build, application tests, lint, lint-tooling tests, export/watcher tests, documentation checks and the relevant browser flows after your changes. Keep `yarn test:workflow` as the isolated save/export-recovery check. Run marker/simulation tests independently of rendering.
* [ ] Record fresh packaging and menu/Game requests with a date; keep the earlier reports intact. Recheck repeated mount/unmount and disposal after replacing renderer code.
* [ ] Update the current README, TDD, roadmap, migration statuses, cleanup checklist and milestone progress to match the implemented result. Regenerate diagrams only when their authoritative Mermaid blocks change.

Run the relevant full validation commands after your runtime changes:

```sh
yarn scenes:export
yarn build
yarn test
yarn lint
yarn test:lint
yarn test:export
yarn test:workflow
yarn assets:check --build
yarn cleanup:audit
yarn docs:check
```

While working with the already installed dependencies, the direct equivalents are `node tools/scenes/export.mjs` , `node node_modules/@angular/cli/bin/ng.js build` (or `test --watch=false` ), `node --test tools/scenes/*.test.mjs` and `node tools/cleanup/check-docs.mjs` . These bypass a missing Yarn bootstrap; they do not establish a clean install.

**Acceptance:** one documented 3D runtime, preserved historical sources, reproducible authored export, honest save controls and measured validation. Research, powered machines, transport, restoration, advanced save resilience and animation polish follow the existing later milestones.
