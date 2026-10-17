# Milestone 2 Simulation foundation

Updated 17 October 2026. Status: scaffold only. Prerequisite: [Milestone 1](milestone-01-project-and-integration.md).

Build an authoritative world that can advance, pause, and resume without depending on rendering. The first result is inspectable data and a stable clock; walking, mining, and factory rules arrive in later milestones.

[High-level plan](README.md) · [Next milestone](milestone-03-character-and-manual-opening.md)

## Current implementation

The plain TypeScript `src/simulation/simulation.ts` exists and has a passing enqueue smoke test in both Chromium and a separate Node run. Its queue contains strings; `step()`, `captureSnapshot()`, and `replaceWorld()` only log. There is no authoritative world, typed command/result model, fixed-step clock, pause/resume behavior, or connection to the renderer yet. Use the existing shared runtime and Babylon adapter as the integration boundary. `contracts/GameState` is renderer lifecycle state, not the future saved `WorldState`.

## Step 1 Define the initial world data

- [ ] Define plain types for the world, player position, inventories, resource deposits, and simulation tick.
- [ ] Define stable entity and content IDs; keep the next entity-ID counter in world state.
- [ ] Create a small authored map with scrap deposits and space for later coal, water, and greenhouse systems.
- [ ] Implement a new-world factory with empty player inventory, no equipment or machines, zero production totals, and no research unlocks.
- [ ] Distinguish map resources from possessions. Deposits exist in the world without giving the player starting items.
- [ ] Store or version the fixed step duration so a future load cannot silently reinterpret saved tick counts.

## Step 2 Separate state from session data

- [ ] Use JSON-compatible records, arrays, numbers, strings, and booleans for world state.
- [ ] Keep content definitions outside mutable state and refer to them by stable IDs.
- [ ] Keep meshes, materials, scene handles, services, event listeners, frame timestamps, held keys, queued commands, and selected panels outside saved world data.
- [ ] Give the simulation one owner of mutable state. Provide detached or deliberately constructed read views for other layers.
- [x] Keep the current simulation scaffold independent of Angular, Babylon, Phaser, Dexie, browser APIs, and wall-clock time. Retain this boundary as real rules are introduced.

## Step 3 Define the command boundary

- [ ] Define typed command inputs and results with specific rejection reasons. Add real commands as their systems arrive rather than empty implementations for every future feature.
- [ ] Accept intents through the application layer and execute them in a defined order at a simulation step.
- [ ] Validate commands against the current authoritative state immediately before mutation.
- [ ] Make rejection leave world state unchanged; make successful resource changes atomic within the synchronous step.
- [ ] Keep command input separate from continuously sampled movement state.
- [ ] Expose the new-world and stepping operations through a small facade or application service so both Angular and Babylon use the same session.

## Step 4 Implement fixed simulation steps

- [ ] Start with the proposed 20 ticks per second and a 50 ms step. Treat this as a measurement baseline rather than final performance tuning.
- [ ] Implement a pure stepping entry point receiving state, ordered commands, and the fixed duration.
- [ ] Use a browser frame loop to accumulate elapsed time and run only complete steps.
- [ ] Bound catch-up, initially to five steps per frame, and discard excess elapsed time after long stalls.
- [ ] Publish views after completed work, allowing rendering to run independently of the number of simulation steps.
- [ ] Document the initial system order. Expand it using the high-level schedule as new systems are introduced.

## Step 5 Handle pause and visibility

- [ ] Implement explicit player pause and keep its reason distinct from browser visibility suspension.
- [ ] Stop simulation advancement while the page is hidden; do not turn hidden time into offline production.
- [ ] Clear held input on focus loss so movement cannot become stuck after returning.
- [ ] Reset the elapsed-time baseline and accumulator before resuming.
- [ ] Allow inspection and later snapshot capture of the latest completed state while paused.
- [ ] Ensure stopping the application cancels the frame callback and visibility/focus listeners.

## Step 6 Verify the foundation

- [ ] Test new-world initialization, including empty inventory, zero production history, and unique IDs.
- [ ] Step two copies of the same state with the same ordered commands and verify identical outcomes.
- [ ] Test that rejected commands change nothing and cannot make quantities negative.
- [ ] Test bounded catch-up with a controlled clock rather than waiting for a real browser stall.
- [ ] Check pause, tab hiding, focus loss, and resume in the browser. Confirm hidden time is discarded.
- [x] Run the current queue smoke test in Node without importing the renderer or browser storage. Extend the suite as world state and rules are implemented.

## Completion checks

- [ ] A new world can be created, advanced a chosen number of ticks, inspected, paused, and resumed.
- [ ] Simulation progress depends on steps rather than render frames or renderer physics.
- [ ] Rendering and Angular panels observe the same authoritative session.
- [ ] No hidden-time catch-up or stuck held input occurs.
- [ ] Core data and rule boundaries are ready for manual gameplay and later snapshots.

## Notes and implementation issues

| Possible issue                                    | Implementation guidance                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Determinism depends on incidental iteration order | Use an explicit command order and stable entity order where competing actions matter. If randomness is needed later, save the seed and generator state. |
| Pausing disables all application work             | Pause simulation advancement, while keeping menus, inspection, and snapshot operations usable.                                                          |
| A new field cannot be serialized                  | Store IDs and plain values in the world; reconstruct runtime objects in adapters.                                                                       |
| Read-only UI access still mutates the world       | Do not hand components live nested records. Read-only signals do not freeze the values inside them.                                                     |
| Changing tick rate changes a saved game           | Version the timing assumption and decide how old snapshots migrate before changing it.                                                                  |

Record implementation notes here:

| Date           | Observation or decision                  | Follow-up and status                                                           |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| 4 October 2026 | Scaffold only; current source inspected. | See Current implementation above; unchecked gameplay requirements remain open. |

## References and diagrams

- [Fixed step loop diagram](README.md#fixed-step-loop-diagram)
- [Suggested simulation schedule](README.md#suggested-simulation-schedule)
- [Core class diagram](../design/TDD.md#core-class-diagram)
- [Simulation timing and save boundaries](../design/TDD.md#simulation-timing-and-save-boundaries)
