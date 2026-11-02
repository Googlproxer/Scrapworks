# Protagonist runtime v3

Current player character, prepared on 2 November 2026 from the user's [rigged Mixamo archive](../Protag_v3_rigged.zip) and [edited Blender source](../Protag-v3.blend). The source Meshy character, UV correction, torso alignment, outfit and full geometry are retained. Original source files are read only during conversion.

## Deliverables

* [Runtime GLB](../../../../../public/assets/models/protagonist-v3.glb), loaded by the game at `/assets/models/protagonist-v3.glb`.
* [Editable animated derivative](protagonist-runtime-v3.blend), with packed source textures and five named actions.
* [Export/provenance report](export-report.json) and [actual GLB reimport validation](validation-report.json).
* [Animation contact sheet](animation-contact-sheet.png), [front idle preview](previews/idle-000.png), [running preview](previews/run-11.png), and the [twelve rendered views/phases](previews/index.json).
* [Browser playback evidence](browser-smooth-turning/report.json), including [standing](browser-smooth-turning/standing-right.png) and a [moving reversal](browser-smooth-turning/moving-reversal.png).
* [Production browser audit](production-browser.json), covering both entry routes and the deployed GLB.

| Property | Current value |
| --- | --- |
| Geometry | 104, 972 triangles, one skinned mesh; no decimation or concealed-face removal |
| Skeleton | 65 Mixamo joints; all original weights retained, up to eight influences per vertex |
| Material | One PBR material; base colour, normal and packed metallic/roughness textures |
| Textures | Three embedded 2048x2048 WebP images; no external resources |
| Transfer size | 7, 762, 852 bytes, approximately 7.4 MiB |
| First idle frame | Approximately 1.8912 metres from boot sole to hair |
| Root | Identity transform at the ground origin, with the user's torso alignment retained |
| Coordinates | Blender metres/Z up/facing -Y; GLB metres/Y up/facing +Z; presentation scales metres to Editor centimetres once |

The user explicitly requested the full mesh and retains later polygon optimisation. This version therefore exceeds the previous 40, 000-triangle and 5 MiB targets. Those targets are reported in validation rather than enforced by removing geometry or skin weights.

Mixamo returned the metre-valued OBJ at centimetre scale. The converter measures the source Blender height and restores the resulting factor of approximately 100. Before export, rigged bind-pose vertices match the edited Blender geometry within 0.7 micrometres. It preserves the authored horizontal offset rather than recentering the bounding box. The full Blender material restores normal/metallic/roughness channels absent from the diffuse-only Mixamo export; the imported UV layer is named `UVMap` to match that graph.

## Animation contract

| Clip | Duration | Reference speed | Runtime policy |
| --- | --- | --- | --- |
| Idle | 8.3333 s | Stationary | Plays while standing |
| Walk | 0.9667 s | 1.7707664 m/s | Blends during walking; rate follows the existing 1.5 m/s player speed |
| Run | 0.7000 s | 3.9823594 m/s | Blends during sprinting; rate follows the existing 3 m/s player speed |
| TurnLeft | 1.1667 s | Approximately 90 degrees per clip | Retained and validated; playback remains disabled |
| TurnRight | 1.1667 s | Approximately 90 degrees per clip | Retained and validated; playback remains disabled |

The supplied animation skeleton rests in a T-pose and the target in an A-pose. Conversion maps all 65 bone names, aligns anatomical axes and corrects rest-frame roll. Net horizontal travel is removed; small cyclic sway remains. Turn yaw is unwound so it cannot duplicate presentation heading. A constant per-clip vertical correction keeps boot contact at ground level while preserving walk bob and running flight. Reimported loops have stationary endpoints, no boot penetration beyond floating-point tolerance, walking clearance below 7 mm, and running flight up to approximately 91 mm.

The archive also retains strafe and jump sources. This asset update preserves the current Idle/Walk/Run gameplay controls and the disabled-turn policy; it does not introduce those extra actions into gameplay.

Integration checks passed: 49 focused renderer tests, a final 24-test rerun of the world-scene suite with full triangle-count/eight-influence assertions, strict application/tools type checks, focused source lint, documentation links, and the production build. The final keyboard probe recorded 156 samples with no browser errors and verified Idle, Walk, Run during sprinting, smooth heading, and stopped turn groups. Both production entry routes loaded the v3 GLB with no browser errors or failed requests. Browser rendering used SwiftShader, so its frame timings are not physical target-device performance qualification.

## Reproduce and validate

Run these from the repository root with Blender 5.2.2. The Python tools require Blender's `bpy` runtime and run in isolated background processes; they do not operate on the user's open Blender file.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/art/build-protagonist-runtime-v3.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/art/validate-protagonist-runtime-v3.py -- --render
node tests/acceptance/check-turning-browser.ts http://localhost:4200
```

Omit `--render` for numeric validation only. The browser probe requires the development app and Playwright Chromium. It exercises keyboard movement/reversal and checks that both turn groups remain stopped with no contribution. The validator checks actual GLB topology, embedded PBR textures, all eight skin influences, root transforms, source hashes, every clip frame, loop endpoints, deformation and ground contact. Rendering reimports the exported GLB before producing the twelve views/phases.

Assemble the contact sheet using the existing Playwright Chromium installation:

```powershell
node tools/art/contact-sheet-protagonist-runtime.ts
```

## Provenance

The ZIP is a user-supplied Mixamo export of the edited Meshy character. Its animation stacks identify `mixamo.com` . The converter records exact archive/member/source hashes. No acquisition receipt or standalone licence file accompanies this archive; the reports do not infer rights from the separate older MPFB experiment. Keep these source records with future distributions.
