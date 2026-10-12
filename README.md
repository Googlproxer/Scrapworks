# Scrapworks

Scrapworks is a browser game project built with Angular and TypeScript.
Angular provides the application shell and interface. Phaser runs the regular game route, while
the Babylon.js prototype at `/3d` starts the [3D migration](docs/plans/3d-migration.md).

The project is at an early stage: the application shell, asset loading, and scene transitions are
in place, with placeholder scenes awaiting game-specific mechanics and content.

## Design and implementation plans

Start with the [documentation index](docs/README.md) or the [implementation roadmap](docs/plans/README.md).
The roadmap records current progress and links all ten milestone checklists. Gameplay design,
technical design, art direction, source artwork, generation records, and diagrams are organised
under `docs/`; browser-served assets remain under `public/assets/`.

## Technology

- Angular 22 for the application interface and build tooling.
- Phaser 4 for rendering and game scenes.
- Babylon.js 9 for the isolated 3D prototype.
- TypeScript 6 with strict type checking.
- SCSS for application styling.
- Vitest through the Angular test runner, using Playwright and headless Chromium for tests.

## Getting started

Install Node.js and yarn. The installed Angular tooling requires Node.js 22.22.3 or later within
22.x, 24.15.0 or later within 24.x, or 26.0.0 and later.

Run these commands from the `scrapworks` directory:

```sh
yarn
yarn run dev
```

Open [localhost:4200](http://localhost:4200/). The development server rebuilds and reloads the
application when source files change. Angular CLI is included in the project dependencies, so a
global installation is unnecessary.

Open [localhost:4200/3d](http://localhost:4200/3d) and select Play Game to view the completed
Phase 1 prototype, including the imported protagonist.

## Development commands

| Command                                            | Purpose                                                     |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `yarn`                                             | Install dependencies from the committed lockfile.           |
| `yarn run dev`                                     | Start the local development server.                         |
| `yarn run ng -- build`                             | Create a production build.                                  |
| `yarn run ng -- build --configuration development` | Build with source maps and without production optimization. |
| `yarn test`                                        | Run tests once in headless Chromium.                        |
| `yarn run lint`                                    | Check Angular, TypeScript, and template rules.              |

## Testing

Tests run in a real Chromium browser using Vitest's Playwright provider. Install the matching
headless browser after `yarn`, and again after upgrading Playwright:

```sh
yarn run test:setup
yarn test
```

Use `yarn run test:watch` to rerun tests as source files change. The existing
`yarn run ng -- test --watch=false` command also uses Chromium through `angular.json` .

Phaser probes canvas capabilities as soon as it is imported. The previous jsdom environment
returned `null` from `canvas.getContext('2d')` , causing Phaser's alpha check to throw before any
tests ran. Browser mode supplies real canvas and WebGL APIs and requires no canvas mocks or
native Node canvas package. See [Angular's browser testing guide](https://angular.dev/guide/testing#running-tests-in-a-browser).

The tests cover client state replay and unsubscribe, scoped runtime injection, remounting and
stale callback rejection, required-asset failures, the actual Play Game button, responsive
canvas sizing, and repeated removal of game loops, canvases, and listeners. Phaser and Babylon
integration tests use real browser rendering. Babylon checks also cover model loading, late-load
cleanup, retry and axe accessibility checks; service tests use a typed test client.
Browser failure screenshots are saved under `.vitest/` and excluded from Git.

## Formatting and access modifiers

Open the `scrapworks` folder as your VS Code workspace and install its recommended ESLint and
Prettier extensions. Prefer explicit `public`, `private`, or `protected` modifiers on class members.
The single ESLint configuration is `eslint.config.mjs`; Prettier preferences are in `.prettierrc`.
It combines the recommended TypeScript and Angular rules with the custom access-modifier and
Prettier rules. Angular template and accessibility rules check both inline and external templates.
The Yarn lint commands, `ng lint`, and the VS Code ESLint extension use this same configuration.

| Command              | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `yarn run format`    | Apply ESLint fixes and format source files with Prettier.             |
| `yarn run lint`      | Check Angular, TypeScript, and template rules without changing files. |
| `yarn run lint:fix`  | Apply fixes supported by the active ESLint rules.                     |
| `yarn run test:lint` | Test the custom access-modifier rule and combined lint configuration. |

## Source layout

| Path                                            | Purpose                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/main.ts`                                   | Bootstrap the Angular application.                                                     |
| `src/app/app.ts` , `app.html` , `app.scss`      | Root application component, interface, and styling.                                    |
| `src/app/features/game/game-page/`              | Routed game page, its scoped runtime provider, and the Play Game button.               |
| `src/app/features/game/game-viewport/`          | Provide the shared HTML host and delegate mount/unmount to the runtime.                |
| `src/app/features/game/game-runtime.service.ts` | Own the client subscription and project lifecycle state into readonly Angular signals. |
| `src/app/features/game/game-client-factory.ts`  | Provide the replaceable factory for creating a client.                                 |
| `src/app/features/save/`                        | Save/load interface and local persistence service.                                     |
| `src/app/app.config.ts` , `app.routes.ts`       | Application providers and route configuration.                                         |
| `src/contracts/`                                | Plain client, lifecycle state, scene keys, and event payload contracts.                |
| `src/game/bootstrap.ts`                         | Create the Phaser game, attach the bridge, then register and start scenes.             |
| `src/game/bridge/phaser-game-client.ts`         | Own per-game Phaser listeners and replay lifecycle state through RxJS.                 |
| `src/game/scenes/`                              | Boot, loading, menu, gameplay, and scene lifecycle reporting.                          |
| `src/game/gameobjects/`                         | Phaser world objects and presentation behavior.                                        |
| `src/game/babylon/`                             | Babylon prototype client, scene construction, asset loading and browser tests.         |
| `src/simulation/`                               | Plain TypeScript simulation, independent of Angular and Phaser.                        |
| `src/core/`                                     | Framework-independent application utilities.                                           |
| `public/assets/`                                | Game images and other static assets, served under `assets/` .                          |
| `src/styles.scss`                               | Global application styles.                                                             |
| `src/**/*.spec.ts`                              | Colocated unit and browser integration tests.                                          |
| `angular.json`                                  | Build, development-server, and test configuration.                                     |
| `docs/`                                         | Design documents, milestone plans, art sources and generation records, and diagrams.   |
| `tools/diagrams/`                               | Optional renderer for documentation diagrams.                                          |

Keep interface code in `src/app/` and game code in `src/game/` . Place runtime assets in
`public/assets/` and load them from the relevant game scene.

`GamePageComponent` provides one `GameRuntimeService` for itself and its Phaser host child.
Ancestors such as the root component cannot inject that page-owned instance. Angular consumers
use `GameClient` and plain state rather than live Phaser scenes.

The runtime starts idle, mounts a client into the component's element, and exposes loading,
ready, error, and stopped states. Play Game becomes available when MainMenu is ready. Each
client uses its own game's event emitter; required-asset failures keep the runtime in error
until it is remounted. Unmounting unsubscribes before destroying the client, and injector
destruction provides fallback cleanup. Phaser removes its canvas and loop on a following frame.

## Production build

```sh
yarn run ng -- build
```

The browser application is written to `dist/scrapworks/browser/` , including files copied from
`public/` . Deploy the contents of that directory to a static web host.

## License

Scrapworks is licensed under the MIT License. See [LICENSE](LICENSE).
