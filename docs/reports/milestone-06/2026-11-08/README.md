# Milestone 6 implementation and verification

The later same-day [toolbar/placement feedback follow-up](toolbar/README.md) supersedes this report's coordinate-entry UI and centre-distance placement behavior. The results below retain the initial M6 scope; the current catalogue/plan and follow-up describe saved Equipable/Tools/Placeables controls.

Implemented and locally verified on 8 November 2026 after the user's full authorization. Base revision: `647b4f5`; changes are in the working tree. All checks in the [plan](../../../plans/milestone-06-first-working-machines.md) pass. The [factory catalogue](../../../design/factory-catalogue.md) defines scope and provisional balance. Milestone 6 is complete within that scope; no new hosted CI run or publication is claimed.

## Verified slices

- Same Miniplex worker and 20 Hz host clock; eight paid safe equipment assemblies, seven placed machine kinds and explicit crafted power edges. Existing personal crafting/stock priority and shared research semantics remain in place.
- Seeded five-outcome recycler, exact per-batch solid conservation and three-batch material availability. A bounded pending-result buffer and saved completion marker retain finished blocked output/history without rerolls or duplicate recovery. Residual scrap adds neither extraction nor production history.
- Local manual transfers, construction/deposit claims, exact Basic/Medium arity, wired proportional power, source-local powered labs and finite scrap extraction. Dismantling requires room for the whole bag return before changing any state.
- Current `factory-1` content, compatible detached upgrades for known `opening-1`/`research-1`, factory/native snapshot validation and simultaneous partial recycler/fabricator/extractor/lab continuation.
- Angular Signal Forms factory controls, keyboard-accessible machine list and transfers, existing handcraft exit protection, original procedural Babylon machine silhouettes and explicit visible wires.

Latest passed checks: **151 Node simulation/session/persistence tests**, **371 Chromium application/renderer/accessibility tests**, **90 tooling tests**, strict game/reference/tool types, application/template lint and production build. Tests include whole-value recovery for every machine with the slot freed by placement, final-unit manual/extractor contention, simultaneous partial jobs/lab work during night-time shortage and blocked random-result continuation through the durable codec. Known M5 content is accepted at both envelope and worker validation boundaries. Controller navigation adjusts native numeric fields within their bounds as well as selects/sliders.

The same suites also pass with CI's coverage instrumentation. [Coverage summary](coverage.md): game lines 92.15%/branches 85.04%; tooling lines 50.14%/branches 53.24%. Coverage is informational under repository policy.

Production worker startup/input/pause/crash/Retry, delayed-render execution, regular IndexedDB save/reload/deletion, shared research/known M4 continuation and desktop/mobile AXE pass. The real isolated authoring workflow passes valid-save export/reload, invalid-export preservation and recovery. Source/worker separation, production bundle limits, exported/built asset checks, all eight diagram sources and documentation links pass.

The **full empty-handed built-UI route passes**: earn the opening and all industrial unlocks, gather 550 additional scrap, craft/place all eight equipment types (eight machine instances including two labs, plus eight cables), use recycler output in both fabricators, make four kits, supply two powered labs, complete Sorting and conveyors with Field Research disabled, then Save/page reload/Continue. The restored world has eight machines/eight connections and one worker, preserves run identity and passes desktop/mobile AXE. The separate prepared diagnostic passes the same production/lab/save route but is not used as bootstrap evidence.

The [full-route receipt](factory-results.json), [verification summary](verification.json), [world capture](factory-world.png), [desktop controls](factory-desktop.png) and [mobile controls after reload](factory-mobile.png) retain the evidence. Mobile controls use the field kit's scroll area. The saved route reaches night-time solar zero with wind continuing to power runnable work; exact saved night/blocked/simultaneous continuation is also covered by native-state tests.

[Fibery Milestone 6](https://scrapworks.fibery.io/Project_Tracking/Milestone/6) is Completed with all six existing packages Done, 44 implementation/five numerical-design criteria checked and all six milestone completion checks marked done. Readback confirms cleared Current Focus, M1–M5 still Completed and M7–M10 still Planned. The [catalogue receipt](../../../design/balance/milestone-06-revision-2026-11-08.json) records the 127-row reconciliation; Draft numerical balance and existing whiteboards are preserved.

## Reproduction and integration boundary

Run the package's `test:game`, `test`, `test:tools`, `lint` and production `build:stats` commands, followed by `test:acceptance`, delayed acceptance with `--render-delay-ms=1000`, `test:saves`, `test:research`, `test:factory`, asset checks with `--build`, `test:workflow` and `docs:check`. `test:factory` runs the production build with a virtual browser clock; it earns stock and unlocks through normal UI commands and observes worker publications without mutating simulation state. The prepared diagnostic is `node tests/acceptance/save-browser.ts --factory-controls`. Correctness/browser acceptance is added to CI; the manual performance tool stays outside CI. This work has not been published or verified by a new hosted CI run.

The unchanged authored 10 × 10, 2 m-cell fixture accommodates one solar panel/turbine/recycler/Basic/Medium/extractor and two labs, eight explicit connections including a cycle and reachable manual transfers. Empty-handed spawn and Editor ownership remain intact. Transport, battery/fuel/event weather, Advanced fabrication, MiniFab upgrades, restoration and save-format optimization retain their later milestones. Prototype balance and human pacing/controller playtests are not qualified by automated browser success.

## Manual factory performance

[Raw measurements](performance.json) come from `node tools/factory-bench.ts` on Windows/Node 24.21.0 with an AMD Ryzen 9 7900X3D: the real Simulation, Miniplex, native Rapier collision, 20 Hz steps, bounded four-machine detail publication/inspection and detached native captures. The 64 × 64 synthetic world contains separate connected groups of one wind turbine/four fabricators, at 0, 50, 250 and 1,000 machines. Active machines receive real inputs; idle ones do not. There are 40 warmup and 160 measured steps per case. This tool is deliberately outside CI.

| Workload | Step median / p95 | Publication p95 | Inspection p95 | Capture / rebuild | Snapshot JSON |
| --- | --- | --- | --- | --- | --- |
| No machines | 0.079 / 0.159 ms | 0.063 ms | 0.002 ms | 0.99 / 2.28 ms | 44,776 B |
| 50 active | 0.133 / 0.191 ms | 0.143 ms | 0.089 ms | 2.10 / 5.57 ms | 175,985 B |
| 250 active | 0.436 / 0.557 ms | 0.153 ms | 0.089 ms | 10.95 / 13.95 ms | 700,549 B |
| 1,000 idle | 0.673 / 1.568 ms | 0.126 ms | 0.052 ms | 21.01 / 32.94 ms | 2,425,296 B |
| 1,000 active | 0.703 / 1.143 ms | 0.119 ms | 0.054 ms | 22.67 / 38.77 ms | 2,672,518 B |

The no-machine row is the matched current-runtime baseline; [M3 foundation qualification](../../ecs-worker-implementation/2026-10-30/README.md) remains historical evidence with different workloads. At 1,000 active machines, compute remains well inside a 50 ms tick, and detail count stays four. The roughly 59.7 KB publication includes explicit topology. These Node measurements do not establish main-thread receiving cost, 1,000-machine renderer FPS, physical-controller usability or target-device pacing. Capture/rebuild and JSON growth support the already-deferred Milestone 9–10 save-performance review; the save representation was not optimized here.
