# Milestone 3 opening implementation

2 November 2026. The user authorized the complete Milestone 3 plan after committing the character/debug baseline ( `581d872` ). The implementation retains one Miniplex authority, one simulation worker and the host-owned 20 Hz clock. Factory systems and gameplay saving remain later milestones.

## Playtest UI follow-up

The 2 November playtest follow-up centres the field kit, separates Inventory & Crafting from Research, removes gathering controls and reserves work/progress space to prevent craft-state layout shifts. World selection handles deliberate ground pickup. A separate top-right notification host is fixed to the global viewport, including while the kit is closed. `UiService.openNotification()` supports tone, accent colour, icon, title/message, timeout, keyed replacement and a dismiss reference. Five visible notices precede a FIFO overflow queue; queued timeouts start only when displayed, and hover/focus pauses dismissal.

Presentation activity is now independent of canvas input ownership. The built app verifies that opening the kit during movement keeps frames and worker steps advancing, stops movement and returns the character to animated idle. The pause menu still freezes simulation and character animation. All 328 browser application/renderer/accessibility tests pass, including queue promotion/lifetimes, warning transitions, keyboard tabs, reserved geometry and world-only pickup. Production compilation, lint and strict TypeScript checks pass. Follow-up browser evidence and screenshots are linked in [the follow-up receipt](ui-follow-up.json); earlier evidence below retains its original scope and source hashes.

The revised empty-handed route reaches its first automatic craft in 264.41 seconds (4:24), with no gameplay waits added. Desktop/mobile full-page axe checks report no violations. The simulation worker remains byte-identical to the opening build; production worker lifecycle/Retry and graph separation pass again. Screenshots: [centred kit](field-kit-tabbed.png), [Research tab](field-kit-research.png), [viewport notification with the kit closed](notification-viewport.png) and [narrow viewport](field-kit-tabbed-mobile.png).

## Delivered behavior

* Empty 24-slot bag and separate tool slot; configurable stacks, 2 m reach, 3 s hand / 1 s prybar salvage, lossless ground overflow/merging and deliberate pickup. The existing authored deposit contains 250, 000 scrap.
* Versioned plain catalogue: five technologies and six opening recipes, explicit capability and eligibility/contribution boundaries, stable authoring source-ID mappings and excluded future content. Runtime never calls Fibery.
* Background Field Research consumes synchronized remaining-input bundles after manual and MiniFab spending, waits without catch-up debt, retains pause/switch progress, and never refunds paid materials.
* Per-unit handcrafting protects output/refund space. Intentional exit warns and suspends; cancellation or forced interruption returns unfinished original ingredients once, preserving finished items/history.
* The personal MiniFab pulls one complete operation at a time, makes researched precursors, reuses output directly, retains legitimate buffers, waits on stock/capacity and dismantles only when the whole return fits.
* A useful unpowered 1x baseline and optional 60 active seconds at 2x. Five reversible turn-equivalents fill the initial battery. Pointer, selected right stick and remappable keys use the same angular accounting; stationary holds add nothing. Only actual processing drains charge, including split expiry/completion steps.
* Field-kit panels present inventory and MiniFab beside each other on wide screens, with a single scroll flow on narrow screens. UI focus blocks world input while simulation continues. Browser focus/visibility loss and menus suspend simulation. Ground items use existing numeric deltas plus stable item mappings, rather than a rich pile-list message each tick.

## Verification

The completed checks include 69 simulation/session cases, 319 Chromium application/renderer/accessibility cases, 55 tooling/world/export cases, immutable dependency installation, lint, production compilation, worker/main dependency separation, build asset validation and actual development reload/export-failure recovery. New tests cover scarcity/contention, protected handcraft refunds, first-tool auto-equipping with a full bag, cancellation residue, whole-return capacity, multi-output preflight, real next-input slot freeing, direct precursors, charge expiry/completion/concurrent winding, solid recovery/re-crafting, detached capture/rebuild and an entirely empty-handed route.

The production browser route uses physical keyboard and native UI actions, not debug resources, pre-unlocks or a sped-up worker. Its passive worker probe only observes completed publications. The final experienced route reached its first unpowered automatic craft in 248.77 seconds. The relaxed reference itinerary reached the same point in 929.82 seconds, including an explicit 40-second reading/decision allowance per research/craft action. Those optional allowances live in the test harness; gameplay imposes none. The relaxed itinerary is a scripted pacing reference, not a human usability study. It ran before the final layout/input and full-bag tool refinements; the final experienced route and regression suite cover those changes without changing the balance.

The earlier [Step 0 scale/performance qualification](../../ecs-worker-implementation/2026-10-30/README.md) remains historical foundation evidence. This milestone does not claim a fresh 100, 000-entity performance matrix, physical input-to-photon or target-device qualification. Existing Babylon/Toolkit peer and Miniplex CommonJS build warnings are retained; no dependency versions changed.

Chromium headless reports both tabs focused even after tab activation and CDP focus-emulation changes. The focus-loss regression therefore injects only `document.hasFocus()` plus the corresponding browser blur/focus event, observing that the actual built worker stops/resumes. It does not mutate world/session state or time. This establishes the browser-signal integration; physical OS/window focus is not claimed. Final acceptance additionally exercises actual pointer and keyboard winding, stationary holds, both handcraft exit paths, original-input refunds and full-page axe checks.

Verification also corrected the asset policy's stale v2 runtime and pre-relocation source paths, and scoped the development workflow's loading locator to the loading message now that gameplay has its own live statuses. Sources remain preserved under `art/characters/Protag/` . TypeScript/HTML/SCSS line endings are pinned to LF for the Windows checkout and Linux CI.

## Reproduce

```powershell
yarn install --immutable
yarn lint
yarn test:tools
yarn test:game
yarn test
yarn build --stats-json
node tools/ecs-bench/verify-production.ts
yarn test:acceptance
yarn test:opening
yarn assets:check --build
yarn test:workflow
yarn docs:check
```

The approximately 15-minute relaxed reference is optional: `node tests/acceptance/opening-browser.ts --relaxed` . It is not added to CI. The experienced empty-handed route is added to CI after production-worker acceptance. Raw local browser artifacts are under ignored `tmp/opening-browser/` and `tmp/opening-browser-relaxed/` .

Retained evidence: [verification and source hashes](verification.json), [final opening route](opening-browser.json), [relaxed reference](opening-browser-relaxed.json), [built-worker acceptance](production-worker.json), [development workflow recovery](workflow.json) and [Fibery completion readback](fibery.json). Screenshots show the [wide field kit](field-kit.png), [narrow layout](field-kit-mobile.png) and [winding control](winding.png).
