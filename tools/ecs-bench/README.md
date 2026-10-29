# ECS laboratory

Standalone synthetic experiments for Miniplex 2.0.0, bitECS 0.4.0, Koota 0.6.6 and Becsy 0.16.1. Production simulation, game contracts, authoring sources and gameplay are not imported or modified.

## Commands

- `yarn bench:ecs:check`: strict type checking and isolated Node/Chromium correctness for the reference, four candidates and three diagnostic variants.
- `yarn bench:ecs:smoke`: correctness followed by short 1,000-entity Node/Chromium trials; no performance qualification.
- `yarn bench:ecs:node` / `yarn bench:ecs:browser`: full scaling/timing matrix in one environment.
- `yarn bench:ecs:full`: both environments, diagnostic variants, projection/capture/rebuild trials, CPU/allocation/heap profiles, 10,000 churn ticks, 20 lifecycle cycles and three 30-second paced runs per primary candidate/workload.
- `yarn bench:ecs:report --input tmp/ecs-bench/<run-id> --destination docs/reports/ecs/<date>`: regenerate compact evidence and Markdown.

Use Node 24.21.0, the pinned Yarn version and `yarn playwright install chromium --only-shell`. Results go under ignored `tmp/ecs-bench/`. A full run can take hours and generates large heap snapshots. Run on an otherwise idle machine without concurrent builds/tests. No external service or game save is accessed.

Charts use `plot-requirements.txt`, installed into ignored `tmp/ecs-bench/plotting`. Set `ECS_BENCH_PYTHON` to the Python executable used for that installation. When available on Windows, report generation defaults to Codex's bundled Python; otherwise it uses `python` on Windows or `python3` elsewhere. `smoke --profiles` exercises all instrumentation on small fixtures. Every complete timing trial receives an untimed SHA-256 fingerprint of its entire captured state for comparison with the reference implementation.

`full --profiles-only` reruns correctness plus all eight target profiles without replacing latency samples. `report --profiles-from <diagnostic-run>` explicitly joins corrected diagnostics to an earlier timing cohort, requiring the same hardware, Node and lockfile. Both manifests remain in the summary. Generated prose is `evidence.md`, leaving a reviewed report's `README.md` intact. Allocation-sampling response objects are released before memory checkpoints; post-disposal snapshots support retained-object analysis.

`--output <directory> --resume` resumes matching source/lock fingerprints. Additional diagnostic controls are `--candidates`, `--scales`, `--workloads`, `--ticks`, `--repetitions` and `--label`. Altered settings cannot qualify as the complete selection matrix; results retain exact settings. `--allow-node-version` is for non-reference diagnostics. CI uses `--label hosted-ci` and does not make reference-desktop performance claims.

The manual CI workflow runs ten sequential primary fragments (one repetition per environment, with balanced rotated candidate order), then the diagnostic portion once using `full --repetitions 0`. Every fragment uploads its own manifest and artifacts. Hosted repetition indexes are in fragment/artifact names; each fragment's internal repetition starts at zero. Runner hardware may differ between fragments, so these results never replace a complete reference-desktop cohort. The default desktop `full` command remains one sequential cohort with five repetitions on the same machine.

## Protocol

Every timed publication escapes through an exported consumer object exposed to the browser host. Exact changed-record and removed-ID counts are asserted on every tick against a precomputed 100-phase schedule, and the full captured state is fingerprinted outside timing. Consumer references are released before memory checkpoints. Candidate imports include Becsy's actual selected ESM build; Node and Chromium empty-runtime checkpoints use the same target capacity. Use `--help` for CLI usage without launching an experiment.

The canonical world is 60% processors, 20% owners with 24 slots, 10% deposits and 10% piles. Status distributions are exact per 100 processors. Inventory units remain quantities, not entities. Seed 1729 and bounded commands maintain active work, nested bag edits, stable ownership and constant population under churn.

Shared synthetic completion/accounting rules are plain functions. Native ECS queries and hot stores remain inside each adapter. Cached handles are runtime indexes into one authoritative set of component data, not a second mutable world. All scalar stores retain JavaScript-number precision. The reference implementation scans ordinary records; it is an overhead/control measurement, not an ECS candidate.

Five independent processes per workload/scale/environment warm sacrificial worlds for at least two seconds and 200 ticks, then recreate the same initial state. First-query/tick costs are separate; 2,000 measured ticks include systems, structural changes, dirty tracking and deep detached changed projections. Per-trial measurement stops at 120 seconds with partial samples labelled timeout. The parent watchdog also records hangs/crashes. Profilers and forced GC run separately.

The selection gate is the median of five per-run p95/p99 values at 100,000 entities in normal mixed work, in both environments: ≤5 ms/≤8 ms. The 250,000-entity scale and all-active work are stress evidence. Report full copying versus 0%, 1%, 10% and 100% changed publication separately. No absolute RAM budget was agreed; memory, allocation pressure and retained growth are compared explicitly.

Correctness verifies oracle equivalence, query mutation, nested changes, stable owner links, deep detachment, fresh-runtime continuation, independent worlds, growth, failure publication, pause/catch-up and idempotent teardown. The benchmark session mirrors the existing timing contract; existing application tests remain the authority for production session behaviour.

## Package-specific boundaries

- Miniplex uses plain entities and cached active-component queries. Predicate membership is explicitly reindexed in the diagnostic probe.
- bitECS uses per-world component stores; numeric fields use Float64Arrays with measured growth or ordinary arrays in the diagnostic variant. Removed payload references are cleared before ID reuse.
- Koota uses schema numeric stores and object payload traits. Nested updates are explicitly signalled; its Number.prototype patch is confined to fresh processes. The convenient updateEach variant runs the same rules.
- Becsy 0.16.1 publishes ESM files under `lib/`; the documented `/perf` subpath is absent and root `main` selects UMD despite `type: module`. Explicit `lib/perf.js` and `lib/index.js` imports share the root API declarations. Operations after initialization run in a declared system; repeated World.build calls are forbidden by the checked build. Component classes are recreated for each world. Configured entity/log capacities are recorded by fixture size and are part of its memory cost.

## Interpretation

Dirty tracking runs inside native systems/structural commits and is included in those times, rather than reported as a fabricated independent zero-cost phase. CPU profiles attribute its self-time. Full-view and capture copying are deliberately measured; capture is not a gameplay save schema. Browser heap/backing-store metrics are not renderer-process RSS. Heap sampling is statistical and any unsupported capability is labelled unavailable.

Only correctness-passing candidates meeting the complete timing gate are eligible for adoption review. Score domain-function reuse, type safety, lifecycle/mutation complexity, capture/projection complexity and package maintenance/integration risk equally (0: material workaround, 1: manageable discipline, 2: direct verified fit). Prefer the higher total; equal totals use retained memory and then combined tick latency. If none qualifies, retain the budget and identify measured bottlenecks rather than selecting a winner anyway.
