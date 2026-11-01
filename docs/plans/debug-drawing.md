# Development debug drawing

Scrapworks supports object-owned wire drawings in the running Angular development game. Angular owns the controls; Babylon owns the geometry. This is presentation tooling: it does not add gameplay rules, simulate an interaction, or change the worker protocol.

## Turn drawings on

Run `yarn dev`, open the game, expand **Debug drawings**, and enable **Show debug drawings**. The master switch starts off. Categories are enabled by default and appear when an attachment registers, even while drawings are off. Settings survive scene changes and Retry within the mounted page; reloading resets them.

The supplied `placement` circle uses the current 3 m placement rule. The `collision` circle uses the current 0.35 m player radius. Both are centred on the latest completed player position published by the simulation, one centimetre above the ground. The `transforms` axes follow the rendered player anchor. Its interpolated position can differ from the completed position; that difference is useful when diagnosing presentation delay. These circles do not represent the future interaction-distance rule.

The controls do not request a simulation pause. Normal focus/input rules still apply while operating UI. The separate Inspector retains its existing pause behavior.

## Attach from TypeScript

```ts
import { attachDebugDraw } from '@game/debug/draw/debug-draw';

const debug = attachDebugDraw(node, { category: 'interaction' }, (draw) => {
  draw.circle('reach', { radius: currentReachMetres });
  draw.arrow('forward', {
    direction: { x: 0, y: 0, z: 1 },
    length: 1,
    color: '#ff9900',
  });
});
```

`node` can be a Babylon scene node, including a mesh or transform. The callback is synchronous and runs once per rendered frame while its owner, attachment, category and master switch are enabled. Read current presentation values inside it. Keep identifiers stable within an attachment: submitting the same identifier updates its cached shape; omitting it hides it for that frame. `debug.clear(id)` releases one cached shape and `debug.clear()` releases all; the next callback can submit them again.

`debug.setEnabled(false)` disables that attachment. `debug.dispose()` releases it immediately and is safe to repeat. Owner disposal also releases it automatically. A script that can stop independently of its node should call `dispose()` from its stop/destruction hook.

Supported writer methods:

| Method | Options |
| --- | --- |
| `line` | `start`, `end` |
| `ray`, `arrow` | optional `origin`, `direction`, `length` |
| `circle` | optional `center`, `radius`, optional `plane` (`xz`, `xy`, `yz`) |
| `sphere` | optional `center`, `radius`; three wire circles |
| `box` | optional `center`, full `dimensions` |
| `axes` | optional `origin`, `length`; RGB axes |

Every shape accepts `opacity` from 0 to 1; shapes other than axes use an optional six-digit `#rrggbb` color. Defaults are opaque cyan and horizontal circles. Dimensions must be positive and coordinates finite. Invalid shapes are hidden and produce deduplicated development diagnostics. A throwing provider hides its attachment for that frame without failing gameplay.

## Coordinates and depth

All positions, offsets, radii and dimensions are in gameplay metres. The backend converts once to Babylon's centimetres.

- Default local space follows the owner's absolute position and rotation, ignoring its scale. A 1 m radius stays 1 m even when the character's model conversion scales its anchor by 100.
- `{ space: 'world' }` accepts absolute metre coordinates. The node still owns enablement and cleanup.
- Depth testing defaults on. Set `{ depthTest: false }` to see an attachment through scenery.
- Drawings are unlit, do not write depth, and cannot intercept picking or collisions. Circles are planar; terrain projection and adjustable line thickness are not provided.

## Attach in Babylon Editor

Select a node and attach one of the `debug-line`, `debug-ray`, `debug-arrow`, `debug-circle`, `debug-sphere`, `debug-box` or `debug-axes` scripts under `src/game/debug/draw/editor/`. Each script exposes its own geometry fields plus category, enabled state, opacity, coordinate space and depth testing. Distances are labelled in metres. Circle planes are entered as `xz`, `xy` or `yz`. Multiple scripts can be attached independently.

Keep the Editor attachment enabled and **Debug only** unchecked. That Editor flag excludes scripts from exported runtime registration; it is not Scrapworks' production feature gate. Save the scene and use the normal automatic export/reload workflow. The `player-visual` anchor already has a one-metre axes attachment under `transforms`.

The scripts register on `onStart` and release on `onStop`. Their inspector metadata is independent. Embedded Editor Play and edit-mode viewport drawing are outside this version; inspect results in the Angular development game.

To repeat the focused browser check, start `yarn dev --port 4319` and run `node tests/acceptance/debug-drawing-browser.ts http://127.0.0.1:4319` in another terminal. It checks the real exported axes, player boundaries, categories, movement, AXE, both Retry paths and preference reset. Artifacts are written under ignored `tmp/debug-drawing/`.

## Runtime boundary and lifecycle

`SessionDriver` pins one completed `WorldView`, publishes it, drains completed notifications, and submits future simulation work. The player examples read that same `WorldFrame.view`. They never call the cloning `GameSession.view`/`current` getters or issue worker inspection, capture or tick requests. Rule constants come from the lightweight `world-rules` module, not the simulation barrel that exports ECS authority.

One manager per scene evaluates providers at the pre-active-mesh stage, after presentation scripts. It commits staged output only while scene ownership is current. It caches 64-segment circles and stable line topology, reuses buffers for changed geometry, and updates local transforms every frame even when no new publication arrived. A world-generation replacement invalidates cached output; skipped publications use current complete values rather than assumed intermediate deltas.

One private, lazily created utility layer shares the existing camera and frame loop. Main-thread Babylon notifications use `fromBabylonObservable`, lifecycle-owned RxJS subscriptions and one-shot disposal streams. Provider dispatch remains synchronous, with revision checks after callbacks. Teardown unsubscribes before disposing meshes, materials and the utility layer.

Renderer Retry can retain a healthy simulation session; worker failure restarts from authored state. Both replace old drawing owners. Debug resources are independent of Inspector cleanup and are released immediately when the old scene stops being current.

## Production and verification

Angular development file replacement selects the renderer backend. Production selects a no-op factory, evaluates no drawing providers, and allocates no debug observers or GPU resources. Small typed facades and serialized Editor configuration can remain. The production graph verifier rejects the development renderer and geometry modules while continuing to enforce worker/main separation.

Browser tests cover primitive geometry, stable buffers, visibility, transforms, publications, invalidation and teardown. Runtime/page tests cover the completed player circles, retained preferences and accessible controls. The focused acceptance probe lives under `tests/acceptance/`; screenshots and logs belong under ignored `tmp/debug-drawing/`.

Use the existing application, game, tooling, export, production graph, acceptance and authoring-workflow checks. Timed lifetimes, labels, persisted preferences, per-object UI lists, thick lines, and new gameplay rules are not part of this feature.
