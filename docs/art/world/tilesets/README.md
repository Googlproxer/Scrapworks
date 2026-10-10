# Terrain tileset

Prepared 4 October 2026 with the built-in image generation tool, following the flat painted [art direction](../../README.md) and the 64 by 52 pixel footprint in the [Tiled integration plan](../../../plans/tiled-world-integration.md).

## Files

- [Prepared terrain atlas](../../../../public/assets/tilesets/terrain.png): 256 by 624 pixels, 48 tiles, zero margin and spacing.
- [Tiled tileset](../../../../map/tilesets/terrain.tsx): the shared atlas named `terrain`, with seven preconfigured Corner Terrain Sets.
- [Example map](../../../../map/terrain-transitions-preview.tmx) and [rendered example](terrain-transitions-preview.png): all six terrain pairings with connected edges, outside corners, inside corners, and diagonal joins.
- [Transition generation record](terrain-transitions-generation.json): exact source bounds, final prompts, layout guides, original generated sheets, tile assignments, and verification details.
- [Original 16-tile atlas](terrain-atlas-v1.png), [original tileset snapshot](terrain-v1.tsx), and [original generation record](terrain-generation.json).

## Paint with the terrain tools

1. Load or reload `map/tilesets/terrain.tsx` in Tiled. Import the TSX rather than creating a new tileset from the PNG, so the terrain information is included.
2. Use an orthogonal map with tiles **64 wide by 52 high**. Fill the ground layer with a solid dirt tile using the Bucket Fill Tool.
3. Open the **Terrain Sets** view, select **World Terrain**, and select **Grass**, **Stone**, or **Water**.
4. Activate the **Terrain Brush** and paint. Tiled chooses matching straight edges, outside corners, inside corners, and diagonal joins, adjusting neighbouring tiles as needed.

The atlas transitions between filled terrain cells. It has no transitions to empty cells, so fill the ground before using the Terrain Brush. The individual pair sets are useful when working on a particular boundary or using Terrain Fill Mode.

These are **Corner Terrain Sets**: matching the four corner materials is sufficient to select both edge and corner graphics for ground terrain. Tiled's distinct Edge Set type is more commonly used for paths, fences, and similar connections. See [Tiled's terrain guide](https://doc.mapeditor.org/en/stable/manual/terrain/).

## Terrain sets and patterns

The shared **World Terrain** set contains Dirt, Stone, Water, and Grass. Complete two-material coverage is also available in six separate sets:

- Dirt / Grass
- Dirt / Stone
- Dirt / Water
- Stone / Grass
- Stone / Water
- Water / Grass

Each pair supports all **16 possible corner assignments**. Five generated transition shapes provide an outside corner, horizontal edge, vertical edge, inside corner, and disconnected diagonal pair. Tiled's horizontal and vertical mirroring supplies their remaining orientations; rotations are disabled to preserve the rectangular tile proportions. Pure terrain fills supply the other two assignments.

Tiles with three or four different materials in their four corners are not included. At junctions involving three terrains, leave a small band of one terrain between the other patches, or add dedicated junction tiles later. Water is static, and shorelines use a simple material boundary without raised banks or foam.

## Tile IDs and gameplay properties

The original 16 tiles keep their IDs, pixels, classes, and properties, so existing maps continue to use the same terrain fills.

| Local tile IDs | Contents |
| --- | --- |
| 0-3 | Original dirt variants |
| 4-7 | Original stone variants |
| 8-11 | Original water variants |
| 12-15 | Original grass variants |
| 16-20 | Dirt / Grass transitions |
| 21-25 | Dirt / Stone transitions |
| 26-30 | Dirt / Water transitions |
| 31-35 | Stone / Grass transitions |
| 36-40 | Stone / Water transitions |
| 41-45 | Water / Grass transitions |
| 46-47 | Additional dirt fills |

Each tile supplies `terrainId`, `walkable`, and `buildable`. Land transitions allow both actions. Any transition containing water defaults to `terrainId = water`, with walking and building disabled for the whole cell. This is a conservative prototype rule; partial-cell traversal is not implemented. Transition tiles also record `transitionPair` and their untransformed `terrainCorners` in top-left, top-right, bottom-right, bottom-left order.

Terrain painting can produce horizontally or vertically flipped map GIDs. Follow the integration plan: strip transform bits before resolving tile properties, retain supported flips for rendering, and reject diagonal/hex rotations for this rectangular profile. Local tile IDs are not map GIDs.

For Phaser, the prepared image is available at `assets/tilesets/terrain.png`. Runtime map loading has not been added by this asset work.

## Verification and provenance

All 30 prepared transition tiles were checked against their intended visible corner materials. The first 16 tiles' decoded pixels match the archived atlas exactly.

Tiled 1.12.2's native `TileLayer.wangEdit()` matcher passed **192 checks**: all 16 patterns for all six pairs in both the individual sets and the shared set. The [verification report](terrain-transitions-verification.json) records the chosen tile IDs and flip flags. The example map was generated through the same API and rendered with Tiled's `tmxrasterizer`.

To repeat the matching check from the repository root, with Tiled on your PATH:

```text
tiled --evaluate tools/art/verify-terrain-transitions.js map/tilesets/terrain.tsx docs/art/world/tilesets/terrain-transitions-verification.json
```

The [verification script](../../../../tools/art/verify-terrain-transitions.js) accepts an optional fourth path for generating an example map. The original art was generated with the built-in image tool; preparation crops and resamples the selected tile rectangles, removes magenta gutters, and packs the atlas without changing the painted surface design. Exact prompts and geometric layout inputs are retained under `transitions/`.
