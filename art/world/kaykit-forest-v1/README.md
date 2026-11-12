# KayKit terrain scatter

Integrated 13 November 2026 from the user-supplied [KayKit Forest Nature Pack 1.0 FREE archive](../../KayKit_Forest_Nature_Pack_1.0_FREE.zip). Created by Kay Lousberg; the exact supplied [CC0 notice](source/License.txt) is retained. [Creator page](https://kaylousberg.itch.io/kaykit-forest).

This is the first production land/scatter pass against the [layered-terrain concept](../../concepts/terrain-water-scatter-2026-11-12/images/01-layered-terrain.png). Water geometry/levels remain deferred at the user's request. Other world-object models remain in their ongoing art pass. The approved protagonist I material and full mesh are unchanged.

## Source and derivative

[provenance.json](provenance.json) pins the original archive and each selected glTF/binary SHA-256, exact source IDs and measured triangle counts. The complete supplied archive remains canonical. Only eight selected model sources plus their original shared texture/notice are extracted into [source/](source/); no other pack content is shipped.

| Source | Triangles per source mesh | Runtime arrangement |
| --- | --- | --- |
| Rock 2 A | 12 | Small pebble with varied orientation, size and slight burial. |
| Rock 1 A/B/C | 48 each | Three larger small-stone shapes, independently scaled. |
| Grass 1/2 SingleSided Mesh | 14 each | Four folded opaque blades per tuft: 56 triangles. Two-sided lighting, no alpha image cards. |
| Bush 2 A / Bush 4 A | 44 each | Three reused foliage forms per shrub: 132 triangles. |

The [preparation tool](../../../tools/art/prepare-kaykit-scatter.ts) retains the source positions/normals/topology, centres X/Z, moves the lowest vertex to Y=0 and reflects Z for Babylon's left-handed coordinates. It retains the source index order, matching Babylon's left-handed front-face convention. Native-normal alignment is covered by a focused test. The runtime makes the one metres-to-centimetres conversion when binding geometry.

The [compact geometry derivative](runtime/meshes.ts) is bundled with the lazy renderer, avoiding additional model/texture fetches during a scene transition. It uses three shared matte painted materials instead of the pack's gradient atlas. UVs and the atlas remain in the original source for future editing. No Meshy or image-generation call was used for these models or the procedural terrain.

Reproduce from the repository root on Windows:

```powershell
node tools/art/prepare-kaykit-scatter.ts
```

The tool uses the built-in Windows ZIP reader, extracts only explicitly selected names, and adds no dependency. It does not modify or move the supplied archive.

## Layered ground and placement

[Terrain material](../../../src/game/rendering/terrain/terrain-material.ts) continuously blends four rotated procedural surface-pattern variants in world space. Broad coverage fields cross the two-metre cells, with additional intermediate paint planes. There are no per-cell border fades or pattern resets: the logical grid is invisible except for the player's cursor highlight. The original authored grid plane is hidden while the replacement terrain is active, retaining its explicit selection-ray target and restoring its prior visibility on teardown. The polygonal shapes are deliberately quiet beside the protagonist. These are procedural colour patterns rather than imported raster tiles; no concept sheet is used as a terrain texture.

The terrain material reserves diffuse-lighting headroom so the approved warm fill does not clip away cast-shadow contrast. Its bounded arithmetic hash avoids sine/compiler drift between browsers and shader variants, with a smaller mediump fallback. The protagonist's material values and scene lighting are unchanged.

[Placement](../../../src/game/rendering/terrain/terrain-layout.ts) uses a stable presentation seed independent of simulation random streams. Grass candidates have roughly 0.58 m spacing, stones 1.15 m, shrubs 1.85 m; each layer has independent jitter, occupancy and broad density fields. Roots/rock transforms remain fixed while health reveals and scales plants. Shared corner-health averages soften visible cell boundaries.

[LayeredTerrain](../../../src/game/rendering/terrain/layered-terrain.ts) groups thin instances by source geometry and eight-metre chunk. Empty groups are disabled so a zero thin-instance count never displays the template mesh. Full rotated footprints and silhouettes that touch occupied/water cells are excluded; current physical-body cells are also cleared. Moving a body or dismantling an object can therefore change clearance without resampling the layout. Decorative geometry adds no picking targets or collision bodies.

The three-lobe shrub and four-blade grass groups create fuller silhouettes without extra draw calls per individual plant. [WorldRendering](../../../src/game/rendering/world-rendering.ts) registers the scatter with the existing quality-controlled shadow owner. Off releases the shadow map; the ground patterns and plant geometry remain. Normal native scene lifecycle releases matrices, colour buffers, meshes, materials and unique shader sources.

## Review and verification

Local [prepared-state captures and report](../../../docs/reports/rendering/2026-11-13/layered-terrain/) show damaged, recovering, restored and mixed-health terrain in the actual production game. Fixtures use separate browser contexts and normal save loading; they are visual diagnostics, not earned progression or changes to the user's saves. The [manual browser tool](../../../tests/acceptance/terrain-browser.ts) also checks shader compilation, one render loop and shadow-on/off images. No CI workflow or full gameplay route was added.

Focused tests cover stable placement, water/footprint clearance, corner health, source normals/budgets, health-dependent geometry and native resource disposal. This first visual pass is not final hardware performance qualification; tune density and the palette after user review. Broader asset/water and M10 qualification work remain open.
