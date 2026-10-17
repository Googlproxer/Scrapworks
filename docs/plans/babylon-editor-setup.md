# Babylon.js Editor setup

Updated 17 October 2026. Saved Editor changes export/reload automatically during development. The [cleanup baseline](3d-cleanup-baseline.md) records preservation and tooling changes; marker compilation, input/activity handling and cutover remain user implementation work.

Scrapworks is an Editor 5.5.2 project and an Angular browser app. Open
`scrapworks/scrapworks.bjseditor` in Babylon.js Editor. Install dependencies with
`yarn` first; the Editor uses the same project and dependency graph.

## Scene authoring

Open `assets/main-menu.scene` or `assets/game.scene` from the Editor's Assets
browser. MainMenu contains the existing ground, title plane, camera and light.
Game contains the existing ground, capsule, cube, camera, light and static rigged
protagonist. Angular continues to display the menu buttons and loading/errors.
Editor Play previews the selected 3D scene; use `/3d` to test the Angular flow.

Scene coordinates are centimetres: the ground is 2, 000 units wide, the cube is
150 units wide and the capsule is 170 units tall. The imported protagonist has
the Editor's normal 100-fold glTF conversion. Its original GLB remains at
`art/characters/3d/Protag-v1.glb` , with byte-identical Editor-import and original public copies. The standalone public GLB is now excluded from deployment because the Game scene already contains its rig/materials and binary geometry. Preserve all source copies and licence records; see the [asset/export audit](../reports/assets/2026-10-17/README.md).

Start development from the project root:

```sh
yarn dev
```

Visit `http://localhost:4200/3d` and click Play Game. `dev` exports before starting
Angular, then watches saved Editor inputs and enabled attached presentation scripts.
Save in the Editor to export and reload. Failed saves report a terminal error and
retain the last working export; correcting the save retries automatically.
`build` , `test` and `test:watch` export once before starting. World-marker
compilation remains user implementation work. See the [tool guide](../../tools/scenes/README.md)
and [workflow validation](../reports/workflow/2026-10-17/README.md).

`assets/**/*.scene` and the project file are authored inputs. `public/scene/` , 
`src/scripts.ts` , `.bjseditor/` and export caches are generated and ignored.
Run `yarn scenes:export` before invoking Angular CLI targets directly. The
export wrapper packs an isolated workspace copy and checks dependencies before
publishing. It disables the CLI's unconditional physics flag only after verifying
that no authored/packed physics bodies exist. Physics bodies produce an explicit
error until intentional runtime physics is implemented. A world grid remains planned.

Attached presentation components are loaded through the Editor-generated script
map and the official `babylonjs-editor-tools` loader. Keep Babylon presentation
code under `src/game/babylon/` ; simulation rules and gameplay saves stay plain
TypeScript. The runtime registers Babylon core types and the
`@babylonjs/materials` library, including Editor-selected Grid, Sky and Water
materials. Installing a package alone does not register its serialized classes; 
add registrations when introducing other libraries or loaders.

The logo uses `assets/textures/branding/title-logo-v1.png` , an unchanged copy of
the source in `art/branding/` . Import textures into `assets/` so the Editor
exporter packages them with the scenes. On Editor 5.5.2 for Windows, use a
project-relative `sourcePath` with MCP `import_asset` ; its absolute-path check
does not recognise Windows drive letters.

The title material uses Alpha Test, cutoff 0.5, alpha 1, and the PNG's alpha
channel ( `hasAlpha` enabled). Alpha blending is disabled, so visible logo pixels
remain opaque while the background is discarded.

Editor Tools 5.5.2 also imports `@recast-navigation/core` and
`@recast-navigation/generators` without declaring them. Both are pinned to
0.43.1 so Angular's dev server can resolve those modules. This does not add a
navigation mesh or pathfinding implementation.

## Generated asset selection

The scene-export wrapper uses the CLI per-scene dependency manifests to filter unused generated library copies. It preserves original source packs and scene-level geometry/manifests. Raw Editor/CLI exports can repopulate those copies, so run the project wrapper before building. Declare dynamically loaded assets in the [export policy](../../tools/scenes/export-policy.json); see the [tool guide](../../tools/scenes/README.md) for checking a fresh build and development watching.

## Workstation dependencies

Normal export/build uses the repository's Node/Yarn dependencies and official CLI; it does not launch the desktop Editor or Blender. A fresh dependency bootstrap remains unverified in the cleanup baseline.

| Tool or resource                            | When it is needed                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node and Yarn                               | Normal dev/build/test; versions are selected in the root README and package metadata. Direct installed CLI equivalents remain available when Yarn's bootstrap cannot download its release.                         |
| Playwright Chromium                         | Application/browser workflow tests. Use `yarn test:setup` ; set `PLAYWRIGHT_BROWSERS_PATH` when using a different existing browser cache.                                                                           |
| Babylon.js Editor 5.5.2                     | Interactive scene authoring and live desktop MCP. `run-server.mjs` discovers the Windows installation or uses `SCRAPWORKS_BABYLON_EDITOR_PATH` . The desktop bundle is a workstation dependency.                    |
| Python 3 standard library                   | Optional file/history checkpoint and source-verification tools; not required to run the game.                                                                                                                      |
| Blender with MPFB                           | Optional editable protagonist work and `tools/art/*.py` scripts run inside Blender. The [source README](../../art/characters/3d/protagonist-mpfb-v1/README.md) describes the local library and preserved licences. |
| `L:/Angular/tools/mpfb-assets` | Historical downloaded asset-pack cache used by `tools/art/install-mpfb-packs.py` ; only needed to reinstall/recreate packs. Selected source meshes/textures/licences remain in root `art/` .                         |
| `@viz-js/viz` and `sharp` | Optional diagram renderer; pass an absolute module directory as described in the [diagram guide](../diagrams/README.md). These are not app dependencies.                                                           |
| Texture compression tools                   | Optional when enabling compression in the Editor project. The current project has compressed textures disabled, so normal exports do not require PVRTexTool/Khronos tools.                                         |
| `L:/Angular/babylon` and graph-server setup | Template/reference and separately installed authoring tools; neither is an application runtime input. The graph-server validation path below is historical workstation evidence.                                   |

## Desktop scene MCP

Project `.codex/config.toml` registers `babylon-editor` . Reload the Codex MCP
connection/session after adding this configuration. Keep this Editor project
open when using its scene tools.

`tools/editor-mcp/run-server.mjs` launches the official stdio server bundled in
the installed Editor. Set `SCRAPWORKS_BABYLON_EDITOR_PATH` to its installation
directory if automatic Windows discovery fails. The project plugin enables
the Editor's official loopback scene bridge on port 3712 without modifying its
installation. The loopback bridge is not a Streamable HTTP MCP endpoint.

Check the connection from the project root:

```sh
yarn editor:mcp:check
node tools/editor-mcp/check.mjs --list
node tools/editor-mcp/check.mjs get_scene_hierarchy
```

The check initializes MCP, pings it, discovers 79 tools, and calls the requested
live tool (default `get_active_scene` ). A missing Editor or bridge makes the
live call fail. Tool discovery alone does not establish a live scene connection.
`check.mjs` also accepts JSON arguments or `@path/to/arguments.json` and an
optional image output path. The Editor's native Save confirmation needs to be
accepted in its window. Leave the Editor visible for screenshot/Play checks; 
stop preview before editing.

Wait for Play preparation to finish before stopping it. Editor 5.5.2 can lose
its render loop and texture parser if Play is stopped during preparation.
Reloading the saved Editor project clears that temporary preview state.

Only one Editor window should own port 3712. Verify project and scene identity
before modifying nodes. Use the official live tools while the project is open; 
avoid rewriting serialized scene files behind the Editor. Preserve authored
content and restore temporary validation changes.

The seven separately configured `@babylonjs/mcp-servers@9.30.0` graph servers
remain available. They author node graphs and GUI; this desktop server controls
the scene Editor. Its workstation bundle is separate from the app dependencies.

## Scope

This setup converts the current presentation and preserves `/` as the Phaser
route. Automatic export/reload and failure retention are implemented as tooling.
World grids, spawn/deposit/blocker components, simulation exports and Phase 2
lifecycle/input work remain user implementation work.
Continue with the [migration plan](3d-migration.md) when ready.
