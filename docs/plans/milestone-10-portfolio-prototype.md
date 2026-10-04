# Milestone 10 Portfolio prototype

Updated 4 October 2026. Status: foundation only. Prerequisite: [Milestone 9](milestone-09-save-resilience.md).

Turn the working systems into an understandable small-map demo that can be shown in your portfolio. Prioritize a complete playable route, readable feedback, and reliable persistence before expanding the map or technology tree.

[High-level plan](README.md) · [Previous milestone](milestone-09-save-resilience.md)

## Current implementation

The shell, Play Game action, current canvas sizing, runtime lifecycle, logo/cursor assets, source artwork, and repository documentation are in place. The latest application checks pass 24 tests, normal lint, and production build; the preceding shell axe audits passed. These checks do not prove a complete factory loop or accessible future HUD. Manual progression, research, automation, restoration, reliable gameplay saves, and portfolio balancing remain open.

## Step 1 Prepare a consistent presentation

- [ ] Audit the placeholder assets against the Art Document's preferred flat finish and angled overhead square-grid view.
- [ ] Replace terrain and machines gradually, keeping the progression from improvised scrap construction to clean advanced technology readable.
- [ ] Prepare runtime sprite dimensions, pivots, footprints, and any directional/animation frames before using concept artwork as game assets.
- [ ] Keep the protagonist readable against both derelict and restored terrain through silhouette, contrast, and a clear selection/position cue.
- [ ] Drive the gradual landscape transition from environmental state while equipment appearance follows its own technology stage.
- [ ] Check asset licenses and maintain attribution for anything used in the demo.

## Step 2 Finish feedback and onboarding

- [ ] Add a short opening objective that leads an empty-handed player toward scrap and manual recipes.
- [ ] Explain research's Produced and Available requirements before the first payment.
- [ ] Show machine input, output, no-power, disconnected, and blocked states in the inspector.
- [ ] Show coal emissions, restoration health, daylight, water shortage, and storage status in understandable terms.
- [ ] Provide pause, save status, recovery, and backup/import controls with useful failure messages.
- [ ] Keep diagnostics such as tick timings and IDs in a development panel rather than the normal game flow.
- [ ] Check keyboard focus, menu input ownership, readable contrast, and accessible Angular controls against the application's accessibility requirements.

## Step 3 Balance the complete opening and objective

- [ ] Play from a genuinely empty new world without debug grants or pre-unlocked research.
- [ ] Record the time and materials needed for salvage, basic crafts, research payments, equipment crafting, and first automation.
- [ ] Tune their combined cost so research does not accidentally leave the player unable to build what they unlocked.
- [ ] Confirm the authored map supplies enough resources for a viable objective route.
- [ ] Compare coal-heavy and cleaner layouts, including a night interval and recoverable environmental damage.
- [ ] Remove unexplained waiting and unclear failure states before adding more content.

## Step 4 Measure and address performance

- [ ] Measure rendering frame time, fixed-step cost, published-view cost, and save capture/write duration on a representative factory.
- [ ] Check whether Angular views update only when useful values change, rather than on every renderer frame.
- [ ] Avoid unnecessary full-world copying outside snapshot capture and avoid recreating sprites each frame.
- [ ] Measure the bundle and set meaningful warning/error budgets for this project.
- [ ] Verify pause/resume and bounded catch-up under a deliberate frame stall.
- [ ] Add workers or a more complex state library only if a measured problem warrants their added complexity.

## Step 5 Verify the production build

- [ ] Run the production build and test commands, then serve the output through a local static preview.
- [ ] Check asset paths, fonts, scene startup, input, resize, and console output in the production bundle.
- [ ] Verify real IndexedDB save/reload, recovery, and JSON transfer under the preview origin.
- [ ] Check smaller viewports and the desktop browsers you intend to support.
- [ ] Recreate the canvas host and repeat pause/focus transitions without duplicate callbacks or stuck controls.
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
- [ ] Explain the Angular presentation boundary, plain TypeScript simulation, Phaser adapter, and versioned local-save repository.
- [ ] Record a short reproducible route or capture screenshots showing both early and restored states.
- [ ] Document setup commands, controls, save ownership, known limitations, and the supported prototype scope.
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

| Date           | Observation or decision                    | Follow-up and status                                                           |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| 4 October 2026 | Foundation only; current source inspected. | See Current implementation above; unchecked gameplay requirements remain open. |

## References and diagrams

- [Complete acceptance route](README.md#acceptance-route-and-focused-checks)
- [Application interaction diagram](../design/TDD.md#application-system-interaction-diagram)
- [Module dependency diagram](README.md#module-dependency-diagram)
- [Preferred art finish](../art/README.md#preferred-finish-across-all-artwork)
- [Prototype scope](../design/GDD.md#prototype-scope-and-later-possibilities)
