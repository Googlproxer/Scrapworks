# Scrapworks art resources

Editable art projects, source assets, references, exact prompts and provenance live here. The [Art Document](../docs/art/README.md) contains the current 3D visual direction; [historical 2D guidance](../docs/history/README.md) explains the earlier sprite and tile work.

| Directory or record                                             | Contents                                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [characters/](characters/)                                      | Character concepts, finish references, editable model sources and the [animated runtime derivative](characters/3d/protagonist-runtime-v2/README.md). |
| [world/](world/)                                                | Environment concepts and [historical terrain tileset resources](world/tilesets/README.md).                                                 |
| [machinery/](machinery/)                                        | Machine and production progression references.                                                                                             |
| [branding/](branding/)                                          | Logo source, exact prompt and generation/preparation record.                                                                               |
| [ui/](ui/)                                                      | Cursor source, exact prompt and generation/preparation record.                                                                             |
| [generation.json](generation.json) and [prompts.md](prompts.md) | Original generation records and the historical 2D concept brief.                                                                           |
| [relocation record](relocation-2026-10-17.json)                 | Previous/current paths and SHA-256 hashes for the 17 October 2026 move from `docs/art/`.                                                   |

Keep project files, linked libraries, source textures, previews, licences and provenance together within their asset folder. Retain original sources when making runtime derivatives, and document the derivative's source and preparation. Art automation lives in [tools/art/](../tools/art/).

The Babylon.js Editor's active scenes and import copies remain in `assets/`. Live runtime derivatives remain in `public/assets/`, and generated scene exports remain in `public/scene/`. Obsolete browser-only duplicates were removed on 23 October 2026; the unique final historical terrain atlas moved intact into `world/tilesets/`. Retired static character and title scene sources are preserved in Git commit `6cd9f6f`; see the [recovery instructions](../assets/README.md#recovering-retired-scene-sources). The [export policy](../tools/scenes/README.md) records consumers and preserved provenance.

## Opening the Blender protagonist

Open the retained [Protag-v1.blend](characters/3d/Protag-v1.blend) model source. The [runtime derivative guide](characters/3d/protagonist-runtime-v2/README.md) documents the animated version, its source inputs, validation and reproduction steps. The earlier MPFB experiment is retired and can be recovered from Git as described below.

## Recovering retired MPFB sources

Commit `6cd9f6fcdf3bc66997e03d28439bc22c019b427e` (`6cd9f6f`, "Cut over to Babylon and add action input") preserves the complete `art/characters/3d/protagonist-mpfb-v1/` directory. It contains the original README, editable Blender project, rigged GLB, preset, bundled MPFB library, licence comments, previews and validation reports. These files are no longer in the current checkout; historical references identify this separate asset experiment, not the active runtime character.

From the repository root, export the committed directory for inspection or recovery:

```sh
git archive --format=zip --output=retired-mpfb-sources-6cd9f6f.zip 6cd9f6fcdf3bc66997e03d28439bc22c019b427e art/characters/3d/protagonist-mpfb-v1
```

Extract the ZIP into a separate directory and open its README for the original source and licence records. The historical Blender and GLB filenames are `protagonist-mpfb-v1.blend` and `protagonist-mpfb-v1.glb`.

The historical `.blend` retains its old absolute MPFB secondary-library setting. Before replacing/refitting assets or loading its preset, set **MPFB → Apply assets → Library settings → second root** to the absolute path of the recovered `mpfb-library/` directory. Packed textures do not require this setting just to open the project. The historical MPFB reproduction tools require recovering the source directory at their expected repository path first.

## Historical paths

All source resources previously under `docs/art/` moved here with their existing categories; `docs/art/README.md` remains the visual design document. Original dated build/export reports and earlier asset-audit snapshots retain their recorded paths and hashes. For those records, resolve an old `docs/art/<resource>` path as `art/<resource>`, using the documented Git recovery for retired assets. The relocation record lists every moved file and distinguishes byte-identical sources from rebased Markdown links and the logo/cursor runtime-reference fields. Exact prompts, source-library licence comments, Blender/model files and original validation reports remain available in the active source folders or their documented Git history.
