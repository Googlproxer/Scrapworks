# Milestone 8 Restoration and energy choices

Updated 4 October 2026. Status: not started. Prerequisite: [Milestone 7](milestone-07-transport.md).

Complete the small-map restoration loop: coal supports rapid progress, while cleaner power, storage, and purified water make greenhouse recovery sustainable. Keep environmental health separate from machine technology so advanced equipment does not automatically make the planet green.

[High-level plan](README.md) · [Next milestone](milestone-09-save-resilience.md)

## Current implementation

World-progression concepts exist in `art/world/`, but the playable world has no daylight, coal/solar allocation, storage, water, pollution, vegetation, greenhouse state, or restoration objective. The environmental rules below remain planned gameplay rather than implemented visuals.

## Step 1 Define the remaining prototype content

- [ ] Extend the small technology chain with solar panels, a purifier, and basic energy/water storage.
- [ ] Define equipment recipes, power requirements, capacities, and material costs using obtainable prerequisites.
- [ ] Add raw and purified water resources and a ruined greenhouse target to the authored map.
- [ ] Check that the opening supply of scrap, coal, and water is sufficient to reach the objective or can renew under an explicit rule.
- [ ] Separate balance parameters from rule code so the trade-off can be tuned without changing accounting behavior.

## Step 2 Implement day and night

- [ ] Choose a proposed cycle duration and derive cycle position from saved simulation time.
- [ ] Define a deterministic daylight curve and use daylight at the start of the tick for that tick's solar supply.
- [ ] Display daylight/cycle status independently of presentation frame rate.
- [ ] Keep hidden tabs and closed sessions paused; do not calculate offline generation from save timestamps.
- [ ] Verify that a restored mid-night world has the same daylight and remaining cycle time.

## Step 3 Integrate solar and energy storage

- [ ] Define generation limits, battery capacity, charge/discharge rates, and any chosen losses in consistent units.
- [ ] Specify the order of solar, coal, consumer allocation, battery discharge, and battery charging.
- [ ] Preserve deterministic allocation across competing consumers and prevent double-counting one energy supply.
- [ ] Cap stored energy and prevent negative supply, storage, or demand values.
- [ ] Record coal emissions from actual fuel consumption, including the previously selected fuel model.
- [ ] Show generation, consumption, and stored energy so nighttime failure can be understood.

## Step 4 Implement purification and greenhouse water use

- [ ] Add purifier jobs that reserve their inputs once and use allocated power to produce purified water.
- [ ] Add directed water connections or explicit transfer commands with capacity and conservation rules.
- [ ] Keep quantities in source storage, purifier work, destination storage, and greenhouse use accounted for.
- [ ] Define greenhouse water demand and shortage behavior per simulation step.
- [ ] Persist water storage, purifier work, and connection state; visual flow cannot own water quantities.

## Step 5 Add pollution and restoration rules

- [ ] Begin with the proposed map-wide pollution value; defer regional spread until the prototype needs it.
- [ ] Define emissions, natural recovery, greenhouse health changes, water effects, and safe bounds as explicit rates.
- [ ] Update environmental state in the documented phase after resource supply and production.
- [ ] Ensure damage can be recovered from under a viable cleaner layout.
- [ ] Publish pollution, environmental health, greenhouse health, and shortages as separate readable views.
- [ ] Translate health into gradual terrain, vegetation, and atmosphere changes using the Art Document's flat style. Technology stage and landscape health remain independent.

## Step 6 Specify and implement the objective

- [ ] Define the required greenhouse health threshold and what counts as factory operation before coding success.
- [ ] Define a complete day/night qualifying interval, its start condition, and exactly when a failed condition resets progress.
- [ ] Store qualification progress, relevant interval/cycle information, and completion state in the world.
- [ ] Evaluate the goal using simulation state and time rather than a UI timer.
- [ ] Make saving, loading, or reopening the goal panel preserve both success and failed-interval behavior.
- [ ] Explain unmet goal conditions so the player can decide whether to add power, water, storage, or reduce pollution.

## Step 7 Verify the environmental trade-off

- [ ] Test day/night boundaries, storage limits, allocation order, and water conservation with controlled fixtures.
- [ ] Test actual coal burn causing emissions and idle/unused behavior matching the chosen generator model.
- [ ] Test health recovery, water shortage, damaging layouts, and eventual recovery under viable conditions.
- [ ] Save at night with energy/water stored and unfinished qualification; compare restored and original continuation.
- [ ] Verify an invalid qualification interval cannot be turned into success by reloading.
- [ ] Play an effective coal layout and a cleaner layout; tune both from the same empty-world starting conditions.
- [ ] For a chosen continuous solar layout, confirm storage or another nighttime supply is needed when solar falls away.

## Completion checks

- [ ] Coal provides useful progress with a visible restoration cost.
- [ ] Clean power and storage offer a viable, understandable alternative.
- [ ] The greenhouse can be sustained through the required complete cycle.
- [ ] Damage and restoration appear gradually in the world.
- [ ] Environmental, power, water, and objective state all survive save/load.

## Notes and implementation issues

| Decision or possible issue                           | Implementation guidance                                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Goal thresholds are not finalized                    | Set health, duration, and factory-activity parameters before implementing success; the high-level goal is a proposal. |
| An impossible opening exhausts resources             | Audit the combined research, crafting, fuel, and water budget on the authored map.                                    |
| Clean technology instantly changes the terrain       | Drive restoration visuals from environmental state, independently of equipment appearance.                            |
| Storage charges and discharges the same energy twice | Make the allocation and charging phases explicit and test a per-tick energy ledger.                                   |
| Coal is either mandatory forever or never useful     | Tune its production advantage and environmental cost through comparable playthroughs.                                 |
| Water shortage is hard to diagnose                   | Expose source, storage, purifier, power, and greenhouse shortage states through inspection.                           |

Record implementation notes here:

| Date           | Observation or decision                | Follow-up and status                                                           |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| 4 October 2026 | Not started; current source inspected. | See Current implementation above; unchecked gameplay requirements remain open. |

## References and diagrams

- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Suggested simulation schedule](README.md#suggested-simulation-schedule)
- [Energy and environmental restoration](../design/GDD.md#energy-and-environmental-restoration)
- [Prototype success criteria](../design/GDD.md#prototype-success-criteria)
- [Environmental art transition](../art/README.md#environmental-restoration)
