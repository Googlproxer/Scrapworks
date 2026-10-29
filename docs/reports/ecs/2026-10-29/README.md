# ECS investigation — 29 October 2026

**Select Miniplex 2.0.0 for the Milestone 3 ECS foundation.** Miniplex and bitECS meet the agreed 100,000-entity latency gate in Node and Chromium. Miniplex wins the maintainability review, and its Node results are more consistent across repetitions. This selects a dependency and storage direction; production Simulation still uses its existing plain state scaffold.

The completed reference cohort contains **1,188 jobs**, including **1,120 timing trials**, all four candidates, the plain TypeScript control and three diagnostic configurations. There were no worker failures or state-hash mismatches. The 25 measured-trial timeouts were the five Node 250,000-entity fully active repetitions for each candidate and the control. Those limits remain part of the result.

## Selection at 100,000 meaningful entities

Values are the **median of five independent per-run percentiles**, in milliseconds. Every combined tick includes native systems, structural commits, dirty tracking and a deep detached changed-record publication. The gate is p95 ≤5 ms and p99 ≤8 ms **in both environments**.

| Candidate                     |  Node p95 |  Node p99 | Chromium p95 | Chromium p99 | Result                |
| ----------------------------- | --------: | --------: | -----------: | -----------: | --------------------- |
| **Miniplex 2.0.0**            | **4.210** | **5.392** |    **2.600** |    **3.100** | Qualifies; selected   |
| bitECS 0.4.0                  |     4.036 |     4.921 |        2.600 |        3.300 | Qualifies             |
| Koota 0.6.6                   |     6.264 |     7.917 |        8.300 |       13.600 | Exceeds the gate      |
| Becsy 0.16.1, performance ESM |    15.119 |    21.257 |        3.400 |        4.100 | Exceeds the Node gate |

Miniplex's five Node p95 values span **4.145–4.633 ms**. bitECS spans **3.684–14.494 ms**: its median qualifies under the agreed rule, while an individual repetition exceeded both budgets. The complete repetition values, phase timings, maxima, work counts, throughput and initialization/disposal costs are in [trials.csv](trials.csv) and [trials.json](trials.json). [Generated evidence](evidence.md) and [summary.json](summary.json) contain aggregate values and qualification details. No percentile was pooled across processes or selected from the best run.

The world contains 60,000 processors, 20,000 owners with 24 slots, 10,000 deposits and 10,000 ground piles. Normal work has 12,000 active processors; item quantities remain quantities. Shared replenishment, transfers, reservations, held output, charge and histories keep the synthetic workload populated and productive.

## Advantages and disadvantages

| Candidate    | Advantages for this project                                                                                                                                                                                                     | Disadvantages and obligations                                                                                                                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Miniplex** | Ordinary typed records reuse plain domain functions directly. Cached component queries fit synchronous fixed steps. Capture, restoration and detached projections need little storage translation. Small integration footprint. | Application code must mark nested changes explicitly. Value predicates require `world.reindex(entity)`. Rich object graphs and detached copies still allocate. Release activity is sparse, so retaining a pinned version and inspecting the small core remain obligations.                                                    |
| **bitECS**   | Per-world object data plus Float64 stores support both rich inventories and numeric work. Native queries leave scheduling under application control. No runtime dependencies. Competitive qualified latency.                    | Initialization, deletion cleanup, ID recycling and typed-array expansion require explicit code. Query membership does not prove every indexed access to TypeScript. Projection and rebuild translate between separate stores. The 0.4 API requires version-specific knowledge.                                                |
| **Koota**    | Numeric schema traits and callback object traits cover both storage styles. Direct stores and `updateEach` offer different ergonomics. Native change signalling is available.                                                   | Nested/direct-store writes need explicit signalling. Stores cannot be cached before the first insertion into an empty world. Import modifies `Number.prototype`. The measured implementation misses the latency gate, and churn retains generation-index bookkeeping while the world is alive; see the memory evidence below. |
| **Becsy**    | Component schemas and access entitlements provide useful checked-build validation. The performance and checked builds pass the same correctness contract. Shared plain processing functions remain reusable.                    | The published package needs explicit ESM paths and declaration bridging. Scoped reads/writes, asynchronous execution, transient handles and simultaneous-world component classes add substantial machinery. Configured entity/log capacities consume memory. The performance build misses the Node gate.                      |

The tested APIs come from the installed, locked packages. Upstream context is available in the [Miniplex documentation](https://github.com/hmans/miniplex), [bitECS introduction](https://github.com/NateTheGreatt/bitECS/blob/main/docs/Intro.md), [Koota documentation](https://github.com/pmndrs/koota), [Becsy world lifecycle](https://lastolivegames.github.io/becsy/guide/architecture/world) and [Becsy entitlements](https://lastolivegames.github.io/becsy/guide/architecture/queries). Main-branch documentation can differ from these exact published versions; observed package behavior controls this report.

Becsy 0.16.1's root `main` points to UMD under `type: module`, and its documented `/perf` subpath is absent from the tarball. The adapters use `lib/perf.js` and `lib/index.js` with the root API declarations. Initialization uses `World.build`; subsequent operations execute inside a declared system because the checked build forbids repeated build calls after execution starts. No alternate version was substituted.

## Maintainability decision

Each of the five criteria contributes 0–2 points equally. Scores decide among qualifying configurations; measured memory and combined latency would break equal totals.

| Qualifier | Domain reuse | Type safety | Lifecycle/mutation | Capture/projection | Package/integration |    Total |
| --------- | -----------: | ----------: | -----------------: | -----------------: | ------------------: | -------: |
| Miniplex  |            2 |           2 |                  2 |                  2 |                   1 | **9/10** |
| bitECS    |            2 |           1 |                  1 |                  1 |                   1 | **6/10** |

Both reuse the same completion/accounting functions. Miniplex keeps typed entity records and synchronous component operations close to the current simulation design. bitECS adds indexed-store assertions, capacity copying, payload cleanup and storage translation. Miniplex's maintenance cadence prevents a full package-risk score. Full criterion evidence, including assessments of the nonqualifiers, is retained in [summary.json](summary.json). A faster diagnostic variant is not an adoption recommendation without a full primary matrix.

## Scaling, publication and ancillary costs

![Combined p95 by entity count, workload and environment; crosses identify incomplete stress repetitions.](scaling.svg)

All five scales—1,000, 10,000, 50,000, 100,000 and 250,000—were attempted five times for normal, mostly idle, fully active and churn workloads in both environments. The 250,000-entity scale is stress evidence. Its Node fully active points summarize partial timeout samples, not successful 2,000-tick trials. Chromium completed those stress trials. Native indexed queries make mostly idle work inexpensive; fully active rich-record publication is substantially more expensive.

Publication is a major part of target tick cost. These measurements copy complete changed records, including nested slots and buffers. Component/field deltas or publishing fewer presentation records would be different contracts requiring another comparison. Phase percentiles cannot be added to reconstruct a combined percentile. Native dispatch, ordering and asynchronous completion remain included in the combined measurement.

The target-scale ancillary diagnostics compare full publication against 0%, 1%, 10% and 100% dirty publication, with ten samples per case in one fresh process per candidate/environment. They also measure growth from 1,000 to 100,000, first grown tick, capture, encoding, decoding and fresh rebuild. They are separate from the five-repetition latency matrix. All eight target snapshots encode to **39,630,316 bytes**, and every rebuilt runtime completes 1,000 further steps matching uninterrupted execution.

For Miniplex, Node capture/encode/decode/rebuild took **538/93/123/490 ms**; Chromium took **360/59/103/464 ms** in these ancillary runs. These are substantial standalone operations, not tick-path costs or a gameplay persistence implementation. Growth took approximately **78 ms in Node** and **68 ms in Chromium**.

| Integration       | Minified bytes | Gzipped bytes |
| ----------------- | -------------: | ------------: |
| Miniplex          |         16,658 |         4,142 |
| bitECS            |         14,715 |         5,299 |
| Koota             |         37,354 |        10,517 |
| Becsy performance |         85,375 |        21,662 |

Sizes cover emitted adapter/native-package chunks and static dependencies, excluding common harness chunks; individual gzip sizes are summed. They describe this integration, not an entire game bundle.

## Memory, allocation and browser pacing

Post-GC figures below use Node **heapUsed + external** and Chromium **JS heap + backing storage**, in MiB. ArrayBuffers are included within Node external memory and are never added twice. RSS is recorded separately in the JSON; reserved/resident pages are not retained-object counts.

| Environment | Candidate | Populated | After churn soak | After disposal |
| ----------- | --------- | --------: | ---------------: | -------------: |
| node        | miniplex  |     94.54 |            92.25 |          15.15 |
| node        | bitecs    |    110.52 |           108.43 |          15.19 |
| node        | koota     |    114.39 |           210.36 |          15.43 |
| node        | becsy     |    121.65 |           115.90 |          16.29 |
| browser     | miniplex  |     43.58 |            43.55 |           1.50 |
| browser     | bitecs    |     53.84 |            53.91 |           1.50 |
| browser     | koota     |     53.54 |           102.70 |           1.70 |
| browser     | becsy     |     69.00 |            67.36 |           2.01 |

![Incremental populated memory above the before-import baseline in each engine.](memory.svg)

The original Node diagnostic worker retained its allocation-sampling response, which contains samples of collected objects. This inflated post-disposal heap measurements to about 200 MiB. The correction releases CPU/allocation response objects after serialization, permits asynchronous cleanup and collects twice at dedicated Node checkpoints. All eight target profiles were rerun in fresh processes, including the 10,000-tick churn soak and 20 lifecycle cycles. The report explicitly joins those corrected diagnostics to the original timing cohort; latency samples were not replaced.

Koota has a separate **live-world** retention cost. Heap edges identify the active query’s `entities._sparse` and `toRemove._sparse` backing stores: together approximately **96 MiB in Node** and **48 MiB in Chromium**. The published `SparseSet.remove` reduces its cursor without deleting the sparse entry, while queries index packed IDs containing generation bits. Removed-generation numeric indexes therefore remain while the world lives. The corresponding stores disappear after world disposal. This is retained index bookkeeping under churn, not evidence of surviving entity payloads after disposal. Source: the locked Koota 0.6.6 distribution, `dist/chunk-ZWIGMIL4.js`, `SparseSet` and query membership implementation.

[Retained-object evidence](heap-evidence.json) records the heap-node offsets, incoming `entities`/`toRemove` edges and backing sizes. The [snapshot analysis script](heap-evidence.py) distinguishes concrete `entity-*` payloads from compiler boilerplates: all eight post-disposal snapshots contain zero such payload records, while both Koota live-world snapshots contain exactly 100,000. Late lifecycle checkpoints are stable at this test length; this does not prove that every longer-lived workload is leak-free.

Allocation sampling estimated roughly **111–118 GiB in Node** and **57–61 GiB in Chromium** during the instrumented soak. These estimates describe allocation volume, not peak or retained RAM. Sampled checkpoint peaks, raw GC events, separate Node forced/unforced summaries and Chromium GC traces are preserved. Trace events can overlap; their durations are not summed as unique pause time. Dirty tracking is included in ordinary system/commit timing; its separate diagnostic self-time includes timer overhead and is not a ranking statistic.

The three 30-second paced runs per candidate/workload use one RAF scheduler and the existing 20 Hz/five-step contract. The table shows median per-run frame p95 and explicit five-step catch-up duration. Long-task counts are totals across three runs. Backlog in JSON is the residual accumulator after advancement; elapsed time is capped at 250 ms by the contract.

| Candidate | Workload | Frame p95 ms | Long tasks | Five-step catch-up ms |
| --------- | -------- | -----------: | ---------: | --------------------: |
| miniplex  | mixed    |        16.70 |          3 |                  5.90 |
| miniplex  | idle     |        16.80 |          3 |                  1.00 |
| miniplex  | active   |        16.70 |          3 |                 88.30 |
| bitecs    | mixed    |        16.70 |          3 |                  8.70 |
| bitecs    | idle     |        16.70 |          3 |                  1.10 |
| bitecs    | active   |        16.70 |          3 |                 86.40 |
| koota     | mixed    |        16.70 |          3 |                 13.40 |
| koota     | idle     |        16.70 |          3 |                  2.80 |
| koota     | active   |        16.70 |          3 |                 98.50 |
| becsy     | mixed    |        16.70 |          3 |                 11.60 |
| becsy     | idle     |        16.70 |          3 |                  2.20 |
| becsy     | active   |        16.80 |          3 |                 83.60 |

Pacing qualifies this standalone harness only. The final catch-up probe is additional work after the 30-second observation window. Tiny-workload Chromium zeros are below observed timer resolution. Angular, Babylon, rendering and real UI subscribers are absent.

## Correctness and provenance

The original 16 adapter/environment checks passed, including the plain reference and three diagnostic configurations. Every complete five-run state group agrees with its reference checksum; no mismatch was found. [Independent completion arithmetic](completed-work-checks.json) also matches all 1,120 trials, including partial stress trials, confirming that meaningful work continued. Verification covers ownership and ID recycling, explicit membership mutation, Miniplex predicate reindexing, bitECS nested queries, stock priority, deep detachment, fresh-runtime continuation, independent worlds, pause/resume, bounded five-step catch-up, failure publication and disposal.

Post-measurement validation strengthens two assertions: the growth oracle now starts from the **pre-expansion** capture, and every 100-step window must retain a meaningful completion rate. These checks passed for all 16 configurations before the corrected memory pass. The production session's own tests remain the authority for integration; the laboratory session mirrors its 20 Hz/five-step contract.

The exact measured harness is preserved in local commit **`0079ac2aa70afe4a6a33acae1de39759dc7fef91`**. Its 25 measured source-file hashes matched the frozen files at cohort completion. The original manifest honestly records parent revision `6eaa13344d1f9640058050f86471d98c9888fccd` and the uncommitted status at launch. The benchmark/lock fingerprint is `4d9a7a96f573040d79348712f28d98b68c3f5255e722f61591560361b8dbf3ee`; the Windows working-tree Yarn lock hash is `80bc0e7239149d238f0dd36b8b13b673e5a3b28ab078b2c31bbb49d831c76889` (CRLF, lock format 8).

Reference machine: **Ryzen 9 7900X3D, 24 logical CPUs, 63.6 GiB RAM, Windows x64 build 10.0.26300**. Runtime: **Node 24.21.0 / V8 13.6.233.17-node.53**, **Playwright 1.64.1 / Chromium 156.0.8078.4 / browser V8 15.6.75**, pinned **Yarn 4.18.1**. [Environment manifests](environment.json), [measured source hashes](measured-source-files.json), [raw artifact hashes](raw-artifacts.json) and [additional correctness results](additional-correctness.json) preserve the detailed evidence. Three partial development cohorts were discarded; none supplies selection timings.

Raw per-tick samples, CPU profiles, allocation profiles, GC traces and heap snapshots remain under ignored `tmp/ecs-bench/reference-2026-10-29/` and `tmp/ecs-bench/reference-2026-10-29-corrected-diagnostics/`. Their large contents are not committed. The [diagnostic artifact manifest](diagnostic-artifacts.json) identifies the corrected files.

## Reproduction and repository validation

Use a clean checkout, Node 24.21.0 and the pinned Yarn version:

```text
yarn install --immutable
yarn playwright install chromium --only-shell
yarn bench:ecs:check
yarn bench:ecs:smoke
yarn bench:ecs:full --output tmp/ecs-bench/<new-run>
```

Install `tools/ecs-bench/plot-requirements.txt` into `tmp/ecs-bench/plotting` with Python 3.12+ to regenerate the standalone charts. To reproduce the exact historical timing implementation, use harness commit `0079ac2`; current tooling includes the diagnostic response-release correction and stronger validation. The [laboratory guide](../../../../tools/ecs-bench/README.md) documents all commands and diagnostic options.

```text
yarn bench:ecs:full --profiles-only --output tmp/ecs-bench/<diagnostics>
yarn bench:ecs:report --input tmp/ecs-bench/<timings> --profiles-from tmp/ecs-bench/<diagnostics> --destination tmp/ecs-bench/<report>
```

Both manifests are retained when diagnostics are joined. The join requires matching lockfile, Node and hardware. It never replaces timing samples. Builds, tests and candidate measurements run sequentially. Every timing repetition uses a fresh process, at least two seconds and 200 ticks of disposable-world JIT warm-up, then identical measurement state and 2,000 fixed 50 ms steps without sleeping. The measured-trial limit is 120 seconds; profiling and forced-GC checkpoints are separate.

Repository validation passed: immutable Yarn install; strict benchmark types/lint; six protocol tests; application lint; 284 Chromium application/accessibility tests; 30 lint-tool tests; 26 world/simulation tests; 13 export tests; production build, asset checks and real authoring-workflow failure/recovery checks. The production input audit finds **3,950 inputs with no benchmark package or harness**. Workflow YAML and all ten balanced fragment orders were checked. The standalone harness passes axe with zero violations. Final documentation and smoke results are recorded in [environment.json](environment.json).

Normal CI now runs correctness/smoke workloads and audits production build inputs. The manually dispatched workflow runs ten sequential primary fragments with balanced candidate ordering, followed by the diagnostic portion once, uploading each fragment's artifacts. Hosted runner hardware may differ between fragments; those timings remain separate from reference-desktop selection. The remote workflow was configured, not dispatched during this investigation.

## Milestone boundary and remaining work

This investigation supports completion of **only the ECS comparison and workload-evidence items in Milestone 3 Step 0**. The private production runtime, component/resource model, real commands, projection integration and remaining foundation work still need implementation. No production simulation, Editor assets, gameplay systems or gameplay saves changed.

These results qualify the standalone synthetic harness on this desktop. Angular/Babylon rendering, real UI subscribers, native relation/hierarchy features, worker architectures, additional browser engines and target devices need later qualification. Preserve stable game-owned IDs, explicit mutation boundaries and detached views when implementing the selected foundation.
