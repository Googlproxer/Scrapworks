# Milestone 10 Portfolio prototype

Updated 23 October 2026 at migration Phase 7. Status: migration presentation, UI and production checks verified; complete factory demo, persistence and representative performance pending. Prerequisite: [Milestone 9](milestone-09-save-resilience.md).

Turn the working systems into an understandable small-map demo that can be shown in your portfolio. Prioritize a complete playable route, readable feedback, and reliable persistence before expanding the map or technology tree.

[High-level plan](README.md) · [Previous milestone](milestone-09-save-resilience.md)

## Current implementation

The 3D migration provides the Angular shell/menu/controls, animated protagonist, authored grid fixture, orbit/follow camera, selection/placement preview and stable lifecycle/input boundaries. The [23 October evidence](../reports/migration/2026-10-23/README.md) records 181 Chromium tests, 27 Node world/export tests, 30 lint-tooling checks, source lint/type checks, production build/export checks and actual browser flows at device pixel ratios 1 and 2. Tested UI states have zero axe violations; production routes have zero recorded browser errors or failed requests.

The [production profile](../reports/migration/2026-10-23/performance.json) measures bundle/assets, requests and RAF intervals on the small migration scene. It is not target-hardware qualification, representative factory performance, a gameplay-save test or a completed objective route. Manual progression, research, automation, restoration, gameplay saves and portfolio balancing remain open.

## Step 1 Prepare a consistent presentation

- [ ] Audit the placeholder assets against the Art Document's preferred flat finish and angled overhead square-grid view.
- [x] Establish the migration fixture's understated ground/grid, angled perspective camera and readable protagonist/selection presentation.
- [ ] Replace terrain and machines gradually, keeping the progression from improvised scrap construction to clean advanced technology readable.
- [x] Prepare the current protagonist's runtime scale, ground alignment, materials and idle/walk/run clips, and fixture logical footprints.
- [ ] Prepare remaining terrain/machine models and action clips for the complete prototype; concept images remain references rather than runtime meshes.
- [ ] Keep the protagonist readable against both derelict and restored terrain through silhouette, contrast, and a clear selection/position cue.
- [ ] Drive the gradual landscape transition from environmental state while equipment appearance follows its own technology stage.
- [ ] Check asset licenses and maintain attribution for anything used in the demo.

## Step 2 Finish feedback and onboarding

- [ ] Add a short opening objective that leads an empty-handed player toward scrap and manual recipes.
- [ ] Explain research's Produced and Available requirements before the first payment.
- [ ] Show machine input, output, no-power, disconnected, and blocked states in the inspector.
- [ ] Show coal emissions, restoration health, daylight, water shortage, and storage status in understandable terms.
- [ ] Provide pause, save status, recovery, and backup/import controls with useful failure messages.
- [x] Keep fixture diagnostics, IDs, construction test controls and test-data saving outside the production game UI.
- [x] Check implemented menu/controls keyboard focus, input ownership and accessibility; tested migration UI states pass axe.
- [ ] Repeat accessibility and readable-feedback checks for future inventory, research, machines and restoration HUD.

## Step 3 Balance the complete opening and objective

- [ ] Play from a genuinely empty new world without debug grants or pre-unlocked research.
- [ ] Record the time and materials needed for salvage, basic crafts, research payments, equipment crafting, and first automation.
- [ ] Tune their combined cost so research does not accidentally leave the player unable to build what they unlocked.
- [ ] Confirm the authored map supplies enough resources for a viable objective route.
- [ ] Compare coal-heavy and cleaner layouts, including a night interval and recoverable environmental damage.
- [ ] Remove unexplained waiting and unclear failure states before adding more content.

## Step 4 Measure and address performance

- [ ] Measure rendering frame time, fixed-step cost, published-view cost, and save capture/write duration on a representative factory.
- [x] Record small-fixture production asset/request sizes and stationary/movement RAF intervals with renderer/method metadata. This does not measure factory simulation/save cost or qualify target hardware.
- [ ] Check whether Angular views update only when useful values change, rather than on every renderer frame.
- [ ] Avoid unnecessary full-world copying outside snapshot capture and avoid recreating meshes/materials each frame.
- [ ] Measure the bundle and set meaningful warning/error budgets for this project.
- [x] Verify pause/resume and five-step catch-up using controlled long frame deltas plus browser focus/modal transitions.
- [ ] Add workers or a more complex state library only if a measured problem warrants their added complexity.

## Step 5 Verify the production build

- [x] Run production build/test commands and serve the migration output through a local static preview.
- [x] Verify production routes, scene/world/character loading, input, console output and exclusion of Phaser/retired assets/development UI.
- [ ] Repeat the complete asset/font/input/resize route after the factory HUD and final content exist.
- [ ] Verify real IndexedDB save/reload, recovery, and JSON transfer under the preview origin.
- [x] Check migration resize behavior and Chromium at device pixel ratios 1 and 2.
- [ ] Qualify the intended desktop browser/device support matrix with the complete prototype.
- [x] Recreate the canvas host and repeat pause/focus transitions without duplicate callbacks or stuck controls in migration tests.
- [ ] Document that another hosting origin has its own browser saves; use export/import to transfer a run.

## Step 6 Run the complete acceptance route

- [ ] Start empty, walk to scrap, and craft basic materials.
- [ ] Save mid-craft, restore, and finish once.
- [ ] Meet a production milestone, spend stock elsewhere, observe research rejection, replenish, and unlock once.
- [ ] Craft and place the generator and recycler; automate input and output through conveyors.
- [ ] Save with a running job, transit items, stored energy/water, and unfinished restoration.
- [ ] Step original and restored branches with the same commands and compare results.
- [ ] Sustain the greenhouse through the required day/night interval with a viable layout.
- [ ] Reject an invalid load/import and inject a failed save write while preserving the current world and last good revision.
- [ ] Export the run, import into a new slot, and repeat the continuation comparison.
- [ ] Complete the route without console errors or broken input after pause, resize, or host recreation.

## Step 7 Prepare portfolio material

- [ ] Write a concise project description explaining the restoration setting, environmental trade-off, and production-based research.
- [ ] Explain the Angular presentation boundary, plain TypeScript simulation, Babylon adapter, and versioned local-save repository.
- [ ] Record a short reproducible route or capture screenshots showing both early and restored states.
- [ ] Document setup commands, controls, save ownership, known limitations, and the supported prototype scope.
- [x] Document current migration setup, controls, ownership, limitations and evidence; explicitly separate settings storage from future gameplay saves.
- [ ] Separate future ideas such as remote control and cloud saves from completed features.
- [ ] Prepare the production artifact and hosting instructions. Publish when you choose the destination and are ready to release.

## Completion checks

- [ ] A new player can understand and complete the small-map objective.
- [ ] A restored run behaves the same as the original through the acceptance route.
- [ ] Presentation follows the agreed art direction and the protagonist remains easy to locate.
- [ ] The production build works under its intended static-serving setup with no outstanding blocking errors.
- [ ] The portfolio material describes demonstrated behavior and clearly states remaining limitations.

## Notes and implementation issues

| Possible issue                                            | Implementation guidance                                                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Polishing adds more systems before the demo is complete   | Finish the acceptance route on the existing map before expanding scope.                                                 |
| Concept assets appear blurry or misaligned                | Prepare runtime exports, consistent pivots, and size rules; generated concept art is not automatically animation-ready. |
| A debug-stocked start hides progression problems          | Balance from the empty new-world factory and include both research and equipment costs.                                 |
| The demo works in development but fails from static files | Check the built artifact through a static server, including relative assets and browser-storage origin.                 |
| Canvas interaction is the only way to understand status   | Provide readable Angular inspection and status controls, with keyboard access and clear focus handling.                 |
| Performance work grows into an unnecessary rewrite        | Measure the bottleneck first and make the smallest change that addresses it.                                            |

Record implementation notes here:

| Date            | Observation or decision                                                             | Follow-up and status                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4 October 2026  | Foundation only; current source inspected.                                          | See Current implementation above; unchecked gameplay requirements remain open.                                                                                     |
| 23 October 2026 | Migration presentation/UI, production packaging and small-scene profiling verified. | Credits above apply to the migration fixture only. Full acceptance route, representative factory/target-hardware performance and portfolio release remain pending. |

## References and diagrams

- [Complete acceptance route](README.md#acceptance-route-and-focused-checks)
- [Application interaction diagram](../design/TDD.md#application-system-interaction-diagram)
- [Module dependency diagram](README.md#module-dependency-diagram)
- [Preferred art finish](../art/README.md#preferred-finish-across-all-artwork)
- [Prototype scope](../design/GDD.md#prototype-scope-and-later-possibilities)
