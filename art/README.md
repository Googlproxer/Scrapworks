# Scrapworks art resources

Editable art projects, source assets, references, exact prompts and provenance live here. The [Art Document](../docs/art/README.md) owns the current visual direction.

| Directory or record                | Contents                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [characters/](characters/)         | Character identity/finish references, editable model sources and the [current v3 animated runtime derivative](characters/Protag/v3/runtime/README.md).                   |
| [world/](world/)                   | Environmental progression concepts.                                                                                                                                      |
| [KayKit terrain scatter](world/kaykit-forest-v1/README.md) | Selected user-supplied CC0 sources, exact provenance, compact geometry derivative and the first layered-land/scatter integration. |
| [machinery/](machinery/)           | Machine and production progression concepts.                                                                                                                             |
| [branding/](branding/)             | Logo and approved gear-and-leaf favicon sources, exact prompts and preparation records.                                                                                  |
| [ui/](ui/)                         | Cursor and menu backdrop sources; accepted UI screen concepts; [reusable UI kit](ui/kit/v1/README.md); [UI resource, tool and machine sprites](ui/sprites/v1/README.md). |
| [generation.json](generation.json) | Exact generation prompts and input/output provenance for the retained concepts.                                                                                          |
| [M10 concepts](concepts/m10-2026-11-12/README.md) | Four gameplay proposals and 32 individual world/machine/character/feedback/prop concepts, exact prompts, references and a local review gallery; implementation and approval remain separate. |
| [Terrain, water and small scatter](concepts/terrain-water-scatter-2026-11-12/README.md) | Six follow-up concepts, a layered-terrain/water-volume brief and fifteen Meshy prompts for low-poly rocks, plants and optional bank shape studies. |
| [Shader/material source and tests](shaders/protagonist-builtins/README.md) | Approved I material source and attribution, original built-in/blending comparisons, and local WebGL review renders. The runtime reuses I for the protagonist; world objects remain in their separate asset pass. |

Keep project files, source textures, previews, available licensing and provenance together. Preserve original sources when making runtime derivatives and document their preparation. Current automation lives in [tools/art/](../tools/art/). Active Editor scenes/imports remain in `assets/`, live runtime derivatives in `public/assets/`, and generated scene exports in ignored `public/scene/`.

The world/machinery images and retained modelling references guide the 3D design; the Art Document describes the approved flat finish. The south-idle illustrations have been retired. World sprite sheets and terrain atlases were retired in the [28 October cleanup](../docs/plans/3d-cleanup.md). Their original prompts remain only where they explain the generation chain of retained concepts; `generation.json` identifies the retired inputs and their Git recovery commit. The current [UI sprite set](ui/sprites/v1/README.md) supplies interface illustrations only.

## Opening the Blender protagonist

Open [Protag-v3.blend](characters/Protag/v3/Protag-v3.blend) for the editable authoring source. The [current runtime derivative guide](characters/Protag/v3/runtime/README.md) documents the rigged Mixamo archive, animated Blender derivative, full material, validation and reproduction. Preserve the full source mesh: the user owns later polygon optimisation. Earlier source versions live under [Protag/](characters/Protag/); the [v2 derivative record](characters/protagonist-runtime-v2/README.md) is historical.

## Recovering retired MPFB sources

The separate MPFB experiment is preserved at Git commit `6cd9f6fcdf3bc66997e03d28439bc22c019b427e`, under `art/characters/3d/protagonist-mpfb-v1/`. That directory contains its editable Blender project, rigged GLB, library, licensing, README and original validation. Recover it into a separate directory to consult those records:

```sh
git archive --format=zip --output=retired-mpfb-sources-6cd9f6f.zip 6cd9f6fcdf3bc66997e03d28439bc22c019b427e art/characters/3d/protagonist-mpfb-v1
```

The retired experiment's reproduction tools are recoverable from the cleanup's pre-removal commit. See [cleanup recovery](../docs/plans/3d-cleanup.md#recovery) and [retired scene sources](../assets/README.md#recovering-retired-scene-sources). Active runtime sources have their own provenance; the MPFB licence does not establish rights for the separate user-supplied model or animation archive.
