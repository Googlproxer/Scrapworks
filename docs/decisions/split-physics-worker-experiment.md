# Retain the current simulation worker after the physics split experiment

Recorded 12 November 2026. Decision: **retain B0**. C1 is an isolated experiment, with no production adoption or migration. The full feasible local sequence has concluded; failed gates and unavailable qualification are results, not passing coverage.

The [preregistered plan](../plans/split-physics-worker-experiment.md) made input response the primary requirement. C1 preserves deterministic outcomes in the tested continuations, but does not establish a repeatable capacity benefit and does not clear the response, save-capacity and qualification gates. Its extra asynchronous hop remains on the tick's critical path. The evidence supports keeping Rapier in the authoritative simulation worker.

## Scope and provenance

The experiment ran entirely on this PC in `codex/split-physics-worker`, based on local commit `8bd4f87642361f3689be14e9f032c1405a367a7a`. The original checkout and production source/configuration were not changed. B0 is the current architecture, B1 extracts the boundary synchronously in one worker, and C1 uses one simulation worker plus one directly connected physics worker with one outstanding physics request. The primary comparison preserves the controller, tick rate, three native substeps, interpolation and input policy.

Preparation `6e802333` froze the optimized variants before primary acquisition. The primary helper, protocol, artifact-producing source and build manifests remain auditable. Tooling and postprocessing changes after acquisition are separate from those frozen artifacts. The [execution record](../plans/split-physics-worker-execution.md) preserves amendments and corrected pilots. Raw receipts, immutable acquisition snapshots, JSONL and 384 sparse images are local and ignored by Git under `docs/reports/split-physics-worker/2026-11-11/`. The [local report](../reports/split-physics-worker/2026-11-11/README.md) indexes them, including complete distribution/confidence tables and tabulated compute scaling curves.

Hardware was a Ryzen 9 7900X3D (12 cores/24 threads), Radeon RX 6800 XT and LG C2 with Windows output 3840 × 2160 at 120 Hz, on the High performance power plan. Primary bundled Chromium 157 used native ANGLE/D3D11 at 1440 × 900, DPR 1. It used fresh documents/worlds/workers in a shared browser process. Firefox 159 used fresh **local headless** processes per primary job. No external browser UI, CI, hosted runner or remote device was used. These browser modes are separate strata, not interchangeable display qualifications.

## Response result

Both browsers scheduled all 140 primary jobs: seven workloads, two synthetic input paths, five runs per architecture and balanced B0/C1 ordering. Each full run attempted 220 starts, reversals and releases after 15 seconds of warm-up. B1 remains the extraction diagnostic specified in plan section 6, step 4; it was exercised in the compute, continuation, lifecycle, soak and input-control stages.

| Acquisition | Scheduled jobs | Full receipts | Attempted probes | Completed probes | Unfinished probes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bundled Chromium | 140 | 140 | 92,400 | 92,391 | 9 |
| Firefox headless | 140 | 117 | 78,388 | 78,374 | 14 |

Firefox additionally retained 20 selected-largest startup failures and three corridor interruptions; 14,012 scheduled probes were never attempted. No failed run was replaced, no guard widened, and no missing sample was fabricated. Five of six Chromium dense-contact failures and seven Firefox dense-contact failures coincided with an outstanding capture request. Other unresolved attempts lack that established overlap. All remain failures under the frozen gate. The three Firefox corridor crossings occurred in ordinary small movement increments; they establish acquisition failures, not a demonstrated physics teleport.

The predeclared maximum C1 increases were 2/5/8 ms at p50/p95/p99, using one-sided 95% bounds from 10,000 paired run/block bootstrap replicates. Of 126 operation/quantile assessments per browser, Chromium recorded 72 passes, 36 inconclusive and 18 failures due to unresolved probes. Firefox recorded 34 passes, 30 inconclusive, 26 failures and 36 incomplete assessments. These are individual software tests, not a count of qualified workloads. **No workload/device stratum cleared all nine assessments.**

| Firefox synthetic gamepad, physics-heavy | C1 − B0 | Lower95 | Upper95 | Allowed increase |
| --- | ---: | ---: | ---: | ---: |
| Reversal p95 | 19 ms | 7 ms | 32 ms | 5 ms |
| Reversal p99 | 59 ms | 25 ms | 68 ms | 8 ms |
| Release p95 | 19 ms | 6 ms | 28 ms | 5 ms |
| Release p99 | 43 ms | 18 ms | 71 ms | 8 ms |

Firefox steady-load gamepad reversal p50 also failed: +12 ms, bounds 9–14 ms against 2 ms. Other apparently similar medians cannot override these failures or broad confidence intervals. Chromium normal keyboard start p50 was +0.3 ms with bounds −1.3 to +3.1 ms, so even that small point estimate did not prove the 2 ms bound.

Same-clock stage observations help locate the loaded Firefox difference: in physics-heavy gamepad runs, median per-run native-physics p95 was 41 ms in both architectures; runtime p95 was 43 ms B0 versus 49 ms C1, simulation round trip 54 versus 62 ms, and C1 physics round trip 46 ms. Rendering p95 was 14 ms in both. This is consistent with orchestration/delivery overhead around unchanged native work. It does not isolate one scheduling or operating-system cause, and overlapping durations must not be summed.

B1 also regressed in the short Firefox S1/awake/1,000 screen: median repetition tick p95 was 28 ms B0, 41 ms B1 and 45 ms C1. Because B1 keeps physics in the same worker, attributing the entire difference to message passing would overstate the evidence. Extraction effects and runtime/warm-up variation require a targeted B0/B1/C1 comparison to separate them; B1 did not receive the full primary latency schedule.

## Capacity and coherence

Each browser completed the full 76-specification compute screen in all three architectures: 228 records per browser, three repetitions, 40 warm-up and 200 measured ticks each. All comparison captures matched. The short screen exposed capacity failures without a qualified larger C1 world: bundled S3/contacts/1,000 failed in all three variants, and Firefox S3/P0 and S2/awake/1,000 failed in all three. At Firefox S1/awake/1,000, B0 passed the short screen while B1 and C1 failed. Occasional favorable short percentile changes do not establish a repeatable gain.

| Short-screen qualification difference, 76 specifications/browser | C1 passes, B0 fails | B0 passes, C1 fails |
| --- | ---: | ---: |
| Bundled Chromium | 0 | 1 |
| Firefox headless | 1 | 2 |

The isolated Firefox C1-only pass was S2/static-near/100. B0's repetition p99 values were 44/53/43 ms, while C1's were 46/48/43 ms; the 50 ms gate requires all three repetitions to pass. B1 passed too. B0 also passed S2/static-near/1,000. This threshold-sensitive result does not establish a monotonic or repeatable increase in usable world capacity, and did not receive an additional long response qualification.

Core factories and physical courses completed 10,000 ticks plus 1,000 after restore. Selected-largest, steady-load, corner and ordering follow-ups retained exact native/gameplay hashes. All 159 exported actual-autosave accepted-input streams replayed exactly against B0 in their browser (100 bundled, 59 Firefox). All 520 captured save payloads validated and survived 100 native continuation ticks; this count includes manual seeds and supplemental saves, not 520 autosaves. Fault suites completed 56 checks per browser, including delayed, stale, duplicate, reordered, dropped and corrupt results. Each architecture completed 100 lifecycle cycles per browser, ending with zero tracked owned workers. C1's replacement peak was bounded at four workers.

There is an independent **production save-format capacity limit**. Firefox's B0-selected S2/mixed/1,000 initial save contains 2,053,766 plain-data entries, exceeding the unchanged codec's 1,000,000-entry bound, so all 20 rendered jobs fail before movement. Worker snapshot parity did not prove that the application could load the save. Likewise, all three final steady-soak captures exceed that bound, and 118 complete high-load primary acquisitions exported no committed in-window autosave. The codec was not weakened, and wrapping a final capture for validator diagnosis was not counted as an actual save. These strata cannot pass save/playable-capacity qualification.

Each B0/B1/C1 bundled steady soak delivered 36,000 logical ticks over more than 30 minutes, with zero dropped time, at least 1,002 active native bodies and stable native body/collider counts of 1,122. Maximum pending credits were 2.174/2.214/2.156. Calls exceeding 50 ms numbered 1/0/2, with maxima 51.4/49.5/52.5 ms. Factory active jobs declined from 30 to 10 and finite research had exhausted: persistent native pressure was verified; a constant full factory/research workload was not. Page-heap samples and worker ownership settle, but they do not establish per-worker/native/WASM/GPU or whole-process memory safety.

## Control and qualification limits

Known-delay/frame/drop/stale probe controls passed in both browsers. Fifty-six correctly engaged contact/image routes cover seven courses; 40 earlier misdirected pilots remain rejected. Sparse images corroborate visible movement but do not locate the precise first changed raster pixel or qualify contact p99. Arrival-phase bins and facing/animation/camera/stopping companions are retained. The idle overhead control does not bound full loaded trace-serialization overhead.

Pause and zero-size diagnostics stop logical progression and accept fresh input afterward. The explicit reconnect follow-up shows that held gamepad input is accepted again after reconnection in **B0, B1 and C1**; manual load similarly reapplies held gamepad input, while held keyboard input remains suppressed. This is shared behavior and fails a strict neutral-before-reactivation interpretation; it is not a C1-only divergence. Short tap registration remains separately reported from sustained response. Real focus loss could not be produced through the bundled provider's tab/visibility controls; two failed attempts are retained and the gate remains unqualified.

The user supplied USB keyboard/DualSense and a 4K/120 Hz display but explicitly had no physical testing available. Physical input-to-photon, human A/B, a real 60 Hz run and other hardware remain unqualified. Reported focus flags cannot prove native foreground; shared Chromium processes, headless Firefox, reduced Firefox timer precision, unbounded full-probe overhead and missing physical memory observations further limit qualification. None is promoted to a pass.

## Consequence

Keep the current architecture. Preserve the local prototype/evidence for review; do not introduce C2, prediction, a save-codec change or a production migration as part of this experiment. If further work is separately authorized, first address the save representation/entry limit and shared held-gamepad policy, then use a foreground/fresh-process measurement path with a loaded-probe overhead bound. A future C1 proposal must demonstrate an actual benefit and clear the original response/coherence/lifecycle requirements. Correct deterministic replay alone is insufficient.

## Revisiting the archived experiment

At the user's request, preserve the tooling, this decision and the execution record on `codex/split-physics-worker`. Raw reports, frozen builds and temporary projects remain local and ignored by Git. The durable summary above travels with the branch; raw-data analysis and artifact verification require the retained local directories indexed by the tooling README. A fresh checkout requires an explicitly established reference and preparation rather than treating absent reports as passing evidence.

The verifier accepts descendant documentation/tooling commits while comparing production files directly with frozen base `8bd4f87642361f3689be14e9f032c1405a367a7a`. Protocol, seven artifact-producing sources, original B0, optimized build and primary helper hash checks remain in force. A future code/fixture/protocol change starts a separately identified comparison, with no pooling into the completed experiment.
