# Milestone 3 Character and manual opening

Updated 23 October 2026 at migration Phase 7. Status: character, movement, picking and deposit data implemented; manual salvage, recipes and inventory interaction pending. Prerequisite: [Milestone 2](milestone-02-simulation-foundation.md).

The eventual opening is to walk to scrap, salvage it, and craft plates and wire by hand. The player starts empty-handed. Migration supplies the animated character and authoritative movement foundation; it does not implement resource collection or recipe jobs.

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
- [ ] Choose initial interaction range, collection amount or work duration, and inventory capacity as documented balance values.
- [ ] Implement a salvage command that validates the target, range, remaining quantity, and available capacity.
- [ ] Deduct from the deposit and add to inventory together. Reject an impossible transfer without partial mutation.
- [ ] Stop empty deposits from producing and show useful out-of-range, empty, and full-inventory feedback.
- [ ] Keep collection out of cumulative crafted production totals; it transfers a map resource rather than completing a recipe.

## Step 4 Add manual recipe jobs

- [ ] Define stable item and recipe IDs for scrap, basic plates, and wire, using the GDD's opening as the starting design.
- [ ] Make starting manual recipes available without research; reserve technology gates for later recipes.
- [ ] Begin with one active manual crafting job. Record recipe ID, reserved ingredients, remaining work, and a stable job identity as needed.
- [ ] Validate ingredients before starting, then consume or move them into the job reservation exactly once.
- [ ] Advance job work with simulation time. Wait safely if completed output cannot fit; do not lose reserved work.
- [ ] Commit outputs and cumulative production totals exactly once when the output enters its destination inventory.
- [ ] Defer job cancellation until refund behavior is defined. Keep blocked completion state compatible with future saving.

## Step 5 Add inventory and crafting presentation

- [ ] Publish nearby salvage targets, active jobs and recipe availability through application/session views alongside current empty inventory data.
- [x] Expose detached world, selection and lifecycle state through Angular signals. Inventory/crafting panels remain pending.
- [ ] Submit craft and salvage commands through the session rather than changing inventory from a component or scene.
- [ ] Display ingredient costs, output quantities, progress, capacity, and rejection reasons.
- [x] Prevent gameplay shortcuts while a text field, menu, modal or binding capture owns input.
- [x] Give implemented menus/controls keyboard access and visible focus; tested states pass axe. Future inventory/crafting controls still require their own checks.

## Step 6 Verify the manual loop

- [x] Test equal movement distance across rendering schedules and normalized diagonal input.
- [x] Test boundary collision and grid/pointer selection independently of artwork.
- [ ] Test out-of-range, depleted, and capacity-blocked salvage with unchanged state on rejection.
- [ ] Test unaffordable and repeated craft requests; ingredients cannot be spent twice or become negative.
- [ ] Test output blocked by capacity and later released, with one output commit and one production-history update.
- [ ] Play from an empty world to obtain both basic materials without debug inventory grants.

## Completion checks

- [ ] The player can walk, collect scrap, and craft plates and wire.
- [x] Character position and fixture deposit/blocker/selection remain readable in the angled view. Future salvage/crafting targets remain untested.
- [ ] Only completed recipe output increases cumulative production history.
- [ ] Manual job state can be detached and serialized without renderer objects.
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

## References and diagrams

- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Core class diagram](../design/TDD.md#core-class-diagram)
- [Opening progression](../design/GDD.md#proposed-opening-progression)
- [Camera and art finish](../art/README.md#camera-and-painted-finish)
- [Character readability](../art/README.md#character-readability)
