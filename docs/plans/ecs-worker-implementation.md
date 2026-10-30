# Miniplex and simulation worker implementation

Recorded 30 October 2026. Status: **implemented and qualified through Milestone 3 Step 0**. The [dated production report](../reports/ecs-worker-implementation/2026-10-30/README.md) records all 94 qualification jobs, actual-scene acceptance and required repository checks. The existing movement/world fixture now runs with one private Miniplex authority in one dedicated worker. Work stops at this foundation; new salvage, crafting, research and MiniFab gameplay follow in their own milestone steps.

[Roadmap](README.md) · [Technical design](../design/TDD.md#ecs-foundation-from-milestone-3) · [Worker investigation](simulation-worker-investigation.md) · [Qualified lean contract](../reports/simulation-worker/2026-10-30/README.md) · [Production handoff](../reports/simulation-worker/2026-10-30/handoff.md)

## Decisions and scope

The library comparison, worker investigation and lean requalification are complete. Preserve those dated reports; they qualify an isolated laboratory rather than the production runtime.

| Decision | Implementation direction |
| --- | --- |
| Runtime | Miniplex **2.0.0**, one private ECS world per active simulation session. |
| Execution | One dedicated module worker owns authoritative simulation; systems execute sequentially. Angular/Babylon/input remain on the main thread. |
| Timing | Host frame-driven credits, fixed 50 ms steps, one advance batch in flight, and one shared five-step allowance for dispatched plus pending elapsed time. No independent worker ticker or offline catch-up. |
| Presentation | Compact transferred numeric views and bounded detached inspection details; full capture is a separate operation. Interpolation first; prediction remains deferred. |
| Script hooks — user confirmed | Retain the main-thread `onGameTick` authoring hook as **completed-tick presentation notifications**. It no longer prepares or participates in an authoritative step. |
| Failure/Retry — user confirmed | Retain the last completed view for the error state. Worker/presentation failure Retry creates a fresh session from the authored initial world. Healthy renderer-only Retry retains its live session. **No automatic in-memory checkpoints or recovery** in Step 0. The failure feedback explains the restart consequence. |
| Qualification | Reference desktop and Chromium, 60 Hz required; 120 Hz diagnostic. Existing compute/receiving/frame/input budgets remain. Actual scene integration must pass before adoption. |
| Future work | Multiple ECS workers, shared component memory, Atomics, parallel systems, target-device qualification and gameplay persistence remain separate. |

Step 0 includes real ECS ownership, opening component/resource schemas, reusable domain primitives, serializable command/capture boundaries, lean views, worker lifecycle, existing movement/placement behavior, and meaningful populated foundation tests. Normal initialization has an empty 24-slot bag, no equipped tool, no devices/work or research unlocks. Existing authored deposits and development-only placement remain.

Opening work/buffer/reservation/charge/research/history records must be representable and exercised in headless fixtures. Do not implement the five technologies, six playable recipes, salvage/research/crafting executors, device controls, onboarding, new gameplay UI or a runtime content catalogue here. Step 4 owns the real versioned content catalogue; foundation tests supply an explicit small immutable content fixture. No Fibery access enters runtime code. Milestone 4 owns IndexedDB slots, import/export UI and gameplay saves.

## Ownership and contracts to establish first

### Authoritative state and identity

- Keep `WorldDefinition` immutable, with Editor centimetre-to-metre conversion at the existing export/presentation boundary. Grid/terrain and content definitions are shared read-only resources, not an entity per item unit or terrain cell.
- Use typed ordinary component records for player transform/movement/equipped tool, inventory slots, deposit/pile quantities, structures/footprints and owned work/buffer/reservation/charge state. Use explicit resources for world ID, completed tick/fixed-step configuration, ID allocation, research ledgers and production/extraction history.
- Preserve authored string IDs and allocate game-owned IDs for new entities. Treat a world instance/generation separately from its map ID. Maintain a private ID-to-Miniplex index; raw object identity/query handles never cross the boundary.
- Assign compact numeric wire slots with generations independently of game IDs. Initial/structural packets supply the string-ID mapping. Slot reuse invalidates stale presentation handles, links and subscriptions. Capture stores stable IDs and allocation state, not transient wire slots.
- Replace the mutable `WorldState` scaffold with ECS-owned components/resources. A public snapshot or compatibility view is detached data, not a second mutable authoritative world. Store references/indexes may point into the same owned component records without duplicating their values.

### Session and command protocol

Define plain contracts before implementing transport: initialize/readiness, submit frame/input/step credits, read/subscribe completed presentation, submit discrete commands/results, inspect/subscribe details, pause/resume, full resynchronization, capture/rebuild, failure and disposal. Keep clocks/timers/worker APIs outside simulation/contracts/core. Shared protocol definitions contain serializable data; host/worker infrastructure owns delivery and timeouts.

Initialization resolves only after the first complete view is usable. Frame submission never waits for a worker reply. Every command has a world generation, input/activity revision and sequence/command ID; results identify applied tick and acceptance/rejection/cancellation. Continuous intent coalesces to its newest valid sample. Discrete commands remain ordered and bounded, are acknowledged once, and are revalidated against current authority. Do not replay cancelled pre-pause commands. Placement preview uses read-only completed occupancy and is advisory.

The authoritative step has explicit phases: apply valid commands and input; perform ordered domain work; move/collide the player; commit structural changes; increment the tick; publish completion. Preserve the existing command-before-movement behavior. Reserve the agreed stock priority: manual/current handcraft commitments, requested MiniFab intake, then Field Research. Future systems must call shared rules in that order rather than relying on query iteration. Step 0 proves the scheduling/transaction invariant with foundation fixtures without delivering those gameplay executors.

### Completed-tick script hooks and frame consistency

Retain `GameplayScript.onGameTick`, but change its contract/documentation to a read-only completed context. Prefer a clearly named `registerCompletedTickHandler` registration API and migrate all callers in the same change. Include completed tick, fixed delta, world generation and the current publication's completed tick/version; remove descriptions implying pre-step preparation.

Worker receipt applies completed deltas and queues small tick summaries. **Do not call scene scripts from the message handler.** During `SessionDriver`'s owned render-frame phase, bind/pin the latest completed view, drain presentation notifications in tick/registration order, then submit the next valid input/credit request. Preserve immediate unsubscription, registration order and ownership/revision checks after each callback. New registrations start after the current completed-tick cursor and do not replay already committed ticks, including undelivered catch-up summaries. A callback's commands target a future step and cannot affect the reported completed tick. A throwing presentation hook stops dispatch, enters the visible failure path and requests suspension; it cannot roll back an already completed authoritative tick. Retry follows the approved fresh-world policy.

Deliver one notification per committed step, at most five from a batch, without retaining a snapshot per tick. During catch-up, callbacks can see the latest published view, which may be newer than their individual tick; the context exposes that explicitly. Keep only the bounded transform endpoints needed for interpolation. Pause/clear-input publications without a new step do not generate fake tick events. Suppress scene notifications while inactive and discard old notification backlog on pause/replacement/resynchronization; still apply valid authoritative deltas so base versions remain consistent. Resume does not replay historical presentation callbacks. Authoritative callbacks belong in plain systems and never execute through this hook.

### Production presentation contract

Specify fixed versioned layouts for actual consumers rather than copying the benchmark's 12 columns blindly:

| Consumer | Continuously available data | Detailed data |
| --- | --- | --- |
| Player/camera | Completed transforms/endpoints, facing, movement/sprint flags, tick and fixed-step duration. | Equipped-tool presentation metadata when it changes. |
| Entity presentation/selection | Stable IDs, kind/definition reference, creation/removal, required transforms/footprints/rotation and visible quantity/status changes. | Selected entity/inventory/device details on demand. |
| Angular HUD | Small world/player summaries and explicit command/session status. | Player bag plus the currently inspected entity; additional consumers register explicit subscriptions. |
| Placement preview | Authored static geometry and completed dynamic occupancy. | Authority always revalidates a submitted placement command. |

Keep Float64 precision for relevant numeric data. Transfer presentation-owned buffers, never authoritative component buffers. Build directly from dirty components at publication boundaries and update a main-thread cache without constructing a full rich world first. Maintain game-ID mappings, schema/version/base checks, generation-safe removals and explicit full resynchronization.

Deduplicate identical detail subscriptions, release them on panel/selection/world changes, and invalidate stale requests/results. Start with the player bag and inspected entity. Use the laboratory's 16-ID limit as an initial bounded implementation setting, then enumerate actual simultaneous consumers and verify that count; it is not a gameplay inventory limit. Renderers read narrow detached selectors/changed sets; Angular signals update relevant bounded views/status once per publication, not one signal per simulated entity. Do not rebuild 100,000 DTOs or scan the entire ECS cache on every render frame.

## Delivery phases

Each phase is a reviewable change with passing affected checks. Make interface changes together with all callers/tests. Temporary migration adapters must not leave two authoritative backends running. Keep new ECS construction in test/development composition until phase 4 can switch the normal factory, dependency classification and worker-aware audit together; combine phases 2–4 in one adoption changeset if needed to keep normal CI green. **Phases 1–5 deliver the first playable migration slice; phases 6–7 finish Step 0 evidence and adoption.**

### 1. Introduce the asynchronous session boundary through an inline adapter

- Add plain session/protocol types and a host coordinator. Initially adapt the existing `Simulation` as a temporary reference backend so transport/interface changes can be verified separately from ECS storage.
- Move the accumulator, command bookkeeping, activity revisions and backend lifecycle out of the Angular-specific `GameSession` into plain application/session infrastructure. Keep `GameRuntimeService` as the page-scoped Angular composition owner using `inject()`/signals and the existing disposal scope.
- Update `WorldSessionBridge`, `SessionDriver`, `WorldFrame`, scene initialization and tests for readiness, frame submission and latest-completed reads. `BabylonGameClient.loadScene` must await session readiness with stale-transition checks, and clean up a session/load that becomes obsolete.
- Define the approved completed-tick hook and Retry semantics. Adapt the minimum consumers necessary for compilation/behavior here; finish renderer-specific delivery and scaling work in phase 5.

**Gate:** current authored fixture still loads/moves/pauses/places development objects through the new interface; commands, callback ownership and cancellation have explicit tests. Rendering never depends on synchronously finishing a submitted step. Inline stepping itself remains synchronous without a Promise around every system/tick.

### 2. Replace authoritative storage with Miniplex and reusable foundation rules

- Use exact Miniplex 2.0.0 to build/test the new runtime. Keep it development-only until the phase 4 production worker switch; that switch moves the selected package through the pinned Yarn workflow. Competing ECS libraries and laboratory tooling remain development-only.
- Implement the private runtime, native cached queries, stable-ID/index management, explicit nested dirty tracking, component membership/structural boundaries and deterministic disposal. Preserve domain functions outside library-specific orchestration.
- Reuse `PlayerMotor` algorithms against ECS-owned movement records. Replace its dependence on a mirrored building array with an owned spatial index/read-only collision source. Preserve movement normalization, speeds, facing, footprint collisions, bounds and placement order. Static occupancy can be indexed; broader collision rewrites wait for profile evidence.
- Implement actual opening component/resource shapes and shared primitives for slot/capacity transactions, atomic preflight/commit, reservation ownership, work state and material-value/eligibility checks against an injected immutable content interface. Include ownership/reference validation and stock-priority tests. No opening recipe/research catalogue or feature executor is delivered.
- Prepare replacement of the old production `WorldState` authority. Until the production switch, its legacy adapter is temporary and runs as the sole authority for its own session. On adoption, remove it from the normal production graph and retain only an independent test/reference fixture for equivalence; it must not become a permanent mirror or second running simulation.

**Gate:** actual production schemas initialize empty possessions correctly; ECS and reference fixtures agree for existing movement/placement. Shared domain tests prove conservation, no double spending/credit, explicit priority, mutation boundaries, ID reuse and independent worlds. Meaningful populated component fixtures exercise work/buffers/reservations/charge and ledgers.

### 3. Implement production lean views and detail subscriptions

- Implement the production publisher/codec, creation/ID mapping, numeric updates, removal generations and narrow host cache/selectors defined above. Preserve version checks and a bounded full-resync route; intermediate deltas cannot be dropped independently.
- Add detached immediate inspection plus live detail subscriptions, with tick/generation tagging, deduplication, unsubscribe and invalidation. These are infrastructure APIs and existing minimal UI bindings, not the new inventory/research/MiniFab screens.
- Keep full world capture separate. Initialization/resynchronization can send complete presentation, with loading state and measured cost; routine publications cannot clone complete inventories/ledgers.

**Gate:** independent decoder assertions compare production fields, asymmetric coordinates/facing, booleans and precision with authority. Nested subscribed changes appear in the next publication; caller mutation cannot affect authority. Test full/delta/gap/duplicate/removal/reused-slot behavior, subscription replacement and world teardown. Frame readers see one consistent completed publication.

### 4. Add the dedicated worker and lifecycle coordinator

- Create a worker entry and Worker-backed port using the same production runtime and codec as the inline control. Switch the normal composition to this port, move exact Miniplex 2.0.0 into production dependencies, and update the graph audit in the same adoption change. Keep Miniplex imports reachable only from the worker in normal production; isolate inline backend construction to test/development composition. Retire the legacy production state implementation when this switch lands.
- Preserve one host accumulator, one outstanding advance request and the shared five-step limit. Give commands, subscriptions and pending requests explicit bounds/backpressure; expose rejected/failed requests rather than silently dropping discrete input.
- Stop new credits/input synchronously on pause/input ownership changes. Acknowledge suspension after any bounded in-flight work; clear pending intent/commands with cancellation results and no hidden-time catch-up. Valid late completed world deltas may still update the cache; obsolete input/scene notifications do not run.
- Handle readiness failure, worker errors/message errors, timeout, stale generations, abort during initialization, repeated disposal and termination. Keep the last complete view readable in failure, stop further advance, then restart from the authored definition only when the user chooses Retry. Clear command/results/subscriptions/interpolation and use a new world generation. No checkpoint schedule or automatic inline fallback.
- Preserve ordinary pause/resume and same live-session continuity; the fresh-world rule applies to explicit failure Retry/restart, not every focus change. Terminate the worker when its owning session/page is disposed or explicitly replaced.

**Gate:** all pending requests settle on timeout/crash/disposal; no tick follows pause acknowledgement; no old world/load/callback alters a replacement. Hidden time is discarded. Main-menu, focus, controls capture, Inspector, zero-size/context loss and unmount/retry behavior remain correct. Verify worker lifetime independently of scene/renderer generation.

### 5. Finish renderer/Angular integration and the playable migration slice

- Pin the latest completed view once per owned render frame and drain completed-tick presentation hooks at the documented phase. Protect against a hook changing input ownership or replacing/destroying the scene. Remove old pre-step registration semantics and update the Toolkit tests/docs together.
- Adapt `PlayerView` interpolation/facing/animation and camera follow to completed transform endpoints. Handle same-tick pause publications, skipped ticks, replacement and resync explicitly. Preserve centimetre conversion, existing rig/assets and input interpretation. Do not add local prediction here.
- Replace `EntityViews.sync`'s full population scan each frame with initial creation plus changed/removal processing at publication boundaries. Maintain existing Babylon bindings/picking/footprints without creating a mesh for every non-visible synthetic entity.
- Bind Angular's world/player summaries, selection, readiness/errors/Retry and existing controls to completed data and inspection. Keep UI state and renderer lifecycle `GameState` separate from authority. Placement remains advisory on the host and authoritative on command execution.

**Gate:** the real scene is playable with Miniplex in the worker: movement/collision, animation/camera, selection, pause/Inspector, placement fixture, input restoration, Retry and teardown pass. Retry feedback makes the authored-world restart explicit. Existing authored scenes/imports/art require no change for this migration; new production component templates, if needed, stay in separate HTML files and pass accessibility checks.

### 6. Complete plain capture/rebuild and foundation continuation

- Implement an independently versioned plain component/resource snapshot with stable references, ID allocation, work/reservations/held output, bag/tool/owned buffers, charge, research/history ledgers and completed tick. Include the authored/content identity/version needed for validation, without serializing ECS queries/handles, renderer state or wire slots.
- Capture at a completed batch barrier after settling in-flight advance/publication. Store the world's components/resources separately from a continuation envelope containing the command ledger, next sequence and any worker-accepted but unapplied discrete commands. Commands arriving on the host after the barrier stay in a bounded host queue for later submission and are not silently included in that earlier capture. Clear continuous input/elapsed-time state on restoration, rebuild queries/indexes/wire mappings in a fresh world generation, seed the host sequence from readiness and apply captured pending commands once. An internal capture barrier does not issue a user pause that cancels those accepted commands. This continuation envelope is testing/foundation infrastructure, not the later gameplay-save format. There is no automatic capture scheduling.
- Validate schema, finite/ranged numbers, quantities/capacities, supported content references, unique IDs, ownership and reservation invariants before replacing a live world. Test using the explicit foundation content fixture; runtime content validation accepts the later Step 4 catalogue through the same plain interface.
- Use populated **production-schema** fixtures for inventory/work/research/history/charge continuation even though those feature executors/UI are later work. After restoration, 1,000 additional deterministic steps must match uninterrupted execution, including conservation and exactly-once output/research credit.

**Gate:** capture/encode/decode/rebuild are detached, deterministic and fail safely for invalid input. Repeated restoration and new commands preserve IDs/accounting. Their latency/retained copies are measured separately from tick budgets. No IndexedDB/world-save UI, automatic checkpointing, offline progress or retry-from-capture behavior is added.

### 7. Qualify, package, document and stop

- Add a production-runtime composition to the existing worker laboratory: use actual production component schemas, runtime, publisher, host coordinator and inspection contract. Keep synthetic activity/replenishment fixture builders outside production imports. Compare only Miniplex inline and worker; avoid repeating library selection or speculative threading experiments.
- Retain five independent 2,000-step primary repetitions and the original disposable-world warm-up/timeouts. Cover normal 50,000/100,000/250,000 and target idle/active/churn; assert meaningful operations, state hashes and changed counts. Run all normal 0/4/8 ms pressure cases in three 30-second repetitions for both modes. Profile target CPU/allocation separately, run 10,000 churn ticks and 20 lifecycle cycles for each, and inspect retained payload/buffer evidence. Report full captures and subscription counts separately.
- Use the focused Miniplex-only matrix to reduce runtime without reducing per-configuration confidence. Run changed-domain/protocol tests per phase, the complete required repository checks once the integrated change is ready, and full performance qualification only after measured source is stable. Do not run builds/tests/other candidates during ranking trials. 120 Hz remains diagnostic and must report achieved cadence; do not treat the prior approximately 65 Hz timer result as 120 Hz proof.
- Verify the **actual** Angular production worker URL, base path and same-origin CSP, plus real Babylon scene callbacks, movement/camera feel, accessible UI and physical-input caveats. Record visible mesh/draw counts independently of simulated entity counts. A large simulation test must not silently turn into 100,000 rendered meshes or imply that rendering scale is qualified.
- Change the current production-input audit: permit pinned Miniplex and required transitive code only in the simulation worker graph; reject candidate libraries/inline runtime in the main renderer graph, all other ECS candidates, and all investigation fixtures/harness imports. Use output/import-graph reachability rather than removing the existing exclusion wholesale. Verify a normal production build and a deliberate forbidden-import test of the audit.
- Run the repository's required CI checks, including immutable Yarn install, lint/rule tests, scene/world tests, ECS/worker checks/smoke, application/browser/axe tests, production build/input audit, assets and dev reload/export recovery, documentation/diagram checks. Preserve scoped regression evidence when synchronous tests migrate to the asynchronous contract.
- Commit a dated implementation/qualification report with source/environment manifests, all repetitions/failures and raw diagnostic locations. Reconcile Step 0 boxes individually with evidence. Update authoritative class/frame diagrams and regenerate their matching `.mmd`, SVG and PNG files **when runtime changes land**; current diagrams remain untouched by this planning document. Stop before later gameplay steps.

**Adoption gate:** normal 100,000-entity median per-run simulation/publication p95/p99 ≤5/8 ms; observed receiving p95/p99 ≤2/4 ms; every required normal paced run meets callback p95/p99 ≤18.5/33.4 ms and sampled input-to-presentation p95/p99 ≤100/150 ms. Require correctness, bounded queues, disposal/retention evidence and real-scene functional acceptance. Preserve fully active/stress failures explicitly; the current fully active workload already exceeds the normal compute budget and must not be generalized into a universal pass. If a gate fails, fix the identified path and rerun affected evidence without relaxing the target. Physical target-device/other-engine qualification remains later.

## Expected file boundaries

New names are proposed; keep modules focused and avoid umbrella abstractions that duplicate state.

| Area | Existing files to adapt | Proposed additions/responsibility |
| --- | --- | --- |
| Public plain contracts | `src/contracts/world.ts`, `game-client.ts`, `game-tick.ts` | Session protocol, completed-tick context, stable IDs, projection/inspection and snapshot types. No ECS/Angular/Babylon types. |
| Simulation | `src/simulation/simulation.ts`, `world-state.ts`, `player-motor.ts`, `placement.ts`, `world-rules.ts` | `ecs/` private runtime/components/resources/indexes/publisher; `domain/` shared inventory/work/eligibility primitives; snapshot validation/rebuild. |
| Host/worker infrastructure | Migrate coordination out of `src/app/features/game/session/game-session.ts` | `src/session/` coordinator, port, cache, credits, worker port and test/development inline port; `src/workers/simulation.worker.ts`. Clock/DOM/worker APIs stay outside pure modules. |
| Angular composition | `src/app/features/game/game-runtime.service.ts`, its specs and game-page readiness/Retry bindings | Page-scoped backend factory and narrow signals/selectors; no public ECS access. |
| Babylon/Toolkit | `src/game/babylon-game-client.ts`, `views/session-driver.ts`, `world-frame.ts`, `world-scene.ts`, `player-view.ts`, `entity-views.ts`, placement/selection readers, `toolkit/gameplay-script.ts` and related specs | Async readiness, frame-pinned completed data, delta presentation, interpolation, completed hooks and lifecycle guards. |
| Build/dependencies | `package.json`, `yarn.lock`, `angular.json`, TypeScript worker configuration, environment/backend factory configuration | Exact Miniplex production dependency, worker compilation and production-only worker factory; inline control remains outside main production reachability. |
| Verification | Existing unit/world/browser/tooling suites, `tools/ecs-bench/verify-production.mjs`, worker laboratory and CI workflows | Production graph audit, real-runtime fixture composition, focused Miniplex qualification and retained-object evidence. |
| Documentation | Milestone 2/3, TDD, runtime walkthrough, class/frame diagrams | Reconcile implemented behavior and retire superseded synchronous descriptions only with corresponding runtime changes. |

## Completion and rollback

- [x] Production contracts and approved hook/Retry policies are implemented and tested.
- [x] Existing fixture runs with one private Miniplex authority in one worker; no old state mirror remains.
- [x] Opening schemas/shared primitives are real, populated and verified without implementing later gameplay systems.
- [x] Lean views, production IDs and bounded subscriptions match actual consumers and pass qualification.
- [x] Movement/presentation, lifecycle, input, completed hooks and authored-world Retry pass integrated tests.
- [x] Plain capture/rebuild and 1,000-step continuation satisfy Step 0 without delivering gameplay saves.
- [x] Production worker/main dependency separation, required CI and current diagrams/docs are verified.
- [x] Dated results reconcile only proven Step 0 work; later gameplay remains pending.

Select one backend at session construction for controlled tests/development. Do not automatically switch a failed worker to inline or run both authoritative worlds together. During development, rollback can use the compatible inline adapter at a fresh session boundary; shipping rollback is a reviewed build/revision change. Moving a live world between backends would require a validated complete capture at a completed-tick barrier and remains outside the automatic recovery policy. Miniplex is now an exact production dependency reachable only through the worker graph. Authored assets are unchanged; runtime diagrams are reconciled with the implementation.

Both user questions are answered above. Remaining schema/layout/module details are implementation choices within the agreed scope; they do not require another library/threading investigation or a new gameplay-design round before phase 1.
