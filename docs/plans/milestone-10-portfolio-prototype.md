# Milestone 10 Portfolio prototype

Implemented 10 November 2026 on `master` based on `3b7daa2`, with local uncommitted changes. Status: **In Progress**. Milestones 1–9 remain Completed. M10's current-asset engineering delivery is implemented; human pacing/balance remains provisional because the user chose to playtest later. The separate asset plan remains deferred and untouched. See [implementation evidence](#implementation-verification--10-november-2026) and [local handoff instructions](../portfolio/README.md). Prerequisite: [Milestone 9](milestone-09-save-resilience.md), complete.

Deliver the remaining gameplay/UI, balance, testing and local handoff work using the current assets first. Record a representative performance baseline in **Chromium and Firefox on this PC**, with a portable test for later hardware. Then tackle the separate [asset audit and final qualification plan](portfolio-assets-and-final-qualification.md); final performance approval depends on the settled assets. A new player's first all-map restoration checkpoint still targets **30–60 minutes of real play**, followed by continued play. Hosting is a separate choice.

[High-level plan](README.md) · [Previous milestone](milestone-09-save-resilience.md)

## Agreed scope and decisions — 10 November 2026

- **Defer the asset audit until the other tasks are delivered.** The separate [asset plan](portfolio-assets-and-final-qualification.md) owns the audit, replacement selection, selected presentation work and final qualification. Continue onboarding, balance, baseline testing and the local handoff with current assets. Preserve the complete protagonist mesh; its polygon optimisation remains with the user.
- **Separate baseline measurements from final qualification.** M10.4 records the current assets and reproducible workload as the comparison baseline. Repeat the same protocol after the asset plan settles the final assets; the baseline cannot establish final renderer, loading, memory or bundle performance.
- **Support Chromium and Firefox on this PC.** Record browser versions, OS/CPU/GPU, viewport, device pixel ratio and build revision during qualification. Responsive UI checks remain required; touch/mobile, other engines and other hardware are not established support claims.
- **Make hardware testing portable.** Deliver a documented manually invoked production-browser test with browser selection, deterministic workloads, phase timings, thresholds and an exportable result manifest. The user can run it on other hardware later. Missing second-device evidence is an explicit follow-up, not a claim of lower-end qualification or a blocker for this local artifact.
- **Target 30–60 minutes to first restoration for a new player.** Retain earlier tools/MiniFab opening targets and test them with real-time human play. Scripted/accelerated routes establish reachability and correctness, not human pacing.
- **Deliver a local production artifact.** Include static-preview/setup instructions, controls, portfolio material, attribution, support/measurement results and known limits. Hosting choice, upload and public release remain separate.
- **Keep the established objective and rules.** All 400 land/water cells on the 20 by 20 map reaching 100% latches completion; play then continues. Preserve the coal-free route, optional coal/mitigation, one research queue, safe crafting and M9 save/recovery policy. Map expansion, new tiers, personal MiniFab upgrades, pure-ore/general-liquid systems, accounts, cloud sync and multi-worker rewrites remain deferred.
- **Preserve storage contracts while polishing.** M9 is the supported compatibility baseline. Presentation-only edits must not invalidate saves. Catalogue or durable onboarding changes require explicit version/validation/continuation treatment; authored-map changes still follow exact-map rejection and must be identified before they land.
- **Keep long diagnostics local.** Full/virtual gameplay, accelerated-clock variants, balancing runs, soaks and performance benchmarks are manually invoked and never added to CI/GitHub Actions. CI retains focused unit/component and fixture integration checks, types, lint, builds and architecture/asset checks. Detailed reports remain local/untracked under `docs/reports/`.

No unanswered product questions remain. The user explicitly deferred the human playtest ("I'll playtest later"); retain the target without claiming it has passed or changing numerical balance without observations. Specific replacements follow the later asset audit. The baseline protocol records the gates below; measured results and unavailable metrics are reported separately from final qualification.

## Current implementation and review findings

| Area                            | Delivered evidence and remaining M10 work                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simulation/worker               | One authoritative Miniplex worker, lean views and actual Angular/Babylon integration were [implemented and qualified](ecs-worker-implementation.md) in M3 Step 0. Later lean/production qualification supersedes the early rich-bridge failure. M10 qualifies the final factory rather than repeating architecture selection.                                                                                                               |
| Opening, research and factories | M3–M7 deliver empty-handed salvage, safe handcrafting, MiniFab/winding, shared research, paid construction, renewables, production/labs, transport and sorting. Status panels/notifications exist; persistent next-action guidance and new-player usability remain M10 work.                                                                                                                                                                |
| Environment and objective       | M8 delivers health-driven terrain/vegetation, water, weather, batteries and optional coal. The [local report](../reports/milestone-08/2026-11-09/README.md) records earned coal-free 400-cell completion and coal/mitigation recovery. Functional procedural visuals do not establish final art approval. Unconsumed infrastructure water returns to its attributed sources; stale generic liquid-loss wording must not override this rule. |
| Persistence                     | M9 delivers named runs, two-active-minute autosaves, five autosave/three manual revisions, recovery, JSON transfer and emergency backup. Its [local report](../reports/milestone-09/2026-11-09/README.md) records 231 Node, 398 Chromium and 90 tooling tests, types/lint/build, actual IndexedDB/reload/import/recovery and desktop/mobile AXE. These are dated results, not fresh M10 or Firefox qualification.                           |
| Performance                     | Existing worker and M8/M9 profiles establish baselines. M9's mixed layouts measure roughly 1.5–1.6 ms median capture, 11.3–12.2 ms IndexedDB writes and 111.5–115.7 ms fresh worker reconstruction, with roughly 1 MB retained per run. They do not establish final renderer FPS, complete load latency, human pacing or other hardware. Overlapping phases cannot be summed into end-to-end claims.                                        |
| Packaging/accessibility         | Static production loading, input/Retry/lifecycle and tested UI AXE states have evidence. Bundle graph limits already exist in `tools/architecture/bundle-limits.json`; reassess final assets/delivery costs. Final screens and both primary browsers still need qualification.                                                                                                                                                              |

M8 and M9 are committed as `1ac2843` and `3b7daa2`; their dated reports describe earlier local verification. This review claims no fresh hosted CI or deployment. Reports may be absent from fresh checkouts; durable scope, decisions and evidence summaries belong in tracked plans/design documents.

## Delivery order

Preserve the seven existing Fibery identities and original step numbers. The delivered engineering chain is **M10.2 onboarding → M10.4 current-asset baseline/portable test → M10.5 production verification → M10.6 scripted gameplay acceptance → M10.7 local handoff**. M10.3 retains the later human pacing/balance check against that handoff; its invariant/affordability audit is delivered. M10.4 depends on M10.2 rather than the deferred human check. M10.1 still follows M10.7 under the separate [asset plan](portfolio-assets-and-final-qualification.md). Final closure requires both human pacing/balance and the asset follow-up; neither is implied by the local engineering handoff.

## Step 1 Deferred asset audit and final qualification

- [x] Establish the migration fixture's understated ground/grid, angled perspective camera and readable protagonist/selection presentation.
- [x] Prepare the current protagonist's runtime scale, ground alignment, materials and idle/walk/run clips, and fixture logical footprints.
      The remaining presentation work is owned by the separate [asset audit and final qualification plan](portfolio-assets-and-final-qualification.md), tackled **after Steps 2–7**. The existing M10.1 task retains its identity and Open state, with its source path/criteria moved to that plan. The two checked migration achievements above remain historical groundwork. Current-asset usability fixes needed by the other tasks can proceed; asset selection/replacement waits for the follow-up.

## Step 2 Finish feedback and onboarding

Existing research, machine, environment and save controls retain M3–M9 credit. This package teaches and refines them.

- [x] Keep fixture diagnostics, IDs and construction test controls outside the production game UI.
- [x] Check implemented menu/controls keyboard focus, input ownership and accessibility; tested migration UI states pass axe.
- [x] Add compact dismissible/reopenable next-objective guidance: movement → scrap → field research/tools → components → MiniFab → renewable factory/labs → transport/sorting → water/greenhouses → 400-cell restoration. Derive completion from authoritative gameplay; loading an advanced run must not force completed tutorial actions again.
- [x] Explain UI-bound handcrafting/refunds, separate research/unlock/equipment ownership, MiniFab precursors/buffers and its inventory-side panel. Optional pointer/controller winding has accessible alternatives; depletion never stops baseline crafting.
- [x] Explain historical research eligibility, available stock, irreversible contributions and timed work before spending; teach the shared field/lab queue and preserved work.
- [x] Audit implemented machine/transport inspection; add missing next actions for inputs/outputs, no power, disconnected ports, incompatible recipes, blocked destinations and full buffers. Keep controls anchored during cycles and pending commands.
- [x] Teach toolbar assignment, B/R placement, two-click power wiring/cancellation, facing material/fluid ports, water supply, renewable variability/storage and optional coal/mitigation. Shortages can wait and pollution is recoverable.
- [x] Refine existing pause/save/recovery/import/export and storage-failure messages; explain committed/unsaved progress, browser-origin ownership and deliberate imported-run activation.
- [x] Verify guide, inventory, research, factory, environment, toolbar and saves with keyboard, existing controller bindings/navigation, focus restoration, live announcements, contrast and responsive layouts. Pass AXE in tested states and review WCAG AA layout/focus/contrast, including reserved conditional status/progress space. Physical controller hardware remains a separate unperformed check.

## Step 3 Balance the complete opening and objective

**Human pacing deferred by the user.** Automated paid routes and conservation/continuation checks establish reachability and correctness. No numerical costs, timing, content version, authored map or save schema changed. Leave the first three items provisional until real playtest observations justify acceptance or tuning.

- [ ] Run real-time empty-handed playtests with a new player and an experienced route; record active play, wall time, confusion/intervention, waits and time/materials at tools, MiniFab, factory, automation and restoration. Record limitations if independent new-player testing is unavailable.
- [ ] Retain improved-tool research at about a minute, requested MiniFab automatic crafting within 15–20 minutes for relaxed new players and under five minutes for experienced players; target first all-map restoration in 30–60 minutes of new-player real play, without minimum waits.
- [ ] Tune combined research/equipment/operation costs so unlocks are affordable to use and the existing map supports the route. Reconcile accepted numbers into runtime, design catalogues and existing Fibery Source IDs; distinguish provisional from playtested balance.
- [x] Compare coal-free and optional coal-heavy/mitigation routes through day/night, rain and Dunkelflaute, preserving research, eventual recovery and continued play after completion.
- [x] Preserve generous finite deposits, useful base components, mixed recycler sorting, solid-value recovery, exact attributed return of unconsumed infrastructure water and explicit consumption. Keep deferred ore/general-liquid systems outside this acceptance.
- [x] Remove unclear waits/failures; re-run affected conservation, payment, timing and continuation checks after tuning. Identify content-version transitions before changing saved rules and preserve M9 compatibility/exact-map policy.

## Step 4 Measure and address performance

The [M9 review](milestone-09-save-resilience.md#implementation-verification--9-november-2026) supports retaining the object save representation. **This package records a fresh representative baseline with the current assets**, supplies the portable test and fixes demonstrated functional bottlenecks. Final asset-dependent qualification belongs to the [later asset plan](portfolio-assets-and-final-qualification.md). Keep the single worker and object format unless measurements justify changes.

**Recorded baseline gates:** the diagnostic stores the thresholds and exact workload/protocol. Reuse them for final qualification. Baseline completion means reproducible evidence, not final performance approval. Final failures require a measured fix or explicit documented scope/threshold decision, never silent post-measurement relaxation. Internal host/delivery timings, total process/GPU memory and physical controller testing remain unqualified where unavailable; frame/input observations do not substitute for them.

| Measurement            | Gate and method                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering              | 60 FPS operating target on this PC in Chromium/Firefox; normal representative frame intervals p95 ≤18.5 ms and p99 ≤33.4 ms, retaining prior 60 Hz targets. Report every repetition/interrupt; 120 FPS remains diagnostic.                                                                                                                                                      |
| Simulation/publication | Retain prior normal-workload worker compute/publication p95 ≤5 ms and p99 ≤8 ms. Separately measure delivery, host apply, UI/render work and command-to-visible feedback. Label stress results separately.                                                                                                                                                                      |
| Saves/loads            | True end-to-end manual/autosave commit p95 ≤250 ms and complete load-to-playable p95 ≤2 s on this PC, including validation and scene/UI reconstruction. Inspect autosave-associated main-thread tasks ≥50 ms and visible hitches; async write duration alone is not a freeze.                                                                                                   |
| Storage/delivery       | Report eight retained revisions/run, aggregate storage and peak observed memory. Use 10 MB per representative eight-revision run as an investigation threshold, not eviction policy. Preserve existing bundle limits; report raw/Brotli main, worker, WASM and asset costs separately. Freeze final asset/loading budgets from the measured artifact before release acceptance. |

- [x] Record small-fixture production asset/request sizes and stationary/movement RAF intervals with renderer/method metadata. This does not measure factory simulation/save cost or qualify target hardware.
- [x] Verify pause/resume and five-step catch-up using controlled long frame deltas plus browser focus/modal transitions.
- [x] Deliver a portable strict-TypeScript local diagnostic with Chromium/Firefox selection, production static serving, deterministic representative fixtures, prerequisites and shareable JSON results. Record revision/dirty state, browser/version, OS/hardware where available, viewport/DPR, seed, workload counts, warmups, repetitions, unsupported metrics and frozen gates. Report unavailable browser-specific memory/Long Tasks APIs; common frame/input timing must work across both browsers.
- [x] Cover an earned renewable/restoration layout, mixed coal/water/transport/research with moving native bodies, and separately labelled crowded-map stress. Record machine/connection/buffer/body counts and active/blocked mix; fixture diagnostics do not establish earned gameplay.
- [x] Record current-asset production rendering, input scheduling and autosave during play in both browsers, with separately labelled simulation/publication phase controls. Include asset/export hashes, build identity, geometry counts where available, loading/payload costs and screenshots of the measured scene. Use three warmed 30-second normal-workload samples and twelve save/load samples; report percentiles/maxima/sample counts. Explicitly retain unavailable internal delivery/application splits and actual command-to-visible timing as qualification limits.
- [x] Separate capture, validation/copying, encoding, IndexedDB commit/retention, fresh worker reconstruction and complete scene/UI replacement. Measure end-to-end costs independently of overlapping phases; evaluate current representation before binary/compression redesign.
- [x] Record observable frame/input/heap behavior through repeated pause/load/host recreation and isolated copying/storage phases; address demonstrated demo issues while preserving deterministic continuation. Internal Angular/delivery/render CPU splits and total process/GPU memory require separate instrumentation before final claims.
- [x] Record current-asset graph/bundle limits, complete raw/Brotli payload/loading costs, memory and baseline gate results. Preserve the workload/seed, commands and local results for direct comparison after final assets; distinguish source, asset, browser or workload changes between runs. Leave the portable command/result format for later hardware, whose qualification stays deferred.

## Step 5 Verify the production build

Verify the current-asset functional artifact now. The asset follow-up repeats affected checks and owns final asset-dependent performance approval; these checks do not wait for new models.

- [x] Run production build/test commands and serve the migration output through a local static preview.
- [x] Verify production routes, scene/world/character loading, input, console output and exclusion of Phaser/retired assets/development UI.
- [x] Check migration resize behavior and Chromium at device pixel ratios 1 and 2.
- [x] Recreate the canvas host and repeat pause/focus transitions without duplicate callbacks or stuck controls in migration tests.
- [x] Verify the current-asset static artifact in Chromium/Firefox on this PC: scene/character/terrain/worker/WASM/fonts, keyboard/mouse/controller input, resize/DPR, pause/focus, crash/Retry, host recreation and teardown, with no unexpected console errors or failed requests.
- [x] Repeat real IndexedDB named runs, auto/manual histories, craft continuation, corrupt-head recovery, invalid import, distinct import/activation and emergency backup under the preview origin in both browsers. Keep focused CI fixtures; full gameplay stays local.
- [x] Verify asset/base-path/CSP and optional Brotli-serving instructions against the artifact, including original fallback. Reconcile build commands, browser prerequisites and final bundle limits.
- [x] Explain that browser profiles/hosting origins own separate saves, storage can be cleared/evicted, and JSON export/import transfers progress. Verify backup instructions without promising cross-origin IndexedDB access.
- [x] Run required types/lint/focused correctness/accessibility suites, production build, documentation, architecture and asset checks. Record exact results/support limits in tracked summaries; detailed reports remain untracked.

## Step 6 Run the complete acceptance route

Reuse earlier earned-route and invariant evidence, then accept gameplay/UI on the current-asset artifact. Final presentation/performance acceptance follows the asset plan. Full routes and performance diagnostics remain local/manual. Human usability and fixture correctness are distinct evidence.

- [x] Start empty, follow guidance, gather scrap, field-research tools/basic crafting and obtain the MiniFab through paid component assembly. Record accelerated route timings as correctness evidence; human opening/restoration timing remains the deferred Step 3 gate.
- [x] Request missing precursors, save mid-work, restore and finish every output once while other activity remains possible. Verify cancellation/refunds and baseline crafting after winding depletes.
- [x] Meet historical eligibility, contribute stock and complete shared field/lab research once; reject overspending/locked recipes and retain queue investment through edits/reload.
- [x] Build renewable recycling/fabrication/labs, automate extraction/supply/sorting, and demonstrate blocked destinations with other routes continuing within capacity. Check solid recovery and attributed unconsumed-water returns.
- [x] Save running jobs, transit, stored energy/water, weather and unfinished restoration. Compare original/restored deterministic branches with identical commands, then export/import a distinct run and repeat continuation checks.
- [x] Reach all 400 land/water cells at 100% without coal, retain completion through later pollution and demonstrate optional coal/mitigation recovery without game over or research lockout.
- [x] Exercise invalid loads/imports, corrupt-head recovery, failed writes, emergency backup and cross-tab conflicts with focused fixtures; preserve play/last good revisions without granting resources to the earned route.
- [x] Complete current-asset Chromium/Firefox routes without unexpected console errors or broken input after pause, resize, recovery or host recreation. Record human-playtest findings separately from automated/performance evidence and retain checkpoints for the later asset regression pass.

## Step 7 Prepare portfolio material

Prepare the local handoff using current assets and label captures/performance as provisional. The asset follow-up refreshes affected screenshots, attribution, measurements and packaged files before final milestone closure.

- [x] Document current migration setup, controls, ownership, limitations and evidence; explicitly separate settings storage from future gameplay saves.
- [x] Write a concise description of restoration, renewable/coal trade-offs and production-based research, with screenshots or a reproducible capture route showing empty/industrial/restored states.
- [x] Explain Angular UI, Babylon presentation, Editor layout, one plain-TypeScript simulation worker and versioned local saves using demonstrated behavior/current diagrams.
- [x] Document setup/static-preview commands, controls/onboarding, qualified Chromium/Firefox versions on this PC, save compatibility/ownership/recovery/backups, attribution, limits and deferred features.
- [x] Package the local artifact and exact source/build identity, with instructions for running the portable diagnostic and reading/sharing JSON results. State that other/lower-end hardware is not yet qualified.
- [x] Include hosting/base-path/Brotli guidance for a later destination; public upload is outside agreed local delivery. Keep cloud saves, remote control, new tiers/maps and later hardware qualification explicitly future work.
- [x] Reconcile current-asset engineering packages from evidence and retain the baseline/checkpoints for the separate asset plan. Retain M10.1 Open, M10.3 In Progress for the user's later playtest and the overall milestone incomplete until human balance and final assets/qualification pass; preserve all completed groundwork/M1–M9 credit.

## Completion checks

- [ ] A new player understands guidance and completes the 400-cell objective in 30–60 minutes, with real-time playtest evidence and no blocking confusion.
- [ ] The final run preserves exact continuation, safe recovery and distinct JSON transfer across acceptance cases.
- [x] Current-asset engineering (Steps 2, 4–7) passes gameplay/UI/build/accessibility checks and delivers a labelled performance baseline and provisional local handoff. Step 3's human pacing/balance remains deferred by the user.
- [ ] The separate asset plan completes after those tasks, including selected presentation work, attribution, final Chromium/Firefox performance/regression qualification and refreshed artifact/material. Only this completes the asset-dependent milestone gates.
- [x] The portable test/result manifest is usable on later hardware; second-device qualification remains deferred, not implied.
- [ ] Local artifact/portfolio material accurately describe demonstrated behavior, all seven delivery packages are complete and hosting remains a separate choice.

## Notes and implementation issues

| Possible issue                             | Implementation guidance                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Art replacement grows beyond the demo      | Make the keep/polish/replace audit first and select concrete assets. Preserve sources/provenance and logical footprints. |
| Virtual routes are treated as human pacing | Use real-time human observations for 30–60 minutes; accelerated routes establish local correctness/reachability.         |
| Chromium evidence is claimed for Firefox   | Run renderer, worker/native physics, storage and interaction cases in both; label unavailable diagnostics.               |
| No second device is available              | Deliver the portable test now, qualify this PC and record other hardware as untested follow-up.                          |
| Polish changes compatibility               | Keep presentation independent; version/validate durable content changes and retain exact-map rejection.                  |
| Performance work becomes a rewrite         | Freeze workload/gates, report failures and make the smallest measured fix. Keep diagnostics outside CI.                  |

| Date             | Observation or decision                                                                                                                                                                                                                                                                                                   | Follow-up and status                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23 October 2026  | Migration presentation/UI, packaging and small-scene profiling verified.                                                                                                                                                                                                                                                  | Five groundwork packages retain historical credit.                                                                                                                                                                                           |
| 27 October 2026  | Component-led MiniFab pacing, renewable-first industry and peaceful restoration agreed.                                                                                                                                                                                                                                   | M3–M9 now establish gameplay/persistence; final polish remains M10.                                                                                                                                                                          |
| 10 November 2026 | Reviewed clean `3b7daa2`, live Completed M1–M9 and M10's five Done/seven Open packages. Corrected stale worker, future-HUD/save and liquid-loss assumptions. User chose asset audit before replacements, Chromium/Firefox on this PC, portable later-hardware testing, 30–60 minute first restoration and local delivery. | Update repository/Fibery scope/dependencies only. M10 stays Planned and seven delivery packages Open. No unanswered product questions; asset selection follows the audit. No new runtime, gameplay results, hosted CI or deployment claimed. |

## Implementation verification — 10 November 2026

Current-asset engineering is delivered locally, based on `3b7daa2` with uncommitted changes. The repository checklist records five delivery packages (M10.2 and M10.4–M10.7) and five historical groundwork packages complete. M10.3 remains In Progress for the user's explicitly deferred human pacing/balance test; M10.1 remains Open in the separate, untouched asset plan. M10 stays In Progress. No hosted CI, commit/push or public deployment is claimed.

Fibery synchronization is complete and verified: ten Done records, M10.3 In Progress and M10.1 Open; the milestone remains In Progress with two unfinished packages and no unfinished task dependencies. The user explicitly approved the reviewed tracker export after automatic approval review initially rejected it. Criteria, scope, completion evidence and corrected dependencies are reconciled; existing identities, the separate asset task and M1–M9 credit are preserved.

### Delivered behavior and compatibility

- A dismissible/reopenable objective guide derives nine stages from the authoritative view, including advanced/restored saves. No durable tutorial flags or save migration were introduced.
- A fourth, keyboard-accessible Field manual explains controls/construction, handcraft refunds, MiniFab buffers/winding, irreversible research payments/shared queue, factory/transport recovery, water/weather/coal/restoration and save ownership/recovery/JSON transfer. Home/End/arrow navigation includes the new tab; the manual scroll area is focusable and objectives announce changes politely.
- Machine recovery advice reserves its tallest wrapped variant so controls stay anchored during status changes. Transport help describes facing ports, strict filters, capacity and blocked-route recovery. Save help explains browser-origin ownership, committed progress and deliberate imported-run activation.
- No numeric balance, simulation rules, catalogue version, authored map, asset or save schema changed. M9 compatibility/exact-map policy and the current object representation remain intact. The asset audit was not started.

### Verification and baseline

Local correctness checks passed: **401 Chromium Angular/component/renderer tests (44 files), 231 simulation/session/save tests (17 files) and 92 tooling tests (16 files)**. Final focused guide/manual (7) and factory (8) checks passed after the last presentation edits. App/worker/tools/tests/reference strict types, ESLint, production export/build/Brotli, documentation, architecture/main-worker separation and bundle checks pass. Both browsers pass real production lifecycle/input/base-path/CSP, IndexedDB save/recovery/import/backup and research keyboard routes. Chromium-only CDP loading/throttle diagnostics are explicitly skipped in Firefox. AXE has zero violations in tested desktop/390px states; physical controller hardware and exhaustive WCAG qualification are not claimed.

The [local report](../reports/milestone-10/2026-11-10/README.md) preserves exact commands, fixture/export/build identities, screenshots, raw samples, attempted diagnostics, limitations and earned checkpoints. Reports remain ignored/untracked; this section is the durable evidence summary.

The earned Chromium route starts empty, pays for the MiniFab, renewable workshop/shared labs, extraction and nineteen-conveyor/sorter loop, then restores all 400 cells without coal. Preserved paid checkpoints continue through optional coal/mitigation, pollution/recovery, exact attributed water return, Save/reload/Continue and desktop/390px AXE in both engines. Firefox's restoration branch resumes the earned green checkpoint; it is not a second fresh empty-handed run. Corrections to virtual-clock save selection, placement rotation after reload, asynchronous keyboard actionability and the coal test's battery-demand setup affect diagnostics only. The original failed attempt and successful continuation remain documented.

The headed baseline uses **Chromium 158.0.8127.18 and Firefox 159.0**, Windows 10.0.26300, Ryzen 9 7900X3D (24 logical processors), about 68 GB installed RAM and Radeon RX 6800 XT, at 1440×900/DPR 1. Three warmed 30-second samples and twelve UI save/load observations per prepared workload cover renewable/mixed layouts (24 machines, 12 conveyors, six native bodies) and labelled stress (96 machines). Controlled fixtures are not earned gameplay. A real two-active-minute autosave commits in each case; isolated storage controls fill and retain five auto/three manual revisions and preserve exact 1,000-step native continuation.

| Browser/workload   | Worst repetition frame p95 / p99 ms | Manual commit p95 ms | Retained JSON bytes/run |
| ------------------ | ----------------------------------- | -------------------- | ----------------------- |
| Chromium renewable | 8.4 / 8.5                           | 64.4                 | 1,216,869               |
| Chromium mixed     | 8.4 / 8.5                           | 65.3                 | 1,223,293               |
| Chromium stress    | 8.4 / 8.5                           | 130.8                | 2,738,869               |
| Firefox renewable  | 10.34 / 10.36                       | 88                   | 1,216,869               |
| Firefox mixed      | 9.36 / 10.36                        | 87                   | 1,223,293               |
| Firefox stress     | 9.34 / 16.66                        | 188                  | 2,738,869               |

Normal frame/manual-save gates and the storage investigation threshold pass these observations. Isolated hitches remain: warm sample maxima reach 100 ms; autosave-window maxima reach 52.1 ms Chromium/75 ms Firefox in stress, and Chromium records a 50 ms task near autosave. There is no evidence requiring a representation or worker rewrite. These are current-asset observations, not final asset or other-device approval.

The **final packaged artifact's earned green layout** also passes a full schema-2 baseline in both browsers: 52 entities, 21 machines, nineteen conveyors/one sorter, 23 material and seven working water links, six native bodies, with active/disabled/missing-input mix and buffered stock recorded. Each engine has three warmed 30-second samples, a real autosave, twelve saves/loads and exact 1,000-step continuation. Worst frame p95/p99 is 8.4/8.5 ms Chromium and 8.34/8.34 ms Firefox; manual commit p95 is 64.3/85 ms and actual Continue click-to-playable p95 is 1,349.2/1,714 ms. Autosave-window maxima are 25/33.34 ms; eight retained revisions total 1,284,853 JSON bytes. No unexpected console/request errors or tested desktop/390px AXE violations occurred. This does not retroactively correct the wider v2 load boundary or qualify unmeasured mixed/stress load tails.

The original v2 load metric included Playwright actionability before Continue dispatch; its 2.2–2.85 second observations and false load gates remain preserved as measurements of that wider boundary. The corrected schema-2 follow-up records twelve mixed-layout **actual Continue click-to-playable** samples, p95 **1,334.5 ms Chromium / 1,900 ms Firefox**, against the unchanged 2-second gate. That follow-up has a short frame window and no autosave sample; it complements rather than replaces the full frame/autosave baseline. No all-workload load-tail claim is inferred from it.

The optional Chromium production-worker probe is separate from the standard frame protocol (wrappers add overhead). Its small 80-step sample has step p95 1 ms/p99 4.3 ms and publication p95 0.2 ms/p99 2 ms. Firefox 159/Juggler crashed during dynamic-import probing, so the tool explicitly skips that metric there; normal production Firefox paths pass. Inline phase controls are labelled separately. Internal delivery/Angular/render CPU splits, actual command-to-visible timing, autosave commit percentiles, total process/GPU memory and Firefox heap/Long Tasks are unavailable; phase sums and input-to-RAF must not be substituted for them. Chromium's sampled peak JS heap is about 109/115/129 MB across the three workloads.

### Handoff and remaining work

[Portfolio instructions](../portfolio/README.md) document setup, controls, architecture, save compatibility/transfer, provenance, local packaging/preview/Brotli fallback, capture routes and the later human playtest. `node tools/portfolio/package.ts` creates an identified local production directory and standalone preview.

The local delivery is `dist/portfolio-current-assets-r89amX.zip` (14,557,426 bytes), with extracted directory beside it. Packaged standalone-preview checks pass Chromium/Firefox New Game, Field manual/AXE, negotiated Brotli and original fallback. ZIP SHA-256: `a4b9ae62b1121a4ec9eb239c9dbe5416706018be04168df40519b16fbf1a3376`. Its manifest records browser-artifact identity `586ca7021a7ccf0156b3c171279340bd211e999d760908151d6c0fb7fbaa9780`, exact file/config hashes and local source snapshot identity. These generated files remain untracked under `dist/`.

The portable command is:

```powershell
node tools/portfolio/run.ts --browser all --headed --output docs/reports/milestone-10/my-device
```

Install the locked dependencies/matching browsers and build with `--stats-json` first. `--save checkpoint.json` measures a validated current-map checkpoint without grants; earned status requires separate provenance. `--quick` is explicitly partial; full diagnostics reject CI/GitHub Actions. No workflow adds full/virtual gameplay or benchmarks. The later human run, settled assets/final performance and refreshed artifact remain milestone gates; hosting and other hardware remain separate.

## References and diagrams

- [Complete acceptance route](README.md#acceptance-route-and-focused-checks)
- [Current worker implementation](ecs-worker-implementation.md)
- [Save resilience and capture audit](../design/save-resilience.md)
- [Restoration catalogue and objective](../design/restoration-catalogue.md)
- [Application interaction diagram](../design/TDD.md#application-system-interaction-diagram)
- [Module dependency diagram](README.md#module-dependency-diagram)
- [Preferred art finish](../art/README.md#preferred-finish-across-all-artwork)
- [Prototype scope](../design/GDD.md#prototype-scope-and-later-possibilities)

## Sequencing revision before implementation — 10 November 2026

The user moved the asset audit and selected presentation work into the separate asset plan, to tackle after the remaining tasks. Step 4 now records the current assets as a reproducible performance baseline; final asset-dependent performance approval follows settled assets. Keep all existing task identities: M10.1 follows M10.7, M10.4 no longer waits for M10.1, and Current Focus moves to M10.2 onboarding. Baseline evidence, provisional handoff and final qualification are distinct. This revision changes plans only; it records no fresh measurements or implementation credit.
