# Milestone 9 Save resilience

Implemented and locally verified 9 November 2026. Status: **Completed**. All seven packages are delivered: named runs, independent manual/autosave revisions, recovery, an M9 compatibility baseline, JSON transfer and storage-failure backups. Prerequisites [Milestone 8](milestone-08-restoration-and-energy-choices.md) and [Milestone 4](milestone-04-first-local-save.md) retain their completed credit. M10 remains separate work.

Add multiple named runs, two-minute active-play autosaves, recoverable manual/autosave revisions, an M9 compatibility baseline and downloadable JSON backups. A failed write or invalid import must leave both the active world and the last good save usable. Accounts and cloud synchronization remain outside this prototype.

The 9 November [M8 save decision](milestone-08-restoration-and-energy-choices.md#agreed-scope-and-decisions--9-november-2026) binds saves to exact authored-map revision/content. Notify the player and reject a changed-map save before candidate loading; migrations/imports cannot bypass this check. The M9 review establishes compatibility guarantees from M9 onward, with no requirement to preserve M4–M8 saves. Incompatibility alone never authorizes silently deleting an existing save.

[High-level plan](README.md) · [Next milestone](milestone-10-portfolio-prototype.md)

## Current implementation

`src/contracts/save.ts` now defines schema-2 named runs and immutable manual/auto revisions. Dexie version 2 separates run heads, revision metadata and payloads while preserving old slot rows for deliberate deletion. A run-wide token/sequence protects atomic append and 5-autosave/3-manual retention. Metadata/history remains readable when the newest payload is damaged. The [technical specification and field audit](../design/save-resilience.md) records ownership, compatibility and coverage.

World 3/physics 3, content `restoration-1` and exact Rapier 0.21.0 remain unchanged. Schema 2 is the first guaranteed M9 format; schema 1 is unsupported. The detached sequential pipeline has a current identity path and labelled synthetic migration tests, without manufacturing an older M9 format. Exact shipped-map comparison precedes worker/scene construction for loading and import preflight. Existing M3–M8 validators/captures remain the gameplay authority; renderer indexes, held input and session command transport are not persisted as runtime objects.

SaveCoordinator schedules every 120 seconds of completed active simulation time, skipping unchanged boundaries and holding during replacement. Explicit requests precede one coalesced autosave; stale sessions and cross-tab conflicts cannot overwrite a newer head. Recovery and JSON inspection are non-destructive, imports create distinct runs and activation uses the existing candidate worker/scene/UI rollback path. Validated emergency downloads work without IndexedDB. Accessible controls reserve status space and keep pause actions reachable. The isolated developer test-record dialog remains separate.

## Agreed scope and decisions — 9 November 2026

1. **Multiple named runs:** provide a run list with one manual checkpoint and a separate rolling autosave history per run. Names are display labels, not identities. New Game creates a distinct run; its first autosave must not overwrite another run or require an earlier manual save. Continue/Load identifies the selected run, revision and save kind explicitly.
2. **Autosave and retention:** save every **2 minutes of active play**, skipping unchanged state. Suspend the timer while explicitly paused, hidden or held for replacement; resume without a catch-up burst or offline progress. Retain the latest **5 autosaves and 3 manual revisions per run**, including each kind's newest revision. Manual saving never rotates the autosave history, and autosaving never overwrites the manual checkpoint. Count only committed revisions. Measure storage for this policy; a later policy change needs an explicit decision.
3. **Compatibility baseline:** guarantee supported compatibility from **M9 onward**. No existing-save preservation requirement applies to M4–M8. Define the first M9 format and support policy without inventing an unnecessary historical migration or format rewrite. Explain older incompatible saves and allow deliberate deletion; keep unsupported data intact until the player acts. The map policy remains independent and strict.
4. **Recovery and import:** inspecting history or a file never replaces play. Recovery activates a selected valid revision only after the usual discard confirmation and successful candidate preparation. Resumed saves append a new revision linked to the recovered source; they never edit the source revision. Accepted imports create a new local run and slot identity, retain source provenance and simulation entity/next-ID state, and require a separate deliberate activation. They never merge into or silently overwrite an existing run.
5. **Failure and scope:** failed capture, migration, validation, candidate preparation or commit preserves the active world and all previously committed data. Normal commits prune only revisions outside the agreed retention policy in the same atomic transaction. Browser permissions are optional. Accounts, cloud sync, offline simulation and new gameplay systems remain outside this milestone. Compression/binary redesign stays deferred unless a measured bottleneck justifies a targeted format change under the decision below.

The user subsequently authorized M9 implementation on 9 November 2026. No product questions remain. Local measurements below support retaining the current object representation and agreed policy; M10 still owns larger-factory and intended/lower-end-device qualification.

## Save-performance decision — 8 November 2026

Save-format optimization is deferred. Keep the current object representation through Milestones 5–8 while extending snapshots and continuation tests for each new system. Revisit the [exploratory save-format results](../reports/save-formats/2026-11-08/README.md) here when introducing autosaves, retained revisions and migrations, then qualify representative factory performance in [Milestone 10 Step 4](milestone-10-portfolio-prototype.md#step-4-measure-and-address-performance). A broader format redesign may remain deferred until after Milestone 10 if the prototype meets its agreed performance and storage budgets.

Review mixed operating worlds with realistic inventories, machine buffers, transport and moving physics. Separate capture, validation/copying, encoding, IndexedDB transactions and worker reconstruction; entity count alone does not describe the workload. Binary physics storage is a candidate for review, not an approved implementation. Bring a targeted optimization forward only for measured gameplay interruptions, unacceptable save/load latency or excessive revision storage. Keep representation changes behind the repository/codec and versioned migration boundaries. Performance benchmarks remain manual and outside CI; CI runs correctness tests and build checks.

## Step 1 Audit the complete saved state

- [x] Produce a field-to-capture/validator/continuation-test checklist for implemented M3–M8 state, crediting existing coverage and closing actual gaps.
- [x] Include MiniFab ownership, target/precursors, charge and rate budget; research queue/ledgers and lab coordination; inventories, deposits, extraction/production history, machine jobs/reservations/held output, recycler random/permutation/cursor state; transport units/progress, topology/cooldowns/arbitration; water sources, attribution/quality/consumption and pipe/tank buffers; health/frontier cadence, weather/PRNG, batteries, coal fuel/water/ramps and latched objective state. Deferred MiniFab upgrades/power/automation are not new M9 scope. Exclude winding/movement intents, device handles, pending commands and session transport counters.
- [x] Validate entity/content references, capacities, finite ranges, stable IDs, and next-ID state.
- [x] Confirm load reconstructs runtime indexes and renderer mappings rather than saving those objects.
- [x] Extend existing continuation comparisons with a mixed operating M8 factory: partial research/handcraft, moving native bodies, transport backpressure, mixed-source water, weather boundary, coal ramp, battery limits and latched restoration. Rebuild runtime indexes and presentation without replaying commands, repaying inputs or advancing offline time.
- [x] Revisit the deferred save-format benchmark with representative mixed factory/physics state; record phase costs and whether the current representation should be retained or a specific bottleneck investigated.

## Step 2 Retain committed revisions

- [x] Generalize the hard-coded single-slot contracts/repository/coordinator/UI to stable run, slot and revision identities, named runs and independent manual/autosave heads. Keep run identity separate from authored world ID and session generation.
- [x] Define immutable revision identity, kind, captured tick, commit timestamp, format/content/map/physics compatibility metadata and previous/recovered-source provenance. Enforce 5 autosaves and 3 manual revisions per run, including the heads, without mixing their histories.
- [x] Write the new snapshot, metadata, and revision pointers in one transaction.
- [x] Retain the last committed revision if the new transaction fails; prune only according to a successful commit policy.
- [x] Keep previous autosaves and manual revisions independently available for recovery. List metadata/history even if the newest payload is corrupt or incompatible; diagnose it without erasing it or silently selecting a different world.
- [x] Let the player inspect/select a previous revision without overwriting the current one merely by opening the recovery UI.
- [x] Append resumed play after recovery as a new revision, preserving the source and later existing revisions until ordinary retention permits removal. A recovery/load alone writes nothing; make run/revision deletion deliberate and confirm its scope.
- [x] Retain transactional expected-head/token checks across tabs. Report conflicts and refresh metadata; never automatically retry an obsolete capture over a newer committed head. New runs/imports must not reuse another run's local identity.
- [x] Measure per-run and aggregate retained-revision storage for the agreed policy; record results before proposing any retention or encoding change. Do not add automatic whole-run eviction.

## Step 3 Add autosave scheduling and operation safety

- [x] Schedule every 2 minutes of active play, skip unchanged boundaries and reset the interval after a successful save of the active run. Pause/visibility/load holds stop active-time accumulation; resume without queued catch-up saves. Manual saves remain available while explicitly paused.
- [x] Capture only completed states and bind each request to its original slot, world, and session generation.
- [x] Bound autosave work to one in-flight operation and at most one coalesced request for the current session; capture that request only when it executes. Give explicit player operations precedence over redundant automatic work.
- [x] On load/recovery/activation/New Game, suspend new autosaves and gameplay input, finish in-flight persistence work, and discard stale queued autosave requests. Preserve the active handcraft job and prior pause/visibility state through the non-destructive hold.
- [x] Pause the simulation for candidate loading and replacement, then restore the prior pause/visibility state.
- [x] Ensure a newer world session cannot be written by an old request or reported as saved by an old completion callback.
- [x] Show manual/autosave status and failures in reserved, stable UI space with appropriate live announcements, keyboard/controller access and AXE coverage. Do not claim an in-flight write is committed. Failed autosaves keep play usable and offer retry/backup without modal or rapid retry loops.
- [x] Do not depend on unload/page-close writes. Continue selects committed progress; run/revision timestamps and unsaved markers must remain correct after delayed completion, recovery or cross-tab changes.
- [x] Measure autosave capture/write latency and main-thread responsiveness during play; address disruptive pauses or excessive storage with a targeted change only when demonstrated.

## Step 4 Implement schema migrations

- [x] Define the first M9 durable-envelope/world/content/native compatibility matrix, explicitly excluding any M4–M8 preservation guarantee. Separate format support from exact map and Rapier/native compatibility; reject unsupported native state rather than silently rebuilding different physics.
- [x] Provide explicit sequential, pure migration steps for supported M9 versions when real format changes require them. Keep a current-format identity path; exercise migration ordering/failure with clearly labelled synthetic fixtures if no older M9 format yet exists. Do not claim those fixtures establish historical player-save support.
- [x] Enforce exact authored-map compatibility independently of save-format support. A format migration cannot silently transplant an old run onto a changed map; explain invalid-map saves before attempting candidate load.
- [x] Keep database schema upgrades separate from gameplay snapshot migrations.
- [x] Migrate a detached copy and never modify the stored source revision during validation.
- [x] Validate the migrated result against current state and content invariants before use.
- [x] Reject unsupported newer schemas with a specific explanation.
- [x] Define how content IDs or timing assumptions change across versions rather than guessing replacements.
- [x] Keep real fixtures for each supported M9 version as versions arise and test every supported path plus malformed/intermediate/newer versions. Successful load alone never rewrites a source revision; a later explicit/manual/autosave commit writes the current format as a new revision.

## Step 5 Add JSON export and import

- [x] Export a chosen valid committed snapshot with a recognizable filename and versioned envelope.
- [x] Bound encoded file size before reading/parsing and bound decoded structure/collections before expensive reconstruction. Validate the versioned envelope, metadata/payload agreement, exact map, gameplay/content and native physics through the shared loading/migration validators. Report unsupported versions separately from malformed data; do not trust filenames or supplied identities.
- [x] Separate inspect/validate, persist as a new local run, and activate. Use an isolated validation worker for gameplay/native preflight; scene/UI preparation and ownership transfer happen only on deliberate activation. Failure at any stage leaves active play and existing runs intact.
- [x] Create a new slot/local run identity for every accepted import, including repeated imports of the same backup; preserve source provenance and simulation IDs without collision or merging. Do not silently overwrite an existing run.
- [x] Report parse, unsupported-version, validation, and storage failures clearly.
- [x] Make importing and activating a run deliberate actions so inspecting a file cannot unexpectedly replace play.
- [x] Verify exported/imported continuation, including research, transit, fuel, water, and restoration progress.
- [x] Provide an emergency JSON download of a freshly captured, fully validated completed state when IndexedDB is unavailable or full. It must not require a successful database write or falsely mark browser progress as committed. Normal export identifies the chosen committed revision and excludes unrelated settings/developer data.

## Step 6 Handle browser storage limits

- [x] Explain which browser origin owns the saves and that clearing site data removes them.
- [x] Handle quota, unavailable storage, and failed transaction errors without destroying the session.
- [x] Provide downloadable backups and describe how to restore them through import.
- [x] Treat persistent-storage permission as an optional browser capability; a successful request does not replace backups.
- [x] Expose storage estimates/capability status where available and request persistence from a deliberate player action. Unsupported, denied or failed browser APIs must leave saving/backup options usable; estimates are advisory rather than guaranteed capacity.
- [x] Keep storage capability queries and permission requests inside the browser adapter/application boundary.
- [x] Preserve the repository boundary for a future cloud adapter without adding accounts or synchronization now.
- [x] Handle quota/upgrade-blocked/version-change/multi-tab conflicts with useful retry, close-other-tabs, backup or deliberate history-management actions. Do not delete retained checkpoints or whole runs as a speculative response to a failed write.

## Step 7 Verify recovery and races

- [x] Inject write failures before commit and confirm the last good revision remains loadable.
- [x] Test malformed JSON, invalid references, unsupported newer saves, and migration errors with the active world unchanged.
- [x] Test the M9 identity path and every real supported M9 migration through continued simulation. Test synthetic pipeline contracts separately, reject unsupported pre-M9 saves clearly and preserve changed-map rejection before candidate worker/scene construction.
- [x] Queue rapid manual saves, autosaves, loads, and new-world requests; verify slot/world binding and stale-request rejection.
- [x] Recover a previous autosave, resume play, and confirm revision handling follows the retention policy.
- [x] Export and import a real browser save into a new slot, then compare continuation with the original branch.
- [x] Cover corrupt newest revisions with readable history, candidate/scene/UI failures, repeated imports, two tabs racing on one head, atomic retention/pruning rollback, run deletion, first autosave before any manual save and old callbacks after world replacement/disposal.
- [x] Use controlled active-time tests for pause/hidden/resume, unchanged state, slow/failed writes, queue coalescing and explicit-operation priority. Verify autosave never rotates a manual checkpoint or advances offline time.
- [x] Verify denied/full storage still permits emergency file backup and failed import never destroys the active run. Check stable keyboard/controller focus, status layout and desktop/mobile AXE.
- [x] Keep full/virtual/accelerated gameplay routes and performance diagnostics local and manually invoked. CI/GitHub Actions use focused unit/component and fixture-based integration tests only; no opening/factory/restoration playthroughs.

## Completion checks

- [x] Named runs have independent manual/autosave histories; the 2-active-minute schedule, 5-autosave/3-manual retention, pause/visibility rules and operation binding hold without races or manual checkpoint overwrite.
- [x] A failed write preserves the last successful save.
- [x] Previous revisions can be recovered without accidental overwrite during inspection.
- [x] The M9 compatibility baseline and supported migration paths are explicit; unsupported pre-M9/newer/native/map-incompatible or invalid data is explained and preserved safely.
- [x] A full run can be backed up and imported as a distinct local run with exact continuation; deliberate activation alone replaces play. A validated emergency download remains possible when browser storage fails.
- [x] Recovery/storage/status controls are accessible and stable; local performance measurements record the agreed policy's cost without adding playthroughs or benchmarks to CI.

## Notes and implementation issues

| Possible issue                                          | Implementation guidance                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Autosave finishes after another world becomes active    | Bind operations and result messages to session generation as well as slot/world identity.                                |
| Recovery or migration overwrites the only good revision | Work on detached copies and commit only after validation; keep revision selection separate from writing.                 |
| Database upgrade is mistaken for save migration         | Dexie table/index upgrades and gameplay schema conversion solve different problems.                                      |
| Browser storage is denied or cleared                    | Keep the world playable, report the failure, and offer file export where possible.                                       |
| Imported IDs collide with current entities              | Replace the session as a validated world rather than merging imported entities; validate and retain its next-ID counter. |
| Future cloud saves introduce conflicts                  | Leave conflict handling for that feature. Keep version, world, slot, and revision identities explicit now.               |

Record implementation notes here:

| Date            | Observation or decision                                         | Follow-up and status                                                                                                                                                          |
| --------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 October 2026  | File-transfer scaffold only; current source inspected.          | See Current implementation above; unchecked gameplay requirements remain open.                                                                                                |
| 8 November 2026 | Save-format optimization deferred after exploratory benchmarks. | Review autosave/revision costs here, qualify the real factory in Milestone 10, and defer broader redesign beyond the prototype if budgets pass. Benchmarks remain outside CI. |
| 9 November 2026 | Source/Fibery review found stale opening-only status, a single-slot/import mismatch and missing corrupt-head, cross-tab and storage-failure backup requirements. User chose named runs, 2-active-minute autosaves, 5 autosave/3 manual revisions per run and compatibility from M9 onward with no existing-save guarantee. | Seven existing package identities and their Open states are retained. M4–M8 persistence is credited; M9 implementation remains planned. Exact map rejection and local-only playthrough/performance checks remain binding. No pending product questions. |

## References and diagrams

- Current boundaries: [save contracts](../../src/contracts/save.ts), [coordinator](../../src/persistence/save-coordinator.ts), [IndexedDB repository](../../src/persistence/indexeddb-save-repository.ts), [codec](../../src/persistence/save-codec.ts), [player validation](../../src/simulation/player-save.ts) and [authored-map identity](../../src/core/authored-map.ts).
- [Save flow diagram](README.md#save-flow-diagram)
- [Load flow diagram](README.md#load-flow-diagram)
- [Save format and loading](../design/TDD.md#save-format-and-loading)
- [File backups and browser storage limits](../design/TDD.md#file-backups-and-browser-storage-limits)
- [Future cloud persistence](../design/TDD.md#future-cloud-persistence)

## Implementation verification — 9 November 2026

The [local report](../reports/milestone-09/2026-11-09/README.md) records 231 simulation/session tests, 398 Chromium tests and 90 tooling tests, six strict type checks, source/template lint and production build/export checks. The real production browser flow verifies visible handcraft continuation, pause loading, JSON download, two distinct imports, deliberate activation, corrupt-newest recovery with its source retained, run deletion and desktop/mobile AXE. Standard production acceptance covers loading/paint, base path/CSP, keyboard movement, pause, crash/Retry and teardown.

Two controlled mixed M8 layouts include water/weather/health, blocked partial conveyors, handcraft/MiniFab work, moving native bodies and either partial research or coal/mitigation. Uninterrupted and JSON-restored branches agree for 1,000 more steps. Twelve browser samples after three warmups measure capture at about 1.5–1.6 ms median, host validation/copying 6.6–7.0 ms, JSON encoding 0.2–0.3 ms, real append/retention writes 11.3–12.2 ms and fresh worker reconstruction 111.5–115.7 ms. Eight retained revisions total 935,354–985,618 UTF-8 JSON bytes per run; browser-accounted storage deltas are about 1.04–1.07 MB. The isolated idle-page RAF maximum is about 16.8 ms; this is not renderer FPS or lower-end-device qualification. Keep the object representation; no binary/compression change was needed.

The small adapted codec/repository smoke passes two fixtures and twelve format comparisons. Full/virtual gameplay and all performance work stay local/manual; CI workflows are unchanged. Reports and diagnostic fixtures remain local/untracked. Implementation and documentation are uncommitted; no publication, deployment or new hosted CI run is claimed.
