# Milestone 2 Simulation foundation

Updated 30 October 2026 after production ECS/worker integration. Status: simulation/session foundation implemented for the migration fixture; plain capture/rebuild is verified, while factory systems and gameplay save delivery remain pending. Prerequisite: [Milestone 1](milestone-01-project-and-integration.md).

The authoritative world advances, pauses and resumes independently of rendering. Inspectable plain data, a stable clock and movement/collision are implemented. Manual salvage, crafting and factory rules remain later work.

[High-level plan](README.md) · [Next milestone](milestone-03-character-and-manual-opening.md)

## Current implementation

[`Simulation`](../../src/simulation/ecs-runtime.ts) owns private Miniplex components and world resources in one dedicated worker. Plain `PlayerMotor` owns authoritative movement, collision and facing. [`GameSession`](../../src/session/game-session.ts) owns the host 20 Hz accumulator, sampled movement, one in-flight advance and a shared five-step catch-up limit. The existing renderer frame supplies credits through `GameRuntimeService`. Completed-tick script notifications run on the main thread after pinning the latest detached view and before dispatching future credits. `GameState` remains renderer lifecycle state. The [production report](../reports/ecs-worker-implementation/2026-10-30/README.md) verifies the asynchronous boundary and real scene; the [timing contract](../design/TDD.md#simulation-timing-and-save-boundaries) describes hook and capture ordering.

The typed command currently places an isolated development test building. Normal worlds cannot place it and receive no stock or technology grants. Shared slot/reservation/work primitives and plain capture/rebuild are verified with populated synthetic fixtures. Resource-spending gameplay commands, crafting systems and player-facing save/load remain later work. Worker failure Retry starts again from the authored world; healthy renderer-only Retry retains the session.

## Step 1 Define the initial world data

- [x] Define plain types for the world, player position, inventories, resource deposits, and simulation tick.
- [x] Define stable world/entity IDs and the current fixture building ID; keep the next entity-ID counter in world state.
- [x] Compile a small authored 10 by 10 map with a scrap deposit and blocker.
- [ ] Design generous finite resource distribution and objective space for renewable-first industry, water, researched greenhouses and optional coal, following the [27 October progression direction](../design/player-progression.md).
- [x] Initialize a new world with empty inventory, no equipment or machines, zero production totals, and no research unlocks.
- [x] Distinguish map resources from possessions. Deposits exist without giving the player starting items.
- [x] Store the 0.05-second step duration in world state. Future snapshot validation/migration must enforce that timing assumption.

## Step 2 Separate state from session data

- [x] Use JSON-compatible records, arrays, numbers, strings, and booleans for world state.
- [x] Keep the frozen authored definition and fixture rule constants outside mutable state; identify entities/content by stable IDs.
- [x] Keep meshes, materials, scene handles, services, listeners, frame timestamps, held keys, queued commands and selected panels outside authoritative world records.
- [x] Give the simulation one owner of mutable state and provide detached read views for other layers.
- [x] Keep simulation independent of frameworks, renderers, storage, browser APIs and wall-clock time.

## Step 3 Define the command boundary

- [x] Define typed placement inputs/results with specific rejection reasons. Later systems add their own real commands.
- [x] Accept intents through the application layer and execute queued commands in order at a simulation step.
- [x] Revalidate commands against current authoritative state immediately before mutation, including repeated-placement occupancy.
- [x] Rejected placement leaves possessions and entities unchanged; command feedback and the normal step tick may still update.
- [ ] Make future resource-spending commands atomic within the synchronous step and verify conservation.
- [x] Keep queued commands separate from continuously sampled movement state.
- [x] Expose initialization and stepping through one application session shared by Angular and Babylon.

## Step 4 Implement fixed simulation steps

- [x] Use 20 ticks per second and a 50 ms step as the current baseline.
- [x] Implement synchronous `Simulation.step(movement)` inside the worker over privately owned ECS records and ordered commands. The host communicates asynchronously through serializable requests.
- [x] Accumulate elapsed time from the existing renderer frame source and run only complete steps.
- [x] Bound catch-up to five steps per frame and discard excess elapsed time after long stalls.
- [x] Expose detached views after completed work independently of renderer frame rate.
- [x] Document current order: queued commands, movement/collision, tick increment, view publication. The factory schedule remains future design.

## Step 5 Handle pause and visibility

- [x] Keep player pause, modal/input ownership and browser suspension separate in runtime activity; compose them into the session's paused state.
- [x] Stop simulation advancement while hidden without converting hidden time into offline production.
- [x] Neutralize effective movement on focus loss and ownership changes while retaining physical held state for release/centre suppression.
- [x] Reset elapsed-time baseline and accumulator before resuming.
- [x] Keep the latest completed detached view inspectable while paused.
- [ ] Add gameplay snapshot capture of that completed state in Milestone 4.
- [x] Cancel owned frame callbacks and visibility/focus listeners on teardown.

## Step 6 Verify the foundation

- [x] Test empty initialization, detached views, stable IDs and repeated command occupancy.
- [x] Compare equal movement across render schedules, including normalized diagonal distance.
- [x] Verify normal-world placement rejection, unchanged inventory and no entity creation; repeated fixture placement rechecks occupancy.
- [ ] Verify future resource transfers/spending cannot produce negative quantities or duplicate output.
- [x] Test bounded catch-up and pause timing with supplied frame deltas.
- [x] Check pause, tab/focus transitions and resume in browser/lifecycle tests; hidden time is discarded.
- [x] Run compiler/export tests in Node and simulation/session tests in the application suite; the plain simulation modules have no renderer or browser storage imports.

## Completion checks

- [x] A new world can be created, stepped, inspected, paused and resumed.
- [x] Progress depends on fixed steps rather than render frames or renderer physics.
- [x] Babylon and Angular observe the same authoritative session through detached views.
- [x] Tested suspension/input transitions produce no hidden-time catch-up or stuck movement.
- [x] Plain data and rule ownership provide the foundation for manual gameplay and later snapshots; those systems remain unimplemented.

## Notes and implementation issues

| Possible issue                                    | Implementation guidance                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Determinism depends on incidental iteration order | Use an explicit command order and stable entity order where competing actions matter. If randomness is needed later, save the seed and generator state. |
| Pausing disables all application work             | Pause simulation advancement, while keeping menus, inspection, and snapshot operations usable.                                                          |
| A new field cannot be serialized                  | Store IDs and plain values in the world; reconstruct runtime objects in adapters.                                                                       |
| Read-only UI access still mutates the world       | Do not hand components live nested records. Read-only signals do not freeze the values inside them.                                                     |
| Changing tick rate changes a saved game           | Version the timing assumption and decide how old snapshots migrate before changing it.                                                                  |

Record implementation notes here:

| Date            | Observation or decision                                         | Follow-up and status                                                                      |
| --------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 4 October 2026  | Scaffold only; current source inspected.                        | See Current implementation above; unchecked gameplay requirements remain open.            |
| 23 October 2026 | Migration introduced the world/session foundation and movement. | Checklist reconciled from migration validation; no later gameplay implementation started. |

## References and diagrams

- [Fixed step loop diagram](README.md#fixed-step-loop-diagram)
- [Suggested simulation schedule](README.md#suggested-simulation-schedule)
- [Core class diagram](../design/TDD.md#core-class-diagram)
- [Simulation timing and save boundaries](../design/TDD.md#simulation-timing-and-save-boundaries)
