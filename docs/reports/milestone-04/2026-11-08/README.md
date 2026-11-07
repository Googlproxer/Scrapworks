# Milestone 4 manual local saves

Implemented 8 November 2026 after the user's approval of the revised plan. This report records local verification of the opening's first durable gameplay save. The GitHub CI workflow also runs the production save acceptance; its exact publishing commit/run is recorded in the [live milestone](https://scrapworks.fibery.io/Project_Tracking/Milestone/4) when that gate passes. Later research/factories, autosave, revisions, migrations and file transfer are outside this delivery.

## Delivered behavior

- Startup offers **New Game**, **Continue** when a committed manual slot exists, and **Resume current game** when a healthy session is retained. New Game leaves the prior slot intact until Save.
- **Save progress** in the field-kit header captures active handcraft without closing or canceling it. **Save & load** in the toolbar and the pause menu expose manual save/load/delete and committed-slot information.
- Loading saved handcraft prepares Inventory & Crafting with its recipe, unit/batch and remaining work before simulation resumes. Original inputs stay committed. Normal exit/cancel subsequently refunds the unfinished unit once.
- Unsaved-progress loss and another run's overwrite require confirmation; same-run saves do not. Deletion is explicit. Pending operations disable conflicting controls and report success only after storage commit.
- One gameplay database stores schema-1 payload and metadata atomically. Content, world, native physics and database versions remain distinct. Slot metadata remains available for deleting an unsupported/damaged payload. Existing controls and developer test records keep their separate databases.

## Ownership and failure boundaries

[Save contracts](../../../../src/contracts/save.ts) contain the durable envelope/repository interface. [The codec and adapters](../../../../src/persistence/) bound plain input, preserve detached data, serialize application operations and compare committed tokens during writes/deletion. Reads and writes await their transaction boundaries; no read remains live after its resolved operation is closed. The memory adapter exercises failure/race paths without browser dependencies.

The durable payload reuses version-3 SimulationSnapshot and format-3 Rapier bytes/version/body identities/vertical velocity. It excludes the internal SimulationCapture's pending commands and transport ledger. A separate run ID identifies the playthrough; authored worldId does not. The [worker validator](../../../../src/simulation/player-save.ts) reuses existing validation, checks opening/research/job/ID invariants and normalizes transient intent without advancing time, repayment or refunds. Native restoration still validates geometry/configuration and exact engine compatibility.

GameSession holds stop new credits without normal activity interruption. GameSessionOwner constructs a candidate worker and waits for its complete publication. Babylon separately prepares assets/scripts and renders a first frame while retaining the existing scene. Angular stages the saved crafting panel; only then does a synchronous commit replace owners and release the old authority. Candidate/read/schema/asset/UI failure retains the active world and protected job/inventory. Paused loads stay paused; visibility rules still apply. No offline catch-up is added.

World replacement resets movement, salvage, queued commands, watches/selection, winding travel and old notifications; it creates fresh command counters and presentation mappings. An already detached late write retains its original run binding and cannot mark a replacement run saved. Normal gameplay may continue during asynchronous storage, and subsequent progress remains unsaved.

## Verification

| Check                                                    | Result / scope                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict game/reference/tooling types and application lint | Pass.                                                                                                                                                                                                                                    |
| Node simulation/session/persistence suites               | 11 files, 121 tests. Includes active jobs, original-input refunds, research material waits, ground pickup/history, contact/mover continuation, malformed state, stale requests and late writes.                                          |
| Chromium application/renderer/accessibility suites       | 36 files, 364 tests. Includes real IndexedDB commit/reopen/delete, injected quota/denied access, changed tokens, damaged payload metadata, candidate-scene rollback, restored crafting fields and paused load.                           |
| Tooling suites                                           | 14 files, 83 tests.                                                                                                                                                                                                                      |
| IndexedDB close/reopen regression                        | Three independent focused Chromium runs after enforcing completed read transactions and deduplicating teardown.                                                                                                                          |
| Production build and graph checks                        | Production compilation/compression; worker/main separation, deterministic boundaries and existing bundle limits retained. No simulation implementation enters the host save graph.                                                       |
| Built production save route                              | Real IndexedDB, page reload, Continue, visible mid-craft save, exactly one completed device, paused load, canceled/accepted New Game and other-run overwrite, corrupt-slot rejection/deletion, empty-slot reload and desktop/mobile AXE. |
| Existing production acceptance                           | Native and deliberately delayed-render modes: base path/CSP, loading/paint, input, pause, retained healthy-worker Retry, failed-worker restart and teardown.                                                                             |
| Authoring/asset/document checks                          | Development export/reload/recovery, built export verification, documentation links and regenerated matching Mermaid/SVG/PNG sources.                                                                                                     |

Run `yarn test:saves` after `yarn build --stats-json`. It uses the real simulation to prepare an isolated opening fixture, then drives only the built production UI and IndexedDB. Fixture preparation is test infrastructure; there is no new production mutation API. The normal empty-handed route remains `yarn test:opening --virtual-time`, separately from real-time pacing qualification.

[Save acceptance receipt](save-acceptance.json), [saved handcraft](saved-handcraft.png) and [mobile controls](restored-mobile.png) retain the production-browser evidence. Temporary failure diagnostics stay under ignored `tmp/`, rather than being mistaken for successful acceptance.

## Limits

Only the first durable schema and compatible current content/physics/authored layout are supported. Incompatible data is retained and rejected; migration and transfer remain Milestone 9. Browser-origin/profile storage can be cleared or evicted, and there is no cloud backup. Development-only placement buildings are rejected before saving; they are not delivered gameplay. Automated checks do not establish target-device performance, physical controller acceptance or new factory-scale physics qualification.
