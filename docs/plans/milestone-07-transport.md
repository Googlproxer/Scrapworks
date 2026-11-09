# Milestone 7 Transport

Reviewed and completed 9 November 2026 against clean baseline `master` at `a283356` (factory implementation `89ea16f`), after full user authorization including catalogue design and tests. All six packages, 43 implementation criteria and six completion checks are locally verified and reconciled with Fibery. Changes remain uncommitted; no new hosted CI or publication is claimed. Prerequisite: [Milestone 6](milestone-06-first-working-machines.md), completed.

Automate extraction/recycler supply and sort plates, wire and returned scrap into useful destinations using direct adjacent machine connections, conveyors and a separate placeable sorter. Transport is power-free. Preserve quantities, routing and blocked contents through saves. [Trains and loading/unloading stations](../design/player-progression.md#logistics-and-later-transport) are later-game work, outside this milestone.

[High-level plan](README.md) · [Next milestone](milestone-08-restoration-and-energy-choices.md)

## Current implementation

The [transport catalogue](../design/transport-catalogue.md) defines paid assemblies, physical ports, four-unit belt/output lanes, ten-tick travel, two units/s per edge and exact recovery. The same worker owns directed adjacent connections, deterministic fair phase-start transfers, strict separate sorter lanes and exact saved continuation under `transport-1`. Toolbar placement, accessible Angular inspection and bounded Babylon projections are implemented. Both the full empty-handed UI route and an earned-M6 continuation pass the nineteen-conveyor network, useful plate/wire fabrication, returned scrap, blocked sorting and Save/reload/Continue with desktop/mobile AXE. All 173 simulation/save, 384 Chromium and 90 tooling tests pass with coverage. The final production-build repeat from the fresh route's earned stock checkpoint also passes, including reconnect rate-limit protection. The [report](../reports/milestone-07/2026-11-09/README.md) records receipts, manual compute measurements and limits.

## Pre-implementation audit — 9 November 2026

Milestone 6 supplies the working inspectable mixed-output recycler, finite extractor, Basic/Medium Fabricators, physical labs, local persistent buffers, manual transfers and full recovery. Its toolbar supports saved Equipable → Placeables assignments, B/R placement and two-click power wiring. Explicit wires carry power only; rotated model ports currently provide presentation cues rather than material topology. There are no conveyor entities, material port connections, saved items in transit or transport phase. Extend that same worker/buffer authority with transport here.

| Boundary | Verified owning source | Milestone 7 work |
| --- | --- | --- |
| Authority and timing | [ecs-runtime.ts](../../src/simulation/ecs-runtime.ts), [opening.ts](../../src/simulation/opening.ts): one Miniplex worker at 20 Hz; commands, personal work, factory callback and shared research already have an owned order. | One transport phase before factory production inside that callback; retain personal-system precedence and one shared research coordinator. |
| Content and compatibility | [first-factory.ts](../../src/content/first-factory.ts): `sorting-logistics` is already paid/reachable through four Basic research kits and 60 s work. [machine-materials.ts](../../src/content/machine-materials.ts) owns configured machine IO. | Add paid transport assemblies under that existing technology; define physical material ports and execution-time item acceptance. |
| Ownership and saves | [factory.ts](../../src/contracts/factory.ts), [factory-capture.ts](../../src/simulation/factory-capture.ts): stack buffers, committed jobs, bounded pending results, history markers and strict capture validation. | Add bounded transport containers/progress/topology and compatible known-save upgrades without changing existing ownership or rerolling output. |
| Placement and presentation | [factory-placement.ts](../../src/simulation/factory-placement.ts), [machine-geometry.ts](../../src/game/views/machine-geometry.ts): one-cell machines on the authored 2 m grid, nearest-footprint reach and true body-overlap checks. | Reuse toolbar/preview/worker validation; add walkable belts, sorter geometry and directional endpoint feedback. |

M6's [factory report](../reports/milestone-06/2026-11-08/README.md) and [toolbar follow-up](../reports/milestone-06/2026-11-08/toolbar/README.md) retain their dated verification scope. The subsequent [power-connector revision](../design/balance/power-connector-revision-2026-11-09.json) owns current two-click wiring. This review adds no gameplay or new CI evidence.

## Agreed scope and decisions — 9 November 2026

1. **Separate sorter:** the user selected a crafted placeable sorter with one input, configurable item outputs and an unmatched-item output. Conveyors remain transport, rather than every connection becoming a filter. Final port count, footprint, buffering, numerical rates and construction recipes are the first design package.
2. **Strict destinations:** a matched item waits for its configured output when blocked; it never silently diverts into the unmatched output. Other item routes continue while their own capacity and the sorter's bounded storage permit. Store blocked material by route/type so one blocked output does not immediately stop every other output. Finite shared upstream capacity can eventually back up; do not promise unlimited bypass or add hidden storage. Returned scrap can use an explicitly configured route back to recycler input. Missing or disconnected destinations retain their items.
3. **Power-free transport:** conveyors, sorting and direct material connections need no electricity in this slice. They still stop on simulation pause/suspension and have finite throughput. Existing machine power and lab eligibility rules remain unchanged.
4. **Local explicit topology:** use directed compatible ports on facing neighbouring cells, including direct machine output-to-input connections and straight/turning conveyors. Reuse rotated model ports where valid; define additional ingredient/merge access explicitly so a two-input fabricator and the scrap feedback loop can actually be supplied. Do not interpret the 12 m power-cable reach as free material reach. No remote inventory pooling, automatic pathfinding or transfer from player/MiniFab buffers.
5. **Bounded deterministic movement:** capacity counts individual item units, not stacks. Reuse stack transactions at machine boundaries, with explicit conversion into bounded transit units. Use saved deterministic arbitration for competing sources/output types so returned scrap and extractor supply both make progress when the destination repeatedly has room. No wall-clock work, unbounded throughput credit or long movement catch-up after a blockage.
6. **Preserved factory rules:** transport moves main output-buffer contents into compatible main input buffers. Unfinished committed ingredients, completed pending results and research investment retain their existing owners. No direct withdrawal from a pending result, deposit or research ledger. Moving/collecting/recovering items adds no extraction or production history. Recycler randomness, tier arity, full recovery and shared research semantics stay intact.
7. **Delivery boundary:** the user subsequently authorized the full reviewed plan, including catalogue design and tests. All six existing M7 package identities and completed M1–M6 credit are preserved. Trains, underground/elevated crossings, general routing, standalone storage machines, fluids, Advanced fabrication, MiniFab automation, batteries and restoration remain outside this slice.

The [progression specification](../design/player-progression.md#logistics-and-later-transport) owns these product decisions. Implementation choices and provisional balance below must be recorded before execution rather than silently expanding scope.

## Step 1 Define transport content and topology

- [x] Reuse the existing `sorting-logistics` technology, prerequisites, four-kit payment and 60 s work. Define paid conveyor/sorter items and safe handcraft/MiniFab assemblies, factory eligibility by actual arity, stack caps and exact embodied scrap values; research grants no free equipment. Reconcile accepted records through existing Fibery Source IDs, preserving technology identity and Draft numerical balance.
- [x] Publish a reviewed transport catalogue with footprints, quarter-turn orientation, straight/turn geometry, walkability/collision, direct-link rules, number of ports, per-port direction and connection limits. Prove access for two distinct fabrication inputs and extractor/recycled-scrap merging; add no invisible multi-source connection.
- [x] Define finite individual-unit capacities, travel duration/metres per second and per-port transfer limits in simulation units. Machine buffers keep their item stack caps. Bound fractional progress/throughput credit and decide explicitly whether a full cycle waits under phase-start capacity rules.
- [x] Define the separate sorter's item-to-output filters, unmatched output, bounded per-route/type storage, intake selection and independent blocked-route service. Duplicate/overlapping filters must be rejected or have one documented deterministic meaning. No matched-item fallback or destruction; filter edits preserve items and cannot strand an invalid transit state.
- [x] Define deterministic fair arbitration for competing incoming sources and output types. Save all cursors/credits/progress that affect the next transfer, with stable entity/port IDs and no dependence on array iteration order.
- [x] Define plain transport components/resources, sequenced commands and bounded presentation/detail contracts on the existing worker. Plan snapshot/content versioning, validation and detached upgrades for known `factory-1`, `research-1` and `opening-1` saves; default only new transport state and retain all existing progress, topology, toolbar assignments and identities.
- [x] Prove an obtainable empty-handed construction budget and a reachable network layout on the authored fixture: extractor → recycler; plates/wire → useful fabrication; returned scrap → recycler. Include merge contention, turns and player access. Extend the Editor-owned fixture only if measured layout needs require it, preserving authored sources/provenance.

## Step 2 Extend placement and connections

- [x] Reuse saved Equipable → Placeables toolbar slots, B build mode and R rotation for conveyor/sorter placement, with keyboard/controller alternatives and existing handcraft warning/refund protection. Follow the reviewed catalogue's turn and connection interaction; power-wire mode remains a separate tool.
- [x] Validate research unlock, owned equipment, nearest-footprint reach, terrain, occupancy, body overlap and current target identity in preview and again at worker command execution. Spend once only after a complete valid placement/connection; reject stale, duplicate and invalid commands without spending.
- [x] Validate material port identity, facing adjacency, direction, connection count and item compatibility separately from power topology. Show source/target arrows and specific invalid-endpoint feedback before committing.
- [x] Define atomic disconnect, recipe/filter edit and dismantle behavior during transit. Disconnected contents remain owned and collectable; removal preflights the full body scrap value plus intact contents into the bag, rejecting insufficient capacity before changing topology, progress or ownership.
- [x] Remove attached material edges once, without dangling references or double refunds. Apply structural/collision changes at the existing safe boundary; belt walkability does not move logical materials into the physics world.
- [x] Add persistence/validation fixtures alongside placement: overlapping or out-of-bounds transport, invalid/duplicate ports, impossible progress/capacities, unknown items and topology to missing entities are rejected before candidate-world replacement.

## Step 3 Implement one transport phase

- [x] Read eligible transfers from the state at the start of the phase, before any transfers commit.
- [x] Run transport once before factory production/power/lab preparation inside the existing factory callback. Preserve command and personal-work precedence; transported lab inputs may fund the existing shared research step, while newly produced output waits until the next transport phase.
- [x] Calculate bounded throughput/progress and identify destination capacity without moving quantities. Use simulation time only; paused/blocked/disconnected time cannot accrue an unlimited burst.
- [x] Resolve competing transfers using stable IDs and the reviewed deterministic fair arbitration. Advance/save its state only under the defined service rule.
- [x] Reserve each source quantity and destination capacity across all proposed transfers; two outputs cannot claim the same unit and several sources cannot overfill one buffer. Do not borrow capacity from an uncommitted downstream deduction unless the reviewed algorithm explicitly proves it safe.
- [x] Commit approved source deductions and destination additions together.
- [x] Allow an item at most one transport edge per tick, including direct links, sorter boundaries and cycles. Keep travel progress and unit identity consistent with that rule and independent of entity/connection iteration order.
- [x] Implement capture/rebuild and the durable codec together with movement; exact mid-route, blocked, filter and arbitration continuation must match the uninterrupted branch. Retain strict candidate validation and existing rollback/last-good-save protection.

## Step 4 Handle blockage and machine interfaces

- [x] Leave source items unchanged when the next segment or machine buffer is full.
- [x] Allow movement to resume when capacity becomes available without rebuilding the network.
- [x] Revalidate configured machine IO at commit. Recycler accepts scrap, fabricators accept only their selected researched tier-compatible recipe inputs, and labs retain local-buffer/shared-queue payment. Recipe/queue changes cannot delete already delivered stock or remotely pool inputs; surface an incompatible route visibly.
- [x] Preserve the recycler's completed-but-blocked pending-result/history marker and saved random selection while output transport frees capacity. Partial draining of main output never rerolls or partially duplicates a committed result.
- [x] Sort plates, wire and residual scrap without changing quantities. A full matched route retains its material and cannot spill into unmatched output; other routes continue while their bounded capacity permits. Test eventual upstream backpressure explicitly.
- [x] Return residual scrap through a real configured route and merge it fairly with extractor supply. No implicit priority, free extra storage, new history or duplicate claim on the finite deposit. Disconnected/unmatched routes wait safely and recover after reconnection or a valid filter edit.
- [x] Keep all transport and manual collection out of cumulative production increments.
- [x] Define a conservation ledger covering bag/ground/MiniFab stock, deposits, placed equipment value, machine input/output, unfinished committed inputs or completed pending output, conveyor/sorter contents and permanent research sinks. Count each ownership representation once; transport-only fixtures freeze production/research and assert exact per-item conservation.

## Step 5 Render and inspect transport

- [x] Render conveyors, turns, sorter ports and conveyed units from authoritative segment/transit state and stable IDs; Babylon objects never own inventory or create a physics body per conveyed unit.
- [x] Add directional shapes/arrows and blocked/disconnected/incompatible feedback readable at normal camera zoom, with text alternatives rather than colour alone.
- [x] Interpolate visual positions if useful, without moving quantities in the simulation.
- [x] Rebuild render mappings after Continue, Retry and candidate replacement without spawning extra logical items; release observers/subscriptions before disposing/replacing their sources.
- [x] Add player-facing Angular inspection for contents/capacity, direction/endpoints, filter editing, strict-route waiting and safe collection/removal. Use separate HTML templates, signals/Signal Forms where applicable, stable control positions and existing modal focus/input ownership.
- [x] Preserve bounded worker detail subscriptions/publication; avoid full inventory serialization or per-item Angular controls every render frame. Verify desktop/mobile layout, keyboard/controller use, focus and AXE/WCAG AA.

## Step 6 Verify conservation and continuation

- [x] Add focused unit and fixture-based integration checks for long chains, corners, direct links, cycles, one-edge-per-tick movement, finite rate/capacity and next-phase visibility of production output. Permuting entity/connection arrays must preserve results.
- [x] Test several sources competing for limited space with deterministic winners and bounded service for each eligible source, including returned scrap against extraction. Verify source reservations as well as destination capacity.
- [x] Test blocked plate routing alongside flowing wire/scrap, unmatched/disconnected routes, eventual shared-capacity backpressure, reconnection and filter/recipe edits with occupied buffers. No fallback, loss, duplication, reroll or history increment is allowed.
- [x] Assert the ownership/value ledger around transfer, partial machine jobs, completed pending results, dismantling, full bag rejection and deposit depletion. Transport-only fixtures freeze all production/research and compare exact per-item totals.
- [x] Save with mid-route units, partial travel, blocked sorter storage and nondefault arbitration state; compare uninterrupted/restored branches through later unblocking. Reject corrupt topology/capacity/filter/progress and verify known M4/M5/M6 continuation without losing jobs, research, power connections or toolbar state.
- [x] Locally run the earned production-UI route: complete Sorting and conveyors without grants, craft/place the paid network, supply recycler from extraction, route plates/wire into useful fabrication and return residual scrap. Collect actual output without crediting its production twice. Exercise full destination/recovery, Save/page reload/Continue, pause/Retry and desktop/mobile AXE.
- [x] Retain strict types, lint, appropriate simulation/component/fixture tests, production build, architecture/assets/docs and authoring-recovery checks. Tests and continuation checks develop with each slice rather than waiting for final acceptance.
- [x] Keep every virtual/full opening/factory/transport playthrough, accelerated-clock route and performance benchmark local and manually invoked. Never add them to CI/GitHub Actions; use focused unit/component and fixture-based integration coverage there. Record receipts and distinguish local checks from hosted CI and real-time/human pacing.

## Completion checks

- [x] An earned paid conveyor/sorter route supplies the recycler from extraction, separates plates/wire into useful fabrication and returns residual scrap through explicit topology without electricity for transport.
- [x] Every logical item has one authoritative location or reservation.
- [x] Strict matched routes preserve blocked resources; other routes continue within finite capacity and movement resumes when space returns.
- [x] Transfer results are independent of incidental array iteration order, obey one edge per tick and fairly service persistent competition.
- [x] Saved topology, filters, contents, progress and arbitration restore exactly; known earlier saves and candidate rollback remain usable.
- [x] Accessible world placement/inspection and local built-UI acceptance pass; the existing six Fibery packages close only against implementation evidence. CI contains no virtual/full gameplay playthroughs or performance benchmarks.

## Notes and implementation issues

| Possible issue                              | Implementation guidance                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Items travel many segments in one tick      | Build decisions from the phase-start state and commit after destination reservations.                                          |
| Several sources overfill a machine          | Reserve capacity across all proposed incoming transfers before committing any of them.                                         |
| Rendering creates or loses conveyed items   | Render state by stable IDs; the scene never owns logical inventory.                                                            |
| Extractor supply or residual scrap starves | Use reviewed deterministic fair service and persist its state; an incidental stable-ID winner alone is insufficient. |
| One blocked sorter output stops everything | Hold matched material in bounded route/type storage and service other eligible routes; acknowledge eventual upstream backpressure. |
| A filter edit deletes or misroutes stock | Preserve ownership, validate the edit atomically and document how existing held units are assigned before implementing it. |
| Full loops require simultaneous vacancies | Define the phase-start capacity policy explicitly and test a packed cycle; never fabricate space or let a unit move twice. |
| More realistic fluid flow expands the scope | Milestone 8 can reuse explicit directed capacity and conservation rules for water without adding pressure simulation.          |

Record implementation notes here:

| Date           | Observation or decision                | Follow-up and status                                                           |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| 4 October 2026 | Not started; source inspected at that checkpoint. | Historical review; superseded by verified implementation below. |
| 9 November 2026 | Reviewed completed M6 on clean `a283356`; user chose a separate sorter, strict destinations with other routes continuing, and power-free transport. | Plan/tracker reconciliation only. Numerical catalogue design is first; all six implementation packages remain open. |
| 9 November 2026 | Full implementation authorized and completed on the same worker; the physical fixture requires nineteen conveyors to clear the moving block. New edges wait one interval to prevent reconnect throughput bypass. | All six packages and completion checks verified; 173 Node, 384 Chromium and 90 tooling tests, full earned UI route and final saved-checkpoint repeat pass. Catalogue numbers remain Draft; no CI playthroughs or benchmarks were added. See the linked report. |

## References and diagrams

- [Suggested simulation schedule](README.md#suggested-simulation-schedule)
- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Persistent game state](../design/TDD.md#persistent-game-state)
- [Save flow diagram](README.md#save-flow-diagram)
- [Load flow diagram](README.md#load-flow-diagram)
