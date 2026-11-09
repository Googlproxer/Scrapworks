# Milestone 8 Restoration and energy choices

Reviewed 9 November 2026 against clean `master` at `77685f6` and live Fibery. Status: complete and locally verified. Prerequisite: [Milestone 7](milestone-07-transport.md), now complete; Milestone 6 supplies initial renewable generation.

Demonstrate peaceful terraforming through researched greenhouses and other pollution-combating contributors. Restoration expands as a frontier; pollution reduces health locally and can be fully counteracted. Solar/wind, storage and optional high-output coal support industry with different environmental effects. Preserve a coal-free route, research access and recovery without a fail state. The [progression specification](../design/player-progression.md#energy-weather-and-terraforming) owns the agreed direction.

[High-level plan](README.md) · [Next milestone](milestone-09-save-resilience.md)

## Current implementation

Milestone 8 extends the existing 20 Hz worker with persistent local land/water health, fair expanding frontiers, source-attributed water, pipes and overflow, treatment/return, seeded rain/Dunkelflaute, grid batteries and forecast-driven coal base load. Paid research and ten new equipment assemblies reuse existing components and safe hand/MiniFab paths. The authored map is 20 by 20 cells at 2 m/cell, with an eight-cell lake, one 250,000-coal deposit and three 250,000-scrap deposits. All-cell restoration latches a peaceful checkpoint and play continues.

The [numerical catalogue](../design/restoration-catalogue.md) records actual provisional costs/rates and algorithms. The [Fibery revision receipt](../design/balance/milestone-08-revision-2026-11-09.json) preserves existing identities and records verified catalogue readback. Current content is `restoration-1`; canonical authored-definition comparison rejects any changed-map save before a candidate worker or scene is created. Same-map saves include health/budgets, source volumes/attribution/quality, weather/PRNG, coal ramps/fuel and batteries. Full earned gameplay and performance diagnostics remain local/manual.

## Agreed scope and decisions — 9 November 2026

1. **Local health and expanding frontier:** every land and water cell starts at 0% health, clamped to 0–100%. Health persists: positive/negative influence adds/removes health over time, and removing a contributor does not itself erase restored health. Pollution-combating contributors improve surrounding cells; polluters reduce nearby health. Sum all relevant positive and negative influences before clamping, allowing pollution to be fully negated. Once surrounding cells are full, excess positive influence reaches the next cells outward. Multiple contributors equally share the influence needed to fill a cell; do not apply every contributor's entire budget to the same final gap and duplicate overflow. Environmental propagation can run at a lower deterministic simulation cadence than the 20 Hz worker.
2. **Lake sources and quality:** connected water cells form one shared source, with capacity derived from cell count. Pumps are installed at water edges and drain the source's cells uniformly. Water cells have health and can be improved separately by returning treated water. At 100% health, source water needs no treatment and passes straight through a treatment machine without treatment cost. Natural refill is mainly tied to rain events, with very slow refill outside rain; never exceed cell-derived capacity. Define intermediate quality, mixing, refill quality and treatment work in the numerical design.
3. **Pipes and recovery:** water travels through pipes, never conveyors. Pumps feed treatment, tanks and machines; junctions split flow and can nominate any cardinal direction as overflow. There is no pressure simulation. Water fills a pipe evenly along its length and supplies downstream buffers where capacity exists. Overflow runs only when ordinary available buffers are full; otherwise a fully backed-up pump stops and resumes when capacity returns. Dismantled water infrastructure returns its unconsumed water automatically to its original sources, in the extracted-but-unconsumed amounts for each source. Consumed water is not refunded. Preserve attribution through mixing, splitting, storage, treatment and save/load; returning existing water is not new extraction.
4. **Coal, batteries and dispatch:** coal is a slow-starting, slow-stopping base-load source with enticing high output. It can charge batteries. It does not stop unless forecast renewable capacity can both fully supply the grid and charge batteries as needed. Renewable generation is curtailed during coal transitions; restart coal when the power forecast indicates it will be needed. Coal requires fuel and water; untreated water is accepted with higher emissions. Preserve fuel/energy accounting, partial fuel, water supply/quality and transition progress. Coal is optional for players but remains M8 delivery scope.
5. **Weather:** retain ordinary daylight-only solar and variable wind with a positive non-event floor. Add bounded forecast events with saved seeded state and enough warning to prepare storage or reduce demand. Rain events drive the main lake refill, increase wind and reduce solar. Define event duration/storage targets, severity, frequency and recovery before enabling them. Shortages slow or pause work; no offline advancement.
6. **Content boundary:** implement the restoration/water chain, grid batteries, coal and mitigation using existing components/kits and safe assembly paths. Define paid costs, prerequisites, footprint/ports, rates and capacities in the first design package. Keep Advanced fabrication and personal MiniFab upgrades deferred unless explicitly added to scope. Research grants blueprints, never free equipment. The entire green route remains obtainable without coal.
7. **Authored map:** expand the Editor-owned map to 20 by 20 cells, retaining 2 m cells. Include one generous coal source, one connected eight-cell lake and additional generous scrap deposits. Define layout and quantities before authoring; verify the full pipe/power/material layout and walking space. Update the compiler and validation for authored water cells and coal sources rather than creating a separate map authority.
8. **Map-bound saves:** no deployed build or old-save preservation requirement exists. Old saves may be deleted; do not implement M7-to-M8 gameplay migration. Tie new saves to the exact authored map revision/content and reject any changed-map save before candidate-world construction. Explain that the save is invalid and offer deliberate deletion/New Game; do not attempt loading, silently repair the map or erase a save merely because it is incompatible. Same-map saves must preserve exact continuation for every new system. Retain the current save representation through M8; broader resilience/format review remains M9.
9. **Checkpoint:** reach 100% health across every land and water cell on the 20 by 20 map. Record completion once and allow continued play. It is a prototype checkpoint, with no mandatory day/night survival interval and no loss condition if health later declines.

These decisions update planning only. Preserve completed M1–M7 credit, all seven existing M8 package identities, historical receipts and whiteboards. Numerical balance remains provisional; no new catalogue records or gameplay are delivered by this review.

## Numerical design and implementation

The follow-up answers settle health persistence, natural rain-driven refill and the all-cell checkpoint. Both design packages are implemented in the numerical catalogue and plain TypeScript content. Manhattan rings and fair capped sharing run every 20 ticks; water preserves proportional source/quality batches; batteries settle actual joules with 95% charging efficiency; coal ramps over 12/8 seconds with a 60-second known-weather forecast. Balance remains provisional. Focused invariants, browser components and authored-map fixtures accompany the executors; the full earned route and profiling are explicitly guarded against CI execution.

## Step 1 Define content and the peaceful objective

- [x] Research-gate greenhouses, water treatment/storage, energy storage and optional coal/pollution mitigation; no free functioning greenhouse at spawn.
- [x] Publish the prototype checkpoint separately from overall world terraforming: every land/water cell reaches 100% health, record completion once and allow continued play. Derive it from authoritative state; add no survival interval or fail state.
- [x] Specify supplied greenhouse and other positive contributors, local pollution, expanding-frontier budgets/cadence and equal sharing at cell saturation. Health includes water and is always clamped to 0–100% after net influences.
- [x] Author paid research/recipes for pumps, pipes/junctions, treatment, tanks, greenhouses, batteries, coal equipment/fuel supply and mitigation. Reuse the existing coal record; create missing technology identities deliberately and reconcile runtime data without changing historical receipts/whiteboards.
- [x] Keep base components useful in these recipes and maintain a viable green route without coal.
- [x] Use finite but extremely generous deposits, including a budget for experimentation, research, construction and recovery. Future configurable resources remain later work.
- [x] Design and compile the 20 by 20 authored map, connected eight-cell lake, one generous coal source and additional scrap deposits. Extend terrain/resource marker contracts and prove source access, complete factory layout and player traversal.
- [x] Define plain new components/resources, sequenced commands, bounded views, strict validation and the fixed simulation phase schedule. Keep environmental cadence, water flow and power dispatch on the existing worker.
- [x] Specify exact authored-map save identity, early invalid-save feedback and same-map continuation. Old-map/M7 saves need no migration; preserve the active session when rejecting one.

## Step 2 Expand weather, day/night and storage

- [x] Continue Milestone 6's simulation-owned daylight/wind model; solar generates only in daylight.
- [x] Specify wind fluctuation and its minimum generation outside a Dunkelflaute event.
- [x] Define event frequency, duration, severity, solar effects, forecasts and recovery before enabling events. Rain raises wind, lowers solar and drives most natural lake refill; very slow refill continues outside rain. During a Dunkelflaute event the usual wind floor is not guaranteed.
- [x] Persist cycle/weather/event state and seeded random state so saving cannot reroll weather or change continued generation.
- [x] Define battery capacities, charge/discharge rates, losses and allocation order without energy duplication.
- [x] Implement forecast-driven coal base load with saved startup/running/shutdown progress, partial fuel, water input/quality and operating limits. Coal may fill batteries; require sufficient forecast renewable grid/charging capacity before stopping, and curtail renewables during transitions. Define full-battery, forecast-error, fuel/water-shortage and restart behavior without rapid oscillation or energy/fuel duplication.
- [x] Explain current/expected generation, storage and demand. A shortage pauses or slows work; it does not end the run.
- [x] Keep hidden/closed sessions paused, with no offline generation or weather advancement.

## Step 3 Implement water and greenhouse supply

- [x] Implement connected lake-source capacity, cell health/quality and uniform edge-pump withdrawal. Implement bounded rain-led natural refill with very slow non-rain refill; specify refill quality, partial-quality treatment work and the zero-treatment-cost path at full source health.
- [x] Keep source-attributed water quantities/quality, reserved work, pipe contents, storage and consumed/returned totals in authoritative state; visual flow owns no quantities.
- [x] Implement pipes, treatment, tanks and machine inputs with even pipe filling, bounded buffers and no pressure or conveyor-liquid transport. Configure splitting junctions/cardinal overflow; service ordinary available buffers before overflow and stop/resume the pump on full capacity.
- [x] Return treated water to its lake to improve source health without creating water volume or duplicate positive influence.
- [x] Define shortage and restart behavior that preserves recovery and avoids irreversible loss.
- [x] Dismantling returns all affected unconsumed water automatically to its source(s), preserving each source's extracted-minus-consumed attribution through mixed networks. Define disconnect, junction edits, partial network removal and return-quality effects; consumed water/fuel stays spent. Preflight intact solids and topology changes atomically under the existing full-recovery rules.

## Step 4 Implement greening, pollution and mitigation

- [x] Define understandable rates for greenhouse restoration, green-technology contributions, pollution opposition and recovery.
- [x] Implement persistent accumulated health with local signed influences, 0–100% clamping, expanding positive frontier and equal contributor sharing at saturation. Removing support does not erase existing health. No global-pollution shortcut; negative health effects can be fully offset by positive influence.
- [x] Optional coal provides massive power relative to early renewables, needs coal and water, and emits more when using untreated water. Tie emissions to actual fuel use/operating state and show the local impact; define transition costs explicitly rather than inventing fuel or emissions.
- [x] Add later research that lowers pollution impact while preserving meaningful trade-offs.
- [x] Allow polluting players to keep researching, unlock cleaner options and recover the world.
- [x] Publish pollution, restoration, greenhouse supply and shortages separately, without relying on color alone.
- [x] Drive terrain/vegetation/atmosphere gradually from environmental state, independently of machinery's visual technology tier.
- [x] Publish lake quality/volume, source-attributed pipe/tank water, overflow/backpressure, battery charge/rates, coal transitions/forecast and land/water health separately. Reserve UI status space so controls stay anchored; verify keyboard/controller access and AXE.

## Step 5 Verify the small-map terraforming checkpoint

- [x] Evaluate the chosen objective from saved simulation state, not UI timers or browser timestamps.
- [x] Replace the former mandatory greenhouse-survival-through-one-day/night route with the agreed peaceful restoration checkpoint. Missing an interval cannot lose the run.
- [x] Compare coal-free and coal-heavy choices through day/night and weather; both must retain research and recovery routes.
- [x] Test wind floors outside events, event boundaries, storage limits, actual coal emissions and water conservation.
- [x] Test equal-share saturation/overflow without order bias, expanding frontiers, full positive/negative cancellation, health clamps and environmental cadence. Verify treated-return quality, full-health treatment bypass, uniform pumping, junction priority, multi-source mixing/consumption and exact dismantling returns.
- [x] Test coal ramps and forecast dispatch with renewable curtailment, battery full/empty/rate/loss limits, actual fuel/water consumption and higher untreated-water emissions. Compare coal-free and coal-heavy recoverable routes on the new map.
- [x] Save during weather, partial research and restoration; compare original/restored branches with identical commands and random sequences.
- [x] Include source volume/quality/attribution, mixed pipe/tank contents, pending environmental cadence/frontier work, battery charge and coal transition/forecast state in same-map continuation. Reject a changed-map save before attempting candidate loading, with visible invalid-save feedback and the active world unchanged.
- [x] Verify shortages, pollution and poor layouts are recoverable without debug grants or a new world.
- [x] Tune progression prompts for players lingering in early steps without pressuring them through realistic resource exhaustion.
- [x] Keep full/virtual/accelerated gameplay routes and performance benchmarks local and manually invoked. CI uses focused unit/component and fixture integration checks only; do not add playthroughs to GitHub Actions.

## Completion checks

- [x] Researched greenhouses and pollution-combating contributors expand visible restoration across persistent clamped land/water cell health, with fair shared influence and local pollution that can be fully counteracted. All cells at 100% records the checkpoint once and play can continue.
- [x] Solar/wind/storage support a viable coal-free route, with defined weather limitations.
- [x] Optional coal provides high base-load power with slow forecast-driven transitions, coal/water inputs, higher untreated-water emissions and visible local health impact; mitigation remains reachable.
- [x] Environmental choices change restoration pace without antagonists, a fail state or permanent progression lockout.
- [x] Water, power, weather, pollution, research and restoration continue consistently after saving/loading.
- [x] Pipes/overflow, lake treatment/bypass and exact source-attributed water recovery conserve volume; the 20 by 20 map supplies its eight-cell lake, coal and additional scrap.
- [x] Same-map saves continue exactly; changed-map saves are explained and rejected without candidate loading. No old-map migration is required.

## Notes and implementation issues

| Date | Observation or decision | Follow-up and status |
| --- | --- | --- |
| 4 October 2026 | Not started; current source inspected. | Earlier checklist proposed coal-first industry and a fixed greenhouse-survival interval. |
| 27 October 2026 | Peaceful world terraforming, researched greenhouses, renewable-first power and optional pollution agreed. | Supersedes that opening/objective; exact rates, weather, spatial spread and completion thresholds remain open. All implementation tasks are unchecked. |
| 9 November 2026 | User selected expanding local health/frontiers, fair overlapping influence, lake quality/treatment return, pipes/cardinal overflow/source-attributed dismantling, forecast-driven slow coal base load, coal/water inputs, a 20 by 20 map and strict map-bound saves with disposable old saves. | Replaces fixed-radius/global-pollution/residual-coal/old-map-upgrade recommendations. Follow-up answers settle persistent health, rain-led refill with higher wind/lower solar, and the all-land/water-100% checkpoint. Numerical design and every implementation check remain open. |

## Implementation verification — 9 November 2026

All seven existing Fibery packages are Done and M8 is Completed. The [local report](../reports/milestone-08/2026-11-09/README.md) records 197 Node, 390 Chromium and 90 tooling tests, strict types/lint/build, earned all-cell green completion before coal research, optional coal/mitigation, pollution recovery, 281.06 L connected-network return, Save/reload and desktop/mobile AXE. Three local native profiles each pass 1,000-step exact continuation, including an explicitly controlled frontier fixture. Long-run water checks led to conservative bounded quality pools, retention of microscopic litres and exact clean-water quality.

Full gameplay and profiling stayed local/manual; CI workflows are unchanged. Balance remains Draft, changes are uncommitted, and no hosted CI, publication, human pacing or target-device FPS qualification is claimed. Same-map saves preserve the full new state; changed authored definitions reject before candidate preparation. M9–10 remain separate work.

## References and diagrams

- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Suggested simulation schedule](README.md#suggested-simulation-schedule)
- [Energy and environmental restoration](../design/GDD.md#energy-and-environmental-restoration)
- [Environmental art transition](../art/README.md#environmental-restoration)
