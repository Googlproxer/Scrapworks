# Save-format benchmark

This isolated browser experiment compares the current plain-object save representation with alternative layouts and codecs. Its fixtures now use the M9 schema-2 envelope; production pipeline samples append distinct revisions with the real per-run concurrency/retention rules. Alternative codec stages retain an isolated single-row control, so their storage/stage figures do not measure M9 retained-history cost. It never changes a player's gameplay database or loading path. MessagePack remains a development dependency excluded from production bundles. Benchmarks reject CI/GitHub Actions and run only locally/manual.

## Running

Use the project's Node 24.21.0, locked Yarn dependencies and installed Playwright Chromium. From the repository root:

```sh
yarn install --immutable
yarn test:setup
yarn scenes:export
node tools/save-bench/cli.ts --smoke
node tools/save-bench/cli.ts
```

The smoke command runs the opening world, 100 entities and 32 physical bodies with one warmup and three measured samples. The default matrix runs the exported opening world, exactly **10,000 / 100,000 / 250,000 total entities**, and 1,000 physical bodies with two warmups and eleven samples. Both commands run correctness checks as well as timings. Full runs can take several minutes and use substantial memory; run sequentially on an idle machine without builds or tests running alongside them.

Options:

```sh
node tools/save-bench/cli.ts --help
node tools/save-bench/cli.ts --samples 21 --warmups 3 --output tmp/save-bench/run-01
node tools/save-bench/cli.ts --populations 10000 --physics-bodies 0 --samples 5
```

`--seed` controls reproducible format order. Populations and physics counts are independently configurable. The opening world always runs. Output must be a subdirectory of this checkout's ignored `tmp/` directory. Each invocation uses a new persistent Chromium profile under its output directory, a loopback server and databases named `ScrapworksSaveBench-*`. It never opens `ScrapworksGameplaySaves` or a user's browser profile. Profiles remain available for inspecting the benchmark environment; all benchmark databases are deleted on normal completion and on handled case failures.

The CLI writes incremental `result.json` and `report.md` checkpoints. JSON includes raw samples, warmup/measured order, fixture hashes, source hashes, revision and dirty state, lockfile hash, options, browser/Node/OS/CPU/memory and the isolated profile path. `status: passed` requires every requested case to complete. An interrupted run retains a partial checkpoint; it is not a completed comparison.

## Candidates

| ID                | Stored payload                                                                                      | Purpose                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `current-object`  | Current plain save object                                                                           | Control; full save/load calls the actual unchanged `IndexedDbSaveRepository`.  |
| `json`            | JSON string                                                                                         | Measure text serialization versus IndexedDB's object cloning.                  |
| `json-gzip`       | UTF-8 JSON compressed to `Uint8Array` with browser gzip                                             | Measure compression time against transfer/storage savings.                     |
| `msgpack`         | MessagePack bytes, same object layout                                                               | Isolate a general binary codec without a bespoke gameplay schema.              |
| `binary-physics`  | Current object layout, native physics bytes stored as `Uint8Array`                                  | Isolate the number-array overhead while retaining the other object components. |
| `compact-msgpack` | MessagePack with component presence masks, positional component/transform tuples and binary physics | Explore a schema-aware layout with extra maintenance requirements.             |

MessagePack uses default full number precision; there is no Float32 quantization. Encoded buffers are copied to their exact byte length before storage, with that cost included in encoding. The compact format has an explicitly benchmark-only version marker. Every candidate returns to the current plain schema before existing host validation and player-save restoration; compact storage does not bypass production validation or physics compatibility rules.

The [MessagePack implementation](https://github.com/msgpack/msgpack-javascript) documents its binary and number mappings. Gzip uses the browser [Compression Streams API](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream). Codec implementations are experimental adapters for these fixtures, not hardened importers for arbitrary files. The [initial exploratory results](../../docs/reports/save-formats/2026-11-08/README.md) retain the five-sample scale matrix and raw receipts.

## Fixtures and fidelity

The opening case comes from `public/scene/worlds/game.json`. Synthetic entity cases use the same authored world, deterministic varied positions and quantities, existing pile components, paid research unlocks, inventory and active handcraft/MiniFab work. Totals include the player and authored entities; the 250k case remains within the simulation's 250k entity ceiling. Piles do not each create a physical body. The separate physics case builds real, separated Rapier bodies and stores actual engine snapshot bytes at initial tick zero; it does not pad or invent native data. This regular initial-body case is highly compressible and does not represent a complex moving physics scene. These are existing supported component shapes, not a forecast of future factory systems.

Each format is encoded, committed to IndexedDB, read back and decoded. A strict comparison checks all keys, values, array lengths and native bytes. A fresh production simulation worker then restores it and must match the reference capture after four fixed ticks. The measured full pipeline also checks continuation on its first measured sample. These checks run outside timings. Unit regressions cover fixture determinism, concurrent work, codec fidelity/native continuation, invalid codec input, CLI constraints, statistics and blocked-result reporting.

The current host validator is measured separately. If it rejects a larger fixture, the report records the reason and full save/load values are **blocked for all candidates**. Codec/storage measurements and isolated core continuation still run. This distinguishes a representation comparison from the current application's supported save limits.

## Timing and size boundaries

- **Full Save:** settled production worker capture, host ownership/validation, candidate encoding and read-before-write token checking through IndexedDB transaction completion. The object control uses the real production repository, including revision append/retention. Other adapters use the isolated single-row codec control; do not attribute their timings or storage to the M9 history implementation.
- **Full Load:** committed IndexedDB read, decoding, current host validation/clone and metadata agreement, then a fresh production `GameSession` worker ready with its initial publication. This includes worker startup, worker-side player-save validation, native physics restoration and host publication application.
- **Independent stages:** encoding, transaction write, transaction read and decoding. Common diagnostics separately measure real worker capture, host validation with its required clone, and `structuredClone` alone. Stage measurements are not summed to produce full pipeline values.
- **Excluded:** fixture construction, database opening, correctness checks, disposal, Angular dialogs, Babylon scene/assets and rendered-frame readiness. This is the complete data persistence/session path, not the entire visible game transition. Read timings use a warm browser cache, and default IndexedDB transaction durability is retained.

Raw samples are retained. Reports use nearest-rank p50/p95 and deterministic shuffled format order each round, after excluded warmup rounds. No forced garbage collection or unstable pass/fail timing thresholds are used. Small samples, especially smoke runs, are exploratory; a p95 from fewer than twenty samples is often the maximum. Repeat runs before making a production format decision. The harness does not measure peak memory or frame hitches and does not claim crash durability.

Vite builds an isolated minified benchmark from the actual production modules, including the simulation worker. Angular and the rendered game do not run in this harness, so absolute timings should be interpreted within this experiment rather than compared with measurements from a differently packaged application.

**Wire bytes** are exact codec output sizes; JSON is counted as UTF-8. Native object formats have no public, portable structured-clone byte size, so their wire size is `null`. **Storage delta bytes** come from `navigator.storage.estimate()` before and after one committed row in an already-open empty database, using IndexedDB-specific usage where exposed. Existing benchmark databases remain stable during each probe. These are browser-accounted estimates including row metadata, internal encoding/compression and accounting granularity, not exact disk-file sizes. They can differ from wire bytes. [StorageManager documents these estimation limits](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate).

Run correctness regressions and strict tooling checks with `yarn test:tools`; CI runs these small tests, not benchmark timing trials. The existing production build graph check verifies that experimental code and MessagePack stay outside both application and production worker bundles.
