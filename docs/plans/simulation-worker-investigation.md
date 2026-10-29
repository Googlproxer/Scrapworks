# Simulation worker investigation

Decision and plan recorded 29 October 2026. Status: **investigation complete; current worker publication fails qualification**. See the [29 October report](../reports/simulation-worker/2026-10-29/README.md). Compare **Miniplex 2.0.0 and bitECS 0.4.0** in the agreed single simulation-worker architecture, including their suitability for possible future multithreading. The results retain Miniplex as the preferred baseline. Both candidates pass correctness and simulation/copy latency, but rich-record transport misses host-work, callback and input budgets. Production worker integration requires a revised publication contract; production ECS/gameplay implementation remains pending.

[Roadmap](README.md) · [Milestone 3 Step 0](milestone-03-character-and-manual-opening.md#step-0-establish-and-prove-the-ecs-foundation) · [ECS evidence](../reports/ecs/2026-10-29/README.md) · [Technical design](../design/TDD.md#ecs-foundation-from-milestone-3)

## Agreed decisions

| Decision            | Recorded direction                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ECS comparison      | Compare **Miniplex 2.0.0 and bitECS 0.4.0** using the same worker protocol and workloads. Retain the prior Miniplex selection as the baseline, without assuming the worker-study outcome.                                                                                 |
| Execution           | Investigate **one dedicated module Web Worker** owning Simulation and its private ECS world for each candidate. ECS systems execute sequentially within that worker.                                                                                                      |
| Presentation        | Angular UI, Babylon presentation, input sampling and Editor bindings remain on the main thread. They submit intent and consume detached completed views.                                                                                                                  |
| Future suitability  | Assess documented threading facilities, storage compatibility, synchronization responsibilities, migration effort and deployment constraints for both candidates. Distinguish supported capabilities from custom infrastructure and unmeasured potential.                 |
| Further parallelism | **Multi-worker ECS implementation and benchmarking remain out of scope.** Shared-memory component stores, Atomics, worker pools and parallel system scheduling are not implemented in this study. Reopen implementation investigation if simulation profiles show a need. |
| Qualification       | Browser performance governs this browser game. Use the current desktop and Playwright Chromium first. Node remains useful for pure correctness, tooling and diagnostics, with no Node latency qualification gate for this worker study.                                   |
| Responsiveness      | **60 FPS is required; 120 FPS is diagnostic only.** Record actual display/browser cadence and keep emulated pacing distinct from observed refresh performance.                                                                                                            |
| Player presentation | Start with interpolation between authoritative movement views. Investigate local visual prediction only if measured latency or playtesting warrants it; collision and position authority remain in the worker.                                                            |
| Suspension          | Preserve the existing pause/input-ownership contract, including hidden-tab suspension and no hidden-time or offline catch-up. A worker does not authorize background production.                                                                                          |
| Scope               | Investigate compatibility, messaging, timing, lifecycle, memory and browser responsiveness. Production worker integration and remaining ECS/gameplay foundation implementation follow the evidence.                                                                       |

The existing ECS report retains its original dual-runtime selection protocol and measurements. These later decisions do not rewrite that historical evidence. The comparison measured detached publication but **did not measure worker messaging, receiving-side application or parallel scalability**. Neither candidate's historical timings establish a multithreading advantage.

## Questions to resolve experimentally

1. For each candidate, can one worker preserve deterministic state, command priority and lifecycle behaviour while protecting the main thread from simulation work?
2. What must change at the synchronous `GameSession`, scene tick-hook and `WorldView` boundaries?
3. Which clock arrangement preserves the current contract with the least complexity and acceptable input delay?
4. How much do serialization, delivery, receiving-side updates and additional retained views cost at 100,000 meaningful entities?
5. Does interpolation provide acceptable movement and camera response at 60 FPS without prediction?
6. What bounded behaviour is possible while pausing, replacing or failing a world with work already in flight?
7. Does either candidate offer a measured advantage in single-worker cost or maintainability, and what additional work would each require for future multi-worker simulation?

The user confirmed 60 FPS qualification, 120 FPS diagnostics and interpolation first. Numerical budgets below were frozen after calibration and retained without relaxation. The report documents warm-context and callback-arrival corrections, complete primary/paced evidence and excluded superseded samples.

## 1. Audit the current boundary

Read and map the implemented contracts before writing the prototype:

- [`GameSession`](../../src/app/features/game/session/game-session.ts) owns the synchronous accumulator, movement state, ordered tick registrations, command submission and completed view.
- [`GameRuntimeService`](../../src/app/features/game/game-runtime.service.ts) composes pause/input ownership and currently expects `session.frame` to return the just-completed view synchronously.
- [`WorldSessionBridge`](../../src/contracts/game-client.ts), [`GameTickHandler`](../../src/contracts/game-tick.ts) and the Toolkit bindings connect renderer input/hooks to that session.
- [`Simulation`](../../src/simulation/simulation.ts), [`PlayerMotor`](../../src/simulation/player-motor.ts) and [`WorldView`](../../src/contracts/world.ts) provide the implemented plain-state fixture and authoritative movement reference.
- The [ECS laboratory](../../tools/ecs-bench/README.md) supplies both [Miniplex](../../tools/ecs-bench/adapters/miniplex.ts) and [bitECS](../../tools/ecs-bench/adapters/bitecs.ts) adapters, deterministic synthetic fixtures, command rules, capture and correctness oracle. Its synthetic processors are not future gameplay implementations.

Deliver a compatibility table identifying every synchronous caller, state read, tick-hook side effect, input invalidation and teardown path. In particular, a callback executing in the renderer cannot simply be serialized into a worker. Keep scene hooks as presentation/input bindings; authoritative, state-dependent work belongs in plain simulation systems. Describe any change to callback ordering or visibility explicitly, and prove the replacement contract before production adoption. Do not introduce per-system request/response round trips.

## 2. Build an isolated prototype and inline control

Place new investigation code under `tools/simulation-worker-bench/`, reusing the existing TypeScript, Vite and Playwright installation. Keep both exact candidate versions pinned and verify installed exports/declarations. Use strict types and a production browser bundle without HMR or test-runner instrumentation in measured code. Do not change production routing, simulation, Editor assets or gameplay rules for this experiment.

Provide a **two-by-two comparison** over the same plain rules and publication contract:

| Candidate      | Inline control                                                | Single-worker configuration                                   |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Miniplex 2.0.0 | Host runs native Miniplex systems and applies detached views. | One worker runs the same systems and sends completed results. |
| bitECS 0.4.0   | Host runs native bitECS systems and applies detached views.   | One worker runs the same systems and sends completed results. |

Exercise the currently implemented movement/placement fixture as the production compatibility reference, then the richer synthetic world through both ECS adapters. Production-fixture tests establish compatibility with existing behaviour; synthetic tests establish scale. Neither substitutes for the other. Keep each candidate's inline adapter for comparison and tests; it is not an agreed automatic production fallback.

Share fixture seeds, domain functions, command streams, numeric precision, population, inventory capacities, completed-work assertions, capture semantics and detached publication requirements. Allow native queries and storage inside candidate systems; do not force their hot paths through generic per-component getters. Preserve synchronous inline execution without adding Promise overhead to synchronous ticks. Start bitECS with its previously tested hybrid object payloads and Float64 numeric stores; ordinary typed arrays are not automatically shared memory. Avoid a storage rewrite that gives only one candidate a different workload or projection contract.

Use this ownership boundary:

| Owner         | Responsibilities                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker        | One authoritative mutable simulation/ECS world, stable IDs, commands, system ordering, structural commits, dirty tracking, capture/rebuild and completed publication.              |
| Main thread   | Angular/Babylon, physical input and activity observation, message transport, command acknowledgements, detached presentation cache, interpolation and visible failure/retry state. |
| Plain modules | Shared domain rules and serializable protocol types; simulation/contracts/core remain free of Angular, renderer, storage, DOM and wall-clock reads.                                |

Prototype transport/control code may read clocks and use worker APIs outside the pure simulation. Do not send either ECS world, library query/component handles, callbacks, meshes, signals or services across the boundary. Preserve stable game-owned IDs independently of Miniplex object identity and bitECS entity-ID recycling.

## 3. Compare timing and message contracts

Start both candidates with the same ordinary `postMessage` transport and structured-cloned data. Benchmark transferable `ArrayBuffer` payloads only as a diagnostic if object transport is a demonstrated bottleneck, making the same wire-format option available to both candidates. Include packing, unpacking, buffer ownership and allocation costs; transferring a buffer detaches the sender's copy. No `SharedArrayBuffer`, Atomics, worker pool or hosting-header changes are implemented; future shared-memory feasibility is assessed in section 7.

Compare two **alternative** clock arrangements, each with exactly one accumulator and one source of tick decisions. Use the same clock arrangement for both candidates in direct comparisons; isolate any clock-specific improvement from library effects:

1. **Frame-driven host clock first:** preserve the existing application frame source and 50 ms accumulator; send bounded step/input requests to the worker. The worker executes requested steps without an independent timer. Rendering consumes the latest completed view and never waits synchronously for a reply.
2. **Worker-owned clock diagnostic:** move the application scheduler/accumulator into worker infrastructure, supplying explicit activity/input changes from the main thread. Keep clocks out of simulation rules. Measure the improvement, if any, during main-thread pressure against added timing/hook complexity. This design must still pause for the same activity reasons and cannot treat a throttled or hidden tab as offline progress.

Retain the 20 Hz step, five-step catch-up ceiling and discarded excess elapsed time. That ceiling must cover outstanding work as well as a local accumulator; repeated host frames cannot enqueue unlimited five-step batches. Compare one-step requests with bounded batches, including the cost of yielding between steps for control-message handling.

Define a versioned plain protocol with initialization/readiness, advance/input, discrete command/result, activity/pause/resume, publication/acknowledgement, resynchronization, capture/rebuild, failure and disposal messages. Include world generation, input revision, request/command sequence, completed tick and publication/base version where relevant.

- Coalesce continuous movement to the newest valid sample. Preserve ordered discrete commands exactly once, including commands submitted while a tick is in flight. Overflow must produce explicit backpressure or rejection, not silent command loss.
- Preserve manual/current-handcraft, requested MiniFab, then Field Research spending priority in synthetic contention tests. Query order or message arrival between independent work producers must not decide spending priority.
- Keep one advance request/batch in flight initially, with bounded pending elapsed time, commands and publication data. Record queue depths and bytes. Do not keep a large replay log in memory.
- Send an initial full detached view, then ordered changed records/removals. Reject stale generations. Detect base-version gaps and request a full resynchronization. Coalescing must merge deltas correctly; dropping intermediate deltas can silently lose removals or nested changes.
- State when a command was accepted, applied or rejected. A presentation cache and visual interpolation never become another writable authoritative world.

## 4. Prove correctness and lifecycle

Require the following before ranking timings:

- Require both candidates, in inline and worker modes, to match the same plain reference over identical tick-assigned inputs and commands; verify snapshots, IDs, ownership, completion counts, nested inventory changes and detached views outside timing. Also compare normalized plain captures between candidates. Keep meaningful work replenished at all scales.
- Movement/collision/placement and spending priority match the plain reference. Continuous input sampling may coalesce; discrete actions cannot repeat during catch-up or replay after invalidation.
- Pause, focus/UI ownership changes, binding capture, controller changes, Inspector, hidden tab, scene switch and teardown clear stale input and pending timing consistently. Resume starts with fresh input and no hidden-time advancement.
- **Asynchronous pause is explicit:** stop new host requests immediately, identify the last accepted/in-flight batch and acknowledge suspension at a completed tick. Measure how many steps can finish before acknowledgement. No steps or command applications occur after the pause acknowledgement until an explicit resume. Do not claim a synchronous rollback of an already running tick.
- Delayed/duplicated results, stale generations, publication gaps, malformed messages, a busy host and a deliberately slow worker cannot corrupt state or grow queues without bound. An unresponsive worker triggers a visible error and stops new work after a documented timeout.
- Initialization, replacement and repeated disposal cancel owned timers/listeners, terminate the worker and settle pending requests exactly once. Late messages cannot update a replacement world; independent sessions cannot contaminate one another.
- Step exceptions expose the last complete published state and fail the session. Start with the existing visible failure/Retry direction. A presentation view is not a complete recovery snapshot; do not transparently recreate an authoritative world from it or promise zero progress loss after a crash.
- Capture occurs at an acknowledged completed tick and restores into a fresh worker with 1,000 subsequent steps matching uninterrupted execution. Include reservations, held output, histories and charge in synthetic tests. This tests transport/capture boundaries, not IndexedDB or a delivered gameplay save.

Test interruption both between steps and while a bounded catch-up batch is outstanding. Produce an explicit list of preserved guarantees and unavoidable asynchronous differences from the present synchronous session.

## 5. Measure browser cost and responsiveness

Use the reference desktop and installed Playwright Chromium. Record revision/dirty state, lock/source hashes, both candidate/browser/V8 versions, OS/hardware, launch flags, display cadence, seed and exact workload/protocol configuration. Use production builds and sequential measurements. Run each candidate/configuration/repetition in a fresh Chromium process to avoid retained state or module-cache contamination. Node may run pure protocol tests; it does not decide worker performance qualification.

Use a staged matrix rather than repeating the entire four-library study:

| Stage                 | Cases and purpose                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Calibration           | 1,000 and 10,000 entities; correctness, timestamp/queue instrumentation, transport size and browser cadence. Freeze proposed numerical gates before qualification.                                                                                                                                                                                                                         |
| Primary qualification | All four candidate/execution configurations at **100,000 meaningful entities**, normal mixed work, five independent repetitions each, with seed 1729 and seeded balanced ordering. Pair candidate inline/worker results and compare both worker results under the same clock/protocol. Preserve 60% processors/20% owners/10% deposits/10% piles and the existing active/idle/blocked mix. |
| Scaling and stress    | 50,000 and 250,000 entities; mostly idle, fully active and 1% structural churn at target scale. Expand to five repetitions for any configuration used to support a comparative claim. Label stress timeouts explicitly.                                                                                                                                                                    |
| Transport diagnostics | Full publication and 0%, 1%, 10%, 100% dirty; ordered deltas, cadence/coalescing choices, single-step versus bounded batches, alternate clock and transferables only where justified. A changed recommendation must repeat primary qualification.                                                                                                                                          |
| Paced responsiveness  | Three 30-second runs for each of the four configurations, per normal/idle/fully active target workload and each 0/4/8 ms host-pressure case at 60 FPS. Record host work separately from simulation. Measure 120 FPS diagnostically, identifying observed versus emulated cadence.                                                                                                          |
| Retention/lifecycle   | Both candidates in inline and worker modes: 10,000 churn ticks and 20 create/capture/rebuild/dispose cycles at target scale, with bounded queues and deliberately released views/captures/results.                                                                                                                                                                                         |

For unpaced throughput/latency trials, reuse at least two seconds and 200 disposable-world warm-up ticks, fresh measurement state and 2,000 fixed steps without sleeping. Retain the 120-second measured-trial limit and record partial trials. Paced tests instead run at real application cadence and warm up before their observation window. Do not mix throughput and responsiveness samples.

Report p50/p95/p99/max and per-run spread for worker execution, structural commit/dirty tracking, detached publication, packing/serialization, message delivery, host application, queue age and command-to-visible acknowledgement. Measure main-thread bridge work and frame intervals, long tasks, backlog, interpolation age, completed work, initialization/readiness and disposal. Record both latency from sampled input to its applied tick and latency to presentation; the latter is an automated proxy, not a physical input-to-photon measurement.

Measure round trips on the host's monotonic clock and worker durations on the worker's own clock. Do not subtract raw `performance.now()` readings from different contexts without aligning time origins and documenting uncertainty. Report end-to-end observed distributions; summing phase percentiles is invalid and parallel durations are not additive.

Take separate CPU/GC/allocation profiles for both contexts. Measure total retained cost, including worker runtime, host caches, in-flight messages and buffers. Page-only heap figures do not establish worker memory: attach instrumentation to worker targets, or mark the missing measurement unavailable. Force GC only at dedicated checkpoints. Retention claims require surviving-object evidence, and profiler responses must be released before attribution, as learned in the ECS comparison.

## 6. Evaluate gates and player feel

The required operating point is the 100,000-entity normal workload at 60 FPS on the reference desktop. For primary latency qualification, use the median of five independent per-run p95/p99 values and publish every repetition. For paced responsiveness, publish all three 30-second runs and their median; the frozen frame budgets apply to each run. Treat stress/fully active results separately and do not substitute Node results or 120 FPS diagnostics for browser qualification.

| Criterion                                   | Frozen investigation budget                                                                                                                                                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness                                 | All protocol, state, ordering and lifecycle assertions pass. No unbounded queues or unresolved retained-growth issue.                                                                                                                                             |
| Worker simulation + detached publication    | Retain browser **p95 ≤5 ms / p99 ≤8 ms** from the ECS study, now measured inside the worker. This excludes delivery and host application, which must be reported separately.                                                                                      |
| Host work attributable to simulation bridge | **Frozen:** p95 ≤2 ms / p99 ≤4 ms per publication, including receiving-side application. Also report accumulated bridge time per frame when replies arrive together.                                                                                              |
| Paced frame intervals                       | At 60 Hz, **proposed:** per-run frame p95 ≤18.5 ms and p99 ≤33.4 ms in normal work with 0/4/8 ms host-pressure cases; distinguish OS/browser interruptions and publish all runs. Rendering/subscriber work in the real game remains a separate integration check. |
| Input/command responsiveness                | **Frozen:** sampled input to visible applied-tick acknowledgement p95 ≤100 ms / p99 ≤150 ms in normal work; publish the inline delta and worst cases. Synthetic metrics alone cannot approve movement feel.                                                       |
| Long tasks and backlog                      | Report attributable long tasks and recovery duration. Require bounded request/publication queues with no sustained increase in view age. Investigate all observed stalls rather than hiding them in averages.                                                     |
| Memory/startup                              | No absolute RAM or startup cap is agreed. Report incremental and peak memory, startup/readiness and disposal against inline, with attribution and explicit tradeoffs.                                                                                             |

Review movement, camera following, sprint/stop, turns, collisions, placement and UI acknowledgements with authoritative interpolation first. An optional development-only integration probe can exercise the current Angular/Babylon fixture after the isolated prototype passes, without implementing gameplay or treating 100,000 synthetic records as 100,000 meshes. Preserve responsiveness/accessibility checks for any touched UI. If interpolation causes unacceptable delay, report the evidence and propose a separate visual-prediction experiment; never move collision/inventory authority into presentation to meet a latency number.

The outcome may be a simpler clock, reduced projection scope/cadence or a transport change. A worker need not make an individual ECS tick faster; the decision must consider main-thread responsiveness, total cost, input delay and maintainability together. If gates are missed, document the bottleneck and follow-up rather than silently changing the agreed entity target or adding more simulation workers.

## 7. Assess future multithreading suitability without implementing it

Produce a source-backed comparison of the locked packages and official threading guidance. This is an architecture/maintenance assessment, not a worker-pool prototype or a parallel-speedup benchmark. Neither candidate supplies an automatic parallel-system scheduler. bitECS offers buffer-oriented facilities that may reduce custom infrastructure; Miniplex can supply data to custom worker jobs, with additional conversion/coordination work to assess.

| Area                                   | Miniplex evidence and questions                                                                                                                                       | bitECS evidence and questions                                                                                                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shareable numeric storage              | Plain object components are not a shared object graph. Identify how numeric job buffers would be produced, updated and reconciled, and what domain code would change. | Inspect SharedArrayBuffer-backed typed component stores and the `asBuffer` query modifier in 0.4.0. Identify which tested numeric stores could use them and which object payloads would remain owned by the coordinator.                                                       |
| Query and entity lifecycle             | Identify custom partition creation, membership snapshots, stable-ID mapping and stale-result validation.                                                              | Check query-buffer backing, fixed view lengths, growth/replacement and entity-ID reuse. Do not assume `asBuffer` always returns shared memory: the installed package falls back to ArrayBuffer when SharedArrayBuffer is unavailable.                                          |
| Structural changes and synchronization | Identify the owner of entity/component mutation and a future command/result commit boundary.                                                                          | Interpret the threading guide's “main thread” as the ECS coordinator; that role can be the simulation worker. Structural operations remain with that owner, with helper results committed after completion. The guide does not authorize concurrent mutation of the ECS world. |
| Domain dependencies                    | Map independent calculations versus shared inventory, ownership, reservations, output/history and spending-order dependencies.                                        | Apply the same dependency map. Shared arrays do not remove write conflicts or make complex transactions atomic.                                                                                                                                                                |
| Publication and consistency            | Assess costs of detached or packed numeric presentation buffers; retain one writable authority.                                                                       | Assess how shared numeric data could be published consistently without exposing partially updated values to presentation. Ordinary nested objects still need serialization or a redesigned representation.                                                                     |
| Deployment and growth                  | Identify transport/buffer infrastructure, capacity policies and hosting requirements a later implementation would add.                                                | Document cross-origin isolation and resource-loading implications for shared memory, buffer expansion/rebinding, synchronization and recovery. Treat these as future requirements, not changes to current hosting.                                                             |

For each entry, cite installed declarations/source or an official version-appropriate example, identify the native facility versus project-owned code, and record uncertainties. Document potential migration touch points from each single-worker prototype, including shared domain functions, stores, capture/projection, protocol and tests. Keep hypothetical future costs and expected benefits separate from measured single-worker results; do not invent parallel speedups or call a future path proven.

Revisit the original five equally weighted maintainability criteria (domain reuse, type safety, lifecycle/mutation, capture/projection and package/integration risk), scoring each 0–2 using the new worker evidence. Report future multithreading readiness separately with concrete advantages, obligations and uncertainty rather than silently adding a speculative scoring bonus. Recommend a runtime for the current single-worker scope and explain whether preserving a future parallel path changes that recommendation. The historical Miniplex result remains intact; this report supplies any revised recommendation and rationale.

**Implementation exclusions remain explicit:** no additional simulation workers, shared mutable ECS state, SharedArrayBuffer/Atomics implementation, parallel scheduling, synchronization barriers or production-header changes. A later multi-worker implementation investigation would require its own scope and measurements if profiling demonstrates a need.

## Deliverables and implementation handoff

- [x] Compatibility audit and explicit asynchronous session/tick-hook contract.
- [x] Both pinned candidates in inline and single-worker modes, shared correctness/transport suite and reproducible commands, implemented as `bench:worker:check`, `bench:worker:smoke`, `bench:worker:browser` and `bench:worker:report`. Include candidate and execution-mode filters in commands and artifacts.
- [x] Production-build, CSP/worker-loading and deployed-base-path smoke checks using repository build settings; prototype success under Vite alone does not prove Angular packaging. Keep worker dependencies out of the renderer bundle except intentional protocol/host code.
- [x] Raw samples, manifests, profiles and heap evidence under ignored `tmp/simulation-worker-bench/<run-id>/`; compact JSON/CSV, scaling/latency charts and a dated report under `docs/reports/simulation-worker/<date>/`.
- [x] Side-by-side results for all four configurations, per-candidate worker overhead relative to inline, browser qualification and the source-backed future multithreading assessment. Publish failures and all repetitions.
- [x] Recommendation between Miniplex and bitECS for the current single-worker scope, including maintainability evidence and separate future-readiness tradeoffs, plus clock ownership, protocol/batching/publication, interpolation and pause/failure behaviour. Record actual duration so future runs can be estimated.
- [x] Small correctness/smoke CI checks and a manual performance workflow with uploaded artifacts. Hosted-runner timings remain separate from reference-desktop qualification.
- [x] A production implementation plan listing exact affected contracts/files, migration order, rollback path and focused regression checks. Reconcile only investigation evidence; leave production worker and remaining Milestone 3 foundation/gameplay checklists open until implemented and verified.

The investigation is complete, with failed worker publication qualification and no production migration. Target-device qualification, other browser engines, offline production, gameplay persistence, multiple authoritative simulation workers and shared-memory parallel ECS implementation remain later work. Only the suitability assessment for that future parallelism is included now.

Evidence: [results](../reports/simulation-worker/2026-10-29/README.md), [compatibility/handoff](../reports/simulation-worker/2026-10-29/compatibility.md), and [threading assessment](../reports/simulation-worker/2026-10-29/future-threading.md). The common laboratory host bundle includes both APIs for its inline controls; the production input audit excludes all candidates. Investigation completion grants no production runtime/worker credit. Neither current worker bridge qualifies; publication rework and the remaining Milestone 3 foundation stay open.

## Technical sources

- Installed Miniplex 2.0.0 and [official scheduling/entity model](https://github.com/hmans/miniplex#differences-from-other-ecs-libraries): plain objects, application-owned scheduling, no built-in parallel system scheduler.
- Installed bitECS 0.4.0, including `docs/Multithreading.md` and buffered-query storage in `dist/core/index.mjs`; [official threading guidance](https://bitecs.dev/docs/multithreading) and [component storage guidance](https://bitecs.dev/docs/component). Verify online examples against the locked package rather than assuming main-branch documentation is identical.
- [HTML worker specification](https://html.spec.whatwg.org/multipage/workers.html): worker execution, lifecycle and message interfaces.
- [Structured serialization and transfer](https://html.spec.whatwg.org/multipage/structured-data.html): data copying, transfer ownership and shared-memory restrictions.

Sources checked 29 October 2026. The dated report records measured private-worker compatibility, failed publication qualification and the separate future-readiness assessment.
