# Milestone 3 Character and manual opening

Updated 29 October 2026 with Miniplex selection and completed simulation-worker investigation, retaining the component-led MiniFab opening and safe UI-bound handcrafting. Status: character, movement, picking and deposit data remain implemented from migration; production ECS/worker integration, onboarding, salvage, field research, crafting and Mini Fabricator remain pending. Prerequisite: [Milestone 2](milestone-02-simulation-foundation.md).

Teach movement, find scrap, research tools/material recovery, then handcraft plates, wire and mechanical/electrical parts before researching and assembling the four-ingredient MiniFab, whose baseline needs no power. Present it beside inventory with optional winding for a local speed boost; factory electricity is outside this milestone. Later onboard/grid/automation upgrades are extension requirements, not all Milestone 3 deliverables. The [progression specification](../design/player-progression.md) owns the agreed requirements and remaining balance decisions. Migration supplies animation and authoritative movement, not this gameplay. Preserve the completed items below; a roadmap revision does not reset or expand implementation credit.

[High-level plan](README.md) · [Next milestone](milestone-04-first-local-save.md)

## Implementation readiness and scope

Readiness review: 28 October 2026. All five opening design tasks are complete; no remaining opening gameplay-design question blocks this milestone. The ECS architecture revision adds a first Open foundation work package (Step 0) ahead of the five Open gameplay work packages (Steps 3–7). Design review does not resume implementation automatically.

- **Architecture gate:** select/prove the ECS runtime and adapt the existing small state scaffold in Step 0 before building the new core loop. ECS selection/foundation no longer waits for Milestone 6; that milestone extends the same world with factory systems.
- **Deliver:** ECS-backed 24-slot bag/separate equipped tool, salvage/ground pickup, the five core technologies and six opening recipes, safe UI-bound handcrafting, background Field Research, player-requested MiniFab with its initial buffers/cancellation/recovery rules, base crank/60-second battery and the onboarding/UI/verification route.
- **Defer:** actual gearing/battery upgrade progression and recipes, larger buffers, liquids/hazards, advanced portable consumables, autonomous min/max production, factory electricity/machines/labs, transport, restoration and gameplay persistence. Keep the agreed upgrade parameters representable without turning the optional catalogue branches into opening requirements. Milestone 4 implements gameplay saving; Milestone 3 supplies plain detachable state.
- **Use provisional balance:** catalogue recipe/research amounts and times, 250,000 total starter scrap and gesture tuning can be refined through the playable route. These are initial configured values, not new design gates.
- **Prepare the runtime content boundary during Step 4:** commit a versioned plain TypeScript/JSON catalogue using stable source IDs, explicit recipe capabilities, separate contribution/eligibility costs and declared unknown future content. Fibery is an authoring tool; gameplay must not call it or treat old import receipts as a runtime API. The current catalogue is five opening technologies/six recipes plus explicitly later candidates.
- **Replace foundation placeholders through Step 0 then Step 3:** current `WorldState` uses count-map inventory and string-array equipment/research. Use the selected ECS component/resource model for slot/capacity/equipped-tool data, ground resources, separate extraction history, per-technology research ledgers/work and MiniFab job/buffer/charge state; retain one authoritative copy. Keep simulation authoritative/plain and publish detached views; this model change is planned implementation work, not missing game design.
- **Contention rule:** manual player commands/current handcraft input commitment first, requested MiniFab intake next, Field Research draws afterward. Never spend committed ingredients twice; active handcraft protection still defers MiniFab bag transfers.
- **Recovery rule:** preflight the entire disassembly return (body solid equivalents plus intact buffer contents, after any genuinely freed item slot). If it cannot fit, leave the item/device, job and contents intact and report the capacity block; do not partially dismantle or spill. Commit successful disassembly/refunds once and preserve research/history.
- **Acceptance:** integrate simulation rules with the Angular inventory/research/MiniFab UI and Babylon salvage/ground feedback in playable slices. Verify empty-handed reachability, scarcity/overflow/cancellation interactions, accessible input and the pacing targets. Run the full CI workflow after implementation and reconcile milestone credit from results.

The accumulated design changes are saved in the working tree and Fibery. Review/commit that design baseline before mixing it with gameplay changes; this review creates no commit and changes no runtime code or Editor assets.

## Current implementation

The Editor-authored 10 by 10 fixture has a spawn, one scrap deposit and blocker, with a neutral anchor for the runtime animated protagonist. Plain simulation and `PlayerMotor` own position, normalized movement, sprint, collision and facing. `WorldScene` composes Toolkit scripts: `PlayerController` interprets shared input, `PlayerView` owns the rig and animation, and focused camera, selection and placement controllers own their respective feedback. [Migration validation](../reports/migration/2026-10-23/README.md) covers the preceding camera/picking, movement, input ownership and controls accessibility implementation; the [core object design](../design/TDD.md#core-object-scripts) describes the later refactor. New inventory/equipment/research remain empty; the development placement fixture grants no normal-game resources.

## Step 0 Establish and prove the ECS foundation

Move this work forward from Milestone 6 and complete it **before new inventory, salvage, research or crafting runtime implementation**. Milestone 2's movement/session foundation remains completed evidence; adapt its small state scaffold now rather than maintaining a second gameplay world until the factory arrives. ECS is chosen as the architecture. The [isolated laboratory](../../tools/ecs-bench/README.md) pins Miniplex 2.0.0, bitECS 0.4.0, Koota 0.6.6 and Becsy 0.16.1 as development-only comparison dependencies; no ECS runtime is wired into production Simulation.

- [x] Compare Miniplex (first candidate) with a data-oriented alternative such as bitECS using current official APIs, TypeScript ergonomics, indexed queries, lifetime/mutation behavior, deterministic ordering, memory and plain capture/restore boundaries. Record the selected exact dependency version and measured rationale before committing feature code to its storage model; do not select by an empty-world demo alone. [29 October investigation](../reports/ecs/2026-10-29/README.md): select **Miniplex 2.0.0** over bitECS 0.4.0, Koota 0.6.6 and Becsy 0.16.1. Miniplex and bitECS pass the 100,000-entity Node/Chromium median latency gate; Miniplex wins the equal-weight maintainability review, 9/10 versus 6/10.
- [x] Prove representative headless/browser workloads: many inventory/buffer owners and active/idle/blocked processors, deposits/ground piles, add/remove churn, and capture/rebuild/continued steps. Use synthetic processors rather than implementing future factory gameplay. Record repeatable scale timings/allocations and view-publication overhead against the existing 20 Hz budget, with headroom; ECS adoption alone is not proof of speed or threading. The report records five independent repetitions at all five scales, target capture/projection/growth diagnostics, corrected memory/soak/lifecycle evidence and paced browser trials. Node 250,000-entity fully active trials time out; standalone qualification does not establish full-game or target-device performance.
- [x] Complete the [single simulation-worker investigation](simulation-worker-investigation.md). The [report](../reports/simulation-worker/2026-10-29/README.md) retains Miniplex as the preferred baseline. Both pass correctness and simulation/copy latency, but neither rich-record worker bridge qualifies: receiving, callback and input budgets fail. The asynchronous handoff, diagnostics, memory evidence and future multithreading assessment are complete. Production integration requires publication rework; no worker/runtime implementation credit is granted.
- [ ] Give Simulation one private ECS runtime, chosen after the worker comparison, and one authoritative set of component data/world resources in the agreed single-worker architecture after qualification. The comparison retains Miniplex as the preferred baseline; the current publication contract remains a qualification blocker. Use stable game-owned entity IDs and ownership links; keep queries, indexes and library handles private. Do not mirror ECS component state into a second mutable WorldState or put meshes/services/signals/DOM in components.
- [ ] Model the opening with meaningful entities/components: player bag/equipped tool and movement data, deposits, ground resource piles, handcraft/MiniFab work with real input/output/reservation state, owner links and local charge. Keep immutable content and world-level clock/ID allocation/research/history ledgers as explicit resources where appropriate. Inventory units/each technology do not need one entity each.
- [ ] Run ECS systems inside the authoritative fixed step under one application-owned 20 Hz clock, preserving five-step catch-up. Resolve the current synchronous GameSession/scene-hook boundary through the worker investigation. Preserve manual/current-handcraft, requested MiniFab, then Field Research spending priority and explicit structural-mutation boundaries; query iteration order is not a gameplay-priority policy. Do not register authoritative systems as Editor script tick hooks or introduce a competing ticker.
- [ ] Reuse the tested PlayerMotor algorithms against authoritative ECS-held movement data; keep camera/player Toolkit scripts as input/presentation bindings. Preserve existing movement, collision, picking, pause, catch-up, teardown and development-fixture behavior through focused regression checks.
- [ ] Keep recipe eligibility, slot transactions, material-value accounting and work progression as plain reusable domain rules, called by ECS systems. Handcraft, MiniFab and later factory executors share these rules with explicit policy differences; do not build duplicate inventory/crafting engines or force every executor into identical behavior.
- [ ] Publish detached projections with stable IDs through the existing GameClient/WorldView boundary. Rebuild query/index state from plain component data without importing ECS types into Angular/Babylon/contracts. Measure/select changed projections rather than making full-world cloning on every entity/system the scaling strategy.
- [ ] Define a plain component/resource capture-and-rebuild contract and verify continuation on a fresh runtime, including ID references, work/reservations/held output, research/history and charge without duplicate credits. This is groundwork for Milestone 4; no IndexedDB slots, import UI or gameplay save delivery is added here.

This is a real initial ECS implementation gate, not only an ECS-ready interface around a temporary non-ECS game. Only comparison, synthetic workload evidence and the worker investigation are complete. Current worker publication fails qualification. Production integration and the remaining foundation stay pending; the laboratory changes no production runtime code.

## Step 1 Define coordinates and picking

- [x] Keep positions, distances and collision footprints in metres on the square-grid X/Z plane.
- [x] Pick the ground with camera rays, convert centimetres/metres at the presentation boundary and resolve the logical grid independently of mesh bounds.
- [x] Account for camera position, rotation, zoom and canvas bounds in picking.
- [x] Check conversion round trips, grid boundaries and camera-dependent selection.
- [x] Keep mesh pivots, animation, occlusion and camera following separate from authoritative positions.

## Step 2 Add player movement

- [x] Adapt keyboard direction to camera-relative session intent; normalize diagonal magnitude in simulation.
- [x] Advance position at 1.5 m/s walking or 3 m/s sprinting using the 50 ms step.
- [x] Normalize diagonal movement so it is no faster than cardinal movement.
- [x] Enforce map boundaries and occupied-cell collision with a 0.35 m player radius.
- [x] Clear movement on focus loss, pause and teardown.
- [ ] Clear movement/queued commands at the future gameplay world-replacement boundary.
- [x] Display the animated protagonist and following camera without changing simulation positions.

## Step 3 Add manual salvage

- [x] Define scrap deposits with position and remaining quantity in world state; no salvage mutation exists yet.
- [ ] Add a short movement tutorial and promptly guide the player to first scrap.
- [ ] Author a configurable initial total of 250,000 scrap across starting deposits, tuning placement/distribution through playtesting; ordinary early play should not approach exhaustion. Keep future resource-configuration values separate from a later configuration UI.
- [ ] Replace the foundation count-map/string-array inventory/equipment placeholders with slot/capacity/equipped-tool state and detached views; add stable ground-resource IDs and separate extraction history in plain simulation data.
- [ ] Use 24 bag slots plus a separate equipped-tool slot, no weight, per-item stack caps (100 for simple materials), and 2 m radial reach. Leave capacity/reach upgrades configurable; use agreed initial salvage rates of 3 seconds per scrap by hand and 1 second with the prybar.
- [ ] Add hold-to-repeat/toggle salvage with selected-target feedback. Stop on release, range loss, depletion or UI ownership changes. Auto-equip the first handcrafted prybar into an empty tool slot, with later swaps explicit; implement no durability/wear/repairs in this opening.
- [ ] Implement salvage validation for target, radial range and remaining quantity. Route what fits to inventory and overflow to recoverable ground items; a full bag does not reject salvage.
- [ ] Atomically deduct the salvaged quantity and split it between inventory and ground; retain every unit and stable ground-item identity. Merge nearby same-item ground drops and use deliberate pickup; pickup is a transfer, not a second extraction.
- [ ] Stop empty/out-of-range salvage and clearly report full-inventory ground overflow without silently discarding output or cancelling merely because the bag is full.
- [ ] Keep collection out of cumulative crafted production totals; it transfers a map resource rather than completing a recipe.
- [ ] Track newly extracted materials separately for raw-resource research eligibility; transfers/refunds do not add extraction history.

## Step 4 Add timed field research and the bootstrap catalog

- [ ] Implement tools → material recovery → sibling mechanical/electrical assembly → Mini fabrication. MiniFab research consumes crafted parts; separate hand assembly uses plates, wire and both parts. No existing fabricator or factory electricity is required.
- [ ] Tune provisional research/construction costs and times against the agreed opening order and pacing. Represent MiniFab ownership as a personal subsystem, not an inventory item or placed factory entity.
- [ ] Define the initial mixed scrap, plates, wire, mechanical/electrical parts and tool recipes in a versioned checked-in plain catalogue with stable IDs. Deliver five core technologies/six opening recipes, with no runtime Fibery dependency; explicitly exclude later/unknown content rather than treating it as free.
- [ ] Use the [opening catalogue](../design/opening-catalogue.md) for the agreed topology and safe handcrafting boundary; quantities, stacks and work times remain provisional playtest balance.
- [ ] Keep gathering and field research initially available; require research for every crafting capability, including basic recipes.
- [ ] Implement background Field Research here, ahead of Milestone 5's expanded technology/lab work. Advance with simulation time while other tasks run and the UI is closed; gradually consume required uncommitted player stock, with automatic wait/resume on missing inputs. Disabled field work never draws from the bag.
- [ ] Resolve automatic stock contention after manual actions/current handcraft commitment: requested MiniFab intake before Field Research; use only remaining uncommitted stock, with atomic revalidation.
- [ ] Keep cumulative extraction/production eligibility, available stock, per-technology consumed contributions and work distinct. Pause/disable or switch the active field technology without lost progress; no research cancel/reset/refund or reclaimed consumed inputs. Use paced one-of-each still-required material cycles, consume/credit atomically and wait for the entire next bundle if any input is missing. Exclude fully paid item costs; retain partial cycle time without unpaid catch-up.
- [ ] Enforce prerequisites and unlocks at command execution, including precursor recipes. Validate an acyclic, reachable bootstrap path.
- [ ] Target the first better-tool unlock at about one minute of early play; define exact costs/durations through the opening playtest.

## Step 5 Add bootstrap jobs and the Mini Fabricator

- [ ] Keep every researched safe assembly handcraftable. Use prepared ingredients and short basic work times; do not automatically craft hand-job precursors.
- [ ] Run handcrafting only with its UI visible. Warn before leaving or starting conflicting work, then cancel the unfinished unit/remaining batch on exit; abrupt teardown applies the same rule.
- [ ] Commit finished units individually. Preserve completed output/history, refund unfinished original ingredients exactly once and release unstarted reservations. Active handcrafting protects result/refund capacity, with consume-only enabled Field Research allowed on uncommitted stock after player commands. Return original inputs before releasing that ownership, guaranteeing refund space; do not spill handcraft refunds. Other transfers/MiniFab deliveries wait across batch units and while the warning is open.

- [ ] Record recipe ID, reservations, remaining work and stable job identity for researched bootstrap crafting.
- [ ] Handcraft: check bag output capacity after actual per-unit input consumption before spending. MiniFab: check one complete operation against real input/output buffers; initially one operation's ingredients/result. Pull immediate inputs from uncommitted inventory at start; only actual bag removals can free bag slots.
- [ ] Commit completed MiniFab output/history once into its buffer, then transfer to inventory without new history. If the buffer is full and bag output cannot fit, pause/notify and retain output, then resume when room returns. Allow validated next-operation intake first if it genuinely frees held-output delivery space; no spill, hidden storage or partial funding.
- [ ] Protect handcraft result/refund capacity across the batch/warning. Defer other additions/transfers and automatic MiniFab bag-input withdrawals. Enabled Field Research may consume uncommitted stock, never current craft inputs; revalidate each next unit. Supplied MiniFab work may finish and hold output. Idle crafting UI does not lock inventory.
- [ ] Resolve player inventory actions ahead of automatic output insertion in the step. Commit completed output/history once into the MiniFab output buffer; delivery/direct reuse is transfer only; automation cannot evict player items or reserve bag slots against player actions.
- [ ] Add the player-requested MiniFab: one final item type and stack-bounded batch, researched handcraftable recipes initially, drawing one operation at a time from inventory. Later hazards/liquids require researched/crafted handling upgrades; buffer capacities can upgrade toward full stacks.
- [ ] Implement always-available power-free baseline work: basic items are quick, more complex eligible items slow. Depleted charge removes only the bonus and never pauses valid baseline work.
- [ ] Add the local battery: five turn-equivalents to fill, 60 active crafting seconds at 2x speed, 1x when empty. Drain only during actual processing; idle/paused/blocked/missing-input/inventory-wait time costs zero. Split expiry/completion steps correctly. No grid, weather or generators are required.
- [ ] Plan unlocked compatible precursors first, reuse complete input sets directly from output buffers/inventory and retain legitimate surplus. Preserve a valid target while waiting for stock; no unlimited intermediate store or full-batch upfront reservation.
- [ ] Reject invalid/impossible/cyclic/locked chains without spending; wait/resume a valid request when its next complete ingredient set is unavailable.
- [ ] MiniFab cancellation discards partial work and preserves original inputs/completed output, returning them if possible or retaining the buffers. While residue remains, replacement must use the same input types (quantities may differ). Output must clear before a different recipe starts; exact same recipe may start with remaining output only if another full result fits. Persist restrictions and refund once. Opening finished items recover their scrap value; later non-scrap solids recover source ores and liquids are lost.
- [ ] Preflight whole disassembly recovery against post-removal bag capacity, including body material and intact buffers. On insufficient room leave item/device/job/contents intact; no partial dismantle/spill/early cancellation. On success recover once, preserve history and never refund research.
- [ ] Leave inventory-driven automatic replenishment/min-max policies to the later upgrade; do not confuse initial precursor scheduling with that capability.
- [ ] Preserve distinct related-tech unlock, MiniFab-specific upgrade research and actual upgrade crafting/application. Later power/battery/automation upgrades must not take effect for free on research completion; grid integration waits for electricity.

## Step 6 Add inventory, research and crafting presentation

- [ ] Publish nearby salvage targets, active field technology, enabled/manual-pause/material-wait state, research eligibility/consumed contributions/work, Mini Fabricator target/precursors, active jobs and recipe availability through application/session views. Explain ongoing inventory consumption; closing Research UI must not stop it and no cancel/refund action is offered.
- [x] Expose detached world, selection and lifecycle state through Angular signals. Inventory/crafting panels remain pending.
- [ ] Submit salvage, research, crafting and device requests through the session rather than changing inventory or unlocks from a component or scene.
- [ ] Display ingredient costs, precursor requirements, output quantities, progress, stack/capacity bounds and rejection/blocking reasons. Handcrafting exit warnings explain that completed items remain and the unfinished item is refunded; give accessible stay/cancel-and-leave controls.
- [ ] Present a dedicated MiniFab panel beside inventory with its current controls; add future capability controls as those features unlock without granting uncrafted upgrades.
- [ ] Provide a pivoted UI handle controlled by pointer grab/drag, selected right-stick direction and remappable directional keys. Up/Right/Down/Left/Up earns one turn-equivalent; fractional/reversed/back-and-forth actual handle travel earns proportional charge, without a full-turn gate. A stationary click/hold earns nothing.
- [ ] Validate accepted angular travel and centre deadzones, filter noise/discontinuous jumps without rejecting deliberate reversals, and end winding on release/focus/selection/input-owner changes. Re-entry earns no gap; no simultaneous camera/gameplay input or charge from unchanged held keys.
- [ ] Use equal angular-to-charge/capacity limits across pointer/stick/keyboard, configurable reasonable rate bounds and clear charge/boost feedback. Initial gain is 12 active-boost seconds per turn. Keep winding optional; later gearing reduces five-to-one turns, while unlimited +50% battery levels double upgrade costs without increasing turns-to-full.
- [ ] Treat accelerometer shaking and other unusual inputs as future capability/permission-gated experiments, not required Milestone 3 or mobile support.
- [x] Prevent gameplay shortcuts while a text field, menu, modal or binding capture owns input.
- [x] Give implemented menus/controls keyboard access and visible focus; tested states pass axe. Future inventory/crafting controls still require their own checks.

## Step 7 Verify the research-led opening

- [x] Test equal movement distance across rendering schedules and normalized diagonal input.
- [x] Test boundary collision and grid/pointer selection independently of artwork.
- [ ] Test unchanged-state rejection for out-of-range/depleted salvage, and lossless bag/ground splitting plus one extraction-history increment when inventory is full.
- [ ] Test unaffordable and repeated craft requests; ingredients cannot be spent twice or become negative.
- [ ] Test handcraft post-input capacity and MiniFab one-operation buffers, multi-output capacity, stock waits, direct precursor use, full-output pauses and player-before-automation ordering. Test next-input ingestion that genuinely frees delivery space versus partial-stack/buffer inputs that do not; no double output/history credit or hidden storage.
- [ ] Test background raw-resource research alongside salvage/handcraft and with its UI closed, gradual bag draws, shortage wait/resume, disabled field work with zero withdrawals, pause/switch retention, no cancel/refund, locked/completed rejection and duplicate-safe timed completion. Include shared-stock ordering, untouched current craft inputs, protected output/refund space and later-unit affordability.
- [ ] Test a Mini Fabricator target with several precursor levels, shared ingredients, batch surplus, insufficient stock and a full output destination.
- [ ] Test 1x at zero charge, 2x while charged, 60-second initial capacity, and split-step expiry/completion. Idle, paused, missing-input, output-blocked and inventory-wait states drain zero; concurrent charging still pays actual work drain. Preserve work/materials without double speed or charge.
- [ ] Test five accumulated turn-equivalents to fill, fractional travel, clockwise/counterclockwise reversals, stick/handle alignment and keyboard cardinal cycles. Filter noise/stale/centre jumps without suppressing genuine back-and-forth motion. Test cap/rate equivalence, ownership/focus loss, frame-independent gain, gearing floor of one and capacity/cost formula fixtures with no free refill.
- [ ] Test component-led MiniFab acquisition without an existing fabricator or factory electricity; reject applying researched but uncrafted upgrades.
- [ ] Test UI close/task interruption after ten completed plates during plate eleven: keep ten, refund current scrap once, discard partial work and never continue invisibly. Test that conflicting inventory writers are deferred, including during the warning, and cancellation restores original inputs before unlock even on forced teardown; completed units remain.
- [ ] Test last-ingredient contention: manual actions and current handcraft first, requested MiniFab next, research waits. Test full-return disassembly capacity, genuinely freed item slots, no changes on a blocked return and no duplicate refunds/contents on retry.
- [ ] Test retained cancellation buffers, same-input-type/different-quantity replacement, uncleared-output restrictions, exact-recipe capacity exception and restore without duplicate returns. Test solid recovery value and actual completed re-craft history; recovery/transfers add no history.
- [ ] Play from an empty world through first tools and player-requested automatic crafting, without debug inventory or pre-unlocked recipes.
- [ ] Measure a relaxed 15–20 minute first-automatic-craft route and an experienced under-five-minute route; do not impose those times as waits.

## Completion checks

- [ ] The selected ECS runtime owns the opening gameplay data and deterministic systems; capture/rebuild and scaled workload evidence are recorded without a second mutable state or clock.
- [ ] The player can complete onboarding, collect scrap, research basic recipes/tools and build/use the player-requested, power-free MiniFab from its inventory-side panel while doing other work.
- [ ] Optional physical winding grants a local speed boost, is accessible across supported input methods and cannot block uncharged crafting or require factory electricity.
- [x] Character position and fixture deposit/blocker/selection remain readable in the angled view. Future salvage/crafting targets remain untested.
- [ ] Only completed recipe output increases cumulative production history.
- [ ] Device requests, precursors, jobs, research contributions/work, histories and unlocks can be detached and serialized without renderer objects.
- [ ] The playable opening is ready for the first save/load round trip.

## Notes and implementation issues

| Possible issue                                                    | Implementation guidance                                                                                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A pointer selects the wrong tile after zooming                    | Apply the camera conversion and inverse world projection in a consistent order; test both at the adapter boundary.                                             |
| Input stays active when a panel is focused                        | Track whether gameplay owns input and clear held movement when ownership changes.                                                                              |
| Crafted output fills the inventory unexpectedly                   | Define capacity accounting before accepting a job. Preserve a finished-but-blocked job if space disappears during crafting.                                    |
| Craft cancellation creates free resources                         | Leave cancellation unavailable until reserved ingredients and refund rules are explicit.                                                                       |
| Migration animation is mistaken for complete character production | Idle/walk/run are verified on the current runtime derivative. Salvage/crafting actions, broader terrain readability and future equipment remain separate work. |

Record implementation notes here:

| Date            | Observation or decision                                                             | Follow-up and status                                                                             |
| --------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 4 October 2026  | Presentation scaffold only; current source inspected.                               | See Current implementation above; unchecked gameplay requirements remain open.                   |
| 23 October 2026 | Migration delivered animation, movement/collision, camera/picking and deposit data. | Manual salvage, crafting and inventory interaction remain pending; Phase 7 stops implementation. |
| 27 October 2026 | Research-led crafting, opening pacing and Mini Fabricator direction agreed. | Move bootstrap field research into this milestone, preserve migration credits, and leave every new gameplay task unchecked. |
| 27 October 2026 | Earlier scrap-only MiniFab acquisition; dedicated UI, free baseline and optional winding agreed. | Acquisition was superseded on 28 October; UI, baseline and winding remain agreed. |
| 28 October 2026 | Safe handcrafting and component-led MiniFab tree agreed. UI exit warns/cancels unfinished work, preserving completed output and returning current ingredients. | Updated catalogue and Fibery database records; whiteboard layouts untouched. Inventory/salvage/tools and detailed balance are next; no runtime implementation added. |

## References and diagrams

- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Core class diagram](../design/TDD.md#core-class-diagram)
- [Opening progression](../design/GDD.md#proposed-opening-progression)
- [Camera and art finish](../art/README.md#camera-and-painted-finish)
- [Character readability](../art/README.md#character-readability)
