# Milestone 5 Research

Updated 4 October 2026. Status: not started. Prerequisite: [Milestone 4](milestone-04-first-local-save.md).

Implement research that requires cumulative production milestones and consumes available materials. The player keeps their production history after paying. The first playable result is researching basic power and crafting a generator through the manual opening, without science packs.

[High-level plan](README.md) · [Next milestone](milestone-06-first-working-machines.md)

## Current implementation

No technology catalog, cumulative production history, research command, material payment, or research interface exists. Renderer readiness is complete, but research still depends on the authoritative simulation and manual opening. Retain cumulative production after spending, and consume current stock exactly once.

## Step 1 Define a small technology catalog

- [ ] Define stable technology IDs, names, prerequisite IDs, cumulative production requirements, payment costs, and unlocked recipe/equipment IDs.
- [ ] Initially use the required material quantities for both the production milestone and the payment, matching the current GDD.
- [ ] Add only the technologies needed for the first generator and recycler. Extend toward solar, water, and storage in Milestone 8.
- [ ] Keep the starting manual recipes available with no unlock.
- [ ] Check that every required material can be made with starting abilities or an earlier technology.
- [ ] Check that the prerequisite graph is acyclic and that basic power does not depend on an already powered recycler.

## Step 2 Establish production and payment rules

- [ ] Preserve cumulative totals from completed manual recipe output; later machine output will use the same accounting rule.
- [ ] Exclude salvage, transfers, picking up items, refunds, and spending from production-history increments.
- [ ] Use player inventory as the initial payment source. This is the recommended prototype rule; connected factory stock access remains a later design choice.
- [ ] Represent unlocked technology IDs in persistent state and distinguish them from derived recipe availability.
- [ ] Keep production milestones, current stock, research payment, and equipment crafting costs as separate concepts.

## Step 3 Implement one synchronous research transaction

- [ ] Accept a research command by technology ID through the facade and command queue.
- [ ] Reject unknown IDs and already completed technologies.
- [ ] Check prerequisites, cumulative milestones, and all current payment quantities against authoritative state.
- [ ] Complete every check before changing inventory.
- [ ] Deduct all costs and grant the unlock in one synchronous operation with no asynchronous gap.
- [ ] Preserve cumulative production totals on payment and return a useful result/rejection reason.
- [ ] Ensure a second queued request observes the first unlock and cannot pay again.

## Step 4 Enforce unlocks beyond the research panel

- [ ] Add unlock validation to the authoritative craft-start rule for technology-gated equipment.
- [ ] Provide the same availability query for presentation without trusting a UI-disabled button as enforcement.
- [ ] Define the unlock check that construction will use in Milestone 6. Complete the placement integration when that system exists.
- [ ] Keep research payment separate from equipment crafting. A player still needs to craft the physical item after research succeeds.
- [ ] Recompute recipe availability after unlock and after world restoration.

## Step 5 Present research progress clearly

- [ ] Display prerequisites, Produced, and Available for every required material.
- [ ] Show the material payment and whether the player can pay now.
- [ ] Explain when historical production is sufficient but current stock is insufficient.
- [ ] Show locked, available, and completed technology states without relying on color alone.
- [ ] Show the equipment's separate crafting cost and the recipes it unlocks.
- [ ] Publish research views through Angular signals rather than reading mutable core records directly.

## Step 6 Extend snapshots and verify the rules

- [ ] Capture and validate unlocked technology IDs alongside the existing production totals.
- [ ] Verify totals and unlocks survive save/load and continued crafting.
- [ ] Test totals sufficient but inventory insufficient, unmet prerequisites, unknown IDs, and already unlocked technologies.
- [ ] Test duplicate commands and multi-material payment with no partial deduction on rejection.
- [ ] Test locked crafting at the command boundary, even if the UI action is invoked directly.
- [ ] Use the GDD's illustrative 28 plates and 14 wire as a fixture if useful; do not treat those values as finalized balance.
- [ ] Play from an empty world to research and craft the first generator.

## Completion checks

- [ ] Research requires both lifetime output and an affordable current payment.
- [ ] Successful research pays once and retains lifetime totals.
- [ ] Locked equipment cannot be crafted through either the UI or a direct command.
- [ ] The initial technology path is reachable entirely from manual abilities.
- [ ] Save/load preserves production history and research progression.

## Notes and implementation issues

| Possible issue                                         | Implementation guidance                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Research becomes available but cannot be afforded      | Show Produced and Available separately; this difference is part of the agreed design.                                           |
| A technology creates a progression deadlock            | Audit the materials and power needs of every prerequisite recipe before adding it to the small tree.                            |
| UI and simulation disagree about availability          | Derive both from the same rule query, then revalidate when executing the command.                                               |
| Stored machines seem unable to pay research            | The initial payment rule uses player inventory. Explain it and let players collect stock; do not silently invent remote access. |
| Research and crafting together require excessive grind | Balance their combined cost from an empty playthrough, while keeping their accounting separate.                                 |

Record implementation notes here:

| Date           | Observation or decision                | Follow-up and status                                                           |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| 4 October 2026 | Not started; current source inspected. | See Current implementation above; unchecked gameplay requirements remain open. |

## References and diagrams

- [Research transaction diagram](README.md#research-transaction-diagram)
- [Research progression](../design/GDD.md#research-progression)
- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Save flow diagram](README.md#save-flow-diagram)
