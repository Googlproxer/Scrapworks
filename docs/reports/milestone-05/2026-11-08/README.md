# Milestone 5 research implementation

Implemented locally on 8 November 2026 following the user's authorization of the revised plan and shared-task/queue clarification. This report covers the research slice; physical labs, factory construction/power and transport remain their later milestones. Changes have not been published or qualified by a new hosted CI run.

## Delivered behavior

- Exactly one active technology is shared by Field Research and future labs. The ordered queue supports adding, removing and moving every entry, including the current task. Removing/reordering retains all technology contributions and completed/partial work; re-adding resumes the ledger. Blocked heads wait in order, and completion advances the next head on the next simulation step.
- The catalogue contains 14 paid technologies/seven recipes, preserving the five-technology opening. It adds first-factory research, safe hand/MiniFab Basic research kits and a kit-funded sorting/conveyor research branch. Eight equipment blueprints expose separate construction costs without pretending that physical machinery is present. Broader unpriced branches remain unavailable.
- The research panel shows queue controls, stable focus, prerequisite and history requirements, current bag stock, permanent contributions, work and recipe/blueprint unlocks. Field enable affects bag withdrawals only. Future lab scaling and exact fabrication arity are explained without operational controls for nonexistent machinery.
- Plain shared work rules prove source-local payment, deterministic supplied-lab ordering, 4× lab rates/four-slot fixture buffers and useful multi-lab scaling. They preserve partial cycle work and prevent cross-buffer pooling, duplicated payment, final-unit overshoot or unused work spilling into a second technology. The one existing worker remains authoritative.
- Current snapshots save queue order and all ledgers, including removed tasks. The known Milestone 4 `opening-1` content revision converts to `research-1` inside the candidate worker, preserving identities, jobs, stock, history, research and native physics. Conversion never mutates the stored slot or adds offline work; Save subsequently writes the new representation. General migrations/format optimization remain deferred.

[The catalogue and coordination specification](../../../design/research-catalogue.md) records provisional numbers, source identities, construction definitions and exact source/payment semantics. [The Fibery receipt](../../../design/balance/milestone-05-revision-2026-11-08.json) records reused technology IDs and the added kit/cost records. All numeric balance remains provisional.

## Verification

| Check | Result and scope |
| --- | --- |
| Application/template lint and strict game/reference/tooling types | Pass. Updated the benchmark fixture and existing opening callers for queue commands. |
| Simulation/session/persistence | 12 files, **131 tests pass**. Covers current-task edits, removed-ledger retention, blocked heads, invalid/duplicate/completed commands, source-local lab scaling, full paid coal-free research/kit route, safe MiniFab precursors, exact fabrication eligibility, simultaneous mid-kit handcraft/MiniFab continuation, legacy namespace rejection and unchanged legacy inputs/native state. |
| Chromium application/renderer/accessibility | 36 files, **367 tests pass**. Subsequent focused seven-test queue/notification checks also pass after explicit queue ordinal rendering and blocked-head feedback refinement; native controls retain keyboard focus and AXE passes. |
| Tooling | 15 files, **90 tests pass**. |
| Production build and dependency checks | Pass. Main/worker separation, deterministic boundaries and existing bundle limits retained. No physical factory executors or second simulation are added. |
| Built research route | Pass: real IndexedDB legacy slot → Continue → current-task reorder/removal → retained ledger → Save/page reload → re-add/resume → one completion/next head. Desktop/mobile AXE, keyboard activation, queue ordinals, same run identity and one worker verified. |
| Existing built save route | Pass: visible saved handcraft, one MiniFab completion, paused load, unsaved/different-run confirmations, corrupt-slot handling/deletion, page reload and desktop/mobile AXE. |
| Existing production worker route | Pass in normal and deliberately delayed-render modes: startup/paint, input, pause, worker crash/Retry, teardown and built asset/loading paths. |
| Full opening | Pass: automated empty-handed production UI route through all five opening technologies, hand assembly, winding and first automatic plate. This run took about 79.9 seconds of wall time with a virtual test clock; it is not a human pacing qualification. |
| Authoring/assets/documents | Authored export, isolated native watcher/Angular reload, invalid-save retention/recovery and built assets pass. Matching research Mermaid/SVG/PNG regeneration and documentation validation accompany closure. |

Run `yarn test:research` after `yarn build --stats-json`. It reuses the save-browser harness with a real simulation-prepared fixture; only test setup writes the initial IndexedDB row. Gameplay thereafter uses the built UI and storage. No production mutation/debug API is introduced. The CI workflow includes the research route and its diagnostics, independently of the deferred manual performance benchmarks.

[Research acceptance receipt](research-acceptance.json) · [Desktop queue](research-queue.png) · [Large-display layout](research-large.png) · [Mobile requirements](research-mobile.png).

The subsequent UI refinement keeps required material quantities beside field-work time in queue entries and catalogue cards, without opening their detailed requirements. Large displays (at least 1600 × 900 CSS pixels) use `--field-kit-max-width: 50vw` and `--field-kit-max-height: 50dvh`, initialized in [variables.scss](../../../../src/variables.scss) and loaded by the global stylesheet. Existing compact sizing remains in place. Production research acceptance verifies 2560 × 1440 and 3840 × 2160 layouts, runtime variable overrides and accessibility at large/mobile sizes.

## Limits

Laboratories are rule fixtures, not placed gameplay. Their actual power, buffers/transfers and saved instances arrive in Milestone 6, as do machine recipe selection/construction enforcement. Sorting research does not implement conveyors. Advanced fabrication, MiniFab upgrades, broad save migrations, offline progress, coal/pollution, storage/water/greenhouses and restoration remain outside this delivery. No new target-hardware performance or real-time human/controller pacing claim follows from these checks. Catalogue values remain editable provisional balance; changing incompatible historical costs still requires an explicit future compatibility decision.
