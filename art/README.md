# Scrapworks art resources

Editable art projects, source assets, references, exact prompts and provenance live here. The [Art Document](../docs/art/README.md) owns the current visual direction.

| Directory or record | Contents |
| --- | --- |
| [characters/](characters/) | Character identity/finish references, editable model sources and the [animated runtime derivative](characters/protagonist-runtime-v2/README.md). |
| [world/](world/) | Environmental progression concepts. |
| [machinery/](machinery/) | Machine and production progression concepts. |
| [branding/](branding/) | Logo source, exact prompt and preparation record. |
| [ui/](ui/) | Cursor source, exact prompt and preparation record. |
| [generation.json](generation.json) | Exact generation prompts and input/output provenance for the retained concepts. |

Keep project files, source textures, previews, available licensing and provenance together. Preserve original sources when making runtime derivatives and document their preparation. Current automation lives in [tools/art/](../tools/art/). Active Editor scenes/imports remain in `assets/`, live runtime derivatives in `public/assets/`, and generated scene exports in ignored `public/scene/`.

The world/machinery images and retained modelling references guide the 3D design; the Art Document describes the approved flat finish. The south-idle illustrations have been retired. Sprite sheets and terrain atlases were retired in the [28 October cleanup](../docs/plans/3d-cleanup.md). Their original prompts remain only where they explain the generation chain of retained concepts; `generation.json` identifies the retired inputs and their Git recovery commit.

## Opening the Blender protagonist

Open [Protag-v1.blend](characters/Protag-v1.blend). The [runtime derivative guide](characters/protagonist-runtime-v2/README.md) documents its source model, animation archive, validation and reproduction. Preserve the source FBXs, modelling references, animation sources and current validation alongside it. The unused static Editor import copy has been removed; [Protag-v1.glb](characters/Protag-v1.glb) remains the canonical source export.

## Recovering retired MPFB sources

The separate MPFB experiment is preserved at Git commit `6cd9f6fcdf3bc66997e03d28439bc22c019b427e`, under `art/characters/3d/protagonist-mpfb-v1/`. That directory contains its editable Blender project, rigged GLB, library, licensing, README and original validation. Recover it into a separate directory to consult those records:

```sh
git archive --format=zip --output=retired-mpfb-sources-6cd9f6f.zip 6cd9f6fcdf3bc66997e03d28439bc22c019b427e art/characters/3d/protagonist-mpfb-v1
```

The retired experiment's reproduction tools are recoverable from the cleanup's pre-removal commit. See [cleanup recovery](../docs/plans/3d-cleanup.md#recovery) and [retired scene sources](../assets/README.md#recovering-retired-scene-sources). Active runtime sources have their own provenance; the MPFB licence does not establish rights for the separate user-supplied model or animation archive.
