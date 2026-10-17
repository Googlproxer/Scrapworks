# Milestone 3 Character and manual opening

Updated 17 October 2026. Status: presentation scaffold only. Prerequisite: [Milestone 2](milestone-02-simulation-foundation.md).

Make the first playable loop: walk to scrap, salvage it, and craft basic plates and wire by hand. The player starts with abilities and an empty inventory. Use a simple 3D marker or the static rig while movement animation remains unfinished.

[High-level plan](README.md) · [Next milestone](milestone-04-first-local-save.md)

## Current implementation

The Editor-authored Babylon Game scene contains placeholder geometry and a static rigged protagonist. The earlier `/` Phaser Player samples WASD/Shift and moves its sprite directly; that prototype is not authoritative gameplay. World movement, normalized input, collision, picking/grid conversion, deposits, salvage, crafting, inventory, and animation remain unimplemented. Follow the 3D fixture and lifecycle prerequisites in the cleanup plan.

## Step 1 Define coordinates and picking

- [ ] Keep positions, distances, and collision footprints in metres on the square-grid X/Z ground plane.
- [ ] Pick the ground with Babylon camera rays, convert Editor centimetres to gameplay metres at the boundary, and resolve the logical grid independently of mesh bounds.
- [ ] Account for camera position, rotation, zoom, and canvas bounds when converting a pointer to a ground/grid position.
- [ ] Check transform round trips and selection at tile centers, boundaries, and several camera positions.
- [ ] Keep mesh pivots, character animation, occlusion, and camera following separate from authoritative world positions.

## Step 2 Add player movement

- [ ] Sample keyboard direction in the input adapter and send the normalized intent to the session.
- [ ] Advance position using movement speed and the simulation's fixed duration.
- [ ] Normalize diagonal movement so it is no faster than cardinal movement.
- [ ] Add simple map-boundary and occupied-tile collision, with a clearly defined player footprint.
- [ ] Clear movement on focus loss, pause, teardown, and later world replacement.
- [ ] Display a readable player marker and make the camera follow without changing simulation positions.

## Step 3 Add manual salvage

- [ ] Define scrap deposits with position and remaining quantity in world state.
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

- [ ] Publish inventory, nearby target, active job, and recipe availability through `GameFacade` views.
- [ ] Use Angular signals for published state and computed values for panel presentation.
- [ ] Submit craft and salvage commands through the facade rather than changing inventory from a component or scene.
- [ ] Display ingredient costs, output quantities, progress, capacity, and rejection reasons.
- [ ] Prevent gameplay shortcuts from firing while a text field or menu owns focus.
- [ ] Give controls keyboard access and readable focus states, following the application's accessibility requirements.

## Step 6 Verify the manual loop

- [ ] Test equal movement distance across different rendering frame schedules and normalized diagonal input.
- [ ] Test boundary collision and pointer selection independently of artwork.
- [ ] Test out-of-range, depleted, and capacity-blocked salvage with unchanged state on rejection.
- [ ] Test unaffordable and repeated craft requests; ingredients cannot be spent twice or become negative.
- [ ] Test output blocked by capacity and later released, with one output commit and one production-history update.
- [ ] Play from an empty world to obtain both basic materials without debug inventory grants.

## Completion checks

- [ ] The player can walk, collect scrap, and craft plates and wire.
- [ ] Character position and interactive targets remain readable in the angled view.
- [ ] Only completed recipe output increases cumulative production history.
- [ ] Manual job state can be detached and serialized without renderer objects.
- [ ] The playable opening is ready for the first save/load round trip.

## Notes and implementation issues

| Possible issue                                          | Implementation guidance                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A pointer selects the wrong tile after zooming          | Apply the camera conversion and inverse world projection in a consistent order; test both at the adapter boundary.          |
| Input stays active when a panel is focused              | Track whether gameplay owns input and clear held movement when ownership changes.                                           |
| Crafted output fills the inventory unexpectedly         | Define capacity accounting before accepting a job. Preserve a finished-but-blocked job if space disappears during crafting. |
| Craft cancellation creates free resources               | Leave cancellation unavailable until reserved ingredients and refund rules are explicit.                                    |
| The character sample is mistaken for finished animation | The 3D import is a static rig. Keep runtime scale, deformation checks, and animation preparation as separate art work.      |

Record implementation notes here:

| Date           | Observation or decision                               | Follow-up and status                                                           |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| 4 October 2026 | Presentation scaffold only; current source inspected. | See Current implementation above; unchecked gameplay requirements remain open. |

## References and diagrams

- [Gameplay interaction diagram](../design/TDD.md#gameplay-system-interactions)
- [Core class diagram](../design/TDD.md#core-class-diagram)
- [Opening progression](../design/GDD.md#proposed-opening-progression)
- [Camera and art finish](../art/README.md#camera-and-painted-finish)
- [Character readability](../art/README.md#character-readability)
