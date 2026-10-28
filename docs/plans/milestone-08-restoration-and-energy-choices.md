# Milestone 8 Restoration and energy choices

Updated 27 October 2026. Status: not started. Prerequisite: [Milestone 7](milestone-07-transport.md); initial renewable generation is planned in Milestone 6.

Make researched greenhouses the source of peaceful terraforming. Solar/wind, storage and green technology support greening; optional high-output coal opposes it through pollution. Choices affect pace and difficulty without a fail state or research lockout. The [progression specification](../design/player-progression.md#energy-weather-and-terraforming) owns the agreed direction.

[High-level plan](README.md) · [Next milestone](milestone-09-save-resilience.md)

## Current implementation

World-progression artwork is reference material. There is no simulation daylight/weather, power economy, water, pollution, greenhouse/restoration state or objective. Milestone 6's renewable implementation is also still pending. This design update does not claim a working environmental loop.

## Step 1 Define content and the peaceful objective

- [ ] Research-gate greenhouses, water treatment/storage, energy storage and optional coal/pollution mitigation; no free functioning greenhouse at spawn.
- [ ] Scope the small-map restoration checkpoint separately from the overall world-terraforming goal. Define measurable restoration coverage/health and supported industry before implementing completion.
- [ ] Specify greenhouse needs and its role as restoration's source; decide spatial spread, maximum reach and interaction between greenhouses.
- [ ] Keep base components useful in these recipes and maintain a viable green route without coal.
- [ ] Use finite but extremely generous deposits, including a budget for experimentation, research, construction and recovery. Future configurable resources remain later work.

## Step 2 Expand weather, day/night and storage

- [ ] Continue Milestone 6's simulation-owned daylight/wind model; solar generates only in daylight.
- [ ] Specify wind fluctuation and its minimum generation outside a Dunkelflaute event.
- [ ] Define event frequency, duration, severity, solar effects, forecasts and recovery before enabling events. During an event the usual wind floor is not guaranteed.
- [ ] Persist cycle/weather/event state and seeded random state so saving cannot reroll weather or change continued generation.
- [ ] Define battery capacities, charge/discharge rates, losses and allocation order without energy duplication.
- [ ] Explain current/expected generation, storage and demand. A shortage pauses or slows work; it does not end the run.
- [ ] Keep hidden/closed sessions paused, with no offline generation or weather advancement.

## Step 3 Implement water and greenhouse supply

- [ ] Define raw/purified water, treatment work, supply connections, capacities and greenhouse demand.
- [ ] Keep water quantities, reserved work and storage in authoritative state; visual flow owns no quantities.
- [ ] Use directed connections/transfer rules without introducing pressure simulation.
- [ ] Define shortage and restart behavior that preserves recovery and avoids irreversible loss.
- [ ] Settle dismantling recovery for stored liquids and process consumables against the full-recovery design before implementing it.

## Step 4 Implement greening, pollution and mitigation

- [ ] Define understandable rates for greenhouse restoration, green-technology contributions, pollution opposition and recovery.
- [ ] Decide whether pollution can temporarily reverse local greening or only slow it; neither choice may create a game-over condition or block research progression.
- [ ] Optional coal provides massive power relative to early renewables; tie emissions to actual fuel use and make its impact visible.
- [ ] Add later research that lowers pollution impact while preserving meaningful trade-offs.
- [ ] Allow polluting players to keep researching, unlock cleaner options and recover the world.
- [ ] Publish pollution, restoration, greenhouse supply and shortages separately, without relying on color alone.
- [ ] Drive terrain/vegetation/atmosphere gradually from environmental state, independently of machinery's visual technology tier.

## Step 5 Verify the small-map terraforming checkpoint

- [ ] Evaluate the chosen objective from saved simulation state, not UI timers or browser timestamps.
- [ ] Replace the former mandatory greenhouse-survival-through-one-day/night route with the agreed peaceful restoration checkpoint. Missing an interval cannot lose the run.
- [ ] Compare coal-free and coal-heavy choices through day/night and weather; both must retain research and recovery routes.
- [ ] Test wind floors outside events, event boundaries, storage limits, actual coal emissions and water conservation.
- [ ] Save during weather, partial research and restoration; compare original/restored branches with identical commands and random sequences.
- [ ] Verify shortages, pollution and poor layouts are recoverable without debug grants or a new world.
- [ ] Tune progression prompts for players lingering in early steps without pressuring them through realistic resource exhaustion.

## Completion checks

- [ ] Researched greenhouses initiate visible restoration toward a measurable small-map goal.
- [ ] Solar/wind/storage support a viable coal-free route, with defined weather limitations.
- [ ] Optional coal improves power capacity at a visible greening cost; mitigation research remains reachable.
- [ ] Environmental choices change restoration pace without antagonists, a fail state or permanent progression lockout.
- [ ] Water, power, weather, pollution, research and restoration continue consistently after saving/loading.

## Notes and implementation issues

| Date | Observation or decision | Follow-up and status |
| --- | --- | --- |
| 4 October 2026 | Not started; current source inspected. | Earlier checklist proposed coal-first industry and a fixed greenhouse-survival interval. |
| 27 October 2026 | Peaceful world terraforming, researched greenhouses, renewable-first power and optional pollution agreed. | Supersedes that opening/objective; exact rates, weather, spatial spread and completion thresholds remain open. All implementation tasks are unchecked. |

## References and diagrams

- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Suggested simulation schedule](README.md#suggested-simulation-schedule)
- [Energy and environmental restoration](../design/GDD.md#energy-and-environmental-restoration)
- [Environmental art transition](../art/README.md#environmental-restoration)
