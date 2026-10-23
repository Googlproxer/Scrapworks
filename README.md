# Scrapworks

Scrapworks is a browser-first 3D factory-restoration game built with Angular and TypeScript. The player starts empty-handed, salvages and crafts materials, researches machinery, automates production, and restores a damaged planet.

Babylon.js is the sole world renderer and Babylon.js Editor owns scene/world-layout authoring. The migration adds an authored world definition, authoritative fixed-step movement and construction-preview validation. Manual salvage, crafting, research, factory systems and gameplay saving remain future milestones.

Start with the [documentation index](docs/README.md), [3D cleanup plan](docs/plans/3d-cleanup.md), and [implementation roadmap](docs/plans/README.md). Earlier 2D work is indexed under [history](docs/history/README.md). Editable Blender projects, artwork, references and provenance are indexed in [art/](art/README.md); visual guidance remains in the [Art Document](docs/art/README.md).

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

The development command exports scenes before starting Angular, then watches saved Editor inputs and attached presentation scripts. Save in the Editor to export and reload automatically. Failed exports leave the last working scenes available and report the error in the terminal; correcting the save retries. See the [workflow validation](docs/reports/workflow/2026-10-17/README.md).

In a development build, select **Inspector** to load the [Babylon.js Inspector](https://doc.babylonjs.com/toolsAndResources/inspectorv2) for the current scene. Select **Close Inspector** at the top of the viewport to restore the game interface and focus; click the viewport to resume movement. Gameplay and application menu input pause while the Inspector owns input, and changing scenes or unmounting closes it. Scene edits are temporary runtime diagnostics; save authored changes through the Editor workflow. The Inspector and its UI/editor dependencies are excluded from production builds through a development-only loader replacement. Restart an already-running dev server after installing these dependencies or changing `angular.json`.

## Development commands

| Command                             | Purpose                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `yarn dev` | Export scenes, start Angular, and watch saved authoring changes.                |
| `yarn build` | Export scenes, then create a production build.                                  |
| `yarn scenes:export` | Pack saved Editor inputs into generated browser assets and the script registry. |
| `yarn test` | Export scenes and run the Chromium application suite once.                      |
| `yarn test:export` | Check staged export, retention, physics guards and watcher behavior.            |
| `yarn test:world` | Run authored marker, coordinate, movement, scheduler and placement checks in Node without a renderer. |
| `yarn test:workflow` | Verify dev reload/failure recovery in an isolated browser fixture.              |
| `yarn test:watch` | Export scenes once, then watch application tests.                               |
| `yarn test:setup` | Install the matching Playwright Chromium headless shell.                        |
| `yarn lint` | Check TypeScript and Angular templates through the shared ESLint configuration. |
| `yarn test:lint` | Check the custom rule and combined lint configuration.                          |
| `yarn format` | Apply ESLint fixes and Prettier to application source.                          |
| `yarn editor:mcp:check` | Check the desktop Editor connection with the project open.                      |
| `node tools/cleanup/check-docs.mjs` | Check documentation links, anchors, and Mermaid source consistency.             |

Direct Angular targets need `yarn scenes:export` first. Do not rely on an old `public/scene/` export or generated `src/scripts.ts` from a previous checkout.

## Source and asset layout

| Path                                                          | Purpose                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/app/` | Angular UI, routed page, scoped runtime, viewport, and current save experiment. |
| `src/contracts/` | Plain renderer lifecycle, client, and event contracts.                          |
| `src/game/` | Active 3D presentation adapter and authored-scene loader.                       |
| `src/simulation/` | Plain authoritative world, fixed movement and collision/placement rules. |
| `src/core/` | Framework-independent utilities.                                                |
| `scrapworks.bjseditor` , `assets/` | Authored Editor project and complete scene/asset sources.                       |
| `public/scene/` , `src/scripts.ts` | Generated Editor exports and script map; ignored by Git.                        |
| `public/assets/` | Browser-served assets, including existing runtime copies still in use.          |
| `art/` | Blender projects, source artwork, references, prompts and provenance.           |
| `docs/` | Design, plans, visual guidance, diagrams and historical documentation.          |
| `map/` | Historical Tiled sources.                                                       |
| `tools/` | Scene export, Editor connection, art, diagram, and cleanup utilities.           |

Gameplay coordinates use metres on an X/Z ground plane; Editor coordinates use centimetres. Saved marker metadata compiles to `public/scene/worlds/game.json` in the same staged export as the scenes. The simulation creates an empty-handed world from that definition; scene serialization is not a gameplay save. See [marker authoring](tools/world/README.md).

## Validation and current limits

The [17 October baseline](docs/plans/3d-cleanup-baseline.md) records the passing build/lint, 33 Chromium tests, 30 lint-tooling tests, and verified pre-cleanup checkpoint. Tests cover renderer lifecycle, actual Play Game/Retry actions, loading failures, resizing, late-load disposal, and shell accessibility. They do not establish complete gameplay, storage resilience, or finished character animation.

Browser tests require real canvas/WebGL APIs. Reinstall the headless browser after Playwright upgrades. Failure screenshots are ignored under `.vitest/` .

Use `eslint.config.mjs` for application lint, Angular template accessibility, the custom access-modifier rule, and Prettier integration. Formatting preferences are in `.prettierrc` ; recommended editor extensions are under `.vscode/` .

## Production build

```sh
yarn build
```

The static browser application is written to `dist/scrapworks/browser/` . Configure the host to serve `index.html` for application routes. The [17 October asset/export audit](docs/reports/assets/2026-10-17/README.md) preserves the earlier packaging measurements. The current runtime retains only live public assets and scene-declared dependencies. Historical maps, the final terrain atlas and original character sources remain outside deployment. Retired authored scenes are [recoverable from Git commit `6cd9f6f`](assets/README.md#recovering-retired-scene-sources). Record fresh measurements after the final migration build rather than reusing the earlier totals.

## License

Scrapworks is licensed under the MIT License. See [LICENSE](LICENSE). Preserve individual third-party asset licenses and provenance alongside their sources.
