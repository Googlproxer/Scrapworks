# Babylon Phase 2 implementation walkthrough

Prepared 11 October 2026. Companion to [Phase 2 of the 3D migration plan](3d-migration.md#phase-2-preserve-lifecycle-and-input-ownership).

Build on the completed Phase 1 client. The remaining work is input ownership, suspension when hidden, recovery from lost graphics capability, and broader lifecycle tests. Work through these checkpoints in order to implement Phase 2 yourself.

Phase 1 is complete; the changes below are Phase 2 implementation guidance. Player movement and fixed-step simulation integration follow in Phase 3.

## Existing lifecycle foundations

The current implementation already provides these mechanisms:

| Foundation         | Current implementation                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| Renderer ownership | Each client owns its canvas, engine, scene and asset container         |
| Rendering          | One stable render callback                                             |
| Resizing           | `ResizeObserver` watches the host                                      |
| Async safety       | Runtime generation guards and client transition tokens                 |
| Destruction        | Idempotent; disconnects resize, stops rendering and disposes resources |
| Late assets        | Disposed after destruction or a superseded transition                  |
| Errors             | Angular error display and Retry through remounting                     |

Keep those mechanisms as you work through the following steps. The [Phase 1 walkthrough](3d-phase-1-walkthrough.md) and [migration plan verification record](3d-migration.md#phase-1-prove-babylon-inside-the-existing-application) describe the completed prototype.

## 1 Separate the new responsibilities

Extend [BabylonGameClient](../../src/game/babylon/babylon-game-client.ts), keeping it responsible for coordinating lifecycle. Add small modules as needed:

| Suggested file under `src/game/babylon/` | Responsibility                                           |
| ---------------------------------------- | -------------------------------------------------------- |
| `input/viewport-input.ts`                | Focus, held keys, input permission and camera attachment |
| `lifecycle/browser-activity.ts`          | Document visibility and browser focus events             |
| `timing/frame-clock.ts`                  | Frame timing that can reset after suspension             |

Scene builders should continue constructing scenes without attaching controls. Angular should continue consuming plain contracts.

Leave player movement and the fixed-step simulation integration for Phase 3. Phase 2 can establish an input snapshot and resettable clock without moving the character.

## 2 Make camera controls follow viewport focus

The client currently attaches camera controls unconditionally near the end of `loadScene()`:

```ts
scene.activeCamera?.attachControl(this.canvas, true);
```

Replace that with one method that reconciles whether controls should be attached. Its decision should require all of the following:

```ts
const canAcceptInput = scenePrepared && sceneKey === 'Game' && documentVisible && hostHasSize && canvasFocused && uiAllowsInput && !destroyed && !hasError;
```

Attach controls when this changes to `true`; detach them when it changes to `false`. Track the attached state so repeated checks do not repeatedly attach listeners.

Keep the menu camera detached. Focus the canvas when the user clicks the game viewport, provided input is allowed. Its existing `tabIndex = 0` also permits keyboard focus.

Add a visible focus indication to the viewport host using `:focus-within`. Allow Tab to move focus out normally.

**Checkpoint:** camera interaction works after focusing the viewport, then stops when focus moves to an Angular button or text field.

## 3 Collect input without changing world state

Give `ViewportInput` a held-key set and methods such as:

```ts
setEnabled(enabled: boolean): void;
clear(): void;
getMovementIntent(): { x: number; z: number };
dispose(): void;
```

Listen for `keydown` on the canvas. Use `event.code` for bindings such as `KeyW`, `KeyA`, `KeyS` and `KeyD`. A window-level `keyup` listener can release keys after focus changes; it should only remove held keys.

Ignore modified shortcuts and unrecognised keys. Only call `preventDefault()` for an accepted game binding. Ignore repeated `keydown` events so a key held through a suspension does not silently reactivate when focus returns.

Clear held input on canvas blur, window blur, hidden documents, UI blocking, scene loading, errors and destruction. Clear pointer gestures on cancellation as well.

Reserve movement keys by removing the current camera's default keyboard input:

```ts
camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
```

This API is present in the installed Babylon 9.30.0 version. Retain pointer and wheel controls while the viewport owns input. When disabling controls, also clear the ArcRotateCamera's inertial rotation, zoom and panning offsets so it stops drifting.

**Checkpoint:** hold a movement key, switch focus away, release it elsewhere, then return. The input snapshot should be empty until a fresh key press.

## 4 Give Angular an explicit input blocking hook

Focus handles ordinary buttons and text fields. An explicit permission flag also lets a modal block input immediately, including while a pointer gesture is underway.

During the two-renderer prototype, an additive optional method on [GameClient](../../src/contracts/game-client.ts) is a small change:

```ts
setInputEnabled?(enabled: boolean): void;
```

Implement it in Babylon and forward it from [GameRuntimeService](../../src/app/features/game/game-runtime.service.ts). Store the requested permission in the service and reapply it when mounting a replacement client.

Treat this as permission, independent of focus: setting it to `true` must not force focus or attach controls while another condition blocks input.

When dialogs are introduced, derive permission from whether any blocking dialog is open. Closing one dialog must not re-enable input while another remains open.

**Checkpoint:** disabling input stops an active gesture immediately. Re-enabling it still requires viewport focus.

## 5 Handle document visibility and zero sized hosts together

Listen to `visibilitychange` on `host.ownerDocument`, and initialise the visibility flag from that document. Window blur should clear input; document visibility should control hidden-tab suspension. These are different signals. Browsers also throttle background animation callbacks, so explicit suspension remains necessary. [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

Extend the existing resize observer to record whether both host dimensions are positive. When the host is zero-sized, suspend rendering and input. When it becomes usable again, call `engine.resize()` before resuming.

Do not infer host visibility from `engine.getRenderWidth()`: the installed engine can retain or substitute a backing-buffer size when its canvas has no visible dimensions.

Keep the single render callback registered. Make it return early while rendering is blocked; resuming should not register another callback.

**Checkpoint:** hide the host, restore it, and verify correct dimensions, a visible scene and exactly one active render callback.

## 6 Represent suspension without weakening readiness checks

Add `'paused'` to `GamePhase` in [game-state.ts](../../src/contracts/game-state.ts). An optional plain reason can explain it:

```ts
readonly pauseReason?: 'document-hidden' | 'viewport-hidden';
```

Keep scene preparation separate from the published phase. A useful state order is:

| Condition                                  | Published state |
| ------------------------------------------ | --------------- |
| Destroyed                                  | `stopped`       |
| Failed                                     | `error`         |
| Required assets still loading              | `loading`       |
| Scene prepared, but rendering blocked      | `paused`        |
| Rendering usable and a frame has succeeded | `ready`         |

After `whenReadyAsync()`, check the existing transition token, mark the scene prepared, then reconcile activity. If the document or host is hidden, defer the first frame. Publish `ready` only after a successful frame when rendering becomes usable.

Update the duplicate-scene guard to recognise a paused current scene too. Otherwise `setScene('Game')` could unnecessarily reload a paused game.

Update the [page template](../../src/app/features/game/game-page/game-page.component.html) to show paused status through `role="status"`. Preserve the current error and Retry flow. Do not automatically restore canvas focus on resume.

**Checkpoint:** let the GLB finish loading while hidden. Returning should render that scene without a second import or premature `ready` event.

## 7 Reset timing when activity resumes

Introduce a small clock with `sample(now)` and `reset()`. Reset its previous timestamp whenever rendering is suspended, a scene changes, an error occurs or the client is destroyed.

The first sample after resetting should return zero elapsed time. Subsequent samples return elapsed seconds.

Later, Phase 3's fixed-step scheduler must reset its accumulator at the same boundary. Currently [Simulation](../../src/simulation/simulation.ts) is a logging scaffold, so Phase 2 only needs to establish and test this timing behaviour.

**Checkpoint:** a ten-second hidden period contributes zero catch-up time on the first resumed frame.

## 8 Use explicit Retry for WebGL context loss

For this prototype, route context loss through the existing error/remount mechanism. It gives you a complete recovery path before adding automatic recovery.

Subscribe to:

```ts
engine.onContextLostObservable;
```

When notified, invalidate the current transition token, clear input, detach controls, reset timing and report an error such as:

> Graphics rendering was interrupted. Select Retry to reload the prototype.

Use the existing scene disposal and error publication path. Invalidating the token is essential: a GLB load already in progress must not subsequently publish `ready`.

Keep Babylon's built-in context handling enabled. Babylon can rebuild GPU resources and exposes loss/restoration observables, but under this policy restoration of the old engine should leave the application in `error` until Retry remounts it. [Babylon context-loss handling](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene/#handling-webgl-context-lost)

Store and remove your observable subscription during destruction.

**Checkpoint:** losing graphics capability displays an error. Retry disposes the old engine and creates one replacement canvas and engine.

## 9 Extend cleanup and the browser tests

Expand the existing destruction sequence to release the new resources before disposing the scene and engine: disable and clear input, detach camera controls, release any tracked pointer capture, remove DOM listeners and observable subscriptions, then perform the existing cleanup.

Give each helper idempotent disposal. Also handle partial constructor failure: if helper setup throws after engine creation, dispose everything already created before rethrowing.

Extend [client tests](../../src/game/babylon/babylon-game-client.spec.ts) and [page tests](../../src/app/features/game/game-page/babylon-game-page.component.spec.ts) with these cases:

| Case                        | Required result                                         |
| --------------------------- | ------------------------------------------------------- |
| Repeated mount/unmount      | No remaining canvases, loops or owned listeners         |
| Two simultaneous hosts      | Destroying one leaves the other working                 |
| Zero-sized host restored    | Correct resize and one render callback                  |
| Focus or UI permission lost | Held keys and camera gestures cleared                   |
| Hidden during loading       | One import; readiness deferred until rendering succeeds |
| Hidden then resumed         | No accumulated elapsed time                             |
| Context lost during loading | Error persists; late assets disposed                    |
| Context-loss Retry          | Old engine disposed; replacement works                  |

Test actual context loss using `WEBGL_lose_context`, rather than only dispatching a synthetic DOM event. The extension deliberately simulates loss and restoration. [MDN WebGL testing extension](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_lose_context)

Keep the existing late-load and stale-transition tests. Add accessibility checks for the paused state, then run:

```sh
yarn test
yarn run lint
yarn run test:lint
yarn run build
```

## Completion check

Phase 2 is complete when the viewport reliably releases input, suspension preserves the scene without advancing time, graphics failure has a working recovery path, and repeated creation/removal leaves no owned resources behind.

- [ ] Viewport focus and UI permission control keyboard, camera and pointer input.
- [ ] Held keys and gestures clear on blur, suspension, load, errors and teardown.
- [ ] Hidden documents and zero-sized hosts suspend rendering; resuming resizes and renders without duplicate loops or asset imports.
- [ ] The first resumed clock sample excludes suspended time.
- [ ] Context loss reports an error, rejects late loads and recovers through Retry.
- [ ] Multiple hosts, repeated mount/unmount and partial construction failures preserve resource ownership.
- [ ] Browser tests, accessibility checks, lint, custom lint-rule tests and the production build pass.

Record the completed checks in [Phase 2 of the migration plan](3d-migration.md#phase-2-preserve-lifecycle-and-input-ownership) before moving on to movement, camera configuration and picking in Phase 3.
