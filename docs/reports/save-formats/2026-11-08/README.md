# Save-format comparison: initial exploratory run

The [isolated benchmark](../../../../tools/save-bench/README.md) passed all **30 format/world comparisons**, including full save/load at 250,000 entities. The production save implementation is unchanged. These results establish a reproducible comparison harness; they do not select a replacement format.

Command:

```sh
node tools/save-bench/cli.ts --samples 5 --warmups 1 --output tmp/save-bench/scale-01
```

Reference machine: AMD Ryzen 9 7900X3D, Windows, Node 24.21.0, persistent headless Chromium 156.0.8078.4. Builds and tests were paused during measurement. Source revision `1447967` plus the uncommitted benchmark changes are identified by exact source/lockfile hashes and dirty state in the [raw result](result.json). All source hashes were checked against the workspace after the run. [Complete measurements](measurements.md) retain every world's phase breakdown and p50/p95 values.

Five samples and one warmup are exploratory: reported p95 is the maximum of five values. Storage is the browser-accounted estimate for a committed row, not an exact disk-file size. Reads use a warm browser cache. Full load ends when the restored simulation worker has delivered its initial publication; Angular/Babylon scene loading is excluded.

## 250,000 entities

These synthetic worlds use supported piles, inventory, research and active crafting shapes. They contain only 16,019 native physics bytes, so physics-byte packing has little influence here. Every representation passed the unchanged production save gate, exact stored round-trip comparison and four-tick native continuation.

| Format                                            | Estimated storage MB | Median full Save ms | Median full Load ms |
| ------------------------------------------------- | -------------------: | ------------------: | ------------------: |
| Current object                                    |                 8.53 |               2,534 |               3,383 |
| JSON                                              |                 8.10 |               1,891 |               3,376 |
| JSON + gzip                                       |                 4.23 |               2,216 |               3,304 |
| MessagePack, current layout                       |                 6.82 |               1,947 |               3,353 |
| Object + binary physics                           |                 8.46 |               2,530 |               3,355 |
| Compact components + binary physics / MessagePack |                 5.71 |               2,036 |               3,194 |

MB uses decimal bytes. Gzip used about half the current format's accounted storage, while JSON had the lowest median save time in this run. Load times stayed relatively close: restoring and publishing the world in a fresh worker took about 2.5 seconds across formats. Common capture took about 1.19 seconds; host validation with its required clone took 587 ms, and cloning alone took 531 ms in separate diagnostics. Format changes alone therefore leave substantial common capture, cloning and reconstruction costs.

Wire size and browser storage differ materially: JSON was 50.29 MB as UTF-8 text but accounted for about 8.10 MB in Chromium storage. The report keeps those metrics separate rather than treating a smaller encoded file as an equal reduction in IndexedDB usage.

## 1,000 physical bodies

This separate case contains 1,001 entities and 642,986 native physics bytes. Its regular, initial tick-zero bodies are highly compressible; the result should not be extrapolated to complex moving physics scenes.

| Format                                            | Estimated storage MB | Median full Save ms | Median full Load ms |
| ------------------------------------------------- | -------------------: | ------------------: | ------------------: |
| Current object                                    |                 2.76 |                 234 |                 390 |
| JSON                                              |                 0.19 |                 111 |                 298 |
| JSON + gzip                                       |                0.067 |                 121 |                 308 |
| MessagePack, current layout                       |                0.129 |                 123 |                 370 |
| Object + binary physics                           |                0.181 |                 126 |                 321 |
| Compact components + binary physics / MessagePack |                0.125 |                 118 |                 324 |

Changing only physics storage from a number array to `Uint8Array` reduced the accounted size by about 93% in this case and reduced median save time by about 46%. The contrasting pile-heavy result shows why the workload composition matters. Encoding a numeric array with a general binary codec and storing native bytes directly are separate choices.

## Verification

- All five worlds × six formats passed actual IndexedDB round trips, exact field/native-byte comparison, restored worker initialization and native continuation checks.
- The full pipeline used the real production repository for the object control, and matched token-check/transaction boundaries for alternatives. Candidate data returned to the current schema before existing validation and restoration.
- Strict tools and game typechecks passed; 91 tooling tests and 121 game/session tests passed.
- Production build, source boundaries, worker/main dependency separation and route bundle checks passed. The codec dependency and benchmark code remain outside the shipped graph.

The first hosted CI attempt exposed an existing loading-probe precision mismatch: an unrounded renderer request timestamp was compared strictly with Chromium's upward-rounded paint timestamp. The acceptance probe now accounts only for the documented 4 ms presentation bucket, with regression coverage for rejecting earlier buckets. Production loading code and the save implementation were not changed. Both native and delayed-render production acceptance runs passed locally after the probe correction.

The harness also supports larger sample counts, repeat runs and recording save-limit rejection without raising production limits. Follow-up measurements should vary world composition and hardware before making a production decision. Peak memory, frame hitches, cold-disk reads, crash durability and migration cost were not measured.
