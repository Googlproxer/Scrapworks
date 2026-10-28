# Milestone 6 First working machines

Updated 28 October 2026. Status: not started; ECS selection/foundation moved to Milestone 3, with factory content extending it here. Prerequisite: [Milestone 5](milestone-05-research.md).

Establish manually supplied renewable-powered recycling, fabrication and laboratory operation, then provide extraction for later continuous supply. The Mini Fabricator's first automatic crafting belongs in Milestone 3; this milestone builds the placed factory. See [player progression](../design/player-progression.md).

[High-level plan](README.md) · [Next milestone](milestone-07-transport.md)

## Current implementation

Recycler artwork is source/reference material. There are no simulation factory entities, construction/resource commands, power allocation, production buffers or machine/lab work. No new gameplay is implemented by this plan update.

Extend the [ECS foundation established in Milestone 3](../design/TDD.md#ecs-foundation-from-milestone-3). Library/storage selection, stable IDs, component/resource authority, domain-rule reuse and capture/rebuild boundaries must already be proven before this milestone. Add factory components/systems inside the same simulation step; do not introduce a second world, parallel inventory/recipe engine or a late migration from the opening loop. Babylon remains presentation.

## Step 1 Define machine content and state

- [ ] Reuse the selected Milestone 3 ECS runtime, stable IDs, inventory/recipe/work domain rules and Milestone 4 snapshot adapter. Extend components/queries/systems for factories; do not defer initial ECS selection or rebuild the opening systems here.
- [ ] Profile representative factory-scale active/idle machines and projection costs, comparing with the Milestone 3 baseline. Optimize measured storage/query/work scheduling bottlenecks without assuming ECS alone guarantees throughput.
- [ ] Define researched equipment items, footprints, orientations, direct input/output ports, capacities, power requirements and stable machine IDs.
- [ ] Define initial solar/wind generation, recycler, the first required factory fabrication tiers, lab and extraction content. Scope the delivered tiers explicitly.
- [ ] Basic Fabricator accepts exactly one distinct input type; Medium exactly two; Advanced three or four. Advanced cannot execute lower-arity recipes. Mini Fabricator and recycler rules are separate.
- [ ] Preserve base components as inputs to advanced branches; later pure ore processing must feed those branches rather than obsolete them.
- [ ] Add persistent buffers, work, reservations, pending outputs and machine connections; derive missing-input/no-power/blocked status.
- [ ] Validate all recipe/item/machine/technology references and ensure the first machine in each required chain has an obtainable bootstrap route.

## Step 2 Implement construction, transfer and full recovery

- [ ] Validate unlock, crafted equipment ownership, reach, terrain, footprint and connections in preview and again at command execution.
- [ ] Consume the crafted equipment item once on successful placement and claim the footprint atomically.
- [ ] Support manually loading/unloading compatible machine buffers; transfers do not create production history.
- [ ] Define the material-value ledger, active-job/buffer treatment and safe recovery destination before dismantling is enabled.
- [ ] Dismantle buildings/equipment into full embodied solid value: scrap-origin material as scrap, other material as source ore for full reprocessing. Liquids are lost. Define later origin/equivalence details; recover contents/pending output once without inventing solid value or silently discarding blocked recovery.
- [ ] Verify crafting, random recycling and dismantling cannot mint extra scrap through a recovery loop. Keep the open consumed-resource policy explicit.

## Step 3 Implement renewable-first power

- [ ] Choose consistent energy/power/time units, direct power connections and deterministic allocation.
- [ ] Derive daylight and fluctuating wind from simulation time/state. Solar produces only during daylight; wind keeps a defined floor outside Dunkelflaute events.
- [ ] Settle the initial weather model and event staging with Milestone 8. Do not accidentally promise a wind floor during an event.
- [ ] Provide a complete solar/wind bootstrap without requiring coal technology or fuel; define sufficient starting generation and demand behavior.
- [ ] Specify supply, consumer allocation, storage and partial-power behavior without negative energy or double use.
- [ ] If optional coal is included in this slice, require its research, provide substantially higher output and record emissions from actual fuel use. Otherwise track it in Milestone 8.
- [ ] Persist cycle/weather state and generation-related work; use no wall-clock or renderer-driven gameplay randomness.

## Step 4 Implement recycling, fabrication, extraction and lab work

- [ ] The recycler produces a random mixture across its output catalog, rather than one player-selected deterministic recipe.
- [ ] Specify distribution, yields, availability expectations and material conservation before assigning balance values.
- [ ] Use a simulation-owned seeded random stream. Preserve pending results and random state across blocking and saves; no output rerolls.
- [ ] General fabricators execute a selected unlocked recipe of their supported arity and reserve ingredients once.
- [ ] Advance jobs using allocated power; preserve partial work and finished-but-blocked output until a full commit is possible.
- [ ] Commit new output and lifetime production once. Extraction increases extraction history, not crafted output history; finite deposits decrease atomically.
- [ ] Integrate dedicated research-craftable production and faster labs with Milestone 5's shared progress/payment rules; multiple labs scale useful throughput.
- [ ] Leave the Mini Fabricator inventory-driven upgrade out unless its separate unlock, min/max semantics and implementation scope have been agreed.
- [ ] Design a useful advanced portable MiniFab role/consumable and relevant hazardous/liquid handling upgrades when advanced crafting is scoped; no concrete recipe or cost is approved yet.
- [ ] Integrate any scoped MiniFab power upgrades only after their general technology, separate MiniFab research and actual crafting/application. Onboard solar/wind, polluting coal and grid boost never remove power-free baseline work; keep the Milestone 3 local charge mechanic independent until this integration exists.
- [ ] Make current-tick output available to transport on the next transport phase.

## Step 5 Render, inspect and verify continuation

- [ ] Provide accessible construction/inspection, buffer transfer, recipe/arity, power, random-output and lab-progress feedback.
- [ ] Render world state without allowing animation callbacks to advance production or research.
- [ ] Extend snapshots for factory work, pending random output, PRNG state, extraction, lab contributions, connections, cycle/weather and energy.
- [ ] Test rejected placement/transfers, arity exclusions, partial power, blocked output, recovery and resource conservation.
- [ ] Save mid-recycler/fabricator/lab job and restore identical continued output, random sequence, research progress and material values.
- [ ] Play from empty-handed research into a manually supplied solar/wind factory, without mandatory coal or conveyors.

## Completion checks

- [ ] Researched renewables power a supplied recycler, initial fabrication and laboratory work.
- [ ] Recycler mixtures and fabrication arity match the agreed rules; higher tiers retain distinct roles.
- [ ] Lab scaling, manual transfers and extraction behave through authoritative saved state.
- [ ] Full dismantling recovery preserves material value without duplication.
- [ ] Power, blocked output and progress are understandable; shortages do not create a fail state.
- [ ] The placed factory works with manual supply before transport is added.

## Notes and implementation issues

| Date | Observation or decision | Follow-up and status |
| --- | --- | --- |
| 4 October 2026 | Not started; current source inspected. | Earlier coal-first deterministic-recipe checklist superseded by the 27 October direction. |
| 24 October 2026 | ECS selected as factory architecture; Miniplex leads evaluation. | Integrate at session level; no ECS package or factory implementation added by the core-object refactor. |
| 27 October 2026 | Renewable-first power, mixed recycler output, restricted fabrication tiers, labs and full scrap recovery agreed. | All implementation remains pending; sorting follows in Milestone 7 and expanded weather/restoration in Milestone 8. |

## References and diagrams

- [Suggested simulation schedule](README.md#suggested-simulation-schedule)
- [Fixed step loop diagram](README.md#fixed-step-loop-diagram)
- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Recycler and factory fabrication](../design/player-progression.md#recycler-and-factory-fabrication)
