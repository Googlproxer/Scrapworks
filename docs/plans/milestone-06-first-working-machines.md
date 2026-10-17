# Milestone 6 First working machines

Updated 17 October 2026. Status: not started. Prerequisite: [Milestone 5](milestone-05-research.md).

Let the player craft and place a coal generator and recycler, supply them manually, and collect useful output. Establish inspectable construction, power, and production rules before automating transport.

[High-level plan](README.md) · [Next milestone](milestone-07-transport.md)

## Current implementation

Recycler generation concepts exist in `art/machinery/`, but they are source artwork. There are no simulation machine records, construction commands, footprints, fuel, power allocation, buffers, or machine jobs. Start these systems after research and gameplay saves have the required state boundaries.

## Step 1 Define machine content and state

- [ ] Define machine IDs, crafted equipment items, research gates, square-grid footprints, allowed orientations, and connection ports.
- [ ] Define input/output capacities, allowed recipes, fuel capacity, and power requirements.
- [ ] Add persistent machine instances with stable IDs, position, orientation, inventories, job state, and fuel/energy state.
- [ ] Represent runtime status such as missing input, no power, and blocked output as derived views where possible.
- [ ] Extend content validation so recipe, item, machine, and technology references are valid.

## Step 2 Implement construction and manual transfer

- [ ] Add a placement query checking unlock, crafted item ownership, player reach, terrain, footprint occupancy, and any supplied connection endpoints.
- [ ] Use that query for preview feedback and repeat validation when the placement command executes.
- [ ] Consume one crafted equipment item on successful placement; do not charge its recipe ingredients again.
- [ ] Allocate a stable machine ID and claim all footprint tiles atomically.
- [ ] Add manual loading/unloading commands with range, item compatibility, source quantity, and destination capacity checks.
- [ ] Transfer existing items without increasing production history. Defer dismantling until its refunds and active-job behavior are defined.

## Step 3 Specify fuel and power accounting

- [ ] Choose and document consistent energy, power, and time units. Convert rates to per-step amounts in one place.
- [ ] Decide whether coal is consumed as a whole item into energy or through a timed fuel job; save all intermediate work.
- [ ] Record emissions from actual fuel use, even before Milestone 8 adds environmental effects.
- [ ] Start with a simple connection graph and validate power endpoints.
- [ ] Define deterministic consumer allocation, initially by stable machine ID, with capacity limits and no negative stored energy.
- [ ] Specify idle, unconnected, and blocked behavior so fuel and energy do not disappear through ambiguous rules.
- [ ] Adopt and document the relevant command, preparation, power, and production phases from the high-level tick schedule.

## Step 4 Implement machine jobs

- [ ] Start a job only when its recipe is unlocked, inputs are available, and the machine accepts that recipe.
- [ ] Reserve ingredients once at job start and persist the recipe ID and remaining work.
- [ ] Calculate job energy demand during production preparation, then advance work only from allocated power.
- [ ] Define how partial power changes work and ensure a job cannot over-consume energy or complete more work than remains.
- [ ] Keep completed-but-blocked work in state until the full output can be committed to the buffer.
- [ ] Commit output and cumulative production history together, exactly once.
- [ ] Make newly produced output wait for the next tick's transport phase when conveyors are introduced.

## Step 5 Add construction and machine feedback

- [ ] Show the machine footprint, rotation, and placement rejection reason before confirming placement.
- [ ] Add an inspector showing buffers, selected recipe, work progress, fuel, power supply/demand, and blocking reason.
- [ ] Keep inspection and selection in presentation/session state, referencing machines by ID.
- [ ] Provide keyboard-accessible loading and collection actions alongside world interaction.
- [ ] Render machine models from state without allowing animation or scene updates to advance production.

## Step 6 Extend saving and verify behavior

- [ ] Add all machine inventories, reserved inputs, work, fuel progress, connections, and energy quantities to capture and validation.
- [ ] Test locked, out-of-range, and overlapping placement with no item cost on rejection.
- [ ] Test powered progress, zero-power waiting, partial allocation, and output-capacity blocking.
- [ ] Test material and energy conservation through manual supply and collection; history only counts new output.
- [ ] Restore a machine mid-job and a generator mid-fuel use, then compare continuation against the original branch.
- [ ] Play the manual opening, research, craft equipment, place it, and produce useful recycler output without conveyors.

## Completion checks

- [ ] A placed, supplied generator powers a connected recycler.
- [ ] Construction consumes equipment once and rejected actions consume nothing.
- [ ] Power and blocked-output states are understandable in the inspector.
- [ ] Job completion updates inventory and history once, including after loading.
- [ ] The factory works with manual supply and collection before transport is added.

## Notes and implementation issues

| Possible issue                                  | Implementation guidance                                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Machine placement charges materials twice       | Crafting creates an equipment item; placement consumes that item only.                                           |
| Fuel burns when no useful demand exists         | Define generator idle/storage behavior explicitly. Emissions must follow actual burn, not merely a powered flag. |
| Job completion repeats while the buffer is full | Persist the completed job without committing output; clear it only after a successful output transaction.        |
| Power allocation changes after load             | Keep stable IDs, connection data, fuel progress, and allocation order consistent.                                |
| A removed machine loses reserved materials      | Keep dismantling outside this milestone until refund and connection cleanup rules are written.                   |

Record implementation notes here:

| Date           | Observation or decision                | Follow-up and status                                                           |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| 4 October 2026 | Not started; current source inspected. | See Current implementation above; unchecked gameplay requirements remain open. |

## References and diagrams

- [Suggested simulation schedule](README.md#suggested-simulation-schedule)
- [Fixed step loop diagram](README.md#fixed-step-loop-diagram)
- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Energy and restoration design](../design/GDD.md#energy-and-environmental-restoration)
