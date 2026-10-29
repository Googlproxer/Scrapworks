# Simulation worker laboratory

Isolated Miniplex **2.0.0** / bitECS **0.4.0** comparison, inline and in one dedicated browser worker. Production source and authored assets are unchanged. See the [investigation plan](../../docs/plans/simulation-worker-investigation.md).

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

Both candidates reuse the canonical domain/fixture and existing correctness suite, with native query/storage code inside each adapter. The worker coordinator owns all mutable ECS state; the host retains detached presentation records. One batch is outstanding under the normal scheduler. Continuous intent coalesces; discrete transport-marker commands are sequenced, acknowledged and applied once. Their ledger tests transport ordering; synthetic inventory spending is still exercised by the shared domain rules. No new gameplay commands are implemented.

The current production Simulation/PlayerMotor movement and placement code is executed in a separate 1,000-step compatibility probe. This is not an Angular/Babylon production worker integration or a gameplay persistence implementation. Source-owned tick callbacks cannot be transported as functions; the dated report must specify the resulting asynchronous session contract.

Object messages are the primary transport. JSON encoded into a transferred ArrayBuffer is a diagnostic available to both candidates, including packing/decoding cost. SharedArrayBuffer, Atomics, additional simulation workers and parallel system scheduling are not implemented. Future threading suitability is a source-backed architectural assessment.

The 5/8 ms p95/p99 budget applies to per-tick simulation plus detached publication inside its execution context, before messaging. Host round trips include delivery and cache application. Receiver callback timing covers explicit JavaScript decoding/application; browser-internal deserialization occurs before that callback and is reflected in round trips, frame intervals and CPU profiles. Do not call the callback timer total main-thread transport cost. Epoch-aligned delivery estimates are diagnostic; round trips use one host monotonic clock. Initial full-view/import costs and first tick are separate from steady state.

Paced 60 Hz results use observed RAF cadence. The 120 Hz timer scheduler is an **emulated diagnostic**, not physical-display qualification. Input-to-visible samples track synthetic marker submission, applied-tick acknowledgement and the next presentation callback, not physical input-to-photon delay. Interpolation metrics describe completed-tick buffering; real movement/camera feel requires the later integration/playtest. End-of-window pending probes are reported explicitly.

Profiling never contributes to latency rankings. Main and worker targets are measured separately through CDP; checkpoints sum JS heap and reported backing storage without counting driver-process memory. Heap snapshots bracket world disposal before worker termination. Lifecycle cycles force collection only at diagnostic checkpoints and verify that terminated worker targets disappear. Sampling responses are persisted and released before retained-memory checkpoints. GC traces include dedicated forced collections and must not be presented as unforced timing distributions.

## Isolated Angular packaging probe

This builds the laboratory through the repository's real Angular production builder into ignored output, without modifying `angular.json` or application entry points:

```text
node tools/simulation-worker-bench/packaging-check.mjs
```

The probe serves its `browser/` directory under `/lab/` with `worker-src 'self'`, same-origin scripts and hashes authorizing only the Angular-generated inline critical-CSS/bootstrap blocks. It smokes both worker candidates and runs axe. This verifies packaging/CSP/base-path loading of the isolated harness; it does not install a CSP in production hosting. The normal production build must separately pass `tools/ecs-bench/verify-production.mjs`, which rejects both investigation directories and all candidate libraries.
