# Milestone 4 First local save

Implemented 8 November 2026 following the user's authorization. The six packages deliver schema-1 manual saves, separate run identity, transactional IndexedDB storage, guarded worker/scene/UI replacement and the agreed Continue/crafting/confirmation flow. [Implementation and verification evidence](../reports/milestone-04/2026-11-08/README.md) records local checks; hosted CI is the final publishing gate and its exact run is recorded in Fibery. Prerequisite: [Milestone 3](milestone-03-character-and-manual-opening.md).

Deliver one manual local save slot for the implemented opening, including MiniFab precursor work, Field Research, inventory and worker-owned physics. Keep persistence behind an interface for a future adapter. Autosaves, retained revision history, file transfer and schema migrations belong to [Milestone 9](milestone-09-save-resilience.md); accounts/cloud synchronization and later gameplay remain outside this milestone.

[High-level plan](README.md) · [Next milestone](milestone-05-research.md)

## Groundwork audited before implementation

| Boundary              | Verified source and current behavior                                                                                                                                                                                                                | Milestone 4 work                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening               | [Opening report](../reports/milestone-03/2026-11-02/README.md); player bag/tool, salvage/piles, five technologies, six recipes, handcrafting, MiniFab and winding execute in one worker.                                                            | Persist the implemented state without introducing upgrade recipes, factories or labs.                                                                           |
| World capture         | [SimulationSnapshot](../../src/contracts/simulation.ts) version 3 and [Simulation.capture()](../../src/simulation/ecs-runtime.ts) detach definition, component/resource data and physics. Fresh-runtime reconstruction and continuation are tested. | Add a durable envelope and codec around this boundary; neither a WorldView nor Editor scene serialization is a gameplay save.                                   |
| Session capture       | [GameSession.capture()](../../src/session/game-session.ts) settles in-flight work. Its internal SimulationCapture also contains command ledger/pending commands.                                                                                    | Save only completed world state; discard pending input/commands and initialize a new session ledger on player load.                                             |
| Physics               | [Rapier continuation](../../tools/world/README.md#physics-ownership-and-continuation) uses format-3 native state, stable body identity and vertical velocity with pinned Rapier 0.21.0.                                                             | Preserve native contact/stack continuation; reject incompatible formats/engines before replacing the active session.                                            |
| Application ownership | [GameSessionOwner](../../src/app/features/game/game-session-owner.ts) creates/disposes worlds; renderer Retry can retain a healthy session. initialize() clears input/timing, and normal pause/input clearing interrupts handcrafting.              | Add candidate preparation and guarded replacement; the existing initialize/dispose path cannot provide failure-safe load or handcraft resumption unchanged.     |
| Storage and UI        | Controls have separate IndexedDB settings; the production pause menu had no gameplay saving at review time.                                                                                                                                         | Introduce a gameplay repository/database and production UI while preserving settings.                                                                       |

Before implementation, baseline checks on 8 November: strict game-suite and independent-reference TypeScript checks, all **106 Node simulation/session tests** and all **356 Angular/renderer/accessibility tests** pass; the documentation check passes. These establish the current opening/capture baseline, not gameplay IndexedDB acceptance.

## Agreed player behavior

The user selected these behaviors on 8 November 2026:

- Show **Continue** when the manual slot exists, alongside **New Game**. Read committed slot metadata at startup; loading is explicit. Continue uses the same validated load path as the in-game action.
- Restore unfinished handcrafting by reopening the field kit's **Inventory & Crafting** panel with its saved recipe, unit/batch and remaining work. Resume only when that UI is ready and ordinary pause/visibility rules permit simulation. Never consume the saved unit's ingredients again or run it invisibly.
- Ask before Load or New Game discards unsaved session progress, and before Save overwrites a slot belonging to a different run. Make deletion explicit and confirmed. Repeated saves of the same run need no overwrite prompt.
- New Game creates a new run and starts empty-handed; it does not erase or overwrite the committed slot until the player saves. Returning from the main menu to a retained live session must not silently create a fresh run.
- Keep one manual slot. Explain that storage belongs to this browser profile/origin and that loading adds no offline production.

## Snapshot field checklist

Use the existing plain capture schema as the world payload. The durable envelope starts at its own schema version; it is independent of simulation snapshot version 3, physics format 3, worker protocol 2 and the IndexedDB schema.

| Data                      | Persist or reconstruct                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save identity             | Envelope schema, compatible content version, authored-world identity, a separate stable runId, savedAt and a committed write token. Slot identity is the storage location; runId survives load. The current resources.worldId equals definition.id and does not identify a unique playthrough. Create run IDs/metadata outside deterministic simulation.                                                                                     |
| Definition and resources  | Detached compiled WorldDefinition, world/player IDs, tick, 0.05-second step, next entity/job ID counter, production/extraction totals and each technology's consumed materials, partial work and unlock. Match the saved authored definition to the supported shipped world before binding its presentation.                                                                                                                                 |
| Player and ground         | Position/facing, physical state, exact 24 bag slots/stacks, equipped tool, onboarding moved flag; remaining deposits and ground-pile stable IDs, types, quantities and positions including elevation. Preserve any supported development placement entities in explicit fixture tests only.                                                                                                                                                  |
| Opening work              | Handcraft ID/recipe, original committed inputs, remaining seconds and units left; Field Research target/enable state; MiniFab ownership, requested recipe/count, current precursor/job, input/output residue, outputRecipe, charge, windBudget, base capacityLevel/gearing and status. Current validators require both upgrade levels to be zero.                                                                                            |
| Physics                   | Engine/version, format, native bytes, bodyIds in native iteration order and player vertical velocity. Preserve dynamic/kinematic state and native configuration; rebuild private ECS/native mappings.                                                                                                                                                                                                                                        |
| Content and derived state | Reference immutable opening content by compatible version; do not duplicate current stack limits, reach, recipe graph or buffer/charge rules as mutable save fields. Recompute precursor choices and material/capacity waits from committed state. Later configurable capacities/upgrades extend this checklist when implemented.                                                                                                            |
| Transients                | Exclude pending commands, transport ledger/IDs, publication/cache mappings, held input, active winding gesture, loop timestamps/elapsed credits, camera/selection, notifications, dialogs and renderer/service objects. Stop active salvage intent and movement on load. Physical velocity needed for continuation remains persistent. Reconstruct handcraft UI ownership explicitly rather than trusting saved visibility/suspension flags. |

## Step 1 Define the snapshot contract

- [x] Define SaveSnapshot and slot metadata independently of storage, Angular, Babylon and authentication; identify run, authored world, content and every supported version explicitly.
- [x] Reuse SimulationSnapshot as the detached world payload. Keep SimulationCapture's ledger/pending commands internal; a gameplay restore supplies an empty queue and fresh counters.
- [x] Implement a versioned codec that accepts unknown data, bounds payload sizes and validates the envelope before constructing a candidate. Reuse/strengthen existing world, opening and physics validation instead of building a competing world model.
- [x] Support only the first durable schema and exact compatible content/physics versions initially. Reject older/newer/incompatible data with a useful reason and preserve it; never silently reset storage or rebuild native state from visible poses.
- [x] Enforce cross-field invariants: one correctly equipped player, valid component ownership/entity/content references and positions, unique entity/job IDs, safe quantities/next-ID state, research prerequisites/contribution/work bounds, recipe unlocks, protected handcraft inputs/output space and legitimate MiniFab request/buffer/charge state.
- [x] Define load normalization for movement/salvage intent and handcraft UI ownership without advancing time, spending ingredients, producing output or refunding a resumable handcraft unit. Use wall-clock time only for metadata.
- [x] Turn the field checklist above into capture/validation/continuation cases; extend it with future persistent state.

## Step 2 Create the persistence boundary

- [x] Define SaveRepository operations to list slot metadata, save, load and delete the one manual slot; keep plain contracts separate from the browser adapter.
- [x] Add an in-memory adapter for deterministic orchestration/failure tests and a Dexie/IndexedDB adapter for browser storage, composed at the application boundary.
- [x] Use a gameplay-specific database/table namespace and preserve controls settings.
- [x] Write payload and metadata atomically; resolve success only after transaction commit. A failed replacement write must leave the previous committed save loadable.
- [x] Use a committed write token for overwrite checks and status, without implementing retained revision history. Recheck the slot token/run within the transaction so a changed slot requires refreshed confirmation rather than silently overwriting a different run.
- [x] Surface missing/unavailable storage, blocked database upgrades, denied access, aborted transactions and quota failures. A list/read failure is not an empty slot; release database connections on teardown.

## Step 3 Capture and queue save operations

- [x] Serialize save/load/delete/new-world operations in gameplay SaveService (or an explicitly named coordinator). Bind requests to their original slot, run and session generation; renderer generation is a separate lifecycle.
- [x] Expose a save operation usable during handcrafting for Step 5's production action. Capture without the normal work-exit/pause path canceling its unit; a pause-menu-only action cannot establish mid-handcraft saving.
- [x] Reuse the asynchronous capture boundary: settle accepted in-flight work and take a detached completed world (including tick zero or while paused). Do not advance an extra tick or replay pending commands to make a save.
- [x] Preserve the active session/work while capturing; allow it to continue once detached data is handed to asynchronous storage.
- [x] Reject stale not-yet-captured requests after world replacement, New Game or route teardown. Finish an already-detached write against its original binding, but never let its late result rebind the current run or mark newer progress saved.
- [x] Derive unsaved status from the current run/generation and captured completed-state boundary versus the last committed save. Continued simulation after capture remains unsaved; reading metadata or failing a write must not clear that status.
- [x] Expose saving/saved/failed states and last committed time accessibly; disable only operations that conflict with the coordinator.

## Step 4 Validate a candidate before loading

- [x] Complete earlier storage operations, confirm any unsaved-progress loss, then hold gameplay credits/commands under a load guard. Keep the active session, its prior activity/UI state and its data available until commit.
- [x] Separate quiescing for load from forced activity interruption: current clearInput()/setPaused() calls can cancel/refund handcrafting. Loading failure must preserve that job and its protected inventory, not merely retain the old session object.
- [x] Read and validate the slot, durable envelope, compatible content and authored definition. Treat stored data as untrusted, even when written by this app.
- [x] Prepare a separate candidate worker/session, restore validated world/native state with fresh command counters, and await readiness plus the first complete presentation publication. Candidate failure must never poison the active worker.
- [x] Stage the required presentation and handcraft UI binding before committing replacement. Require the supported authored layout, not just a matching world ID; unsupported layout/asset or UI preparation failure keeps the current world usable.
- [x] Restore saved handcraft work with its crafting panel visible before the first active tick. Keep normal intentional-exit warning/refund behavior after load, and make forced interruption safe once. Resume background research/MiniFab under existing spending priority without catch-up, repayment, duplicate delivery or repeated completion notifications.
- [x] Commit through GameSessionOwner only after preparation succeeds; change session generation and active run/slot together, clear old input/commands/winding/selection/watchers/events, rebuild renderer mappings/interpolation, reset elapsed clocks and release the old authority/subscriptions.
- [x] Restore the prior running/paused state subject to current focus/visibility/dialog rules. Startup Continue enters the loaded game when ready; a paused in-game Load stays paused. No hidden time is replayed.
- [x] On missing, invalid, incompatible, unreadable or unconstructable data, dispose only the candidate, restore the old activity/UI state, keep the slot intact and announce the reason.

## Step 5 Add the manual save interface

- [x] Replace the startup Play action with New Game and conditional Continue; distinguish retained-session resume from creating a new run. Show checking/error/empty/available slot states without blocking New Game on a storage error.
- [x] Add production Save/Load/Delete controls and a save action usable while the crafting panel is active.
- [x] Show active run/slot, last committed save time, current unsaved state and operation feedback. Loading/deleting a missing slot gives a clear result.
- [x] Confirm only when unsaved progress would be discarded by Load/New Game, or a different run would be overwritten by Save; explicitly confirm deletion. Starting a new run leaves the committed slot intact.
- [x] Make operations usable while paused and handle failed Continue without trapping the player. Restore focus and dialog/input ownership correctly after success, cancellation or error.
- [x] Follow existing Angular 22 signals, external templates and application-owned RxJS lifecycle handling; run keyboard/focus, narrow viewport and AXE/WCAG AA checks.
- [x] Explain local browser/origin ownership and no offline production. Do not add autosave, import/export, cloud accounts or later upgrade progression.

## Step 6 Verify round trips and failure handling

- [x] Prove detached capture stays unchanged while the original world advances; compare saved/restored branches with equal normalized intent, commands and ticks.
- [x] Save mid-handcraft without triggering cancellation, reload and show its crafting panel before advancing. Verify remaining work, original committed inputs and batch count; complete once, then separately exit/cancel/refund once after load.
- [x] Save mid-MiniFab precursor, with held output/full bag, cancellation residue and depleted/partial charge; restore direct reuse/delivery/recovery, base 1x work and rate allowance without duplication or repricing.
- [x] Save partial/paused/material-waiting Field Research, switch targets and continue; verify contributions/history/unlocks and manual → MiniFab → research priority remain exact.
- [x] Preserve ground quantities/elevation and extraction totals, equipped tools and ID allocation; include empty/new tick-zero worlds and physics falling/contact/stack/mover continuation through the durable codec.
- [x] Reject malformed/oversized payloads, unsupported versions/definitions/engines, inconsistent references/research/jobs/buffers and invalid native bytes before replacement. Check the active job/inventory/worker remains unchanged and playable.
- [x] Inject read/write/delete/commit/candidate failures and a changed overwrite token with the in-memory adapter; retain the last good save and release temporary workers/resources.
- [x] Queue rapid saves/loads/deletes/New Game around replacement, renderer Retry, teardown and visibility changes; reject stale requests/replies and prevent late success from clearing newer unsaved progress.
- [x] In a built production browser using real IndexedDB: New Game → progress → Save → full page reload → Continue → verify restored state → Load while paused → Delete → reload. Verify missing/corrupt slots, confirmation cancel/accept, separate-run overwrite and settings independence.
- [x] Extend existing event-driven browser acceptance using committed-operation/worker/frame readiness signals, not readiness sleeps. Run strict types, game/tooling/browser tests, lint, production build, worker-boundary/assets/docs checks and native/delayed-frame Retry acceptance.

## Completion checks

- [x] A full browser reload restores every currently implemented persistent field and compatible physical continuation from the manual slot.
- [x] Saved handcraft resumes visibly; MiniFab/research continue exactly once and no offline progress or stale input appears.
- [x] Failed or canceled load/New Game preserves the current session, work and input/pause ownership.
- [x] A failed save leaves the previous committed slot usable; late results cannot mislabel current progress as saved.
- [x] Continue/New Game/Save/Load/Delete and agreed confirmations work accessibly in the production build.
- [x] Real IndexedDB acceptance passes alongside deterministic repository/orchestration tests; reconcile repository and Fibery credit from evidence.

## Verification notes and implementation order

Delivered in six existing packages: **M04.1** durable contract/worker normalization; **M04.2** atomic repository adapters; **M04.3** serialized bound operations; **M04.4** prepared replacement and rollback; **M04.5** production UI; **M04.6** invariants, failure injection and built-browser acceptance. The report links the implementation and local evidence. Fibery workflow completion is finalized against the hosted CI result.

| Date            | Evidence or decision                                                                                                                                                                                                               | Limit / follow-up                                                                                                                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23 October 2026 | [Controls reload evidence](../reports/migration/2026-10-23/README.md).                                                                                                                                                             | Settings only; no gameplay save credit.                                                                                                                                                                                                                    |
| 2 November 2026 | Opening implementation and later worker-owned Rapier capture/rebuild groundwork.                                                                                                                                                   | Existing internal continuation is reusable; it is not committed gameplay storage or safe application replacement.                                                                                                                                          |
| 8 November 2026 | Clean master 1f463f9 reviewed. Both strict game/reference TypeScript checks, 10 Node files / 106 tests and 35 Chromium files / 356 tests pass. Baseline docs check: 66 documents, 705 local links, 8 diagram sources, no failures. | Installed tool entry points ran directly because pinned Yarn bootstrap was unavailable in the network-restricted sandbox. Chromium used the installed browser cache outside the sandbox for localhost access. No new built gameplay-save route is claimed. |
| 8 November 2026 | User chose Continue + New Game, visible handcraft resume, and confirmation before unsaved-progress loss/different-run overwrite.                                                                                                   | Implemented throughout the production flow; source checklists and Fibery identities are preserved.                                                                                                                                                         |

## Delivered implementation

- Plain save contracts: `src/contracts/save.ts`; bounded codec and repository/coordinator adapters: `src/persistence/`.
- Full untrusted gameplay validation and intent normalization stay in `src/simulation/player-save.ts` inside the worker; the main graph imports no simulation implementation.
- GameSession holds preserve work; GameSessionOwner prepares/commits a candidate. Babylon prepares an independent scene and first frame; Angular stages saved crafting UI before replacement.
- Save progress is available in the active field-kit header. Save/load/delete also live in the compact toolbar and pause menu. Startup offers New Game, conditional Continue and retained-session Resume separately.
- Native winding samples, stale notices, old input/commands and selection do not cross world replacement. Developer placement buildings are explicitly rejected before saving; controls retain their own store.
- Unsupported schemas/content/physics/layouts are retained and rejected. Autosave, migrations, retained revisions and transfer remain Milestone 9.

## References and diagrams

- [Save flow diagram](README.md#save-flow-diagram) and [Load flow diagram](README.md#load-flow-diagram) show the shared persistence direction, including later Milestone 9 extensions.
- [Persistent game state](../design/TDD.md#persistent-game-state), [save format and loading](../design/TDD.md#save-format-and-loading) and [future cloud persistence](../design/TDD.md#future-cloud-persistence).
- [Opening progression and handcraft rules](../design/player-progression.md).
