# Split physics worker experiment plan

Recorded 10 November 2026. Status: **planned; no prototype, new latency baseline or qualification results yet**. This plan defines a local experiment. Production keeps its existing single simulation worker until a separate implementation decision follows the results.

## Purpose and decision

Determine whether putting Rapier in a dedicated worker improves capacity or responsiveness as factory simulation, static collision geometry and active rigid bodies grow. Preserving the current player's response to input is the primary requirement. A faster factory benchmark does not compensate for slower movement, stopping or turning.

The experiment must answer:

1. How does actual player input-to-render response compare with the current controller on the same hardware, browser and workload?
2. Where do simulation work, physics work, communication or presentation first exceed the available budget?
3. Do world edits, saves, pause, overload and worker failures retain coherent gameplay and native physics state?
4. Is any benefit large and repeatable enough to justify another worker, more memory and a coordinated save/lifecycle protocol?

All performance runs, scaling sweeps, soaks and browser routes remain **local and manually invoked**. Do not add them to GitHub Actions, scheduled hosted jobs or CI. Any later CI coverage is limited to small focused protocol/unit and fixture integration tests under the [repository runtime budget](../../AGENTS.md#ci-runtime-budget).

## Current behavior and evidence limits

- [WorldPhysics](../../src/simulation/physics/world-physics.ts) performs three fixed 1/60-second steps inside each 20 Hz gameplay tick. These are numerical substeps executed together; physics has no separate wall-clock timer.
- [Simulation.step](../../src/simulation/ecs-runtime.ts) applies ordered commands and collider changes, resolves movement, then advances opening/factory work and completes structural changes. The split must preserve this before/after ordering.
- [GameSession](../../src/session/game-session.ts) permits one advance at a time, bounds catch-up to five ticks and awaits settled operations for captures.
- Actual movement flows through [InputManager](../../src/game/input/input-manager.ts), [PlayerController](../../src/game/views/player-controller.ts), [SessionDriver](../../src/game/views/session-driver.ts), worker publication and [PlayerView](../../src/game/views/player-view.ts). PlayerView interpolation and facing smoothing are part of the baseline.
- The [portfolio diagnostic](../../tools/portfolio/run.ts) currently records keydown-to-next-RAF. That measures scheduling opportunity, not a causal player response. Historical synthetic worker marker timings and their 100/150 ms gates are also not a production controller baseline.
- The [existing local worker profile](../reports/milestone-10/2026-11-10/README.md) has a small 80-step Chromium sample and no isolated physics measurement. It does not establish a physics CPU bottleneck or gamepad input latency.

**First produce a fresh current-controller baseline. Leave every latency value unfilled until measured.** Record existing responsiveness problems rather than treating the current controller as proof that all devices already feel good.

## 1. Freeze the reference and comparison variants

| Variant                                      | Role                                                                     | Timing and presentation                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B0: current production architecture          | The baseline the candidate must target                                   | Existing controller, one simulation worker containing Rapier, 20 Hz ticks, three physics substeps and current interpolation.                                                |
| B1: extracted boundary in one worker         | Diagnostic control separating refactor effects from cross-worker effects | The proposed begin-physics/finish-tick boundary runs in the same worker, preserving B0 ordering and results.                                                                |
| C1: separate physics worker                  | Primary candidate                                                        | Simulation sends a numbered tick request; physics applies its collider changes and runs three substeps; simulation accepts the matching result before completing that tick. |
| C2: pipelined or independently paced physics | Optional later experiment                                                | A separate, explicitly versioned protocol. Run only after C1 correctness and baseline qualification; do not pool its results with C1.                                       |

Freeze B0 from the actual working tree, including relevant uncommitted changes, rather than assuming HEAD represents the current game. Preserve source/build/asset hashes, dirty patch identity, lockfile and generated scene-registration identity. Both variants use the same pinned Rapier version, content, fixtures, character, browser configuration, input bindings and rendering settings.

Use production optimization for the browser measurements. Diagnostic hooks must be opt-in, bounded and absent from ordinary production output. Establish B1 parity before attributing a C1 difference to worker isolation. Compare C1 directly with B0 as well as B1; an expensive extraction cannot be normalized out of the primary comparison.

Keep preloading, visual prediction, interpolation, facing smoothing, physics timestep, input polling and browser scheduling policy unchanged in the primary experiment. Startup/prewarming can be a separately labelled follow-up after the architecture comparison.

### C1 ownership and ordering

The simulation owns gameplay commands, tick completion and published authoritative state. Physics owns its Rapier world, native handles, character controller and dynamic bodies. Exchange movement intent, ordered collider deltas and resolved poses; do not clone the entire ECS world every tick.

Use a direct MessageChannel and bounded messages or transferred typed buffers for the primary transport. Shared memory is a separate experiment because it introduces different ownership and deployment requirements. Start with one physics request per logical tick and at most one outstanding request. Preserve the existing five-tick host catch-up allowance, including sequential physics requests during catch-up.

Every request/result identifies world generation, logical tick, physics substep target and collider revision. For a completed logical boundary N, physics has completed exactly 3N substeps. Duplicate, stale or mismatched responses cannot mutate authority. Late physics delays tick commitment; it never silently supplies an older position. Browser scheduling cannot guarantee a 50 ms deadline.

Waiting yields at the orchestration boundary. Deterministic simulation calculations remain synchronous plain TypeScript phases with explicit inputs and outputs. Serialize mutations, captures and replacements so asynchronous messages cannot expose a half-completed tick.

## 2. Measure controller latency through the real path

### Primary software endpoint

Measure from **the earliest input change observable by the application** to **the first submitted rendered frame containing the correct corresponding player response**. Both endpoints use the main thread's monotonic clock.

For keyboard, record event receipt before application input processing. For gamepad, record the first observed sample crossing the configured movement/deadzone or button boundary. A gamepad sample timestamp excludes unobserved physical-device and polling delay; it must not be described as physical press-to-photon latency. Use the real DeviceSourceManager, bindings, action evaluation, player controller, worker and interpolation path. A direct call to setMovement or a synthetic marker acknowledgement is insufficient.

Carry diagnostic probe identity through these stages without changing scheduling:

| Stage                                | Observation                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Input observed                       | Main-thread keyboard edge or gamepad sample; actual axis values, binding and deadzone.                                           |
| Action evaluated                     | Movement/sprint action and camera-relative direction selected for the frame.                                                     |
| Input submitted                      | Request/input sequence, input coalescing, next eligible tick and host queue depth.                                               |
| Simulation receives input            | Generation, accepted sequence and logical tick.                                                                                  |
| Physics starts/finishes              | C1 queue wait, collider revision, three-substep duration and result sequence; equivalent in-worker boundaries for B0/B1.         |
| Tick committed                       | Resolved player/body poses and input sequence represented by the completed tick.                                                 |
| Publication applied                  | Main-thread cache application, including message-handler work.                                                                   |
| Player presented and frame submitted | Interpolated player transform, camera transform, frame ID and causal source endpoints immediately around actual scene rendering. |

The existing inputSequence identifies submissions, not individual physical edges. Add diagnostic correlation for raw edges, action samples, coalesced/superseded inputs and submissions. Preserve production coalescing rules. Account for every probe as completed, legitimately superseded, deliberately blocked, timed out or still pending.

Define and freeze response detection before comparing variants:

- **Start:** first render containing displacement in the requested direction above a small fixed threshold calibrated against idle drift and contact corrections.
- **Release:** in free space, the first stationary rendered frame, confirmed retrospectively by the following frames; also record when deceleration begins, residual interpolation travel and final stopping distance. For contact/platform cases, evaluate the intended movement component relative to the support's motion, rather than requiring zero world-space velocity.
- **Reverse:** first render whose displacement has the requested opposite direction, plus time to stable reverse movement.
- Record facing, locomotion animation and camera response as separate metrics. An animation change alone is not movement response; camera following must not hide world-relative movement.
- Keep scripted physics objects and idle animation from triggering the response detector. Confirm the transform-based endpoint against frame/image observations in a separate validation pass, with both fixed-camera and normal follow-camera cases.

Measure p50, p95, p99, maxima, missed deadlines, stopping distance, wrong-direction duration, correction/jitter magnitude and input age at render. Break results down by input device, operation, workload, browser and arrival phase. Do not average all controls into a single passing number.

### Physical controller check

Include a real gamepad and the current keyboard on the same display for B0 and C1. Record wired/Bluetooth connection, device/firmware, polling behavior, browser, refresh rate and display mode. Use high-speed video or suitable external instrumentation to correlate physical actuation with visible movement, recording sampling uncertainty. A short counterbalanced, preferably blinded A/B playtest covers starting, stopping, reversing, wall sliding and moving-body contact.

Automated gamepad-state injection supplies repeatable browser-side samples through the production polling path. Label it synthetic. It supplements rather than replaces the physical controller baseline. Missing physical hardware or insufficient timing resolution leaves physical input-to-photon qualification pending; do not manufacture equivalent numbers from RAF callbacks.

### Timing integrity and probe validation

Main-thread input-to-frame durations are the primary software comparison. Worker-local durations diagnose causes. Do not directly subtract performance.now() values from different realms: their time origins can differ. If estimating cross-worker delivery, align time origins and characterize synchronization uncertainty; retain same-clock round trips as the robust transport measure. Do not sum overlapping stage durations into end-to-end latency.

RAF callbacks precede repaint; frame submission is still a software endpoint, not proof of display presentation. See [time origins](https://developer.mozilla.org/en-US/docs/Web/API/Performance/timeOrigin), [RAF timing](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) and [gamepad polling](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API).

Validate the probe using known added one-frame and 50 ms delays, a deliberately dropped result and a stale-generation result. It must expose the expected latency shift or failure. Check instrumentation-on versus instrumentation-off frame/round-trip behavior; use bounded buffers, no hot-path logging and no per-frame screenshots or synchronous GPU waits. If probe overhead or clock resolution prevents resolving the regression budget, the result is inconclusive rather than a pass.

## 3. Exercise input conditions that expose an extra worker hop

| Input case                                                                | Issue to expose                                                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Start, release and reverse in free space                                  | Added sampling, delivery, tick-join or interpolation delay.                                                                |
| Diagonal movement and sprint transitions                                  | Normalization, latest-input handling and locomotion/facing consistency.                                                    |
| Analog ramp across the deadzone, full-stick reversal and return to centre | Polling/deadzone behavior, stale samples and stopping delay.                                                               |
| Slide along a wall, approach a corner and move away                       | Correct collision response without contact-driven false positives in latency measurement.                                  |
| Push a crate, ride/contact a moving body and traverse dense contacts      | Coupling between player response, dynamics and support transport.                                                          |
| Short 20/40/60/100 ms taps and rapid changes                              | Sampling/coalescing limits and any change in the current tap-registration rate. Report separately from sustained movement. |
| Held movement across pause, focus loss, reconnect and load                | Stale input replay, ghost movement and incorrect reactivation.                                                             |

Distribute input arrival across the 50 ms tick interval and render phases. Record phase histograms and compare phase-conditioned latency, rather than injecting everything just before a favorable tick. Use identical seeded schedules, alternating directions and reset positions so the player remains on the test course. Sustained movement probes must last long enough to be observable in B0; do not mistake intentionally coalesced short taps for lost accepted commands.

## 4. Scale simulation and physics separately, then together

Reuse the actual [current-game workload shapes](../../tools/game-bench/README.md), [portfolio fixtures](../../tools/portfolio/fixtures.ts) and physics regression fixtures. These are controlled prepared worlds, not earned gameplay routes. Generate future-size maps separately from active Editor sources and user saves; validate definitions/captures and record exact counts and seeds. Do not weaken production validators to admit a benchmark.

Screen the following simulation levels against the four physics profiles below:

| Simulation level | Workload                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| S0               | Shipped opening/control world and current player collision course.                                                                             |
| S1               | Existing representative mixed factory: active production, transport, power and research, including partial and blocked jobs.                   |
| S2               | Four times S1's active workload on a valid expanded fixture. Record each subsystem count rather than assuming entity count predicts cost.      |
| S3               | Sixteen times S1's active workload, or the largest valid generated tier if a schema/resource bound is reached. Identify that bound explicitly. |

| Physics profile      | Growth dimensions                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0                   | Current authored physics and collider population.                                                                                                                                              |
| P1: static growth    | Sweep approximately 100, 1,000 and 10,000 extra static colliders; compare colliders near the player with an equal population far away.                                                         |
| P2: body growth      | Sweep approximately 10, 100 and 1,000 dynamic bodies, measuring awake, sleeping and mixed populations independently.                                                                           |
| P3: contact pressure | Dense valid stacks, moving platforms, CCD bodies and repeated contacts, with controlled insertion/removal and collider edits. Increase until a clear capacity knee or declared resource bound. |

The numeric sweeps are proposed anchors, not requirements that every device must pass. Freeze valid fixture counts after baseline calibration and before C1 comparisons. Record native shapes, active bodies, contacts, islands, kinematics, commands per tick, collider changes and returned pose counts.

Growing actual machines also grows colliders; adding bodies also increases ECS/publication work. Expose those coupled counts rather than claiming perfectly independent axes. Add isolation controls with fixed physical geometry while varying simulation-only work, and native-physics controls with fixed game work while varying collision load. The end-to-end matrix retains all actual coupling costs.

Use a constant visible scene/player course first, keeping off-screen scale from turning every result into a rendering benchmark. Follow with representative fully rendered mixed worlds. Separate simulation, physics, serialization, messaging, host application and render/GPU pressure. Add labelled main-thread pressure and background CPU contention; artificial worker delays characterize protocol sensitivity rather than pretending to model a particular device.

Identify the first failure tier for B0 and C1 and the cause: compute saturation, queue growth, collider synchronization, large pose transfers, main-thread stalls, memory, stale input or presentation lag. A stress case beyond B0 capacity is diagnostic; it is not silently included as a passing normal workload.

## 5. Prove world coherence before ranking performance

Use two distinct checks. A deterministic replay supplies identical inputs and commands at identical logical ticks and requires matching outcomes/captures within the same browser/platform and pinned Rapier build. A real-time input test records the ticks that actually consumed input; it measures scheduling differences and can replay that accepted stream against the reference. Do not require two differently scheduled wall-clock runs to produce identical final positions, or ignore a latency regression because their game logic matches.

Run at least 10,000 fixture-driven ticks in correctness mode, capturing selected boundaries and continuing a further 1,000 ticks after restore. This is local replay, separate from timed movement runs. Cover:

- Terrain, machine footprints and rotated colliders; wall/corner sliding, spawn clearance, crate pushing and moving-platform support.
- Place/remove/deplete operations immediately before and after movement. Reach checks, costs, inventory/refunds, reservations and collision revisions must preserve existing order and outcomes.
- Tick boundaries with multiple ordered commands and five-tick catch-up batches. No physics step, command or collision update is skipped or applied twice.
- Manual save, actual scheduled autosave, capture during an outstanding physics request, reload, new game and failed candidate preparation. A save at logical boundary N contains physics after 3N substeps and no half-applied edits.
- Restore both workers as a candidate pair before replacing authority. Preserve the previous active pair on preparation failure and reject delayed replies from retired generations.
- Repeated pause/resume, focus/visibility loss, zero-size viewport, renderer Retry and controller disconnect/reconnect. Simulation and physics clocks pause together, with the existing fresh-input requirement after resuming.

Inject physics response delays of 1, 4, 8, 16.7, 50, 100 and 250 ms, then duplicate, reorder, drop and corrupt selected responses. Test worker initialization failure, runtime termination, disposal mid-request and detached/reused buffers. Require bounded queues, explicit failure/timeout handling and no partially committed gameplay. Fault runs have their own verdicts and are not mixed into normal latency percentiles.

## 6. Run the comparison in stages

1. **Baseline/probe validation:** freeze B0, validate actual response detection and timing, collect the current controller baseline, and publish the protocol and acceptance numbers before C1 is measured.
2. **Correctness:** establish B1 parity and C1 coherent tick/save behavior. Stop performance ranking on a correctness failure.
3. **Short matrix screen:** inspect all S/P combinations with short repeated runs to find bottlenecks and capacity knees. These results select longer cases under a rule fixed from B0, not favorable C1 results.
4. **Latency qualification:** include normal S0/P0, representative S1/P0, simulation-heavy, physics-heavy, dense-contact and the largest baseline-qualified mixed case. Compare B0/C1 using balanced randomized or ABBA order, with fresh browser processes, identical warm-up and fixture resets. Keep B1 as an extraction-cost diagnostic.
5. **Lifecycle/overload and soak:** run the fault suite, at least 30 minutes at a near-capacity qualified mixed tier, and at least 100 create/restore/dispose cycles per architecture. Compare settled memory/worker counts after cycles and separate transient peaks from leaks.
6. **Physical controller and renderer check:** repeat the normal and demanding qualified cases headed on real hardware, followed by the counterbalanced human A/B check. Treat headless/software-rendered and emulated refresh runs as diagnostics.

Use Chromium and Firefox on this PC initially; add a lower-core/slower target device for a broader hardware claim. Measure 60 Hz first and actual 120/144 Hz displays separately when available. CPU throttling is a labelled stress control, not a replacement for another CPU or a high-refresh display. Do not run competing benchmarks, builds or profilers during rankings. Record power/thermal conditions, viewport, renderer/driver, refresh rate, gamepad settings and timer resolution.

Use five independent measured runs for each qualified case/device/browser/variant. After at least 15 seconds of warm-up, collect enough sustained start, release and reverse probes to reach at least 1,000 completed samples **per reported primary operation and input-device stratum across those runs**. Size windows from that count; a smoke run or small sample cannot qualify p99. Preserve every raw sample and per-run distribution. If runtime/resource limits prevent sufficient sampling, report that stratum as incomplete. An accepted normal sustained probe that times out or remains pending prevents a pass; do not obtain favorable percentiles by silently excluding those probes. Drain measurement windows before ending them, retaining any right-censored observations explicitly.

Keep steady movement, cold startup, manual-save interruption and actual autosave windows identifiable. Normal runs retain the same save policy in both variants; do not hide a longer candidate save hold by dropping affected probes. Report accepted input latency, deliberate input-blocking/hold durations and first response after release separately. Hardware actuation observations are a smaller external validation cohort and must retain their uncertainty; they do not manufacture a high-confidence physical p99.

## 7. Freeze acceptance gates around the current controller

The target is **zero meaningful input-latency regression**. The following small maximum regression budgets are proposed for the primary software endpoint and must be frozen with the validated B0 baseline before candidate runs; they are not claims about current measured latency.

| Metric, for each browser/hardware/device/operation/case                  | Maximum C1 increase over matched B0                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Input-to-response-frame p50                                              | 2 ms                                                       |
| Input-to-response-frame p95                                              | 5 ms                                                       |
| Input-to-response-frame p99                                              | 8 ms                                                       |
| Accepted sustained inputs lost, duplicated or applied to the wrong world | Zero                                                       |
| New recurrent extra render-frame or 50 ms tick delay                     | None; inspect distributions and phase-conditioned results. |
| Deterministic gameplay/native continuation or save coherence             | No divergence under identical logical replay.              |

Use paired case/run analysis and one-sided 95% upper confidence bounds for quantile differences, with resampling at the run/block level to preserve correlated samples. The upper bound must fit the budget. Insufficient precision is inconclusive. Averages and best repetitions cannot override a failing device, operation or tail percentile. Retain raw distributions and both confidence bounds so uncertainty can be reviewed.

Apply two latency assessments:

1. **Architecture regression:** compare C1 with B0 on the same workload using the table above.
2. **Playable capacity:** compare each growing-world case with that device/browser/operation's normal B0 response plus the same budgets. Mark where either architecture loses normal controller responsiveness. This prevents an already-slow large-world baseline from granting unlimited extra delay.

Retain the existing normal 60 Hz frame gates of p95 <=18.5 ms and p99 <=33.4 ms where the [portfolio protocol](../portfolio/README.md) applies, alongside the paired frame comparison. Other refresh rates require their own recorded frame baseline. Report end-to-end tick latency, 50 ms deadline misses, delivered ticks, dropped simulation time and oldest input age. Queues must remain bounded and must not grow through a steady near-capacity run.

Inspect JS heap, WASM backing memory and process memory per worker where supported. Distinguish observed heap from total/native/GPU memory and report unavailable measurements. With pair-per-world C1 ownership, expect two steady workers and a bounded four-worker peak while an old and candidate world coexist; verify those counts return after load/Retry/disposal. Record actual resource lifetime if a later candidate uses a different model.

Recommend production adoption only after correctness, latency and lifecycle gates pass and the candidate demonstrates a repeatable gain outside measurement noise: greater qualified world capacity, lower critical-path latency/CPU, or another explicitly accepted benefit. A smaller simulation chunk filename with the same total Rapier download is not a performance result. If C1 loses input responsiveness, retain B0 and report the responsible stage before exploring C2 or prediction.

## 8. Deliverables and implementation sequence

Proposed tooling destination: `tools/physics-worker-bench/`, using strict TypeScript, the existing browser/fixture helpers and an explicit local-only entry point that rejects CI execution. Proposed modes are probe/baseline, correctness, matrix, latency, faults, soak and report. Commands are added only when implemented. No runtime rewrite or benchmark command is added by this planning change.

Raw receipts, traces and screenshots belong under ignored `docs/reports/split-physics-worker/<date>/`. The durable decision belongs in a tracked follow-up to this plan. Each receipt records variant/protocol version, source/build/asset/fixture hashes, dirty-tree identity, browser/hardware/input configuration, actual entity/collider/body/contact counts, run order/seeds, timing resolution, instrumentation state, all attempted probes, phase samples, queues, memory, errors and pass/fail/inconclusive reasons.

The final report must include the current controller baseline; matched latency distributions and uncertainty; world-size/latency/throughput capacity curves; physics versus simulation versus communication attribution; coherent-save/fault results; memory/lifecycle growth; physical-controller observations; and a clear retain/split/further-investigation decision. No production architecture or milestone completion credit follows automatically from creating the prototype.

- [ ] Freeze the actual B0 source/build and validate the causal input-response probe.
- [ ] Publish keyboard/gamepad baseline, phase coverage, sampling plan and frozen gates.
- [ ] Extract B1 and verify identical logical/native continuation.
- [ ] Implement local C1 ownership, ordering and bounded transport; pass correctness first.
- [ ] Run the matrix and the predeclared latency qualification cases.
- [ ] Complete save, fault, pause, overload, soak and disposal checks.
- [ ] Record headed hardware/gamepad evidence and explicit unresolved device limits.
- [ ] Publish the decision with all failures and limitations; make any migration decision separately.
