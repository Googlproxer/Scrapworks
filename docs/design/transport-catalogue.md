# Transport catalogue

Milestone 7 design, 9 November 2026. Numerical values are provisional playtest balance; [player progression](player-progression.md#logistics-and-later-transport) owns the agreed separate sorter, strict destinations and power-free transport. [The delivery plan](../plans/milestone-07-transport.md) owns implementation evidence.

| Placeable | Safe assembly inputs | Work | Bag stack | Embodied scrap | Factory assembly |
| --- | --- | --- | --- | --- | --- |
| Conveyor | 1 plate + 1 mechanical part | 4 s | 20 | 6 | Medium Fabricator (two distinct inputs) |
| Sorter | 2 plates + 1 mechanical part + 1 electrical part | 12 s | 5 | 12 | Handcraft/MiniFab; Advanced is deferred |

Both recipes produce one item and use the existing `sorting-logistics` technology (four Basic research kits, 60 s). Research and construction are separate payments. No new research prerequisite or free equipment is introduced. A twenty-conveyor/one-sorter allowance costs 132 embodied scrap, in addition to the M6 bootstrap budget of 494; all ingredients already have obtainable hand/MiniFab/factory routes.

The acceptance layout uses nineteen conveyors and one sorter (126 scrap), plus an additional Basic/Medium Fabricator (40), two power connections (8) and forty secondary-input plates (80): **254 additional scrap**, or **748** including the M6 construction/research baseline. Existing operating stock can contribute to this allowance. The extractor feed uses one belt; eighteen return belts pass around the authored moving block, preserving the map/save definition. The paid UI route gathers and crafts every addition normally; this budget establishes obtainability, not human pacing.

## Geometry and explicit connections

Every transport entity occupies one 2 m grid cell with quarter-turn rotation. Conveyors are low, walkable and have no native collider. Sorters use the existing 1.2 × 1.2 × 1.5 m machine collision body. Neither accepts a deposit cell. Toolbar placement consumes one owned item; configure a conveyor's straight/left/right path in its inspector after placing it. A connected output must be disconnected before changing that output side. No extra item is consumed for a turn or adjacent material connection.

Ports use local front/right/back/left names; front is +Z at rotation zero. Rotation turns the ports with the body. Connect an output to a facing input on the neighbouring cell, one edge per physical port. No long-distance, diagonal, underground or crossing links exist. Connections are explicit, including directly adjacent machines; adjacency alone never moves material.

| Entity | Inputs | Outputs |
| --- | --- | --- |
| Conveyor | Back | Front, left or right, according to its configured path |
| Sorter | Back | Left filter, right filter, front unmatched |
| Recycler / Basic / Medium Fabricator | Back, left, right, into their existing local input buffer | Front, from main output |
| Extractor | None | Front |
| Laboratory | All four sides, into its local buffer | None |
| Solar / wind | None | None |

Side inputs let two fabrication ingredients and extractor/returned-scrap supply merge through distinct real ports. Direct links use the same arbitration and rate rules as belts. Machine recipe/item compatibility is checked again during movement. A changed recipe can make an existing route wait; delivered stock is retained for manual recovery.

## Bounded movement and sorting

Capacity counts individual units: four per conveyor, four per sorter output lane (twelve total). Machine buffers retain their existing stack capacities. Each unit stores its item, lane and integer travel progress. Travel takes ten 20 Hz ticks (0.5 s; 4 m/s on the 2 m grid), capped at ten while blocked. Each connection transfers at most one unit every ten ticks, or two units/s in steady state. New connections start with the full ten-tick interval, so disconnect/reconnect cannot bypass that rate. Cooldowns cap at ten ticks; no blocked/paused backlog creates a burst. Transport needs no electricity and has no offline progress.

The sorter has two optional exact-item filters and one unmatched lane. Duplicate nonempty filters are rejected. A matched item is assigned to that lane on intake and cannot fall back to unmatched. Each lane can discharge independently. A full lane rejects only its matched intake; other offered types can enter available lanes. Any upstream finite capacity can eventually fill. A missing/disconnected output retains its contents. Drain or collect the sorter's held units before changing its filters; a rejected edit changes nothing. Collecting transfers intact units without history. Dismantling requires enough bag space for every intact unit plus the body's embodied scrap, before topology changes.

All decisions use phase-start containers. Reserve both source stock and destination capacity, then commit together; new arrivals are never offered again in the same tick. A unit moves at most one edge per tick. Destination capacity is conservative: outgoing stock does not create a vacancy for incoming stock in the same phase. A completely packed ring can wait until the player removes stock; no simultaneous vacancy solver is added.

Stable edge-ID round-robin service per destination prevents persistent extractor/returned-scrap competition from starving one source when capacity repeatedly appears. Per-edge item rotation lets mixed-output sources offer other available materials when one sorter lane is blocked. The saved last-served edge/item and cooldowns determine the next result independently of container iteration order. Source reservations prevent offering the same logical unit twice.

Run transport once before factory work in the existing worker callback. Commands, handcraft, salvage and MiniFab retain their current priority. Transported lab inputs may fund that tick's existing shared research coordinator. Current-tick factory output becomes available in the next transport phase. Transport never touches pending job output, committed ingredients, research ledgers or deposits and never changes extraction/production history.

## Ownership ledger

Transport-only fixtures freeze production/research and compare exact per-item totals across source outputs, machine inputs and every transit lane. The solid-value ledger additionally counts bag/ground stock, equipped tools, the owned MiniFab body and its input/output stock, unfinished handcraft inputs, remaining deposits, placed machine/transport bodies, power-connection bodies, machine buffers and permanently paid research contributions. A MiniFab job references its already-counted committed input; a request or future output adds no stock.

For each factory job count unfinished committed inputs **or** its completed pending result, never both. Extractor prospective output remains part of the finite deposit until commitment and is excluded from job stock. Production/extraction histories, recipe/filter IDs, transport edges/cursors, toolbar assignments and renderer meshes are references or statistics, not additional ownership. Material edges have no body value; power connections retain their existing embodied scrap. Recovery moves body value to scrap and retains intact contents; it does not credit history. The focused ledger fixture includes a running MiniFab, ground stock, finite deposit, research sinks and a completed pending factory result while transport runs and a machine is dismantled.

## Persistence and presentation

Content namespace `transport-1` extends the existing schema-1 envelope/world-3/physics-3 format. Keep the object representation; save-format optimisation remains deferred. Validate transport ownership, unit caps/lanes/progress, filters, geometry, unique edge IDs, facing port occupancy, service state and arbitration cursors before candidate replacement. Known `factory-1`, `research-1` and `opening-1` upgrades are detached and reject new transport content masquerading as old stock. Existing jobs, research, power wires, toolbar and run identity remain intact.

Babylon renders procedural transport bodies, directional arrows, material links and bounded unit projections. Angular owns inspection/filter/connection controls and textual blocked/disconnected feedback. No rendered unit owns inventory or requires a physics body. Keep worker detail subscriptions bounded and do not mirror transit as per-item Angular controls.
