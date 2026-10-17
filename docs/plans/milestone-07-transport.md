# Milestone 7 Transport

Updated 17 October 2026. Status: not started. Prerequisite: [Milestone 6](milestone-06-first-working-machines.md).

Automate supply and collection for the recycler with a small conveyor route. Transfers must preserve item quantities, survive blocked destinations, and resume from a save without changing where items are. Begin with direct routes rather than a general routing system.

[High-level plan](README.md) · [Next milestone](milestone-08-restoration-and-energy-choices.md)

## Current implementation

There are no conveyor entities, port connections, saved items in transit, or transport phase. Neither the static Babylon rig nor the earlier 2D movement prototype implements item transport. Add transport after a working, inspectable recycler and its persistent buffers exist.

## Step 1 Define transport content and topology

- [ ] Add the conveyor equipment recipe and research gate to the small catalog, keeping the technology path reachable.
- [ ] Define segment footprint, orientation, direction, capacity, and throughput in simulation units.
- [ ] Define compatible machine input/output ports and allowed connection directions.
- [ ] Add persistent segment IDs, connections, stored items, and any travel/progress values needed for continuation.
- [ ] Specify whether capacity counts items or stacks and use that rule consistently in inventory and transport queries.
- [ ] Begin with an authored or player-built direct network; defer splitters, underground belts, and advanced routing.

## Step 2 Extend placement and connections

- [ ] Reuse construction validation for conveyor unlock, equipment ownership, reach, terrain, and occupied tiles.
- [ ] Validate port compatibility and direction before establishing a connection.
- [ ] Show connection direction and invalid endpoints in the placement preview.
- [ ] Define behavior for a disconnected segment: its contents remain in a valid container or transit state.
- [ ] Keep removal unavailable until its content recovery rule is defined; do not delete a segment containing items silently.

## Step 3 Implement one transport phase

- [ ] Read eligible transfers from the state at the start of the phase, before any transfers commit.
- [ ] Calculate throughput/progress and identify destination capacity without moving items yet.
- [ ] Resolve competing transfers in a stable order, initially by source or connection ID.
- [ ] Reserve destination capacity so multiple sources cannot claim the same available space.
- [ ] Commit approved source deductions and destination additions together.
- [ ] Allow an item at most one transport step in a tick, even when several connected segments are iterated.
- [ ] Keep production output from the current tick unavailable until the next transport phase.

## Step 4 Handle blockage and machine interfaces

- [ ] Leave source items unchanged when the next segment or machine buffer is full.
- [ ] Allow movement to resume when capacity becomes available without rebuilding the network.
- [ ] Respect machine item/recipe compatibility when transferring into its input.
- [ ] Preserve the recycler's completed-but-blocked job behavior while output transport frees capacity.
- [ ] Keep all transport and manual collection out of cumulative production increments.
- [ ] Define a conservation ledger covering inventories, machine buffers, job reservations, and conveyor contents for focused tests.

## Step 5 Render and inspect transport

- [ ] Render conveyed items from authoritative segment/transit state and stable IDs.
- [ ] Add directional cues and blocked/disconnected feedback that remain readable at the normal camera zoom.
- [ ] Interpolate visual positions if useful, without moving quantities in the simulation.
- [ ] Rebuild render-object mappings after load without spawning extra logical items.
- [ ] Include segment contents and connection information in the inspector or development panel.

## Step 6 Verify conservation and continuation

- [ ] Test a chain whose length exceeds one segment; an item cannot traverse the whole chain in one tick.
- [ ] Test two sources competing for limited destination space with a deterministic winner.
- [ ] Test full buffers, disconnected endpoints, and later unblocking with no item loss or duplication.
- [ ] Account for all quantities before and after transport; disable new production in the transport-only fixture.
- [ ] Save with items partway along the route and verify restored continuation matches the original branch.
- [ ] Automate recycler input and output, then collect the result without increasing history a second time.

## Completion checks

- [ ] A small conveyor route feeds and drains the recycler.
- [ ] Every logical item has one authoritative location or reservation.
- [ ] Blockage preserves resources and movement resumes when space returns.
- [ ] Transfer results are independent of incidental array iteration order.
- [ ] Saved segment contents and progress restore correctly.

## Notes and implementation issues

| Possible issue                              | Implementation guidance                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Items travel many segments in one tick      | Build decisions from the phase-start state and commit after destination reservations.                                          |
| Several sources overfill a machine          | Reserve capacity across all proposed incoming transfers before committing any of them.                                         |
| Rendering creates or loses conveyed items   | Render state by stable IDs; the scene never owns logical inventory.                                                            |
| A source starves under stable priority      | Stable priority is a simple prototype rule. If fairness becomes necessary, define a deterministic rotation and save its state. |
| More realistic fluid flow expands the scope | Milestone 8 can reuse explicit directed capacity and conservation rules for water without adding pressure simulation.          |

Record implementation notes here:

| Date           | Observation or decision                | Follow-up and status                                                           |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| 4 October 2026 | Not started; current source inspected. | See Current implementation above; unchecked gameplay requirements remain open. |

## References and diagrams

- [Suggested simulation schedule](README.md#suggested-simulation-schedule)
- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Persistent game state](../design/TDD.md#persistent-game-state)
- [Save flow diagram](README.md#save-flow-diagram)
- [Load flow diagram](README.md#load-flow-diagram)
