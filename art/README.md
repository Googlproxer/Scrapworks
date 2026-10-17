# Scrapworks art resources

Editable art projects, source assets, references, exact prompts and provenance live here. The [Art Document](../docs/art/README.md) contains the current 3D visual direction; [historical 2D guidance](../docs/history/README.md) explains the earlier sprite and tile work.

| Directory or record                                             | Contents                                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [characters/](characters/)                                      | Character concepts, finish references, model exports and [the editable MPFB Blender project](characters/3d/protagonist-mpfb-v1/README.md). |
| [world/](world/)                                                | Environment concepts and [historical terrain tileset resources](world/tilesets/README.md).                                                 |
| [machinery/](machinery/)                                        | Machine and production progression references.                                                                                             |
| [branding/](branding/)                                          | Logo source, exact prompt and generation/preparation record.                                                                               |
| [ui/](ui/)                                                      | Cursor source, exact prompt and generation/preparation record.                                                                             |
| [generation.json](generation.json) and [prompts.md](prompts.md) | Original generation records and the historical 2D concept brief.                                                                           |
| [relocation record](relocation-2026-10-17.json)                 | Previous/current paths and SHA-256 hashes for the 17 October 2026 move from `docs/art/`.                                                   |

Keep project files, linked libraries, source textures, previews, licences and provenance together within their asset folder. Retain original sources when making runtime derivatives, and document the derivative's source and preparation. Art automation lives in [tools/art/](../tools/art/).

The Babylon.js Editor's authored scenes and import copies remain in `assets/`. Existing runtime copies remain in `public/assets/`, and generated scene exports remain in `public/scene/`. These folders have separate consumers; moving art sources does not change their import or runtime paths. The [export policy](../tools/scenes/README.md) controls which copies are deployed.

## Opening the Blender protagonist

Open [protagonist-mpfb-v1.blend](characters/3d/protagonist-mpfb-v1/protagonist-mpfb-v1.blend). Its packed textures are retained, along with the complete [local MPFB library](characters/3d/protagonist-mpfb-v1/mpfb-library/), preset, licence comments and original validation reports.

The `.blend` retains its original bytes, including the old absolute MPFB secondary-library setting. Before replacing/refitting assets or loading its preset, set **MPFB → Apply assets → Library settings → second root** to the absolute path of `art/characters/3d/protagonist-mpfb-v1/mpfb-library/` in your checkout. On this workstation that is `L:/Angular/scrapworks/art/characters/3d/protagonist-mpfb-v1/mpfb-library`. Packed textures do not require this setting just to open the project. Reproduction tools now use the root `art/` directory.

## Historical paths

All source resources previously under `docs/art/` moved here with their existing categories; `docs/art/README.md` remains the visual design document. Original dated build/export reports and earlier asset-audit snapshots retain their recorded paths and hashes. For those records, resolve an old `docs/art/<resource>` path as `art/<resource>`. The relocation record lists every moved file and distinguishes byte-identical sources from rebased Markdown links and the logo/cursor runtime-reference fields. Exact prompts, source-library licence comments, Blender/model files and original validation reports are preserved.
