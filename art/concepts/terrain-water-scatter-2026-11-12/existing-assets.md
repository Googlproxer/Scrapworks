# Existing low poly nature assets

Checked 12 November 2026 after the user requested existing assets to reduce AI use. **Start by reviewing KayKit's free tier**, with Toolbench as a useful geometry-budget comparison. These are candidate libraries; no models have been downloaded, selected or imported.

| Candidate | Relevant contents | Formats and cost | Why review it |
| --- | --- | --- | --- |
| [KayKit Forest Nature Pack — Kay Lousberg](https://kaylousberg.itch.io/kaykit-forest) | Free tier has 100+ tree, bush, grass and rock models; grass has multiple clusters and an unshaded variant. | glTF, FBX, OBJ; free tier; creator lists CC0. | Strongest broad starting set. A shared atlas can help keep the scatter palette consistent. Per-prop triangle counts need inspection. |
| [Low-poly Forest Kit — Toolbench](https://toolbenchdev.com/gamedev/cc0-game-assets/low-poly-forest-kit/) | Published grass 90/10, small rock 80/20 and bush 320/60 triangles at LOD0/LOD1. | GLB, FBX, OBJ; free; creator lists CC0 1.0. | Useful small-count reference. FBX carries the LODs; GLB contains full detail. Grass uses paired thin surfaces, and material slots need review. |
| [Ultimate Nature Pack — Quaternius](https://quaternius.com/packs/ultimatenature.html) | 150 nature models with a broad selection of faceted forms. | Blend, FBX, OBJ; free/optional donation; creator lists CC0. | Editable Blender sources support recolouring and simplification; selected models need a GLB export. [Creator's download page](https://quaternius.itch.io/150-lowpoly-nature-models). |
| [Quiet Grove — polyhangar](https://polyhangar.itch.io/quiet-grove-low-poly-nature-kit-cc0) | Published basalt rock 80, rock cluster 240 and evergreen bush 240 triangles. Eight models overall. | GLB, OBJ/MTL; free/pay what you want; creator lists CC0 1.0. | Small flat-colour rock/shrub supplement, with ground-level origins. It does not list a grass model. |

The counts above are **creator-published**, not measurements of downloaded files. The visual-fit rankings are project judgements based on the listed asset scope and material approach. Check the chosen file's geometry, material slots, normals and opaque foliage from the game's camera before final selection.

## Suggested sample

Take three small stone silhouettes, two grass-clump shapes and one low shrub from KayKit. Compare them with the corresponding Toolbench pieces if the geometry is heavier than desired. Recolour the selected family into the concept palette and view it beside the approved I protagonist at the normal 12 m camera radius and the 6 m close view. Keep each pack's source/licence files with any selected Blender derivative.

Use variation in rotation, size and placement to expand a small selected family. This saves generation work and helps maintain a coherent shape language. Retain the [Meshy prompts](meshy-prompts.md) for gaps in the existing libraries. The fitted shoreline/basin and simulation-driven water surface still require project-specific authoring/presentation work.

The broader [Quaternius Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html) is another option, but its complete 116-model set spans free and paid tiers. Its supplied engine shaders target Unity/Unreal/Godot; Babylon material work would remain. The older Ultimate Nature Pack is the simpler fully free library to review first.
