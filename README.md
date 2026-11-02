# Scrapworks

Scrapworks is a browser-first 3D factory-restoration game built with Angular and TypeScript. The player starts empty-handed, salvages and crafts materials, researches machinery, automates production, and restores a damaged planet.

The [player progression design](docs/design/player-progression.md) records the planned research-led opening, Mini Fabricator, renewable-first industry and peaceful terraforming. These are design requirements; the implementation status remains in the [roadmap](docs/plans/README.md).

Babylon.js is the sole world renderer and Babylon.js Editor owns scene/world-layout authoring. The single Miniplex worker now implements the Milestone 3 empty-handed opening: inventory/salvage, Field Research, safe handcrafting and a requested power-free MiniFab with optional winding. Factory systems and gameplay saving remain later milestones. See the [opening implementation report](docs/reports/milestone-03/2026-11-02/README.md).

Start with the [documentation index](docs/README.md), [3D cleanup record](docs/plans/3d-cleanup.md), and [implementation roadmap](docs/plans/README.md). Editable Blender projects, artwork, references and provenance are indexed in [art/](art/README.md); visual guidance remains in the [Art Document](docs/art/README.md).

## Technology and ownership

The [migration plan](docs/plans/3d-migration.md) records the current integration and validation work. At Phase 7, update milestone progress and stop; migration work does not authorize continuing the later gameplay milestones.

| Responsibility        | Direction                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Application interface | Angular 22, signals, CDK dialogs/overlays, and SCSS.                                                              |
| World presentation    | Babylon.js 9: rendering, camera, picking, animation, effects, and input adaptation.                               |
| Scene authoring       | One Babylon.js Editor project in this repository. Attached scripts handle presentation and scene bindings.        |
| Gameplay              | Strict TypeScript 6, independent of Angular, Babylon, the DOM, and storage. A plain world/session owns fixed-step movement and footprint checks. |
| Saves                 | Versioned plain snapshots through Dexie/IndexedDB; currently a test-data experiment.                              |
| Tests                 | Vitest with Playwright/headless Chromium, plus separate lint-tooling checks.                                      |

Keep gameplay rules and saved world state outside scene components. `GameClient` reports renderer lifecycle; it is not the world-state model.

## Getting started

Use Node compatible with the installed Angular tooling: 22.22.3 or later within 22.x, 24.15.0 or later within 24.x, or 26.0.0 and later. The package manager is Yarn 4.18.1, recorded in `package.json` .

From the `scrapworks` directory:

```sh
yarn
yarn test:setup
yarn dev
```

Visit [localhost:4200](http://localhost:4200) and select Play Game; `/3d` is a compatibility redirect. Open `scrapworks.bjseditor` in Babylon.js Editor 5.5.2 to edit `assets/main-menu.scene` or `assets/game.scene` . Follow the [Editor/MCP setup guide](docs/plans/babylon-editor-setup.md) for authoring and workstation setup.

The development command exports scenes before starting Angular, then watches saved Editor inputs and attached presentation scripts. Save in the Editor to export and reload automatically. On Linux, Angular polls for changes every 500 ms so atomically replaced scene assets trigger a browser reload; an explicit `--poll` option overrides that interval. The authoring watcher still uses native filesystem events. Failed exports leave the last working scenes available and report the error in the terminal; correcting the save retries. See the [workflow validation](docs/reports/workflow/2026-10-23/README.md).

In a development build, select **Inspector** to load the [Babylon.js Inspector](https://doc.babylonjs.com/toolsAndResources/inspectorv2) for the current scene. Select **Close Inspector** at the top of the viewport to restore the game interface and focus; click the viewport to resume movement. Gameplay and application menu input pause while the Inspector owns input, and changing scenes or unmounting closes it. Scene edits are temporary runtime diagnostics; save authored changes through the Editor workflow. The Inspector and its UI/editor dependencies are excluded from production builds through a development-only loader replacement. Restart an already-running dev server after installing these dependencies or changing `angular.json`.

## Development commands

| Command                             | Purpose                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `yarn dev` | Export scenes, start Angular, and watch saved authoring changes.                |
| `yarn build` | Export scenes, then create a production build.                                  |
| `yarn scenes:export` | Pack saved Editor inputs into generated browser assets and the script registry. |
| `yarn test` | Export scenes and run the Chromium application suite once.                      |
| `yarn test:unit` | Run Chromium UI, input/capture and Inspector ownership tests without creating Babylon engines. |
| `yarn test:renderer` | Run the real Babylon device, Toolkit, renderer and authored-world integration tests. |
| `yarn test:export` | Check staged export, retention, physics guards and watcher behavior.            |
| `yarn test:game` | Typecheck and run Node simulation, domain, session and worker-transport tests. |
| `yarn test:tools` | Typecheck tools and run compiler/export, resolver, dependency-audit and lint-rule tests. |
| `yarn test:world` | Run focused authored marker compilation and world-export validation tests. |
| `yarn test:acceptance` | Exercise the built game worker, movement, pause, crash/Retry and teardown; build with `--stats-json` first. |
| `yarn test:workflow` | Verify dev reload/failure recovery in an isolated browser fixture.              |
| `yarn test:watch` | Export scenes once, then watch application tests.                               |
| `yarn test:setup` | Install the matching Playwright Chromium headless shell.                        |
| `yarn lint` | Check TypeScript and Angular templates through the shared ESLint configuration. |
| `yarn test:lint` | Check the custom rule and combined lint configuration.                          |
| `yarn format` | Apply ESLint fixes and Prettier to application source.                          |
| `node tools/cleanup/check-docs.ts` | Check documentation links, anchors, and Mermaid source consistency.             |

Direct Angular targets need `yarn scenes:export` first. Do not rely on an old `public/scene/` export or generated `src/scripts.ts` from a previous checkout.

Occasional asset/repository audits, Editor connection checks and ECS/worker investigations use direct Node commands documented in the [tool catalogue](tools/README.md). Their package aliases have been removed; the catalogue includes replacements for commands found in historical reports. Tests, primary development commands and commands used by main CI remain package scripts.

Plain game tests live under [tests/session and tests/simulation](tests/README.md), with browser acceptance probes under `tests/acceptance`. `yarn test:game` runs without Angular, scene export or a browser. Tool tests stay beside the tools they exercise. The [test audit](tests/README.md#audit-of-tests-previously-under-tools) records the separation and all relocated entry points.

Use `yarn test:game` for plain simulation/session changes and `yarn test:unit` for browser UI/input changes, or `yarn test:unit --watch` while editing. The browser unit tests use client/device/scene doubles and run in Chromium for DOM, IndexedDB, focus and accessibility checks. They currently need scene export for the default factory's generated script imports, even though they never construct its renderer. `yarn test:renderer` covers the tests that need a real engine: browser device wiring, native Toolkit lifecycle, WebGL/context loss, authored assets, animation and picking. `yarn test` continues to run both Chromium groups and remains the CI gate. Add future engine-dependent suites to both test configurations in `angular.json`.

Renderer behavior suites prepare the real authored world and character once per suite using [Babylon scene serialization](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Misc/sceneSerializer.ts). The test-only `AuthoredWorldFixture` retains JSON strings after disposing its source engine, then restores fresh geometry, materials, skeletons, animation groups and world definitions for each test. `WorldScene` tests reuse one engine's compiled shaders, reset render state and dimensions, and dispose every test scene; client lifecycle/context-loss tests retain separate engines. Scripts and simulation sessions are always reconstructed. An isolation regression mutates and disposes one owner while another remains usable. The client authored-load check, WorldScene construction-failure check and Angular Play Game/Retry tests still use the uncached production loaders, so snapshots do not replace end-to-end import coverage. Snapshots are rebuilt from the current exported assets on each test/watch run and are never committed.

Application tests fail on unexpected `console.error`, `console.warn` or `console.trace` calls, including module imports and Angular teardown. Failure-path tests declare exact messages with `expectConsoleMessage` from `src/testing/console-policy.ts`; missing expected messages also fail. The setup remains active when tests restore mocks. Dexie's development-only traces are asserted in the storage-failure tests when Chromium async-task debugging is available.

## Continuous integration and dependency updates

[GitHub Actions CI](.github/workflows/ci.yml) runs on pull requests, pushes to `master`, and manual dispatch. It uses GitHub's `ubuntu-latest` runner, Node 24, and the Yarn version pinned in `package.json`, with an immutable lockfile install and a Yarn download cache. Chromium and its Linux dependencies are installed before browser checks.

Normal CI validates the shipping application, production simulation/session correctness, built-worker lifecycle and dependency separation. It runs no ECS/worker benchmark or comparison commands. The separate [ECS investigation](.github/workflows/ecs-bench.yml) and [worker qualification](.github/workflows/simulation-worker-bench.yml) workflows are manual-only; run them when new performance evidence is needed. The build-graph audit under `tools/ecs-bench/verify-production.ts` is a production dependency check and launches no benchmark trials.

CI exports the authored scenes, then runs lint, tooling tests (including lint rules, scene export and world compilation), documentation checks, game simulation/session tests, Chromium application/accessibility tests, a production build, built-worker acceptance, built-asset validation, and the isolated development reload/recovery check. Successful runs retain the production build for seven days; browser diagnostics are retained when available, including on failure. The workflow validates and packages the application; deployment remains a separate task.

[Dependabot](.github/dependabot.yml) checks Yarn dependencies and GitHub Actions every Monday at 09:00 Australia/Sydney. Related Angular, Babylon, navigation, React/Fluent UI, browser-test, and lint packages are grouped; other minor/patch updates share a group and other major updates get separate PRs. Angular framework, CLI/devkit, CDK, and Angular ESLint major-version updates are excluded from Dependabot version updates: perform these upgrades manually with `ng update` so package migrations run. Angular minor and patch updates remain enabled. Actions use major-version tags maintained by Dependabot. Review Babylon Editor compatibility when merging dependency updates; CI does not run upgrade migrations or automatically merge PRs. Keep the local Editor MCP package's pinned `jiti` loader aligned with the root development dependency when updating it.

These configurations take effect after they are committed and pushed to GitHub; Dependabot configuration must be present on the default branch. Repository branch rules and Dependabot security-update settings are managed separately in GitHub. To require CI before merging, select the `Lint, test and build` check in the branch rule for `master` after its first run.

The local Editor MCP package uses Yarn's `portal:` protocol so Windows and Linux installs share the same lockfile without platform-dependent file-archive permission hashes.

## Source and asset layout

| Path                                                          | Purpose                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/app/` | Angular UI, routed page, scoped runtime, viewport, and current save experiment. |
| `src/contracts/` | Plain renderer lifecycle, client, and event contracts.                          |
| `src/game/` | Active 3D presentation adapter and authored-scene loader.                       |
| `src/simulation/` | Plain authoritative world, fixed movement and collision/placement rules. |
| `src/session/` | Renderer-neutral host coordination, presentation cache and simulation ports. |
| `src/core/` | Framework-independent utilities.                                                |
| `tests/` | Node game tests, fixtures/reference oracle and real application acceptance probes. |
| `scrapworks.bjseditor` , `assets/` | Authored Editor project and complete scene/asset sources.                       |
| `public/scene/` , `src/scripts.ts` | Generated Editor exports and script map; ignored by Git.                        |
| `public/assets/` | Browser-served assets, including existing runtime copies still in use.          |
| `art/` | Blender projects, source artwork, references, prompts and provenance.           |
| `docs/` | Design, plans, visual guidance, diagrams and current validation.          |
| `tools/` | Scene export, Editor connection, art, diagram, and cleanup utilities.           |

Gameplay coordinates use metres on an X/Z ground plane; Editor coordinates use centimetres. Saved marker metadata compiles to `public/scene/worlds/game.json` in the same staged export as the scenes. The simulation creates an empty-handed world from that definition; scene serialization is not a gameplay save. See [marker authoring](tools/world/README.md).

## Validation and current limits

The [migration validation](docs/reports/migration/2026-10-23/README.md) and its refinements record the implemented lifecycle, input, world and character checks. The [28 October cleanup record](docs/plans/3d-cleanup.md) covers retirement of superseded tools and source assets. These checks do not establish factory progression, gameplay saves or target-device performance.

Browser tests require real canvas/WebGL APIs. Reinstall the headless browser after Playwright upgrades. Failure screenshots are ignored under `.vitest/` .

Use `eslint.config.ts` for application lint, Angular template accessibility, the typed custom access-modifier rule, and Prettier integration. ESLint loads the config through the explicit `jiti` development dependency; Node 24 runs the TypeScript tooling tests directly. `yarn test:lint` strictly typechecks all repository tools and the config/rules/tests before running the lint-rule tests. See the [tooling guide](tools/README.md#typescript-tooling) for direct commands and the two Editor compatibility loaders. Formatting preferences are in `.prettierrc` ; recommended editor extensions are under `.vscode/` .

ESLint Stylistic requires a blank line around functions, interfaces, multiline type aliases, enums and exported declarations, and between class methods/constructors and their neighbours. Blank lines between single-line type aliases are optional. Related class fields and imports can stay grouped. Prettier preserves this spacing; `yarn format` applies both tools, and explicit saves in VS Code also run ESLint fixes. Use `yarn lint:fix` to apply the spacing rules directly.

## Production build

```sh
yarn build
```

The static browser application is written to `dist/scrapworks/browser/`. Configure the host to serve `index.html` for application routes. The [export policy](tools/scenes/export-policy.json) retains live public assets and scene-declared dependencies; original character projects remain outside deployment. See [migration production evidence](docs/reports/migration/2026-10-23/README.md) and [retired-source recovery](docs/plans/3d-cleanup.md#recovery). Record fresh measurements when changing production assets.

## License

Scrapworks is licensed under the MIT License. See [LICENSE](LICENSE). Preserve individual third-party asset licenses and provenance alongside their sources.
