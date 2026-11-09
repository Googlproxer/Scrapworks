# Milestone 9 Save resilience

Updated 8 November 2026 after Milestone 4. Status: manual gameplay save foundation implemented; resilience and gameplay file transfer remain planned. Prerequisite: [Milestone 8](milestone-08-restoration-and-energy-choices.md), building on [Milestone 4](milestone-04-first-local-save.md).

Add autosaves, recoverable revisions, schema migrations, and downloadable backups. A failed write or invalid import must leave both the active world and the last good save usable. Accounts and cloud synchronization remain outside this prototype.

The 9 November [M8 save decision](milestone-08-restoration-and-energy-choices.md#agreed-scope-and-decisions--9-november-2026) binds saves to exact authored-map revision/content. No deployed build exists and M7/old-map saves need no migration. Notify the player and reject a changed-map save before candidate loading; do not use these future format migrations/imports to bypass map compatibility. Older-format migration fixtures, when implemented here, must remain on a compatible authored map unless that product policy is explicitly changed.

[High-level plan](README.md) · [Next milestone](milestone-10-portfolio-prototype.md)

## Current implementation

Milestone 4 implements one schema-1 manual slot through SaveRepository, atomic payload/metadata transactions, overwrite tokens, candidate worker/scene/UI restore, visible handcraft continuation and real production IndexedDB reload tests. Storage failures are surfaced and the last committed save is preserved. Autosave, retained revisions, schema migrations, gameplay import/export, persistent-storage requests and factory-state coverage remain this milestone's work. The isolated developer dialog's test-record transfer is not gameplay backup or resilience credit.

## Save-performance decision — 8 November 2026

Save-format optimization is deferred. Keep the current object representation through Milestones 5–8 while extending snapshots and continuation tests for each new system. Revisit the [exploratory save-format results](../reports/save-formats/2026-11-08/README.md) here when introducing autosaves, retained revisions and migrations, then qualify representative factory performance in [Milestone 10 Step 4](milestone-10-portfolio-prototype.md#step-4-measure-and-address-performance). A broader format redesign may remain deferred until after Milestone 10 if the prototype meets its agreed performance and storage budgets.

Review mixed operating worlds with realistic inventories, machine buffers, transport and moving physics. Separate capture, validation/copying, encoding, IndexedDB transactions and worker reconstruction; entity count alone does not describe the workload. Binary physics storage is a candidate for review, not an approved implementation. Bring a targeted optimization forward only for measured gameplay interruptions, unacceptable save/load latency or excessive revision storage. Keep representation changes behind the repository/codec and versioned migration boundaries. Performance benchmarks remain manual and outside CI; CI runs correctness tests and build checks.

## Step 1 Audit the complete saved state

- [ ] Revisit the snapshot checklist for every field introduced through restoration.
- [ ] Include MiniFab subsystem/upgrade ownership, target/precursors, local charge/capacity, power-source state and automation policies where implemented, research contributions/work and lab coordination, extraction/production histories, machine/fuel jobs, reservations, pending random output and PRNG state, sorting/conveyor progress, energy, water, weather/events, pollution, restoration and objective counters. Exclude active winding gestures and device permission/handle state.
- [ ] Validate entity/content references, capacities, finite ranges, stable IDs, and next-ID state.
- [ ] Confirm load reconstructs runtime indexes and renderer mappings rather than saving those objects.
- [ ] Repeat continuation comparisons with a representative operating factory before adding recovery features.
- [ ] Revisit the deferred save-format benchmark with representative mixed factory/physics state; record phase costs and whether the current representation should be retained or a specific bottleneck investigated.

## Step 2 Retain committed revisions

- [ ] Define revision identity, parent/previous revision metadata, and a small explicit retention policy.
- [ ] Write the new snapshot, metadata, and revision pointers in one transaction.
- [ ] Retain the last committed revision if the new transaction fails; prune only according to a successful commit policy.
- [ ] Keep a previous autosave revision available for recovery.
- [ ] Let the player inspect/select a previous revision without overwriting the current one merely by opening the recovery UI.
- [ ] Define how resumed play saves after recovery, preserving the previous revision until the retention policy permits removal.
- [ ] Measure representative retained-revision storage before settling the retention policy; change encoding only if measured storage needs justify it.

## Step 3 Add autosave scheduling and operation safety

- [ ] Choose an autosave interval based on elapsed active session time and document behavior while explicitly paused.
- [ ] Capture only completed states and bind each request to its original slot, world, and session generation.
- [ ] Prevent redundant queued autosaves from growing without bound; retain the latest useful request for the same session as appropriate.
- [ ] On load, suspend new autosaves and gameplay input, finish in-flight persistence work, and discard stale queued autosave captures.
- [ ] Pause the simulation for candidate loading and replacement, then restore the prior pause/visibility state.
- [ ] Ensure a newer world session cannot be written by an old request or reported as saved by an old completion callback.
- [ ] Show autosave success/failure without interrupting routine play; do not claim an in-flight write is committed.
- [ ] Measure autosave capture/write latency and main-thread responsiveness during play; address disruptive pauses or excessive storage with a targeted change only when demonstrated.

## Step 4 Implement schema migrations

- [ ] Define supported save versions and sequential migration functions from older versions.
- [ ] Enforce exact authored-map compatibility independently of save-format support. A format migration cannot silently transplant an old run onto a changed map; explain invalid-map saves before attempting candidate load.
- [ ] Keep database schema upgrades separate from gameplay snapshot migrations.
- [ ] Migrate a detached copy and never modify the stored source revision during validation.
- [ ] Validate the migrated result against current state and content invariants before use.
- [ ] Reject unsupported newer schemas with a specific explanation.
- [ ] Define how content IDs or timing assumptions change across versions rather than guessing replacements.
- [ ] Keep representative older-version fixtures and test migration through all required steps.

## Step 5 Add JSON export and import

- [ ] Export a chosen valid committed snapshot with a recognizable filename and versioned envelope.
- [ ] Parse imports as untrusted data and use the same migration, validation, and candidate-construction path as loading.
- [ ] Create a new slot for an accepted import; do not silently overwrite an existing run.
- [ ] Report parse, unsupported-version, validation, and storage failures clearly.
- [ ] Make importing and activating a run deliberate actions so inspecting a file cannot unexpectedly replace play.
- [ ] Verify exported/imported continuation, including research, transit, fuel, water, and restoration progress.

## Step 6 Handle browser storage limits

- [ ] Explain which browser origin owns the saves and that clearing site data removes them.
- [ ] Handle quota, unavailable storage, and failed transaction errors without destroying the session.
- [ ] Provide downloadable backups and describe how to restore them through import.
- [ ] Treat persistent-storage permission as an optional browser capability; a successful request does not replace backups.
- [ ] Keep storage capability queries and permission requests inside the browser adapter/application boundary.
- [ ] Preserve the repository boundary for a future cloud adapter without adding accounts or synchronization now.

## Step 7 Verify recovery and races

- [ ] Inject write failures before commit and confirm the last good revision remains loadable.
- [ ] Test malformed JSON, invalid references, unsupported newer saves, and migration errors with the active world unchanged.
- [ ] Test a supported older fixture through migration and continued simulation.
- [ ] Queue rapid manual saves, autosaves, loads, and new-world requests; verify slot/world binding and stale-request rejection.
- [ ] Recover a previous autosave, resume play, and confirm revision handling follows the retention policy.
- [ ] Export and import a real browser save into a new slot, then compare continuation with the original branch.

## Completion checks

- [ ] Autosaves record committed progress without racing world replacement.
- [ ] A failed write preserves the last successful save.
- [ ] Previous revisions can be recovered without accidental overwrite during inspection.
- [ ] Supported older saves migrate; unsupported or invalid data is rejected safely.
- [ ] A full run can be backed up and restored through JSON.

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

## References and diagrams

- [Save flow diagram](README.md#save-flow-diagram)
- [Load flow diagram](README.md#load-flow-diagram)
- [Save format and loading](../design/TDD.md#save-format-and-loading)
- [File backups and browser storage limits](../design/TDD.md#file-backups-and-browser-storage-limits)
- [Future cloud persistence](../design/TDD.md#future-cloud-persistence)
