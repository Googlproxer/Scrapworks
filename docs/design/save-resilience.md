# Gameplay save resilience

Implemented for [Milestone 9](../plans/milestone-09-save-resilience.md), 9 November 2026. Angular owns the controls/browser capabilities, SaveCoordinator owns serialized application operations, Dexie owns committed local revisions, and the existing simulation worker validates and reconstructs gameplay/native state. No offline time advances.

## Format and compatibility

| Boundary | Supported representation |
| --- | --- |
| Durable envelope | Schema 2, the first M9 baseline. Schema 1 is unsupported; newer schemas receive a specific explanation. |
| World/content | World 3 and current `restoration-1`. Known earlier content converters remain exercised by synthetic fixtures using the current envelope; this does not promise support for pre-M9 player files. |
| Authored map | Exact canonical authored-definition equality, independent of run identity/content conversion. Check before constructing any candidate worker or scene, including import preflight. |
| Native physics | Physics format 3, Rapier 0.21.0 and validated native bytes/body ownership. Incompatible native versions are rejected, not approximated. |
| Browser database | Dexie version 2. Keep the old `slots` table untouched until explicit deletion. New `runs`, `revisions` and `payloads` tables separate head concurrency, readable metadata and payload storage. |

The envelope records slot/run/token, display name, manual/auto kind, monotonic per-run sequence, prior commit token, recovered-source token, optional import origin, captured tick, committed timestamp, world/content/native identifiers and canonical map identity. Names are labels; they never select or merge identities. The world remains an ordinary object with numeric native bytes. No compression/binary redesign was selected.

`save-migrations.ts` defines a detached sequential pipeline with an identity path for schema 2. There is no real older M9 schema to migrate yet. Labelled synthetic tests exercise ordering, missing steps, intermediate validation and failures without claiming historical support. Database upgrades, envelope migrations, known content conversion and exact map/native compatibility remain separate checks.

Object member order has no gameplay meaning. Geometry, positions, body definitions and committed ingredients use structural comparisons; array ordering remains significant where required. Reordering JSON object keys cannot invalidate an otherwise identical backup or change its continuation.

## Snapshot field audit

`Simulation.capture()` copies the complete resources/components and native capture at a completed boundary. The following inventory covers the current contracts; it is not a second serialization whitelist. New fields must be added to the owning contract validator and its continuation fixture.

| Saved field/group | Validation/reconstruction owner | Continuation and failure evidence |
| --- | --- | --- |
| `version`, `contentVersion`, `definition` | `save-codec.ts`, `capture.ts`, `core/authored-map.ts`; runtime compares shipped map before preparation | `gameplay-save.test.ts`, changed-map runtime test, factory/transport/environment codec fixtures |
| Resources `worldId`, `playerId`, `tick`, `stepSeconds`, `nextEntityId` | `capture.ts`, `player-save.ts`; references and all allocated job/edge/entity suffixes checked | Durable malformed-state tests, stable identity and native continuation |
| Entity `id`, `kind`, `transform` including position/facing/rotation | `capture.ts` and native pose/body checks; ECS indexes, slots/generations and presentation mappings rebuilt | Falling/stacked/moving-body tests; real candidate scene/UI rollback |
| Inventory slots/stack quantities, equipment, deposit kind/remaining quantity, ground piles | `capture.ts`, `player-save.ts`; content/capacity/reach/ownership checks | Ground-pickup/extraction and factory/recovery fixtures; no duplicate extraction/production credit |
| Opening toolbar slots/active selection; salvage target/work; `moved` | `opening-capture.ts`, `player-save.ts`; validate saved work, clear held salvage/movement intent on player restore | Toolbar, salvage and durable player-restore tests |
| Handcraft `id`, recipe, remaining work, invested inputs, units left and visibility/suspension flags | `opening-capture.ts`, `player-save.ts`; resume invested unit only after restored crafting UI is ready | Exactly-once/refund and visible production Save/reload/pause-load acceptance |
| MiniFab owned/request/job/input/output/outputRecipe/charge/capacityLevel/gearing/windBudget/status | `opening-capture.ts`, `player-save.ts`; deferred upgrade levels remain zero | Durable precursor/charge/rate-budget/native tests; controlled mixed-factory continuation |
| Research queue, fieldEnabled and each ledger's consumed/work/unlocked; production/extraction totals | `opening-capture.ts`, `player-save.ts`, `factory-capture.ts`; prerequisites, eligibility, payment/work ranges and lab coordination | Research material waits, known detached content fixtures, factory shared-lab tests and mixed partial research |
| Machine utility/enabled/recipe/deposit/input/output/job/random/requested/allocated/status; job inputs/outputs/outputCommitted; recycler state/sequence/cursor | `factory-capture.ts`, `player-save.ts`; recipe/technology/capacity/accounting invariants | `factory.test.ts`, output-commit and recycler/random continuation fixtures |
| Power connections, transport connections/cooldowns/lastItem/cursors; segment turn/filters/units/item/progress/lane/status | `factory-capture.ts`, `transport-capture.ts`; strict ports, topology, capacities and references | `transport.test.ts`; controlled full/partial transit and backpressure in M9 local native profiles |
| Environment health/sources/weather/connections/nextUpdate/completed/completedTick | `environment-capture.ts`; cells/ranges, cadence, latched checkpoint, lake identity and conservation | `environment.test.ts`; mixed source/quality, saved weather/frontier and native M9 continuation |
| Source id/cells/volume/extracted/consumed/returned/refilled/transferredIn/transferredOut; water batches source/volume/quality | `environment-capture.ts`, water conservation rules | M8 source-attribution fixtures, corrupt water rejection and continued mixed pipe/tank state |
| Utility water/clean/source/overflow/charge/fuelEnergy/phase/transition/hold/positive/negative/generated | `environment-capture.ts`; source pools, buffers, coal/battery bounds and budgets | Environmental native fixtures, battery/fuel/ramp tests, M9 coal/restoration profile |
| Weather random/kind/endTick/nextKind/nextTick/nextDuration | `environment-capture.ts`, deterministic weather rules | Saved seeded sequences and event-boundary continuation |
| Physics format/engine/engineVersion/bytes/bodyIds/verticalVelocity and authored body definitions | Native `WorldPhysics`/snapshot validation in the isolated worker | Exact falling/stacked/moving-body restoration, malformed native bytes and 1,000-step local mixed-state comparisons |

The durable world excludes command queues/acknowledgement ledgers, ECS/native handles, renderer indexes/materials/meshes, device permissions, winding gestures, storage/Angular objects and wall-clock advancement. Player restore validates saved input-related fields before clearing transient movement/salvage intent; invested handcraft and MiniFab work remain owned and resumable.

## Commit, recovery and operation rules

- A run's latest commit token and sequence protect both save kinds. In one transaction, compare that head, add immutable metadata/payload, advance the run head and delete only revisions beyond **5 autosaves / 3 manual revisions**, including each kind's head. Abort rolls everything back. Metadata listing never reads payloads.
- Catalog reads isolate malformed/unsupported metadata into visible unreadable-revision diagnostics while healthy history remains selectable and exportable. Ordinary retention leaves unreadable records intact. Cleanup requires confirmation and rechecks the stored row transactionally so a concurrent repair cannot be deleted. Removing an unreadable head repairs its pointer to the newest retained healthy revision in the same transaction.
- Saved/unsaved state uses a session-local durable-state revision, independent of presentation publication numbers. Completed steps and actual handcraft cancellation/refunds change it; unchanged pause/resume and full resynchronization do not. Pending commands remain separately unsaved. This counter is not a new durable save field or migration.
- Autosave receives completed simulation time (`tick` differences multiplied by `stepSeconds`), every **120 active seconds**. No published progress means no timer progress. Explicit replacement suppresses scheduling; resumption never catches up on hidden/paused time. Successful manual/autosaves reset the active interval; unchanged boundaries are skipped.
- One operation executes at a time. Explicit requests precede at most one coalesced pending autosave. Bind captures/results to the original run/session generation, cancel queued autosaves for replacement, and finish an already detached commit against its original run. A conflict stops automatic writes until deliberate loading; refreshing metadata alone does not authorize an obsolete capture to overwrite a newer head.
- Selecting history writes nothing. Full worker/scene/UI preparation must succeed before activation. Recovery retains its source and later revisions until ordinary retention permits pruning; new saves append from the latest head and record the recovered source. Autosaves do not change a history selection being inspected.
- Deletion confirms its scope and checks the inspected run's revision set transactionally. The latest manual/autosave heads cannot be individually deleted. Deleting an active run keeps play open and suspends its autosaves until a deliberate Save; this prevents immediate silent recreation. Deleting the revision represented by a recovered session clears its saved marker.
- Import bounds the file before reading and validates decoded plain data before expensive native reconstruction. Inspect, commit as a fresh local run and activate are separate actions. Repeated imports retain original run/token provenance and gameplay IDs but receive new local identities. A late read/validation cannot resurrect an earlier file selection.
- Export uses a chosen valid committed revision. **Download current progress** captures and fully validates a completed state without IndexedDB, so denied/full/closed storage still permits emergency backup. Downloading never changes the committed marker.
- Blocked upgrades/version changes close the adapter; close other tabs and reload to reconnect. Rejected operations cannot later run hidden writes. Storage estimates/persistence APIs are optional, advisory and browser-owned; request persistence only from a player action. Site-data deletion/eviction still requires external JSON backups.

Status/preview areas reserve space. Autosaves do not disable focused controls, disclosures have unique labels across the HUD and pause dialog, and pause actions stay above the bounded scrolling save panel. Keyboard/controller input continues through the existing UI ownership layer. Tests include AXE, focus, stale file reads and desktop/mobile production acceptance.

Save confirmations share top-dialog targeting with other UI dialogs. A scoped UI-only input permission allows controller navigation, Submit and Cancel while the non-destructive save hold still prevents simulation credits and gameplay commands. Closing a prompt restores the enclosing hold, prior menu/pause permission and focus; it does not refund invested handcraft work.

## Performance and scope

The [local M9 evidence](../reports/milestone-09/2026-11-09/README.md) records mixed operating M8 water/restoration and coal layouts, controlled blocked conveyors, partial research/handcraft/MiniFab work and real moving native bodies. These are controlled persistence/performance fixtures, not newly earned gameplay. They compare 1,000 further steps exactly and measure capture, host validation/copying, JSON encoding, real IndexedDB append/retention/read and fresh worker reconstruction separately.

The current object representation is retained. M10 still owns representative larger factories and intended/lower-end-device responsiveness/FPS qualification. Full/virtual/accelerated gameplay and performance diagnostics remain local/manual and outside GitHub Actions; CI uses focused unit/component and fixture integration checks.
