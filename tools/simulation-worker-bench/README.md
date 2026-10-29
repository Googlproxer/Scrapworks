# Simulation worker laboratory

The original isolated Miniplex **2.0.0** / bitECS **0.4.0** comparison runs inline and in one dedicated browser worker. Its historical evidence is separate from the production-runtime composition below. See the [investigation plan](../../docs/plans/simulation-worker-investigation.md).

## Reproduction

Use Node 24.21.0, the pinned Yarn lock and installed Playwright Chromium:

```text
yarn install --immutable
yarn playwright install chromium --only-shell
yarn bench:worker:check
yarn bench:worker:smoke
yarn bench:worker:browser --output tmp/simulation-worker-bench/<run>
yarn bench:worker:report --input tmp/simulation-worker-bench/<run>
```

`check` includes strict TypeScript, four pure protocol tests and the browser correctness suite for all four configurations. `smoke --profiles` additionally checks both-context CPU/allocation/heap instrumentation on small worlds. It is not performance qualification. `calibrate` runs short 1,000/10,000/100,000-entity trials and is excluded from ranking.

`browser` runs five repetitions per primary workload/configuration, transport/batch diagnostics, memory profiles with 10,000 churn ticks and 20 lifecycle cycles, and three 30-second paced repetitions per workload/pressure case. It takes hours. Measurements are sequential, with fresh Chromium processes and disposable-world warm-up. Never run builds or other tests concurrently. Use `--help` for candidate/execution, phase, output/resume and label filters. Phase fragments retain their own manifests; do not pool hosted-runner data into reference-desktop evidence. Resume requires identical source and experiment settings.

Raw samples and large profiles stay in ignored `tmp/simulation-worker-bench/`. Report generation writes compact JSON/CSV, `evidence.md` and matching SVG/PNG charts. Plotting uses the existing `tools/ecs-bench/plot-requirements.txt` installation in `tmp/ecs-bench/plotting`; `ECS_BENCH_PYTHON` can select Python. Reviewed reports use a separate `README.md`.

## Boundaries and interpretation

Both candidates reuse the canonical domain/fixture and existing correctness suite, with native query/storage code inside each adapter. The worker coordinator owns all mutable ECS state; the host retains detached presentation records. One batch is outstanding under the normal scheduler. Continuous intent coalesces; discrete transport-marker commands are sequenced, acknowledged and applied once. Suspension acknowledges accepted commands that were cancelled before a tick. Their ledger tests transport ordering; synthetic inventory spending is still exercised by the shared domain rules. No new gameplay commands are implemented.

The current production Simulation/PlayerMotor movement and placement code is executed in a separate 1,000-step compatibility probe. This is not an Angular/Babylon production worker integration or a gameplay persistence implementation. Source-owned tick callbacks cannot be transported as functions; the dated report must specify the resulting asynchronous session contract.

Object messages are the primary transport. JSON encoded into a transferred ArrayBuffer is a diagnostic available to both candidates, including packing/decoding cost. SharedArrayBuffer, Atomics, additional simulation workers and parallel system scheduling are not implemented. Future threading suitability is a source-backed architectural assessment.

## Lean publication follow-up

The 30 October follow-up adds `--presentation lean`. The default remains `rich` for historical reproduction. Both libraries use the same publisher, authoritative fixture, precision and native systems. The normal lean benchmark subscribes to the player inventory and one processor inspector.

```text
yarn bench:worker:check --presentation lean
yarn bench:worker:smoke --presentation lean --paced --profiles
yarn bench:worker:browser --presentation lean --phase lean --output tmp/simulation-worker-bench/<lean-run>
yarn bench:worker:report --input tmp/simulation-worker-bench/<lean-run> --destination docs/reports/simulation-worker/<date>
```

Routine views transfer two newly allocated, presentation-owned ArrayBuffers: Float64 rows and removed identity pairs. Every dirty entity still publishes a row, including the same stable ordinal/generation identity, kind, position, status, work, charge, quantity, reservations, held output and publication tick. A row is 96 bytes; precision is unchanged. The worker neither constructs rich records first nor transfers authoritative stores. The host applies rows to its own typed cache. Frames retain generation/revision/version checks and require explicit full resynchronization on a gap. Full publications can resize host storage.

Inventories, recipes and ownership remain in authority and full plain captures. A `watch` request accepts at most 16 unique game-owned IDs and immediately returns detached details for valid IDs at a completed batch boundary. Watched dirty entities publish fresh nested details with the next frame. Recycled IDs invalidate old subscriptions; selecting a replacement requires its new identity. Unwatched inventories are deliberately absent from routine views and must be inspected before displaying their details. This cap limits simultaneously subscribed inspectors, not authoritative inventories or entity population. More subscriptions or a different actual UI workload need separate qualification.

There is no field-level diff, visibility culling, compression, shared memory or buffer pool. Rows intentionally repeat their small numeric presentation fields. Captures retain complete rich data and their separate serialization/rebuild costs. Contract correctness checks compare every published field and watched nested record with full authority, alongside the original full-state oracle checks. Pure tests cover transfer detachment, precision, stale removals, malformed full frames and cache growth. Neither publication contract changes production `WorldView`.

`--phase lean` saves time by retaining all 120 primary trials (five repetitions, 2,000 steps, original warm-up/timeout), all 36 required normal-world paced runs (all configurations, three pressures, three 30-second repetitions), four 120 Hz diagnostics, and separate target memory/CPU, payload and capture diagnostics. Idle/active paced diagnostics use the two workers at 8 ms pressure, three repetitions each. It omits the superseded JSON/batch variants and alternate clock trials; it does not repeat the full non-qualifying idle/active pressure matrix. Jobs remain sequential in fresh browsers. The normal numerical gates are unchanged. CI covers both rich smoke and lean smoke/pacing; the manual workflow uses the focused lean phase. No hosted workflow is dispatched by running these commands locally.

The 5/8 ms p95/p99 budget applies to per-tick simulation plus detached publication inside its execution context, before messaging. Host round trips include delivery and cache application. Primary cohort A receiver timing covers explicit JavaScript decoding/application. Follow-up cohort B additionally times `MessageEvent.data` access, reporting it separately from the whole message-handler duration as observed receiver cost. Browser-internal work before that access can remain unattributed; round trips, frame intervals and CPU profiles include delivery. Neither timer alone proves total main-thread transport cost. Epoch-aligned delivery estimates are diagnostic; round trips use one host monotonic clock. Initial full-view/import costs and first tick are separate from steady state.

Paced 60 Hz results use observed RAF cadence. The 120 Hz timer scheduler is an **emulated diagnostic**, not physical-display qualification. Input-to-visible samples track synthetic marker submission, applied-tick acknowledgement and the next presentation callback, not physical input-to-photon delay. Interpolation metrics describe completed-tick buffering; real movement/camera feel requires the later integration/playtest. End-of-window pending probes are reported explicitly.

Profiling never contributes to latency rankings. Main and worker targets are measured separately through CDP; checkpoints sum JS heap and reported backing storage without counting driver-process memory. Heap snapshots bracket world disposal before worker termination. Lifecycle cycles force collection only at diagnostic checkpoints and verify that terminated worker targets disappear. Sampling responses are persisted and released before retained-memory checkpoints. GC traces include dedicated forced collections and must not be presented as unforced timing distributions.

## Isolated Angular packaging probe

This builds the laboratory through the repository's real Angular production builder into ignored output, without modifying `angular.json` or application entry points:

```text
node tools/simulation-worker-bench/packaging-check.mjs
```

The probe serves its `browser/` directory under `/lab/` with `worker-src 'self'`, same-origin scripts and hashes authorizing only the Angular-generated inline critical-CSS/bootstrap blocks. It smokes both worker candidates and runs axe. This verifies packaging/CSP/base-path loading of the isolated harness; it does not install a CSP in production hosting. The normal production build must separately pass `tools/ecs-bench/verify-production.mjs`, which rejects both investigation directories and all candidate libraries.

## Follow-up diagnostics

```text
yarn bench:worker:browser --phase followup --output tmp/simulation-worker-bench/<followup>
```

This repeats the complete primary timing and paced matrix after all four correctness checks, adds four untimed payload size probes, and compares paired host/worker clocks at 8 ms host pressure. It skips the separate ancillary, transport and memory runs, which retain their own cohort A evidence. Warm-up and fresh measurement state reuse the same worker, retaining its warmed JIT while replacing the disposable world. Both clocks retain one outstanding request; worker polling uses elapsed time since the prior dispatch. The original cohort A scheduler polls elapsed time since the prior reply, which would confound publication cadence with clock ownership; those planned cases were not executed. Preserve both source manifests, and use cohort B alone for corrected timing/qualification, with cohort A retained as exploratory and separate diagnostic evidence. Cohort A warmed a disposable worker that was then replaced; do not describe its worker timings as warm-context qualification.

Payload bytes are UTF-8 JSON estimates of detached frames, calculated outside timing. The browser does not expose actual structured-clone wire bytes here. The follow-up also verifies explicit cancellation acknowledgements, continuation with new commands after restoring a capture, and restoration of accepted commands still awaiting a tick. Numerical gates remain unchanged.

## Callback-arrival qualification

Frame qualification uses actual `performance.now()` gaps between callback arrivals. RAF's supplied timeline timestamps and callback lateness are retained separately: a regular RAF timeline can hide late JavaScript callbacks. Every correctness job includes an injected 45 ms stall that the same recorder must detect.

The corrected paced stage can be run separately and joined to a compatible primary cohort:

```text
yarn bench:worker:browser --phase paced --output tmp/simulation-worker-bench/<paced>
yarn bench:worker:report --input tmp/simulation-worker-bench/<primary> --paced-input tmp/simulation-worker-bench/<paced> --destination docs/reports/simulation-worker/<date>
```

The report excludes the primary cohort's superseded paced samples, verifies unchanged primary timing code and core/domain/adapter sources, and checks packages, gates, hardware and environment labels before combining stages. Original cohort B primary source is archived as `frozen-browser.ts` and checked against its manifest; subsequent manifests record the primary hot-path hash directly. Cohort C repeats all paced cases; qualification never uses the legacy RAF timeline distributions. Full current-source runs need no supplemental cohort.

## Production implementation qualification

Use `--production --presentation lean --phase lean` to qualify the actual `src/session` coordinator, Miniplex authority, domain primitives, publisher and host cache, comparing only Miniplex inline and worker. Synthetic fixture/activity composition stays in `production-fixture.ts` and is absent from the application graph. No competing runtime or future gameplay executors enter production.

```text
yarn bench:worker:smoke --production --presentation lean --phase lean --paced --profiles
yarn bench:worker:browser --production --presentation lean --phase lean --output tmp/simulation-worker-bench/production-reference
yarn bench:worker:report --input tmp/simulation-worker-bench/production-reference
```

The focused production matrix has 60 primary trials, 18 required normal paced trials, six worker idle/active paced diagnostics, two refresh-rate diagnostics, two profiles, two capture/rebuild diagnostics, two payload checks and two correctness runs. It retains all five primary repetitions and all 2,000 steps, with disposable-world warm-up of at least two seconds and 200 ticks in the retained execution context. Every repetition uses a fresh Chromium process. `--primary-cases mixed:100000` and profile count overrides are development probes; they cannot qualify adoption.

Production rows contain 14 Float64 fields (112 bytes): slot/generation, transform, facing/flags, visible quantity, remaining work, charge, reserved/held totals, status and completed work. Inventory-only changes publish subscribed details without a redundant unchanged numeric row. Normal gameplay has one implicit player subscription and at most one selected entity consumer; qualification uses both, under the 16-ID infrastructure cap. Full capture remains separate. Numeric and inspection data are independently checked against captures outside timed regions. Churn preserves the persistent player and replaces the other 1% population, repairing owner links before commit.

Benchmark-only wrappers time the production step and publisher without putting clocks in pure simulation. `systems` includes domain work and dirty marking; the historical `structural` metric is the residual step time including movement, command handling and structural commits. `publication` includes direct row packing; `packing` is zero because there is no separate codec pass. `observedReceiver` covers MessageEvent.data access, Promise delivery through cache application; browser-internal delivery before that remains in round-trip/callback metrics. These boundaries must be retained when interpreting generated tables.

The real built Angular/Babylon application has a separate acceptance probe: `node tools/world/production-browser.mjs` after `yarn build --stats-json`. It verifies the worker URL under a non-root base path, same-origin worker CSP, keyboard movement, menu pause, idle crash/Retry and teardown. Angular's unit-test builder does not compile worker URL entries, so its page fixture explicitly uses the inline port; it does not substitute for built-worker acceptance. Neither harness qualifies 100,000 rendered meshes, physical input-to-photon, additional devices or multiple ECS workers.
