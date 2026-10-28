# Editor source assets

Open `../scrapworks.bjseditor` in Babylon.js Editor 5.5.2. The `.scene` directories
are editable scene sources, including serialized geometry, materials, cameras, 
lights, world-marker metadata and a neutral Game character anchor. Keep each complete active scene directory together.

Use [the setup guide](../docs/plans/babylon-editor-setup.md) for editing, scene
export and the official desktop MCP connection. Scene units are centimetres. Gameplay uses metres on X/Z; [marker compilation](../tools/world/README.md) converts at that boundary. `public/scene/`, its `worlds/game.json`, and `src/scripts.ts` are generated outputs, not authoring sources or gameplay saves. The [export tools and policy](../tools/scenes/README.md) retain scene-declared dependencies and explicit dynamic assets; adding a library file alone does not make it a runtime asset. Unused grass-library and static-model imports were removed in the [28 October cleanup](../docs/plans/3d-cleanup.md). The former static rig and menu title are [recoverable from Git](#recovering-retired-scene-sources).

## Recovering retired scene sources

Commit `6cd9f6fcdf3bc66997e03d28439bc22c019b427e` (`6cd9f6f`, "Cut over to Babylon and add action input") preserves the complete scenes before the static character and Babylon title were retired:

- `assets/game.scene/`: original static rig, skeleton, geometry, materials and hierarchy.
- `assets/main-menu.scene/`: original title mesh, material and complete scene context.
- `src/game/presentation/fit-menu-logo.ts`: the title's attached presentation script.

From the repository root, export these committed sources to a ZIP for inspection or recovery:

```sh
git archive --format=zip --output=retired-scene-sources-6cd9f6f.zip 6cd9f6fcdf3bc66997e03d28439bc22c019b427e assets/game.scene assets/main-menu.scene src/game/presentation/fit-menu-logo.ts
```

Extract the ZIP into a separate directory to inspect the old scenes. For the complete historical Editor project and its dependencies, omit the three path arguments when exporting the commit.

The duplicate local scene archive was removed on 24 October 2026 after verifying its sources against this commit and the active world-marker files. The new blocker, player-spawn, scrap-deposit and world-settings markers remain under `assets/game.scene/nodes/`; they are not part of the historical commit. Active art and licences remain in their established character and branding folders; the retired MPFB experiment has separate [Git recovery instructions](../art/README.md#recovering-retired-mpfb-sources). Preserve retired authoring through documented Git commits rather than duplicate scene trees in the current checkout.
