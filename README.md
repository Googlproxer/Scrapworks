# Scrapworks

Scrapworks is a browser-first 3D factory-restoration game built with Angular and TypeScript. The player starts empty-handed, salvages and crafts materials, researches machinery, automates production, and restores a damaged planet.

The [player progression design](docs/design/player-progression.md) records the planned research-led opening, Mini Fabricator, renewable-first industry and peaceful terraforming. These are design requirements; the implementation status remains in the [roadmap](docs/plans/README.md).

Babylon.js is the sole world renderer and Babylon.js Editor owns scene/world-layout authoring. The single Miniplex worker implements the empty-handed opening, manual local saves, shared research, renewable industry, transport and M8 restoration/water/expanded energy. The [restoration catalogue](docs/design/restoration-catalogue.md) records provisional rates, paid equipment, weather, batteries and optional coal. The current map is 20 by 20 cells with an eight-cell lake and generous scrap/coal. M8 local acceptance is complete; see the [roadmap](docs/plans/README.md) for evidence and limits.

Start with the [documentation index](docs/README.md), [3D cleanup record](docs/plans/3d-cleanup.md), and [implementation roadmap](docs/plans/README.md). Editable Blender projects, artwork, references and provenance are indexed in [art/](art/README.md); visual guidance remains in the [Art Document](docs/art/README.md).

The [local portfolio handoff](docs/portfolio/README.md) explains the objective guide/field manual, controls, named runs/autosave/recovery/JSON transfer, static preview and portable Chromium/Firefox hardware diagnostic. It separates current-asset baseline evidence from later asset qualification and the user's pending human pacing playtest.

## Technology and ownership

The [migration plan](docs/plans/3d-migration.md) records the current integration and validation work. At Phase 7, update milestone progress and stop; migration work does not authorize continuing the later gameplay milestones.

| Responsibility        | Direction                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Application interface | Angular 22, signals, CDK dialogs/overlays, and SCSS.                                                                                             |
| World presentation    | Babylon.js 9: rendering, camera, picking, animation, effects, and input adaptation.                                                              |
| Scene authoring       | One Babylon.js Editor project in this repository. Attached scripts handle presentation and scene bindings.                                       |
| Gameplay              | Strict TypeScript 6, independent of Angular, Babylon, the DOM, and storage. A plain world/session owns fixed-step movement and footprint checks. |
| Saves                 | Schema-1 manual local saves through Dexie/IndexedDB, with Continue, visible crafting resume and guarded world replacement.                       |
| Tests                 | Vitest with Playwright/headless Chromium, plus separate lint-tooling checks.                                                                     |

Keep gameplay rules and saved world state outside scene components. `GameClient` reports renderer lifecycle; it is not the world-state model.

## Getting started

Use Node compatible with the installed Angular tooling: 22.22.3 or later within 22.x, 24.15.0 or later within 24.x, or 26.0.0 and later. The package manager is Yarn 4.18.1, recorded in `package.json` .

From the `scrapworks` directory:

```sh
yarn
yarn test:setup
yarn dev
```

Visit [localhost:4200](http://localhost:4200) and select New Game or Continue; `/3d` is a compatibility redirect. Open `scrapworks.bjseditor` in Babylon.js Editor 5.5.2 to edit `assets/main-menu.scene` or `assets/game.scene` . Follow the [Editor/MCP setup guide](docs/plans/babylon-editor-setup.md) for authoring and workstation setup.

The development command exports scenes before starting Angular, then watches saved Editor inputs and attached presentation scripts. Save in the Editor to export and reload automatically. On Linux, Angular polls for changes every 500 ms so atomically replaced scene assets trigger a browser reload; an explicit `--poll` option overrides that interval. The authoring watcher still uses native filesystem events. Failed exports leave the last working scenes available and report the error in the terminal; correcting the save retries. See the [workflow validation](docs/reports/workflow/2026-10-23/README.md).

In a development build, select **Inspector** to load the [Babylon.js Inspector](https://doc.babylonjs.com/toolsAndResources/inspectorv2) for the current scene. Select **Close Inspector** at the top of the viewport to restore the game interface and focus; click the viewport to resume movement. Gameplay and application menu input pause while the Inspector owns input, and changing scenes or unmounting closes it. Scene edits are temporary runtime diagnostics; save authored changes through the Editor workflow. The Inspector and its UI/editor dependencies are excluded from production builds through a development-only loader replacement. Restart an already-running dev server after installing these dependencies or changing `angular.json`.

## Development commands

| Command                            | Purpose                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `yarn dev`                         | Export scenes, start Angular, and watch saved authoring changes.                                            |
| `yarn build`                       | Export scenes and create a development build with source maps and developer tools.                        |
| `yarn build:stats`                 | Create the development build and its `browser-stats.json` for analysis.                                    |
| `yarn build:prod`                  | Export scenes and create an optimized production build for deployment.                                   |
| `yarn build:prod:stats`            | Create the production build and its `browser-stats.json` for analysis.                                     |
| `yarn scenes:export`               | Pack saved Editor inputs into generated browser assets and the script registry.                             |
| `yarn test`                        | Run the complete Chromium application/renderer suite locally.                                              |
| `yarn test:unit`                   | Run Chromium UI, input/capture and Inspector ownership tests without creating Babylon engines.              |
| `yarn test:ci`                     | Collect focused Chromium UI, accessibility and IndexedDB coverage, excluding the real-renderer suites.      |
| `yarn test:renderer`               | Run real Babylon device, lifecycle, renderer and authored-world integration tests locally.                 |
| `yarn test:export`                 | Check staged export, retention, physics guards and watcher behavior.                                        |
| `yarn test:game`                   | Typecheck and run Node simulation, domain, session and worker-transport tests.                              |
| `yarn test:tools`                  | Typecheck tools and run Vitest compiler/export, alias, coverage, dependency-audit and lint-rule tests.      |
| `yarn test:coverage`               | Run both coverage groups and generate separate Game and Tooling reports.                                    |
| `yarn test:coverage:game`          | Collect and merge Angular browser and Node game coverage.                                                   |
| `yarn test:coverage:tools`         | Collect normal tooling coverage.                                                                            |
| `yarn coverage:report`             | Regenerate reports and print both totals from collected results.                                            |
| `yarn test:labs`                   | Run opt-in laboratory unit tests through Vitest without performance trials.                                 |
| `yarn test:world`                  | Run focused authored marker compilation and world-export validation tests.                                  |
| `yarn test:worker:smoke`            | Check the built worker with a tiny fixture and no renderer; run `yarn build:prod:stats` first.                |
| `yarn test:acceptance`             | Locally exercise built-game loading, movement, pause, crash/Retry and teardown; requires production stats.  |
| `yarn test:saves`                  | Locally check built-game save history, backup/import, reload and accessibility.                             |
| `yarn test:research`               | Locally check the built-game research queue, legacy continuation, reload and accessibility.                |
| `yarn test:browser:diagnostics`     | Locally run renderer tests, build production, then normal/stalled acceptance, saves, research and dev reload. |
| `yarn test:factory`                | Run the empty-handed built-UI factory, powered labs and saved continuation route with a virtual test clock. |
| `yarn test:workflow`               | Locally verify dev reload/failure recovery in an isolated browser fixture.                                  |
| `yarn test:watch`                  | Export scenes once, then watch application tests.                                                           |
| `yarn test:setup`                  | Install the matching Playwright Chromium headless shell.                                                    |
| `yarn lint`                        | Check TypeScript and Angular templates through the shared ESLint configuration.                             |
| `yarn test:lint`                   | Check the custom rule and combined lint configuration.                                                      |
| `yarn format`                      | Apply ESLint fixes and Prettier to application source.                                                      |
| `node tools/cleanup/check-docs.ts` | Check documentation links, anchors, and Mermaid source consistency.                                         |

Direct Angular targets need `yarn scenes:export` first. Do not rely on an old `public/scene/` export or generated `src/scripts.ts` from a previous checkout.

Occasional asset/repository audits, Editor connection checks and ECS/worker investigations use direct Node commands documented in the [tool catalogue](tools/README.md). Their package aliases have been removed; the catalogue includes replacements for commands found in historical reports. Tests, primary development commands and commands used by main CI remain package scripts.

Plain game `.test.ts` suites sit beside their production code in [src/session](src/session/) and [src/simulation](src/simulation/). Shared fixtures and browser acceptance probes remain under [tests](tests/README.md). Angular/browser suites use `.spec.ts`; the two runners discover their own suffix explicitly. `yarn test:game` uses Vitest in a real Node environment without Angular, scene export or a browser. Tool tests stay beside the tools they exercise. The [test audit](tests/README.md#audit-of-tests-previously-under-tools) records the separation and all relocated entry points.

Use `yarn test:game` for plain simulation/session changes and `yarn test:unit` for browser UI/input changes, or `yarn test:unit --watch` while editing. The browser unit tests use client/device/scene doubles and run in Chromium for DOM, IndexedDB, focus and accessibility checks. They currently need scene export for the default factory's generated script imports, even though they never construct its renderer. `yarn test:renderer` covers the tests that need a real engine: browser device wiring, native Babylon lifecycle, WebGL/context loss, authored assets, animation and picking. `yarn test:ci` combines Angular's `unit,coverage` configurations; `yarn test` runs both Chromium groups locally. Add future engine-dependent suites to the unit exclusions and renderer includes in `angular.json`. Full browser tests, renderer tests, full game coverage and longer browser probes reject `CI`/`GITHUB_ACTIONS`; see the [local diagnostic commands](tests/README.md#browser-acceptance).

Renderer behavior suites prepare the real authored world and character once per suite using [Babylon scene serialization](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Misc/sceneSerializer.ts). The test-only `AuthoredWorldFixture` retains JSON strings after disposing its source engine, then restores fresh geometry, materials, skeletons, animation groups and world definitions for each test. `WorldScene` tests reuse one engine's compiled shaders, reset render state and dimensions, and dispose every test scene; client lifecycle/context-loss tests retain separate engines. Scripts and simulation sessions are always reconstructed. An isolation regression mutates and disposes one owner while another remains usable. The client authored-load check, WorldScene construction-failure check and Angular Play Game/Retry tests still use the uncached production loaders, so snapshots do not replace end-to-end import coverage. Snapshots are rebuilt from the current exported assets on each test/watch run and are never committed.

Application tests fail on unexpected `console.error`, `console.warn` or `console.trace` calls, including module imports and Angular teardown. Failure-path tests declare exact messages with `expectConsoleMessage` from `src/testing/console-policy.ts`; missing expected messages also fail. The setup remains active when tests restore mocks. Dexie's development-only traces are asserted in the storage-failure tests when Chromium async-task debugging is available.

## Continuous integration and dependency updates

[GitHub Actions CI](.github/workflows/ci.yml) runs on pull requests, pushes to `master`, and manual dispatch. It keeps one job with a 15-minute timeout, a shallow checkout, `ubuntu-latest`, Node 26 and the Yarn version pinned in `package.json`. Chromium and its Linux dependencies are installed before focused browser checks.

CI restores both the Yarn download cache and an exact installed-dependency cache containing `node_modules` and `.yarn/install-state.gz`. Installed dependencies are keyed by OS, architecture, Ubuntu image family, exact Node version, lockfile, Yarn configuration, root/local Editor plugin manifests and Yarn patches. There is no stale-key fallback for native packages. Every run still executes `yarn install --immutable`; a miss falls back to Yarn's download cache and a normal install. Only `master` saves the installed-dependency cache, immediately after a successful install, so PRs reuse it without writing large duplicate caches. See the [cache action](https://github.com/actions/cache) and [Yarn install-state guidance](https://yarnpkg.com/configuration/yarnrc#installStatePath).

CI prints separate Game and Tooling coverage tables in the Actions run summary and logs, with HTML/LCOV/JSON artifacts retained for seven days. Coverage is informational and includes untested files within each report scope. See [coverage commands and exclusions](tests/README.md#coverage).

Normal CI validates the shipping application, production simulation/session correctness, built-worker messaging and dependency separation. It runs no ECS/worker benchmark or comparison commands. The existing separate [ECS investigation](.github/workflows/ecs-bench.yml) and [worker qualification](.github/workflows/simulation-worker-bench.yml) workflows are opt-in investigations; the browser diagnostics removed from CI remain local-only, including on manual CI dispatch. The build-graph audit under `tools/ecs-bench/verify-production.ts` is a production dependency check and launches no benchmark trials.

CI exports authored scenes, then runs lint, tooling tests (including lint rules, scene export and world compilation), documentation checks, all Node game simulation/session tests, focused Chromium UI/accessibility/IndexedDB tests, a production build, architecture/dependency audits, a bounded compiled-worker fixture and built-asset validation. The worker fixture warms the real module worker/WASM and checks two simulation ticks, transferred rows, pause, capture/restore and disposal without Angular, Babylon rendering or gameplay progression. Successful runs retain the production build for seven days; focused browser failure artifacts are uploaded on failure. Real-renderer integration, production loading/stall profiles, save/research browser acceptance and development reload/recovery run through `yarn test:browser:diagnostics` locally. The workflow validates and packages the application; deployment remains a separate task.

[Dependabot](.github/dependabot.yml) checks Yarn dependencies and GitHub Actions every Monday at 09:00 Australia/Sydney. Related Angular, Babylon, navigation, React/Fluent UI, browser-test, and lint packages are grouped; other minor/patch updates share a group and other major updates get separate PRs. Angular framework, CLI/devkit, CDK, and Angular ESLint major-version updates are excluded from Dependabot version updates: perform these upgrades manually with `ng update` so package migrations run. Angular minor and patch updates remain enabled. Actions use major-version tags maintained by Dependabot. Review Babylon Editor compatibility when merging dependency updates; CI does not run upgrade migrations or automatically merge PRs. Keep the local Editor MCP package's pinned `jiti` loader aligned with the root development dependency when updating it.

These configurations take effect after they are committed and pushed to GitHub; Dependabot configuration must be present on the default branch. Repository branch rules and Dependabot security-update settings are managed separately in GitHub. To require CI before merging, select the `Lint, test and build` check in the branch rule for `master` after its first run.

The local Editor MCP package uses Yarn's `portal:` protocol so Windows and Linux installs share the same lockfile without platform-dependent file-archive permission hashes.

## Source and asset layout

| Path                               | Purpose                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `src/app/`                         | Angular UI, routed page, scoped runtime, viewport, and current save experiment.    |
| `src/contracts/`                   | Plain renderer lifecycle, client, and event contracts.                             |
| `src/game/`                        | Active 3D presentation adapter and authored-scene loader.                          |
| `src/simulation/`                  | Plain authoritative world, fixed movement and collision/placement rules.           |
| `src/session/`                     | Renderer-neutral host coordination, presentation cache and simulation ports.       |
| `src/core/`                        | Framework-independent utilities.                                                   |
| `tests/`                           | Node game tests, fixtures/reference oracle and real application acceptance probes. |
| `scrapworks.bjseditor` , `assets/` | Authored Editor project and complete scene/asset sources.                          |
| `public/scene/` , `src/scripts.ts` | Generated Editor exports and script map; ignored by Git.                           |
| `public/assets/`                   | Browser-served assets, including existing runtime copies still in use.             |
| `art/`                             | Blender projects, source artwork, references, prompts and provenance.              |
| `docs/`                            | Design, plans, visual guidance, diagrams and current validation.                   |
| `tools/`                           | Scene export, Editor connection, art, diagram, and cleanup utilities.              |

Gameplay coordinates use metres on an X/Z ground plane; Editor coordinates use centimetres. Saved marker metadata compiles to `public/scene/worlds/game.json` in the same staged export as the scenes. The simulation creates an empty-handed world from that definition; scene serialization is not a gameplay save. See [marker authoring](tools/world/README.md).

## Validation and current limits

The [migration validation](docs/reports/migration/2026-10-23/README.md) and its refinements record the implemented lifecycle, input, world and character checks. The [28 October cleanup record](docs/plans/3d-cleanup.md) covers retirement of superseded tools and source assets. These checks do not establish factory progression, gameplay saves or target-device performance.

Browser tests require real canvas/WebGL APIs. Reinstall the headless browser after Playwright upgrades. Failure screenshots are ignored under `.vitest/` .

Use `eslint.config.ts` for application lint, Angular template accessibility, the typed custom access-modifier rule, and Prettier integration. ESLint loads the config through the explicit `jiti` development dependency; Node 24 runs the TypeScript tooling tests directly. `yarn test:lint` strictly typechecks all repository tools and the config/rules/tests before running the lint-rule tests. See the [tooling guide](tools/README.md#typescript-tooling) for direct commands and the two Editor compatibility loaders. Formatting preferences are in `.prettierrc` ; recommended editor extensions are under `.vscode/` .

ESLint Stylistic requires a blank line around functions, interfaces, multiline type aliases, enums and exported declarations, and between class methods/constructors and their neighbours. Blank lines between single-line type aliases are optional. Related class fields and imports can stay grouped. Prettier preserves this spacing; `yarn format` applies both tools, and explicit saves in VS Code also run ESLint fixes. Use `yarn lint:fix` to apply the spacing rules directly.

## Production build

```sh
yarn build:prod
```

The production configuration enables optimization (minification, tree-shaking and dead-code elimination), hashes output filenames, extracts licenses and disables source maps. Development builds use `yarn build`, retaining source maps, Inspector and debug drawing support with optimization disabled. Both modes write the static browser application to `dist/scrapworks/browser/`, replacing the previous build. Use `--output-path <directory>` to keep builds separately.

Use `yarn build:stats` for development analysis or `yarn build:prod:stats` for production analysis. Angular writes `dist/scrapworks/browser-stats.json`, outside the deployable `browser/` directory; a custom output path moves it to `<directory>/browser-stats.json`.

Configure the host to serve `index.html` for application routes. The [export policy](tools/scenes/export-policy.json) retains live public assets and scene-declared dependencies; original character projects remain outside deployment. See [migration production evidence](docs/reports/migration/2026-10-23/README.md) and [retired-source recovery](docs/plans/3d-cleanup.md#recovery). Record fresh measurements when changing production assets.

All package build commands generate smaller Brotli-compressed files alongside the originals (`main-*.js.br`, worker chunks, CSS, HTML and compressible scene/model assets). Images and existing compressed files are skipped. Extra arguments still pass through to Angular, including `--output-path`. The build uses Node's built-in Brotli encoder at quality 11 and adds no runtime dependency. To regenerate sidecars for an existing build, run `node tools/build/compress.ts` (or pass a browser-output directory).

Upload the originals and their `.br` sidecars together. When hosting is chosen, configure content negotiation to serve the `.br` sibling for requests accepting Brotli, with `Content-Encoding: br`, `Vary: Accept-Encoding`, and the original file's content type. Keep the original URL in the application and fall back to the original file for other clients. Generating sidecars does not configure a web server or change `yarn dev`.

## License

Scrapworks is licensed under the MIT License. See [LICENSE](LICENSE). Preserve individual third-party asset licenses and provenance alongside their sources.
