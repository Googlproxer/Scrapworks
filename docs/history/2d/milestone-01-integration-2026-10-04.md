# Milestone 1 Project and integration

Historical integration checklist and evidence from 4 October 2026, archived 17 October. These results describe the earlier Phaser foundation. Use the [current Milestone 1](../../plans/milestone-01-project-and-integration.md) for active work; later validation does not change these dated results.

Updated 4 October 2026. Status: partially complete; Angular–Phaser integration complete.

The shell, component-owned canvas, per-game client bridge, scoped runtime, and lifecycle checks are implemented. This milestone remains open because the representative grid scene, verified browser-storage experiment, custom formatter checks, and dependency commit are unfinished.

[High-level plan](../../plans/README.md) · [Next milestone](../../plans/milestone-02-simulation-foundation.md)

## Starting point and current evidence

All project documentation, diagrams, generation prompts, and source artwork now live inside the `scrapworks/` Git repository. See the [documentation index](../../README.md) for their organisation.

Fresh checks on 4 October 2026:

| Check                                                                                 | Result                                                                              |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `yarn test`                                                                           | 24 tests passed across 8 files in headless Chromium                                 |
| `yarn run lint`                                                                       | Passed using the active `eslint.config.js`                                          |
| `yarn run ng -- build`                                                                | Production build passed                                                             |
| `yarn exec vitest run src/simulation/simulation.spec.ts --environment node --globals` | One plain TypeScript smoke test passed without Angular, Phaser, Dexie, or DOM setup |
| `yarn run test:lint`                                                                  | 20 passed, 2 failed; constructor fixture and formatting integration require review  |

The preceding integration verification on 4 October also checked the routed application at 320×240, 390×844, and 1440×900, keyboard activation of Play Game, and axe audits of menu, gameplay, and required-asset error states. Those audits reported no violations. They cover the current shell, not the future factory HUD.

| Tool or dependency | Installed version on 4 October 2026 |
| ------------------ | ----------------------------------- |
| Node               | 24.21.0                             |
| Yarn               | 4.18.1                              |
| Angular core       | 22.2.1                              |
| Phaser             | 4.2.1                               |
| Dexie              | 4.4.6                               |
| TypeScript         | 6.0.3                               |
| Vitest             | 5.0.3                               |

## Step 1 Stabilize the project setup

- [x] Create the browser Angular application with strict TypeScript settings.
- [x] Install Angular, Phaser, and Dexie and record the installed versions.
- [x] Configure Yarn 4 and generate `yarn.lock`, replacing the npm lockfile.
- [x] Exercise the installed Node, Angular, TypeScript, and Phaser toolchain through successful builds and browser tests.
- [x] Update the README with current commands, source layout, client lifecycle, and browser testing.
- [x] Keep the README's dependency versions at major-version granularity.
- [x] Organise project documentation, art records, and diagrams inside the repository and repair their links.
- [ ] Review and commit the intended dependency setup, Yarn configuration, and lockfile. They remain uncommitted.

## Step 2 Confirm the Angular configuration and boundaries

- [x] Configure standalone components, browser bootstrap, SCSS, and lazy loading of the game page.
- [x] Enable TypeScript strictness and strict Angular template checking.
- [x] Retain strict property initialization without a disabling override.
- [x] Keep the prototype browser-only.
- [x] Separate Angular features in `src/app/features/`, Phaser code in `src/game/`, plain contracts in `src/contracts/`, simulation in `src/simulation/`, and reusable utilities in `src/core/`.
- [x] Provide `GameRuntimeService` on the game page so the page and its Phaser child share one instance.
- [x] Remove the root component's unused runtime injection. Ancestors cannot resolve a provider belonging to a routed child.

Follow [AGENTS.md](../../../AGENTS.md) when writing application code. Future authoritative gameplay belongs in `src/simulation/`; `src/game/` is the Phaser presentation layer.

## Step 3 Establish build and test checks

- [x] Provide development, production, test, test-watch, and normal lint commands.
- [x] Make builds and the complete application suite pass with real headless Chromium rendering.
- [x] Run the simulation queue smoke test separately in Node to prove the plain TypeScript import boundary.
- [x] Test the actual Play Game button, initial disabled state, and transition to a single active Game scene.
- [x] Cover client replay, unsubscribe, loading/error/stopped states, idempotent destruction, and destruction during a notification.
- [x] Cover scoped injection, same-host mounting, host replacement, stale callback rejection, subscription failure, and injector cleanup.
- [ ] Reconcile the separate access-modifier rule tests with their implementation and the active ESLint configuration. The constructor valid fixture and formatting integration currently fail.

The simulation smoke test verifies queueing only. It does not implement typed gameplay commands, world state, fixed steps, or save snapshots.

## Step 4 Complete the canvas lifecycle

- [x] Own the mount element through the Phaser host component's required view query.
- [x] Mount after the Angular element exists and unmount when the component is destroyed.
- [x] Attach client listeners before registering and starting application scenes.
- [x] Replace the global EventBus with the emitter belonging to each Phaser game.
- [x] Retain handlers and their callback context so teardown removes exactly the client's listeners.
- [x] Unsubscribe the runtime before destroying the client; complete the client's RxJS subject and retain stopped-state replay for late subscribers.
- [x] Ignore commands and callbacks after destruction; reject callbacks from an earlier mounted client.
- [x] Make same-host mounts harmless and destroy the previous client when changing hosts.
- [x] Provide injector-destruction cleanup through `DestroyRef`.
- [x] Stop the previous scene before starting another, preventing menu/game overlap.
- [x] Verify three repeated mount/unmount cycles, simultaneous independent games, and immediate host replacement.
- [x] Verify eventual canvas removal and stopped Phaser loops after destruction.

Phaser completes game destruction on a following frame. Runtime state and listener detachment are immediate; tests wait for the loop and canvas cleanup.

## Step 5 Establish a representative scene and responsive interface

- [x] Load the logo, background, and single-pose protagonist assets.
- [x] Mount a full-size canvas with Phaser `RESIZE` and responsive scene layout.
- [x] Publish renderer lifecycle state through plain contracts, RxJS, and readonly Angular signals.
- [x] Expose idle, loading, ready, stopped, and error states; show required-asset failures instead of enabling gameplay.
- [x] Enable Play Game only when MainMenu is ready.
- [x] Verify canvas sizing and menu layout at small and large host sizes.
- [x] Add a screen-reader heading, visible keyboard focus, and readable button/error states; audit the current shell with axe.
- [ ] Draw a small square world grid around the placeholder character.
- [ ] Verify that representative grid, character, camera, and essential controls remain usable on small screens.

The old scene/sprite demo controls have been removed. Their former Add New Sprite regression is superseded by the Play Game regression. The current Player moves directly through Phaser frame updates; authoritative movement arrives in Milestones 2–3.

## Step 6 Prove local browser storage

- [x] Install Dexie and create a development `SaveService` with a `testData` table and a CDK save/load dialog.
- [ ] Identify a disposable experiment record or development slot.
- [ ] Await a committed write and read the plain record back.
- [ ] Reload under the same origin and read that record again.
- [ ] Delete the experiment record and verify its removal.
- [ ] Show operation failure visibly and record the observed round trip.

The current service stores `name`/`value` test records. Its `save()` method does not return or await the write, `load()` logs results instead of restoring a world, and dialog slot occupancy is initialized in memory. This scaffold does not satisfy the storage experiment or Milestone 4.

## Completion checks

- [x] Production build, normal lint, and all application tests pass.
- [x] The current shell starts without unhandled errors, with one canvas per host.
- [x] Host recreation and simultaneous games keep canvases, loops, and per-game listeners independent.
- [x] A plain TypeScript test runs in Node without initializing the renderer.
- [x] Current menu, game, and error states pass the recorded accessibility audits.
- [ ] The representative grid scene loads and remains usable at small viewport sizes.
- [ ] The Dexie experiment survives reload and can be deleted.
- [ ] Separate custom formatter checks pass or their intended role is explicitly resolved.
- [ ] The reviewed dependency setup and lockfile are committed.

## Notes and implementation issues

| Status              | Item                                       | Evidence or next action                                                                                                                                                            |
| ------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete            | Chat-plan Angular–Phaser integration stage | Client teardown, remounting, lifecycle states, button readiness, sizing, regression tests, and README are implemented. This is not completion of every requirement in Milestone 1. |
| Complete            | Runtime provider and callback context      | Page-scoped injection and the Phaser event callback's explicit `this` context are covered by tests.                                                                                |
| Complete            | Source organisation                        | Design, plans, source artwork, generation records, and diagrams are inside the repository. Runtime images remain in `public/assets/`.                                              |
| Open                | Representative grid scene                  | Add the grid and check the eventual world projection and essential interface.                                                                                                      |
| Open                | Storage verification                       | A Dexie test-data service exists, but reload persistence and deletion have not been demonstrated by the current tests.                                                             |
| Open                | Custom lint tooling                        | `test:lint` has 2 failures; `eslint.config.js` is active, while `eslint.config.mjs` and the custom rule remain separate.                                                           |
| Open                | Dependency commit                          | Yarn configuration and lockfile are present but uncommitted.                                                                                                                       |
| Deliberate decision | Bundle budgets                             | No bundle-budget work is required at this stage.                                                                                                                                   |
| Future milestone    | Authoritative gameplay and saves           | The current simulation and persistence scaffolds do not yet provide a saved world or factory mechanics.                                                                            |

## References and diagrams

- [Module dependency diagram](../../plans/README.md#module-dependency-diagram)
- [Application interaction diagram](../../design/TDD.md#application-system-interaction-diagram)
- [State ownership and module boundaries](../../design/TDD.md#state-ownership-and-module-boundaries)
- [Art direction](../../art/README.md)
