# Milestone 4 First local save

Updated 27 October 2026 for the expanded Milestone 3. Status: gameplay persistence unimplemented; controls-settings persistence verified separately. Prerequisite: [Milestone 3](milestone-03-character-and-manual-opening.md).

Implement one manual local save slot that restores the research-led opening, including Mini Fabricator precursors and field research in progress. Keep persistence behind an interface so a future cloud adapter can be introduced without changing game rules. Autosaves, revisions, and file transfer arrive in Milestone 9. See the [progression requirements](../design/player-progression.md).

[High-level plan](README.md) · [Next milestone](milestone-05-research.md)

## Current implementation

Dexie is installed, and `src/app/features/save/` contains a test-data service and a CDK save/load dialog. They store `name`/`value` records, not gameplay snapshots. Writes are not awaited by `save()`, `load()` logs rather than restores a world, and dialog occupancy is in-memory. There is no SaveRepository, versioned codec, detached snapshot, world-replacement boundary, or verified reload round trip. Keep the snapshot and transaction requirements below open.

Migration added plain authoritative `WorldState`, detached presentation views and a separate controls-settings IndexedDB adapter. The [23 October browser evidence](../reports/migration/2026-10-23/README.md) verifies bindings survive page reload, including modifier capture. That proves settings persistence only. Neither `WorldDefinition` (initial authored layout) nor `WorldView` (presentation state) is a gameplay save format. Save/test-data controls are absent from the production game menu. Every gameplay snapshot/restore checklist item below remains pending.

## Step 1 Define the snapshot contract

- [ ] Build on the Milestone 3 ECS capture/rebuild contract: persist stable game IDs and plain component/resource data, never ECS queries/indexes/observers or renderer objects. Rebuild a fresh runtime and ID mappings before world replacement; test continuation without duplicate production/research/refunds.
- [ ] Define a `SaveSnapshot` envelope with schema version, content version, world ID, saved timestamp, and detached gameplay state.
- [ ] Keep slot identity and revision metadata explicit; a slot is a storage location, while a world ID identifies the run.
- [ ] Include ground resource IDs/item types/quantities/positions, bag capacity, equipped-tool state, interaction reach and per-item stack definitions/content version alongside position, deposits, inventories, MiniFab subsystem/tool ownership, selected target/batch, precursor plan, stored active-boost seconds/capacity, gearing/battery upgrade levels, crafted/applied upgrade state, input/output buffer contents/capacities, current operation, cancelled recipe/input-type residue, reservations, blocked reasons/outputs, active crafting work, production/extraction histories, per-technology consumed research contributions/partial work, active field technology and enabled/material-wait state, unlocked technologies, tick, fixed-step version or duration, and the next entity-ID counter.
- [ ] Exclude browser timestamps used by the loop, command queues, held keys, selected panels, services, meshes, materials, scene handles, and attached presentation components.
- [ ] Never resume a handcraft job invisibly after load/world replacement: if its UI is absent, cancel/refund its unfinished unit exactly once while preserving completed output/history, before enabling Field Research draws, other inventory writers or MiniFab deliveries. Background research resumes from its saved enable/target/progress state on simulation steps, without offline catch-up or re-consuming invested items. MiniFab background work retains its separate continuation rules.
- [ ] Write a field checklist for capture and validation. Extend it whenever later milestones add persistent state.
- [ ] Use wall-clock time only for save metadata, not to advance gameplay after loading.

## Step 2 Create the persistence boundary

- [ ] Define `SaveRepository` operations to list slots, save, load, and delete snapshots.
- [ ] Keep repository types independent of Dexie, browser UI, and future authentication.
- [ ] Implement an in-memory adapter for deterministic orchestration tests and a Dexie/IndexedDB adapter for real browser storage.
- [ ] Store snapshot and slot metadata together in a transaction so the list cannot advertise an uncommitted save.
- [ ] Resolve save success only after the transaction commits and propagate typed or clearly handled failure results.
- [ ] Keep browser-specific database configuration in the adapter, injected at application composition.

## Step 3 Capture and queue save operations

- [ ] Capture a detached state at a completed simulation-step boundary, or use the latest completed state while paused.
- [ ] Bind each request to its intended slot, world, and session generation when requested.
- [ ] Serialize persistence operations in `SaveService`; a load and save cannot race to rebind the active slot.
- [ ] Increment the session generation when the active world is replaced and reject queued captures belonging to an old generation.
- [ ] Allow gameplay to continue after capture while the detached snapshot is written asynchronously.
- [ ] Show saving, saved, and failed states; update the saved timestamp only after committed success.

## Step 4 Validate a candidate before loading

- [ ] Treat repository data as untrusted input and validate its envelope and supported schema/content versions.
- [ ] Validate finite numbers, nonnegative quantities, valid positions, unique entity IDs, content IDs, and all referenced entities.
- [ ] Validate crafting reservations and remaining work so a restored job cannot consume ingredients again or finish twice.
- [ ] Validate MiniFab dependency/stack/capacity limits, held finished output and field-research progress. Restore inventory-full pause/delivery exactly once without re-consuming inputs, bypassing player priority, duplicating ground pickups or paying twice.
- [ ] Validate local MiniFab charge/capacity and upgrade ownership separately from research. Do not save active pointer/stick winding gestures or restore them as charge input; depleted charge must still allow baseline crafting.
- [ ] Construct a complete candidate world separately from the active one.
- [ ] Pause gameplay and command input during replacement, preserving the prior pause state and browser visibility rules.
- [ ] Replace the world only after validation and construction succeed. Then clear old commands and held input, reset the loop clock, and rebuild views and renderer mappings.
- [ ] On missing data, read failure, or invalid data, preserve the current world and explain the failure.

## Step 5 Add the manual save interface

- [ ] Provide a clearly labeled manual save and load action for the first slot.
- [ ] Show which slot and run are active, along with last committed save information.
- [ ] Make slot deletion explicit and handle a subsequent attempt to load a missing slot.
- [ ] Keep save actions usable while paused and disable conflicting requests only when the service requires it.
- [ ] Explain that the save belongs to this browser origin and that there is no offline production.

## Step 6 Verify round trips and failure handling

- [ ] Capture a snapshot, continue playing, and prove the captured data remains unchanged.
- [ ] Save mid-craft, reload, and finish with exactly one output commit and no second ingredient charge.
- [ ] Save mid-precursor and mid-field-research, then compare continued inventory, histories, job completion and unlocks against the original branch.
- [ ] Compare original and restored copies after the same commands and ticks.
- [ ] Test missing slots, malformed snapshots, unsupported versions, and failed writes with an in-memory adapter.
- [ ] Queue save/load requests around world replacement and verify no stale request writes the wrong world to a slot.
- [ ] In a browser, save, reload the page, restore, and delete the slot using actual IndexedDB.

## Completion checks

- [ ] Reload restores every persistent field introduced so far.
- [ ] A paused save and a mid-craft save both continue correctly.
- [ ] Load failure leaves the playable current session intact.
- [ ] Save failure leaves the last committed slot usable.
- [ ] A real IndexedDB round trip succeeds, in addition to repository unit tests.

## Notes and implementation issues

| Possible issue                                    | Implementation guidance                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A shallow copy changes while storage is writing   | Capture detached nested data synchronously before awaiting the repository.                                                        |
| The active slot changes while a request is queued | Retain the request's original slot/world binding and session generation; do not reread a mutable active-slot field at write time. |
| Invalid data partially replaces the world         | Build and validate the complete candidate before the replacement boundary.                                                        |
| Loading recreates old held movement or commands   | Treat those as session input and clear them during replacement.                                                                   |
| Local saves appear missing on another URL         | IndexedDB is scoped to the browser origin. Use the same origin for this milestone; file transfer is added later.                  |

Record implementation notes here:

| Date            | Observation or decision                                                        | Follow-up and status                                                                                                             |
| --------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 4 October 2026  | Persistence scaffold only; current source inspected.                           | See Current implementation above; unchecked gameplay requirements remain open.                                                   |
| 23 October 2026 | Controls settings survive real IndexedDB reload; world/session data now exist. | No gameplay persistence credit: snapshots, transaction semantics, world restore and mid-craft continuation remain unimplemented. |

## References and diagrams

- [Save flow diagram](README.md#save-flow-diagram)
- [Load flow diagram](README.md#load-flow-diagram)
- [Core class diagram](../design/TDD.md#core-class-diagram)
- [Persistent game state](../design/TDD.md#persistent-game-state)
- [Future cloud persistence](../design/TDD.md#future-cloud-persistence)
