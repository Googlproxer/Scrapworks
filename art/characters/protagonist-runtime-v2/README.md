# Protagonist runtime v2

Runtime derivative prepared on 23 October 2026 from the user's existing `Protag-v1` character. It preserves that character's appearance, outfit, materials, visible geometry, proportions and skin weights. It does not replace the character with the older, separately generated MPFB model or recolour it to match concept art.

## Deliverables and runtime contract

- [Editable derivative](protagonist-runtime-v2.blend), with packed textures and named `Idle`, `Walk`, `Run`, `TurnLeft` and `TurnRight` actions.
- [Runtime GLB](../../../public/assets/models/protagonist-v2.glb), served at `/assets/models/protagonist-v2.glb`.
- [Export and source hashes](export-report.json), [reimport validation](validation-report.json), and [animation contact sheet](animation-contact-sheet.png). The [individual previews](previews/index.json) are renders of the exported GLB after reimport.
- Current disabled-turn playback: [smooth-turning video](browser-smooth-turning/turning.webm), [247 frame samples and assertions](browser-smooth-turning/report.json), and screenshots of [standing right](browser-smooth-turning/standing-right.png), [standing left](browser-smooth-turning/standing-left.png), and a [moving reversal](browser-smooth-turning/moving-reversal.png).
- Earlier turn-enabled checkpoint: [browser turning video](browser-turning/turning.webm), [frame samples and assertions](browser-turning/report.json), and screenshots of [standing right](browser-turning/standing-right.png), [standing left](browser-turning/standing-left.png), and a [moving reversal](browser-turning/moving-reversal.png). These predate the user's request to disable turn playback.

| Property | Verified value |
| --- | --- |
| Runtime transfer size | 4,236,032 bytes; below the 5 MiB limit |
| Geometry | 37,655 triangles; 10 skinned meshes |
| Materials | 10; original alpha blending retained for hair, eyebrows and lashes |
| Textures | 13 embedded WebP images, 512–2048 pixels; exact retained source WebP bytes, with no PNG fallback duplication |
| Skeleton | 52 deform joints with the existing `mixamorig:` bone names |
| Coordinates | glTF metres, Y up, character faces +Z; Blender metres, Z up, character faces -Y |
| Idle height | 1.6058 metres from sole to hair in the first idle frame |
| Root | Identity armature transform at origin; simulation supplies world translation and target heading, presentation smoothly follows that heading |
| External dependencies | None in the GLB; no studio cameras or lights |

The Babylon scene uses centimetres, so the presentation root scales the imported model by 100. Account for Babylon's glTF handedness conversion when choosing the heading offset. Start `Idle` immediately after loading; the preserved neutral A-pose is an authoring pose, with its original sole extent 18.2 mm below the pivot.

| Clip | Duration | Reference rate | Behavior |
| --- | --- | --- | --- |
| `Idle` | 8.3333 s | 0 m/s | Subtle looping idle, grounded |
| `Walk` | 0.9667 s | 1.5097 m/s | In-place walk; vertical bob and cyclical sway retained |
| `Run` | 0.7000 s | 3.3953 m/s | In-place run; flight phases retained |
| `TurnLeft` | 1.1667 s | 1.3454 rad/s | Retained left pivot clip; runtime playback disabled at the user's request |
| `TurnRight` | 1.1667 s | 1.3464 rad/s | Retained right pivot clip; runtime playback disabled at the user's request |

Drive blend weights and playback rates from published movement. Divide actual speed by the appropriate reference speed to match stride; animation never advances simulation position. Pause/resume animation with the presentation lifecycle. Horizontal hip translation has no net movement across a loop; its small cyclical sway is visual motion, not root travel.

The visual root continues to turn smoothly along the shortest angular path. Runtime animation uses only `Idle`, `Walk` and `Run`: `TurnLeft` and `TurnRight` playback is disabled at the user's request because pivot footwork conflicted with smooth rotation and walking. Both clips remain in the GLB and editable derivative. Heading interpolation and locomotion blending remain independent of authoritative movement and collision positions.

## Derivation and checks

The animation archive's skeleton rests in a T-pose while the user's character rests in a bent A-pose. The build maps all 52 bone names, aligns each bone's anatomical direction, corrects the residual rest-frame rotation, and bakes rotations into the target skeleton. Thirteen source terminal bones are omitted. Translation stays on the hips, with planar travel removed and a constant ground-height adjustment per clip. The original target skeleton and skin weights remain intact.

The retained turn sources include approximately 90 degrees of whole-body yaw. The derivative removes that heading from every sampled bone pose and counter-rotates the residual hip translation. This prepared the clips for the earlier runtime pivot-footwork checkpoint; playback is now disabled. Reimported turn clips have less than 0.0000003 radians of remaining hip heading change; their grounded boot floor range is below 2.5 mm.

Animated knees exposed concealed skin through the trousers. The derivative omits 2,335 lower-body triangles beneath the trousers and boots, selected by leg/pelvis skin weights and height. This protects hands and preserves the visible outfit and silhouette. All original source files remain unchanged.

The validator reimports the actual GLB and checks budgets, embedded images and dimensions, UVs, skin bindings, clip names/durations, deformation, loop rotations, horizontal stationarity, root transform, and ground contact across every sampled frame. Walk soles stay within 5.3 mm of ground; run retains up to 98.9 mm of flight. Tiny negative floor values below one micrometre are floating-point error. The contact sheet covers four idle viewing angles and four phases each of walking, running, and left/right turning.

These are asset checks. At the earlier turn-enabled checkpoint, the focused renderer suites passed 32 cases, and the browser turning probe recorded actual keyboard input with unchanged stationary simulation positions. Those results and videos remain dated evidence of enabled pivot playback, not current playback behavior. The earlier [migration production evidence](../../../docs/reports/migration/2026-10-23/performance.json) records the three-clip checkpoint before turn clips were added, including its earlier asset hash. That sample uses Chromium's SwiftShader software renderer; physical target-device performance remains unqualified.

The current disabled-turn checkpoint passes 33 focused renderer tests. Its [browser report](browser-smooth-turning/report.json) records 247 samples with no errors: both turn groups stay stopped with zero contribution, stationary heading settles during Idle without changing simulation position, and moving reversals retain Walk. The source lint/type checks and production build also pass.

## Reproduce

Run from the repository root with Blender 5.2.2. The scripts create an isolated scene and must be run in a background process; they are not scripts for the user's open Editor scene.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/art/build-protagonist-runtime.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/art/validate-protagonist-runtime.py
python tools/art/contact-sheet-protagonist-runtime.py
node tools/art/check-turning-browser.mjs http://localhost:4200
```

The contact sheet step requires Pillow. Add `-- --no-render` to the validation command for numeric checks only. The browser probe checks the current disabled-turn policy and writes to `browser-smooth-turning/`, preserving the earlier `browser-turning/` checkpoint. It requires the running development app and installed Playwright Chromium and changes the inspection camera only in its own browser context. The build extracts five FBXs into a temporary directory under the repository's ignored `tmp/`, preserving both the archive and the user's separately extracted working folder. The GLB retains the source's exact WebP payloads after Blender export to avoid lossy recompression and duplicate fallback encodings.

## Preserved sources and provenance

- [User-authored model source](../Protag-v1.blend) and [retained model export](../Protag-v1.glb).
- Existing [Female Locomotion Pack archive](../Female%20Locomotion%20Pack.zip): `idle.fbx`, `walking.fbx`, `running.fbx`, `left turn.fbx`, and `right turn.fbx`. Embedded FBX animation stacks identify `mixamo.com`.
- The [older MPFB source and license records](../../README.md#recovering-retired-mpfb-sources) remain a separate asset history recoverable from Git.

The animation archive is an existing user-supplied source. No acquisition receipt, download URL or standalone license file accompanies it. This derivative records that evidence and the input hashes without inventing provenance or applying the separate MPFB asset license to the animation pack. Keep the existing source and authorship records with any future asset distribution.
