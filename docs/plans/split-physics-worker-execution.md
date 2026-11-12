# Split physics worker experiment execution

Prepared 10 November 2026 from local commit `8bd4f87642361f3689be14e9f032c1405a367a7a` in the isolated `codex/split-physics-worker` worktree. This follows [the full experiment plan](split-physics-worker-experiment.md); it is not a production migration decision.

**Execution concluded on 12 November 2026. Decision: retain B0.** The user released the complete local experiment on 11 November. Both full browser schedules, matrices, long soaks, actual-save replays, fault and lifecycle stages ran on this PC. Failed and unavailable gates remain explicit; execution completion is not qualification. See the [durable architecture decision](../decisions/split-physics-worker-experiment.md) and [complete local report](../reports/split-physics-worker/2026-11-11/README.md).

Computer-use interactions used only the bundled browser. Automated Playwright processes were local headless diagnostics. No CI, remote devices, external browser UI or hosted execution was used. Receipts are under ignored `docs/reports/split-physics-worker/2026-11-11/`; original preparation remains under the 10 November directory. The chronology below retains its historical checkpoints rather than retroactively rewriting them as passes.

## Supplied hardware and unavailable evidence

- USB keyboard; model not supplied.
- USB Sony DualSense; firmware not supplied.
- LG C2, 3840 × 2160, configured for 120 Hz. Verify actual output mode, viewport and browser cadence at run time. A 60 Hz headed baseline requires a real 60 Hz display mode; emulation remains diagnostic.
- No physical testing is available. Physical actuation-to-photon timing and the human A/B check remain unavailable, even though a controller is present.
- Broader hardware qualification is outside the user's instruction to execute only on this PC.

## Prepared implementation

[Local TypeScript tooling](../../tools/physics-worker-bench/README.md) builds isolated optimized B0/B1/C1 projects, records source/build/asset/tool/protocol hashes and keeps ordinary production output unchanged. The unchanged original B0 artifact is preserved. Diagnostic traces cover action evaluation, submissions, accepted input, native physics boundaries, committed ticks, main-thread publication, player interpolation, camera and render submission. Pre-application keyboard/gamepad observations supply the primary main-thread starting endpoint. Prepared prototypes are not correctness or performance results.

C1 uses one native worker per simulation world and a direct MessageChannel with one outstanding request. Its synchronous phases preserve the original before/after movement order. Post-movement collider changes require a non-stepping flush acknowledgement before publication; measure that additional structural-edit cost explicitly. Initialization/capture and disposal are serialized at the orchestration boundary. No pipelining, prediction, new timestep, polling policy, interpolation or preload policy is introduced into the primary comparison.

## Final execution coverage and qualification

| Stage | Execution result and remaining qualification |
| --- | --- |
| Source/build/protocol freeze and host metadata | Verified; foreground cannot be independently certified by provider flags. |
| Causal probe, images, idle and overhead controls | Both browser control sets pass; 56 engaged image routes. Full loaded trace overhead and exact earliest raster endpoint remain unqualified. |
| B0 baseline and phase ledger | Five horizontal runs/device, 1,100 samples/operation/device; physical timing unavailable. |
| B1/C1 deterministic/native continuation and ordering | Factories/courses ≥10,000 ticks +1,000 after restore, selected-case and ordering follow-ups pass. |
| Full coupled S/P matrix and isolation controls | 228 architecture/case records/browser, three repetitions each; failure anchors and native/simulation controls retained. No qualified capacity gain established. |
| Primary matched B0/C1 latency; B1 extraction diagnostic | All 140 scheduled outcomes/browser retained; 92,391/92,400 Chromium and 78,374/78,388 Firefox attempted probes complete. Nine/fourteen unfinished probes, three Firefox corridor interruptions and 20 startup failures prevent qualification. No replacements. B1's diagnostic role follows plan section 6, step 4. |
| Save, pause, reconnect, overload and fault controls | 159 actual-autosave accepted replays exact; 520 actual payloads validate/continue. High native snapshots hit unchanged codec capacity; 118 complete high-load receipts lack an in-window committed autosave. Held gamepad reactivation after reconnect/load is shared by all variants. Real focus loss unavailable through bundled provider. Fault suites 56 checks/browser pass. |
| Full soaks and lifecycle | Three bundled ≥30-minute/36,000-tick soaks, no dropped time and ≥1,002 active bodies; 100 lifecycle cycles/architecture/browser, zero final tracked workers. Factory jobs decline; full steady factory load and native/process/WASM/GPU memory remain unqualified. |
| Headed display and physical controls | Native bundled renderer at 1440×900/DPR1 on Windows 4K/120 Hz; shared process. Firefox fresh headless processes are separate diagnostics. Physical 60 Hz, input-to-photon, human A/B and other hardware unavailable. |
| Decision | [Retain B0](../decisions/split-physics-worker-experiment.md); production unchanged, no migration or CI. Tooling and the decision are preserved on the experiment branch at the user's subsequent request. |

Frozen budgets stayed p50 2 ms, p95 5 ms and p99 8 ms, assessed with 10,000 paired run/block bootstrap replicates and one-sided 95% bounds. No threshold was relaxed. Firefox physics-heavy gamepad reversal p99 is +59 ms (25–68 ms bounds), and release p99 +43 ms (18–71 ms); both numerically fail. Chromium normal keyboard start p50 remains inconclusive despite a +0.3 ms estimate. Passing continuation cannot override these response failures.

All 159 accepted replays and 520 actual payload checks concluded successfully. Final postprocessing uses each acquisition's exact exported manual initial seed rather than a mutable global fixture filename. Three explicit reconnect-marker controls close the original poll-signature timing gap; after reconnect, all architectures accept held gamepad movement before neutral. These semantic diagnostics ran after primary acquisition and are excluded from latency ranking. All substantive findings, uncertainty, raw-data paths and follow-up boundaries are in the decision/report.

## Historical checkpoints

## Execution baseline recorded 11 November

Preparation `6e802333` preserves optimized B0/B1/C1 and the original uninstrumented B0. The bundled Chromium browser reports version 157, native AMD Radeon RX 6800 XT through ANGLE/D3D11, a 1440 × 900 viewport at DPR 1, and the Windows display is 3840 × 2160 at 120 Hz. The CPU is a Ryzen 9 7900X3D (12 cores/24 threads). Windows uses the High performance power plan. Temperature and individual worker/native/GPU memory are not measured.

Five fresh documents/worlds per device completed every attempted sustained probe: 1,100 starts, 1,100 reversals and 1,100 releases for each device. Each run warmed up for 15 seconds, used seeded arrival offsets and 250 ms sustained legs, and produced an actual scheduled autosave. These are synthetic application-observed software endpoints in a shared bundled-browser process; they do not satisfy the fresh-process or physical-input qualification requirements. Instrumentation overhead and the complete comparison remain pending at this checkpoint.

**Course audit correction:** this initial cohort used the vertical W/S/stick axis. Late movement in keyboard runs 4 and 5 reached the crate contact region, so its table remains a retained, contact-affected observation rather than free-space qualification. The primary course now uses A/D/horizontal stick movement, with rendered-position bounds `-2.2 < x < 5.8` and `|z - 1| <=0.1`. Crossing the guard fails the run and retains its attempts; it cannot improve the reported percentiles by silently removing contact probes. A new five-run baseline per device is required on that corridor. The 2/5/8 ms regression budgets and causal detector thresholds are unchanged.

| Input | Operation | p50 ms | p95 ms | p99 ms | Maximum ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Keyboard events | Start | 43.7 | 75.4 | 83.2 | 87.7 |
| Keyboard events | Reverse | 49.4 | 75.2 | 82.0 | 88.9 |
| Keyboard events | Release | 53.1 | 78.9 | 84.7 | 108.2 |
| Synthetic DualSense | Start | 29.8 | 69.8 | 78.6 | 80.4 |
| Synthetic DualSense | Reverse | 40.2 | 70.0 | 79.5 | 81.4 |
| Synthetic DualSense | Release | 41.0 | 71.3 | 79.7 | 80.3 |

The known-delay, extra-frame, dropped-response and stale-generation controls passed causal validation. The primary detector never completed the deliberately dropped/stale probes. The delay controls modify only the first probe; their full-run percentiles must not be described as a uniform 50 ms shift. Eight focused protocol/detector tests and strict tool TypeScript checking passed.

Current B0 already exhibits recurrent 42–50 ms submitted-frame gaps. In the first keyboard run, same-clock p95 durations were 0.9 ms inside scene rendering, 0.8 ms for the simulation round trip, 0.3 ms for runtime handling and 0.2 ms inside native physics. Those observations locate much of the wall-clock latency outside these small measured processing spans; they do not identify a particular compositor/GPU/OS cause.

The predeclared matrix selection uses B0 only: three successful repetitions, no dropped time, p95 tick <=35 ms and p99 <=50 ms. Prefer the highest S tier, then greatest added-body count, then contacts over mixed over awake. This selects a **provisional compute-qualified** longer mixed case. Playable capacity still requires comparison with the measured normal B0 response; an already slow growing-world baseline cannot grant C1 an unlimited delay budget. If none passes the compute screen, the smallest S1 mixed tier remains explicitly diagnostic.

Exact receipts, helper-script hashes, attempted-probe ledgers, raw JSONL and phase/stage analyses are retained under the ignored execution report directory. No production architecture decision has been made.

## Guarded baseline and correctness checkpoint

The replacement horizontal baseline completed five runs per device, with 1,100 completed starts, reversals and releases per device and no unresolved attempts. Every rendered course envelope stayed within the free-space guard; Z remained exactly 1. Each run produced an actual scheduled autosave. The earlier vertical cohort remains separately identifiable and is not pooled into these results.

| Input | Operation | p50 ms | p95 ms | p99 ms | Maximum ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Keyboard events | Start | 36.8 | 57.4 | 65.2 | 67.6 |
| Keyboard events | Reverse | 36.7 | 58.1 | 65.8 | 68.2 |
| Keyboard events | Release | 43.6 | 65.9 | 67.7 | 70.0 |
| Synthetic DualSense | Start | 29.5 | 50.4 | 58.2 | 60.5 |
| Synthetic DualSense | Reverse | 29.7 | 50.2 | 58.2 | 59.6 |
| Synthetic DualSense | Release | 38.6 | 58.8 | 59.8 | 60.9 |

Submitted-frame intervals in this cohort were approximately 10.2 ms at p95 and 10.5 ms at p99. The earlier slower browser cadence is retained as temporal variation, with no established compositor, driver or OS cause. Neither cohort observes physical presentation.

Strict tool TypeScript checking and nine focused protocol/detector tests pass. Verification confirms the original commit, protocol hash, seven artifact-producing source files and all three primary build manifests remain frozen. Production sources and configuration are unchanged. The main-thread idle frame/round-trip instrumentation control completed five paired raw-data runs; full trace-serialization overhead remains outside that control.

Correctness and continuation checks cover the factory fixtures and physical courses for 10,000 ticks plus 1,000 ticks after restore. Ordering, accepted-stream replay of the initial cohort, actual-save validation and 100 lifecycle cycles per architecture have completed. The corrected fault harness reports 56 passing checks and zero remaining owned workers. These checks do not qualify physical memory settlement or the still-pending long soaks and complete latency comparisons.

## Matrix and acquisition checkpoint

The full bundled-browser compute screen completed all 76 specifications in B0, B1 and C1: 228 architecture/case records, each with three repetitions of 40 warm-up and 200 measured ticks. All final captures matched; there were no matrix fixture failures or missing comparators. The short screen does not qualify sustained response p99 or a repeatable capacity gain. The B0-only largest-tier rule selected `S3-contacts-100`. `S3-contacts-1000` exceeded the screen budgets, so its conditional extension was not triggered.

The exact selected largest-tier fixture and the provisional `S2-contacts-1000` soak fixture each completed 10,000 ticks plus 1,000 after restore in all three architectures, with 66 matching capture checkpoints. Nineteen native-only and four simulation-only controls completed. The native-only 1,000-body awake control retained 1,002 active bodies after warm-up and after 2,200 steps; the 1,000-body contact stack fell from 972 to two active bodies. The stack cannot substantiate a steady near-capacity soak.

**Explicit soak refinement, before any timed soak:** retain the provisional contact selection and its results, but select a persistent-activity case using B0 screen qualification plus native-only activity. Require at least 90% of the intended awake population after native warm-up and at 2,200 steps, then use the greatest median B0 repetition p95. This selected `S2-awake-1000`. No C1 result selects the replacement. Minute-by-minute native activity, warm-up/final counts, delivered ticks, queues and dropped time must still verify steadiness during the full soak. Factory stocks and finite research can change even while physics stays active.

Add this steady case as a seventh matched response workload before any long candidate comparison, preserving the original six workloads, seeds and 2/5/8 ms budgets. The extended queue is 140 jobs per browser: seven cases, two devices, five runs, and balanced B0/C1 ordering. It receives its own long continuation gate. Receipts preserve the amendment, original selection and persistent-load selection separately.

The corrected structural-edit fixture completed 100 place/remove cycles for each architecture at 100, 1,000 and 10,000 extra static colliders, with matching final captures. Initial attempts incorrectly assumed dismantling returned the placeable; it returns scrap. Those failures remain in the ledger. The corrected fixture supplies 100 basic fabricators at legal stack limits and enough refund capacity, without changing production rules.

Separate optimized contact/image builds preserve the frozen primary builds and helpers. The initial 48 fixed/follow-camera jobs plus eight longer corner pilots completed their movement probes and retained 224 sparse PNGs. **Image/engagement audit correction:** only the 16 free-space and platform-support routes engaged their intended courses. The other 40 pilots used a misdirected input and cannot establish contact coupling, despite completing ordinary movement probes. They remain retained. V2 routes use the verified production-action direction and require wall/corner engagement, crate displacement, dense-body displacement or a platform-side constraint. Separate build `contact-279069a9` explicitly observes dense body 2; the first build's lexicographic first-four selection omitted it. The corrected 32 contact routes and eight corner routes are required before claiming that coverage.

The valid free-space images corroborate visible movement and a constant fixed-camera target, but occur after causal confirmation and do not prove the precise earliest changed raster pixel. Contact cohorts are small diagnostics and cannot qualify sustained p99. Platform stopping is explicitly a support-relative directional component; larger lateral carrying excursions do not qualify full two-dimensional stillness.

A longer corner follow-up uses the original legal geometry and a six-second input leg. Its 10,000-tick plus 1,000-after-restore checks pass in all architectures and explicitly require wall/corner encounter. An earlier closer corner layout was rejected for overlapping authored footprints; no validator was weakened. Correctly directed rendered corner checks remain pending at this checkpoint.

The persistent `S2-awake-1000` fixture also passed 10,000 ticks plus 1,000 after restore in all architectures, with 33 matching checkpoints. A deliberately short two-second soak preflight after 15 seconds of warm-up recorded 1,002 active bodies throughout each architecture's window and zero remaining owned workers. It validates telemetry, not the required 30-minute soaks.

Strict tool checking and twelve focused tests pass, including the requirement that sufficient completed samples cannot hide an unresolved normal attempt or a failed acquisition, and that movement alone cannot establish contact engagement. The analysis reports architecture regression and growing-world response against normal B0 separately. Full latency comparison, 30-minute soaks, supplemental controls, Firefox execution and the final architecture decision remain pending.

## Long response acquisition in progress

The corrected contact and corner queues finished before primary acquisition. Across 96 retained image jobs, the engagement audit verifies 56 intended routes (eight per course across seven course types) and rejects the 40 earlier misdirected pilots for coupling. The 384 sparse PNGs and their metadata remain local. Corrected corner images show the player at the contact location; the physical geometry is verified by the course and trace checks, not inferred from an image silhouette.

The bundled-browser 140-job response queue started at approximately 09:00 Sydney time on 11 November. `long-comparison-freeze.json` preserves the exact queue, analysis budgets, source snapshot and live verification of both baseline helper hashes. Each primary arm attempts 220 starts, reversals and releases per document, with five documents per device/workload/architecture. Each run guards the free-space corridor. No builds, analysis, profilers or competing experiments run alongside primary acquisition. The progress file is `render-queue.json`; completed and interrupted acquisitions remain separately auditable.

During main acquisition, dense-contact C1 keyboard run 2 retained one unresolved reversal (probe 335, no matching submission before timeout): 659 of 660 attempts completed. This is a normal attempt, not a deliberate fault control, and must fail the unresolved-attempt gate even if pooled successful counts exceed 1,000. No replacement run is substituted. Raw-trace attribution is deferred until the timing queue is idle; subsequent workloads continue.

Dense-contact C1 keyboard run 5 also retained one unresolved normal attempt (659 of 660 completed). The completed queue is not equivalent to passing acquisition gates; these unresolved attempts remain in the final denominators and gate decisions.

The primary bundled queue finished all 140 scheduled jobs: 92,400 attempts, 92,391 completed and nine unresolved normal attempts (six dense-contact C1, three steady-load across B0/C1). No substitutes are pooled. The full 30-minute B0/B1/C1 soaks each delivered 36,000 ticks with no dropped time, at least 1,002 native bodies active, native counts 1,122 before/after and zero final owned workers. Finite factory active jobs declined 30 to 10, so only the native pressure stayed constant. Six supplemental jobs and eight labelled pressure jobs completed; detailed trace checks remain pending. Real focus loss could not be produced through bundled tab creation or visibility controls in two retained B0 attempts; this gate and remaining real-focus strata stay unqualified, and reported browser flags cannot certify native desktop foreground.

Firefox 159 headless completed the full 228-record matrix with matching captures and no case failures, the core and corner/steady continuation gates, six ordering cases, 56 fault checks and 100 lifecycle cycles per architecture. All stages ended with zero owned workers. Six detector controls passed. Its B0-only screen selected S2-mixed-1000; that and provisional S1-awake-1000 each passed 10,000 ticks plus 1,000 after restore in all architectures. The full 140-job fresh-process Firefox response schedule is frozen in firefox-long-comparison-freeze.json before execution. It uses the unchanged optimized artifacts, helpers and 2/5/8 ms budgets. Headless response remains software-only diagnostic evidence. Strict checking and twelve tests pass; live artifact verification confirms production is unchanged.

During Firefox normal acquisition, C1 synthetic-gamepad run 3 crossed the frozen free-space corridor guard after 623 attempts (622 completed; the final reverse attempt was interrupted). The retained failure makes this acquisition unqualified. No replacement run or widened corridor is substituted; raw position attribution waits until the timing queue is idle. All remaining scheduled Firefox jobs continue.

Firefox physics-heavy C1 keyboard run 2 also crossed the frozen corridor guard after 138 attempts (137 completed). It is retained as an incomplete acquisition, with no replacement and no threshold change. Browser errors were empty; position attribution remains pending after acquisition.

Firefox dense-contact C1 synthetic-gamepad run 1 crossed the corridor guard after 407 attempted probes, with 405 completed. Its two unfinished attempts and raw trace remain retained; no replacement or widening is substituted. This is the third retained Firefox corridor interruption. Acquisition continues through the full queue.

The first two Firefox selected-largest S2-mixed-1000 rendered jobs (B0/C1 keyboard run 1) failed the 45-second app-preparation bound before any probes were attempted. These are fixture-specific startup failures, not evidence that Firefox rendering is generally unavailable: the preceding 100 jobs rendered and its six controls passed. The original continuation gate passed, so app loading/serialization requires separate diagnosis after timed acquisition. All scheduled attempts stay retained; no candidate timings are invented for this stratum.
