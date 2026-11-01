# Lean publication requalification

This follow-up changes the isolated laboratory's presentation contract. The [29 October method](../2026-10-29/methodology.md) remains the baseline for the fixture, native systems, clocks, command ledger, timing, frame recorder, profiling and limitations. Its rich-record measurements remain historical and are not pooled with this cohort. Production source, authored assets, runtime selection and multi-worker scope are unchanged.

## Contract and correctness

Both Miniplex 2.0.0 and bitECS 0.4.0 retain the same 100,000 authoritative entities, processing ratios, 24-slot inventories, double-precision numbers, deterministic replenishment and seeded commands. Ordinary rich records remain available through plain capture/rebuild. No inventory or production work is skipped to reduce publication cost.

Routine publication visits the same dirty entity set directly at a completed tick boundary. It writes 12 Float64 fields per entity into a new buffer: ordinal, generation, kind, x, z, status, work, charge, quantity, reserved, held and publication tick. The last field records when a row was published, including full resynchronization; it is not a history of semantic field changes. Removed identities use ordinal/generation pairs in a second buffer. These are presentation-owned copies, transferred once; they never alias or detach an ECS component store. Each row is 96 bytes. They are fixed rows rather than field-level diffs, with no visibility culling or numeric quantization. The fixture's `entity-ordinal-generation` IDs reconstruct exactly; a production protocol must support its actual game-owned ID scheme.

The main thread copies received rows into its own typed cache. Envelopes retain world generation, activity revision, completed tick, publication/base version and command acknowledgements. Duplicates are harmless and gaps require explicit full resynchronization. Full publication can resize the cache. Simultaneous worlds retain independent data.

Inventory slots, input/output item records, recipe and ownership details are absent from routine numeric rows. The host subscribes to at most 16 unique stable IDs. A subscription request reads detached details at a completed batch boundary; subsequent dirty subscribed entities carry updated nested details with the next view. Replaced identities remove old details, and stale subscriptions cannot bind to a replacement at the same ordinal. The normal qualification subscribes to the player inventory and one processor. This is an explicit presentation requirement change, not a claim of equivalence to a full rich-record cache. A different actual UI or subscription load needs its own qualification.

Every configuration repeats the original native adapter correctness suite and worker protocol/lifecycle checks. New checks compare every numeric view field and subscribed nested record with a full authoritative capture, verify nested updates/detachment, stale inspection IDs, version gaps and resynchronization. Full captures still compare with the plain reference and each other after restored continuation. The actual Simulation/PlayerMotor movement/placement compatibility probe is retained separately; synthetic processors have static positions and are not a movement/rendering playtest. Pure tests cover buffer detachment, complete row reconstruction, malformed full-frame rejection before cache mutation, identity reuse/removal and host-cache growth.

## Focused matrix and unchanged gates

`browser --presentation lean --phase lean` runs 188 sequential fresh-browser jobs:

- Four correctness configurations, both libraries inline and in one worker.
- All 120 original primary trials: five independent repetitions of normal worlds at 50,000, 100,000 and 250,000, plus idle, active and churn at 100,000, across all four configurations.
- Four capture/encoding/rebuild/publication diagnostics and four untimed payload-size probes.
- Four separate CPU/allocation/heap diagnostics, each with 10,000 churn ticks and 20 lifecycle cycles at 100,000.
- All 36 required normal paced runs: four configurations, 0/4/8 ms host pressure, three independent 30-second repetitions.
- Twelve diagnostic idle/active paced runs: two workers, 8 ms host pressure, three repetitions each.
- Four timer-emulated 120 Hz diagnostics.

Each primary trial retains at least two seconds and 200 ticks of disposable-world warm-up in the retained execution context, fresh measurement state, 2,000 measured steps, a separate first tick, and the 120-second trial limit. Verification/hashing/canonical ordering remain outside timing. No build, test, other candidate or diagnostic runs concurrently with ranking measurements. The same host-credit scheduler, one outstanding request, 20 Hz step, five-step allowance and no offline catch-up apply.

Qualification uses the median of five target per-run p95/p99 values, including lean publication, with the original 5/8 ms compute and 2/4 ms observed-receiving gates. Every normal paced repetition at every pressure must meet frame p95/p99 18.5/33.4 ms and sampled input-to-presentation p95/p99 100/150 ms. Actual monotonic callback arrival gaps remain the frame metric, guarded by the injected 45 ms stall. No numerical gate was relaxed. Profiling is separate and never contributes to rankings.

The focused phase omits superseded rich-message JSON/batch variants, paired alternate clocks, and the full idle/active pressure matrix. Required normal pacing, primary scales/repetitions and memory duration are retained. Hosted results remain separate. Development smoke/calibration is excluded from qualification.

## Attribution and limits

`workAndPublication` includes native systems, structural commits/dirty tracking and numeric/detail publication. Native `postMessage`, observed receipt including `MessageEvent.data`, cache application and monotonic host round trips remain separate. Do not add phase percentiles. Lean payload probes report exact transferred buffer bytes plus an untimed JSON estimate of the envelope/details; browser-internal message bytes remain unavailable. Primary trials also retain buffer-byte and subscribed-record counts for every tick.

Memory checkpoints force GC only in separate diagnostic runs and sum heap plus backing storage over the page and worker. Allocation sampling estimates volume, not retained/peak RAM. Captures deliberately retain complete rich records and additional copies. Heap snapshots before/after disposal and disappearing worker targets distinguish ECS retention from harness or buffer retention. The churn fixture replaces selected identities; subscriptions intentionally do not follow replacements automatically. The main-thread lean cache can therefore contain numeric buffers without concrete rich entity payloads in the live control. That is expected and must be checked using backing-storage evidence as well as payload counts.

This qualifies a standalone browser laboratory on the reference desktop. It does not qualify Babylon rendering, physical input-to-photon delay, real movement/camera feel, target hardware, another engine, prolonged worker-clock churn, gameplay persistence or multiple ECS workers. Interpolation remains first; prediction is deferred. SharedArrayBuffer, Atomics, authoritative-store transfers, buffer pools and parallel systems remain unimplemented.
