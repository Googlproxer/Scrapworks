# Authored world compilation

`compile.mjs` reads saved Editor JSON and publishes a version 1 plain `WorldDefinition` through the staged scene exporter. It does not instantiate Babylon or execute attached scripts. A malformed definition stops export before publication; scenes, generated script registry and `worlds/game.json` retain their last working generation together.

The active Game scene contains four named TransformNode markers. Edit their transforms and `metadata.scrapworks` fields in the Editor's saved source:

| Marker kind | Required metadata | Transform meaning |
| --- | --- | --- |
| `WorldSettings` | `version: 1`, stable `id`, `columns`, `rows`, `cellSizeCm`, `terrainId` | Minimum X/Z grid corner, ground elevation zero, no final rotation. |
| `PlayerSpawn` | `version: 1`, stable `id` | Player ground position. |
| `Deposit` | `version: 1`, stable `id`, `resource: "scrap"`, positive `quantity`, `footprint: {width, depth}` | Centre of the footprint's minimum X/Z cell; yaw in quarter turns. |
| `Blocker` | `version: 1`, stable `id`, `footprint: {width, depth}` | Same footprint anchor and rotation convention. |

Exactly one settings marker and one spawn are required. IDs must be unique; positions must be finite and inside the world; entity anchors must be cell-centred; footprints must fit without overlap. Parent translation and quarter-turn yaw compose before centimetres become metres. Marker hierarchies require unit scale and zero pitch/roll; unsupported transforms, missing parents and cycles fail explicitly. Visual geometry and mesh bounds never determine occupancy.

The migration fixture has a 10 by 10 grid, 200 cm cells and minimum corner (-1000, 0, -1000) cm. Spawn is (100, 0, 100), scrap is (-300, 0, 100), and the blocker is (300, 0, -100). All terrain starts as soil. World views use metres with X east, Z north and Y up. The neutral character anchor uses scale one; the character adapter owns the one-time model conversion.

`GameSession` advances the plain simulation at 20 Hz, limits catch-up to five steps per rendered frame and clears timing/input on suspension. Walk speed is 1.5 m/s, sprint 3 m/s, player collision radius 0.35 m, and placement reach 3 m from the player's position to the anchor-cell centre. The test building is two cells by one, rotated in quarter turns. Its free availability exists only in an explicit developer fixture session; normal worlds start without inventory, equipment, research or buildings.

Run `yarn test:world` for pure Node marker, transform, boundary, movement, pause and placement tests. `yarn test:export` also verifies that invalid authored marker data retains the previously published scene and world files. Gameplay saves and manual/factory progression are separate milestones.
