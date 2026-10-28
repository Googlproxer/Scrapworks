# Milestone 3 Character and manual opening

Updated 27 October 2026 for the agreed research-led opening. Status: character, movement, picking and deposit data remain implemented from migration; onboarding, salvage, field research, crafting and Mini Fabricator remain pending. Prerequisite: [Milestone 2](milestone-02-simulation-foundation.md).

Teach movement, find scrap, research tools/basic recipes and build the scrap-only MiniFab, whose baseline crafting needs no power. Present it beside inventory with optional winding for a local speed boost; factory electricity is outside this milestone. Later onboard/grid/automation upgrades are extension requirements, not all Milestone 3 deliverables. The [progression specification](../design/player-progression.md) owns the agreed requirements and remaining balance decisions. Migration supplies animation and authoritative movement, not this gameplay. Preserve the completed items below; a roadmap revision does not reset or expand implementation credit.

[High-level plan](README.md) · [Next milestone](milestone-04-first-local-save.md)

## Current implementation

The Editor-authored 10 by 10 fixture has a spawn, one scrap deposit and blocker, with a neutral anchor for the runtime animated protagonist. Plain simulation and `PlayerMotor` own position, normalized movement, sprint, collision and facing. `WorldScene` composes Toolkit scripts: `PlayerController` interprets shared input, `PlayerView` owns the rig and animation, and focused camera, selection and placement controllers own their respective feedback. [Migration validation](../reports/migration/2026-10-23/README.md) covers the preceding camera/picking, movement, input ownership and controls accessibility implementation; the [core object design](../design/TDD.md#core-object-scripts) describes the later refactor. New inventory/equipment/research remain empty; the development placement fixture grants no normal-game resources.

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
- [ ] Author finite but very generous starting resources; ordinary early play should not approach exhaustion. Keep future resource-configuration values separate from a later configuration UI.
- [ ] Choose initial interaction range, collection amount or work duration, and inventory capacity as documented balance values.
- [ ] Implement a salvage command that validates the target, range, remaining quantity, and available capacity.
- [ ] Deduct from the deposit and add to inventory together. Reject an impossible transfer without partial mutation.
- [ ] Stop empty deposits from producing and show useful out-of-range, empty, and full-inventory feedback.
- [ ] Keep collection out of cumulative crafted production totals; it transfers a map resource rather than completing a recipe.
- [ ] Track newly extracted materials separately for raw-resource research eligibility; transfers/refunds do not add extraction history.

## Step 4 Add timed field research and the bootstrap catalog

- [ ] Add MiniFab field research requiring collected scrap only, followed by separate scrap-only manual assembly. No refined inputs, prior crafted-output milestone, existing fabricator or electricity may gate this acquisition.
- [ ] Choose scrap costs, field-research/assembly duration and ordering relative to the first tool/material recipes. Represent MiniFab ownership as a personal subsystem, not an inventory item or placed factory entity.
- [ ] Define the initial mixed scrap, plates, wire, mechanical/electrical parts and tool recipes so these components feed later branches.
- [ ] Review the [draft opening catalogue](../design/opening-catalogue.md) before choosing final recipes, research costs/times and hand-versus-MiniFab capabilities; its proposed values are not yet agreed balance.
- [ ] Keep gathering and field research initially available; require research for every crafting capability, including basic recipes.
- [ ] Implement the small timed field-research/contribution slice here, ahead of Milestone 5's expanded technology/lab work.
- [ ] Keep cumulative extraction/production eligibility, available stock, material contributions and work progress distinct; consume contributions once and preserve history.
- [ ] Enforce prerequisites and unlocks at command execution, including precursor recipes. Validate an acyclic, reachable bootstrap path.
- [ ] Target the first better-tool unlock at about one minute of early play; define exact costs/durations through the opening playtest.

## Step 5 Add bootstrap jobs and the Mini Fabricator

- [ ] Record recipe ID, reservations, remaining work and stable job identity for researched bootstrap crafting.
- [ ] Validate ingredients before starting, then consume or move them into the job reservation exactly once.
- [ ] Advance job work with simulation time. Wait safely if completed output cannot fit; do not lose reserved work.
- [ ] Commit outputs and cumulative production totals exactly once when the output enters its destination inventory.
- [ ] Add the manually fed Mini Fabricator: one selected final item type, batch bounded by its item stack limit, running while the player performs other work.
- [ ] Implement always-available power-free baseline work: basic items are quick, more complex eligible items slow. Depleted charge removes only the bonus and never pauses valid baseline work.
- [ ] Add optional winding into a small local battery and apply a simulation-owned speed bonus. Charge/capacity/boost rules are separate from factory electricity; no grid, weather or generation implementation is needed here.
- [ ] Plan missing Mini-compatible, unlocked precursor recipes from supplied materials before the final item. Reuse available intermediates and preserve batch surplus.
- [ ] Reject or clearly block impossible/cyclic/locked chains without spending; decide that request policy before implementation.
- [ ] Define cancellation and full scrap-recovery accounting for crafted items and pending work before exposing dismantle/cancel actions; do not delete resources when output capacity is full.
- [ ] Leave inventory-driven automatic replenishment/min-max policies to the later upgrade; do not confuse initial precursor scheduling with that capability.
- [ ] Preserve distinct related-tech unlock, MiniFab-specific upgrade research and actual upgrade crafting/application. Later power/battery/automation upgrades must not take effect for free on research completion; grid integration waits for electricity.

## Step 6 Add inventory, research and crafting presentation

- [ ] Publish nearby salvage targets, research eligibility/contributions/work, Mini Fabricator target/precursors, active jobs and recipe availability through application/session views.
- [x] Expose detached world, selection and lifecycle state through Angular signals. Inventory/crafting panels remain pending.
- [ ] Submit salvage, research, crafting and device requests through the session rather than changing inventory or unlocks from a component or scene.
- [ ] Display ingredient costs, precursor requirements, output quantities, progress, stack/capacity bounds and rejection/blocking reasons.
- [ ] Present a dedicated MiniFab panel beside inventory with its current controls; add future capability controls as those features unlock without granting uncrafted upgrades.
- [ ] Provide an actual crank that the pointer must grab and rotate through multiple turns, plus controller right-stick rotations while that control owns input. A click/hold alone is not the pointer winding gesture.
- [ ] Validate angular travel/deadzones, reject jitter/discontinuities and end winding on release, focus loss or ownership changes; no simultaneous camera orbit or gameplay input.
- [ ] Provide keyboard/remappable access to an equivalent boost, sensible charge-rate limits and readable charge/boost feedback. Keep winding optional and mildly tedious, not a progression gate.
- [ ] Treat accelerometer shaking and other unusual inputs as future capability/permission-gated experiments, not required Milestone 3 or mobile support.
- [x] Prevent gameplay shortcuts while a text field, menu, modal or binding capture owns input.
- [x] Give implemented menus/controls keyboard access and visible focus; tested states pass axe. Future inventory/crafting controls still require their own checks.

## Step 7 Verify the research-led opening

- [x] Test equal movement distance across rendering schedules and normalized diagonal input.
- [x] Test boundary collision and grid/pointer selection independently of artwork.
- [ ] Test out-of-range, depleted, and capacity-blocked salvage with unchanged state on rejection.
- [ ] Test unaffordable and repeated craft requests; ingredients cannot be spent twice or become negative.
- [ ] Test output blocked by capacity and later released, with one output commit and one production-history update.
- [ ] Test raw-resource field research, locked recipe rejection, duplicate contributions and timed completion without a second payment.
- [ ] Test a Mini Fabricator target with several precursor levels, shared ingredients, batch surplus, insufficient stock and a full output destination.
- [ ] Test baseline crafting with zero charge and boost expiry partway through a job: progress and ingredients survive, and baseline work continues.
- [ ] Test genuine pointer/stick turns, jitter rejection, equivalent keyboard access, capped charge, pointer cancellation/focus loss and exclusive input ownership; refresh rates cannot change earned charge or crafting work.
- [ ] Test scrap-only acquisition and reject attempts to apply researched but uncrafted upgrades; no electricity dependency is introduced.
- [ ] Test dismantling/cancellation against the agreed material-value ledger with no loss or duplication.
- [ ] Play from an empty world through first tools and manually fed automatic crafting, without debug inventory or pre-unlocked recipes.
- [ ] Measure a relaxed 15–20 minute first-automatic-craft route and an experienced under-five-minute route; do not impose those times as waits.

## Completion checks

- [ ] The player can complete onboarding, collect scrap, research basic recipes/tools and build/use the manually fed, power-free MiniFab from its inventory-side panel while doing other work.
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
| 27 October 2026 | MiniFab research/assembly use scrap only; dedicated UI, free baseline and optional winding boost agreed. | Acquisition/power/form are settled. Costs, recipe durations, crank balance and detailed later upgrade rules remain open; no runtime implementation added. |

## References and diagrams

- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Core class diagram](../design/TDD.md#core-class-diagram)
- [Opening progression](../design/GDD.md#proposed-opening-progression)
- [Camera and art finish](../art/README.md#camera-and-painted-finish)
- [Character readability](../art/README.md#character-readability)
