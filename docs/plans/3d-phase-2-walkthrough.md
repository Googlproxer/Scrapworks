# Babylon Phase 2 implementation walkthrough

Prepared 11 October 2026. Companion to [Phase 2 of the 3D migration plan](3d-migration.md#phase-2-preserve-lifecycle-and-input-ownership).

Active implementation guidance, reconciled with the working tree on 18 October 2026. Apply it to the current `loadEditorScene` path and `BabylonGameClient`; the user implements these runtime changes. The progress below records existing code and tests separately from the remaining integration work.

Build on the completed Phase 1 client. The remaining work is input ownership, suspension when hidden, recovery from lost graphics capability, and broader lifecycle tests. Work through these checkpoints in order to implement Phase 2 yourself.

Phase 1 is complete and Phase 2 is in progress. Player movement and fixed-step simulation integration follow in Phase 3.

Updated 12 October 2026: initial [Phase 1.5 Editor integration](3d-migration.md#phase-15-integrate-babylonjs-editor-authoring) loads editable MainMenu and Game scenes through the official Editor loader. The 17 October cleanup added automatic development export/reload and failure retention. That setup was the baseline for the Phase 2 work recorded below; keep presentation settings editable in the Editor.

## Progress as of 18 October 2026

**You are at step 6.** The core render/paused-state work is now implemented: every continuous frame checks activity, blocked prepared scenes publish `paused`, and eligible successful frames publish `ready`. Canvas blur now detaches controls, the ArcRotate camera's keyboard input is removed, and client reconciliation subscriptions are unsubscribed on destruction. The validator correction now narrows to `BabylonSceneKey` and the Angular test bundle compiles.

Step 6 is not complete yet: a paused current scene can still be reloaded by selecting it again, and the page has no accessible paused status. There are also earlier-step omissions listed below. Steps 7 and 8 remain ahead of you.

| Step                 | Status                             | Confirmed progress                                                                                                                                                                      | Still open                                                                                                                                                 |
| -------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Responsibilities   | Structure in place                 | Input/activity responsibilities are separate; lifecycle values use subjects; the authored loader does not attach controls.                                                              | Frame-clock behavior belongs to step 7. Partial-construction cleanup remains in step 9.                                                                    |
| 2 Camera focus       | Core implemented                   | Focus and blur update `canvasActiveSubject`; controls detach on blur or disabled permission. Both pass browser probes.                                                                  | Add/verify a visible viewport focus indicator and gate effective keyboard input with the same ownership conditions.                                        |
| 3 Input collection   | In progress                        | Physical-key state, readonly snapshots and helper cleanup exist. Lifecycle-state emissions clear input. Game camera keyboard input is removed; Babylon detach clears ArcRotate inertia. | Define accepted binding/shortcut handling and block new keydown while activity disallows input. Pointer cancellation/capture still needs direct coverage.  |
| 4 Angular permission | In progress                        | Required hook, runtime forwarding and a test Save dialog's disable/close-enable path exist.                                                                                             | Retain permission during loading/paused states and across remounts; derive it from all blocking dialogs rather than enabling on any single close.          |
| 5 Suspension         | Core implemented, omissions remain | Continuous rendering stops while hidden/zero-sized and resumes the same scene with one loop.                                                                                            | Remove the loader's unconditional `scene.render()` and use the same callback identity to start/stop the loop. Effective keyboard suspension is incomplete. |
| 6 Paused lifecycle   | Current step; in progress          | `updateRenderState()` publishes paused; `renderFrame()` resizes and publishes ready only after an eligible successful frame. Hidden preparation publishes paused.                       | Preserve a paused same-key scene, show `role="status"` paused feedback, and eliminate the loader's hidden first frame.                                     |
| 7 Frame clock        | Not started                        | File/test placeholders exist.                                                                                                                                                           | `frame-clock.ts` is empty and the spec is TODO-only.                                                                                                       |
| 8 Context loss       | Not started                        | Existing error display and Retry/remount are the foundation.                                                                                                                            | Subscribe to context loss, invalidate pending loads and verify Retry.                                                                                      |
| 9 Cleanup/tests      | Progress made                      | Owned subscriptions now live in `subs` and unsubscribe on destroy; activity-observer cleanup passes.                                                                                    | Complete canvas focus, fix explicit loop-stop identity, cover partial construction, and promote the Phase 2 probes into permanent regressions.             |

### Missed items from steps 1–5

These are the earlier checkpoints to revisit; the two step 6 tasks are listed separately above.

| Earlier step                                  | What is still missing                                                                                                                                                                           | Concrete next action                                                                                                                                                                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Step 5: one guarded render path**           | `loadScene()` still calls `scene.render()` immediately after emitting preparation. A hidden-load probe publishes paused correctly but records one rendered frame.                               | Remove that direct render. Let the registered `renderFrame` perform every draw after checking eligibility.                                                                                                                                       |
| **Steps 1/5: stable callback identity**       | Setup registers `this.renderFrame.bind(this)`, while destruction passes the unbound `this.renderFrame` to `stopRenderLoop()`. The explicit stop therefore misses the registered callback.       | Use an arrow-function field, or bind once and retain that exact reference for both calls. Engine disposal currently clears the loop later; that masks the mismatch in ordinary teardown tests.                                                   |
| **Steps 2/3/5: effective keyboard ownership** | Camera controls obey the activity decision, but `ViewportInput` is still enabled according to requested UI permission alone. A focused zero-sized host accepts a new `KeyW` event while paused. | Separate requested UI permission from effective input eligibility, then apply the full Game/prepared/focused/visible/sized/alive/error decision to keyboard input as well. Do not feed the effective result back into its own permission source. |
| **Step 4: retained UI permission**            | `GameRuntimeService.setInputEnabled()` still returns while not ready and does not retain requests across remounts.                                                                              | Store each request before readiness/client checks; apply it to the current/replacement client. A pause must not silently discard a modal's blocking request.                                                                                     |
| **Step 4: all blocking dialogs**              | `openSaveDialog()` enables input whenever that one dialog closes.                                                                                                                               | Derive permission from whether any blocking dialog remains open, using a shared count/set or dialog state. Keep the current simple dialog hook as the starting point.                                                                            |
| **Step 2: focus presentation**                | The walkthrough's viewport `:focus-within` indication has not been added to the viewport stylesheet.                                                                                            | Provide and verify a visible focus indication while keeping normal Tab navigation. Native outline behavior alone has not been checked here.                                                                                                      |
| **Step 3: binding policy**                    | The raw helper tracks supported codes/modifiers and does not prevent browser defaults; no game-binding/modified-shortcut policy is present.                                                     | Keep the reusable key map; define filtering/prevention at the game-input boundary and preserve Tab/browser shortcuts.                                                                                                                            |
| **Step 5: activity-source ownership**         | `BrowserActivity` remains global-document scoped with `beforeunload` cleanup. Client consumers now unsubscribe correctly.                                                                       | Keep the shared source alive for other clients, but document/implement its application-level cleanup owner and owning-document assumptions.                                                                                                      |

### Review findings and validation

Current-source probes use a real Babylon/WebGL engine, controlled activity signals and a minimal scene. They do not edit `src/`.

| Browser check                                                        | Current result                                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Prepared visible scene; disable input; move canvas focus to a button | Pass: one loop, and controls detach on disable/blur.                                                     |
| Hide document or collapse host after readiness                       | Pass: continuous frame IDs stop advancing.                                                               |
| Finish preparation while hidden                                      | Pass: phase is paused. **Fail:** a direct loader render still advances the frame ID to 1.                |
| Destroy client activity consumers                                    | Pass: shared activity subjects no longer retain client observers.                                        |
| Stop using the exact registered render callback                      | Fail: bound and unbound function references differ.                                                      |
| Select the same scene while it is paused                             | Fail: the old scene is disposed/replaced instead of retained.                                            |
| Keydown on a focused zero-sized host                                 | Fail: the key map records `KeyW` despite paused activity.                                                |
| Disable an ArcRotate camera with inertia                             | Pass: detach clears the tested rotation/zoom offsets. Installed Babylon also resets its panning offsets. |
| Hide, then resume                                                    | Pass: the same scene returns to ready with one callback.                                                 |

Validation on 18 October 2026, after the validator fix:

- **Focused existing browser suites: 38 tests passed** across the client, input and browser-activity specs.
- **Current-source review probes: 9 passed, 4 failed** across 13 checks. The four failures are the hidden loader draw, loop-stop reference mismatch, paused same-key reload and effective keyboard gate. The local harness is under ignored `tmp/phase2-step6-review/`; it is review evidence, not permanent regression coverage.
- **Production Angular build: passed.** The validator now narrows to `BabylonSceneKey`; the earlier TS2345 error is resolved. The build used the existing generated scene export.
- **Full browser suite: not completed.** It compiled and reported the TODO-only `frame-clock.spec.ts` as an empty suite, then stopped producing progress and was interrupted. No fresh full-suite/accessibility pass is claimed; the focused suites above completed separately.
- **Source lint: 73 errors**, comprising 72 CRLF/Prettier findings in `environment.api.ts`, `browser-activity.ts` and `frame-clock.spec.ts`, plus Phaser's unused no-op `on` argument. These remain outside this documentation update.
- Documentation link/diagram and walkthrough formatting checks pass. This review updates documentation; runtime changes remain user-owned.

## Existing lifecycle foundations

The current implementation already provides these mechanisms:

| Foundation         | Current implementation                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| Renderer ownership | Each client owns its canvas, engine, scene and asset container         |
| Rendering          | One registered callback; start/stop identity still needs correction    |
| Resizing           | `ResizeObserver` watches the host                                      |
| Async safety       | Runtime generation guards and client transition tokens                 |
| Destruction        | Idempotent; disconnects resize, stops rendering and disposes resources |
| Late assets        | Disposed after destruction or a superseded transition                  |
| Errors             | Angular error display and Retry through remounting                     |

Keep those mechanisms as you work through the following steps. The [Phase 1 walkthrough](../history/3d/phase-1-walkthrough-2026-10-11.md) and [migration plan verification record](3d-migration.md#phase-1-prove-babylon-inside-the-existing-application) describe the completed prototype.

## 1 Separate the new responsibilities

**Status: structure in place.** Extend [BabylonGameClient](../../src/game/babylon/babylon-game-client.ts), keeping it responsible for coordinating lifecycle. Use the helper modules already started:

| Existing file under `src/game/babylon/` | Responsibility                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `input/viewport-input.ts`               | Existing keyboard state, permission and clearing; coordinate camera attachment through the client |
| `lifecycle/browser-activity.ts`         | Existing shared document visibility and browser focus events                                      |
| `timing/frame-clock.ts`                 | Empty placeholder for frame timing that can reset after suspension                                |

The authored-scene loader already prepares scenes without attaching controls. Keep camera attachment under runtime input/lifecycle ownership. Angular should continue consuming plain contracts. Keep pending scenes and attached components within the same transition/disposal ownership as their assets.

Leave player movement and the fixed-step simulation integration for Phase 3. Phase 2 can establish an input snapshot and resettable clock without moving the character.

## 2 Make camera controls follow viewport focus

**Status: camera focus/blur and attach/detach implemented; effective keyboard ownership and focus presentation remain.** The constructor's `cameraObs` now invokes `attachCamera()` using the combined flags. Its effect has both branches:

```ts
if (canAcceptInput) scene.activeCamera?.attachControl(this.canvas, true);
else scene.activeCamera?.detachControl();
```

The client now calls `checkCanvasActive()` during setup and on both focus and blur. Moving focus to a button detaches controls in a browser probe. Browser focus remains a separate input to the decision. Preserve this working behavior; finish the focus indication and effective keyboard gate noted above.

### Define the inputs to the decision

The decision is now reactive. The expression below describes the booleans emitted by the existing subjects/observables; they are not additional stored flags. Keep the streams as the sources of truth and use meaningful parameter names when flattening their tuples.

```ts
const canAcceptInput = scenePrepared && sceneKey === 'Game' && documentVisible && hostHasSize && canvasFocused && uiAllowsInput && !destroyed && !hasError;
```

| Value             | Meaning and owner                                                                                                                                | Initial value / source                                                                                          | When it changes                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenePrepared`   | Emitted by `scenePreparedSubject`: the **current** scene's required assets and Babylon preparation are complete; no successful frame is implied. | Existing `BehaviorSubject(false)`.                                                                              | `.next(true)` follows `whenReadyAsync()` and a current-transition check; `disposeCurrentScene()` emits `false`. Already consumed by both decisions; future context loss must also reset it. |
| `sceneKey`        | The selected renderer scene, already represented in lifecycle state.                                                                             | Read the existing `stateSubject.value.sceneKey`; it starts as `null` and is set when a scene transition begins. | Read the latest value during each reconciliation; do not retain a snapshot from construction.                                                                                               |
| `documentVisible` | Whether the viewport's owning document is visible, supplied by `BrowserActivity`.                                                                | Existing `isVisible` / `visibleObs` use `!document.hidden`; document ownership is discussed in section 5.       | Already observed by both decisions. `document.hidden` itself has the opposite meaning.                                                                                                      |
| `hostHasSize`     | Emitted by `hostHasSizeSubject`: the viewport **host element** has positive layout width and height.                                             | Existing `BehaviorSubject(false)`, then measured during setup.                                                  | `.next(...)` runs initially and from the resize observer. Both decisions and the continuous render predicate now honor it; effective keyboard gating is still pending.                      |
| `canvasFocused`   | The client's `canvasActiveSubject` combined with the browser's focus signal.                                                                     | Initially samples `activeElement === canvas`; browser focus is already a separate `cameraObs` input.            | Setup, canvas focus and canvas blur now update the subject. The browser-focus source independently handles window focus; keep both signals.                                                 |
| `uiAllowsInput`   | Requested permission from Angular/runtime, independent of DOM focus.                                                                             | The helper's `enabledSubject` starts `true`; `enabledObs` now participates in `cameraObs`.                      | `setInputEnabled()` publishes permission, clears keyboard state on disable and updates camera attachment. The runtime still needs to retain/reapply requests across loading/remounts.       |
| `destroyed`       | Emitted by the client's lifetime `destroyedSubject`.                                                                                             | Existing `BehaviorSubject(false)`.                                                                              | `destroy()` emits `true` once and completes it. Never reset it for Retry, which creates another client.                                                                                     |
| `hasError`        | A failure blocks controls until recovery. Reuse lifecycle state instead of adding a second independently maintained error flag.                  | Derive from `stateSubject.value.phase === 'error'`.                                                             | Read after error publication and on each reconciliation. An error message being empty must not make an error phase usable.                                                                  |

For synchronous decisions in `BabylonGameClient`, read `this.scenePreparedSubject.value`, `this.hostHasSizeSubject.value`, `this.destroyedSubject.value` and `this.hasError`. Subscriptions receive the emitted booleans directly. Keep requested UI permission distinct from the final effective input decision: feeding an effective `false` back into the permission source could prevent input from ever re-enabling. These are client/session facts, not gameplay fields to save in `WorldState`.

### Keep `scenePrepared` at the load boundary

This subject and its load/disposal emissions are already implemented. Keep it as the preparation source; a successful rendered frame remains a separate readiness requirement.

Creating `new Scene(this.engine)` and assigning `currentScene` happen **before** asynchronous loading completes. Neither `currentScene !== undefined` nor having an active camera proves preparation is finished.

Keep the existing load order: create/own the scene, await the authored loader, reject stale results, add the returned assets to the scene, then await `scene.whenReadyAsync()`. After that await, check the existing transition token again. Only the still-current load may call `scenePreparedSubject.next(true)`, which triggers the activity decisions.

Reset the flag before replacing or disposing the scene. Do **not** reset it just because the document becomes hidden, the canvas loses focus or a modal opens: the loaded scene remains prepared during suspension. Otherwise returning to the viewport could unnecessarily reload it.

Do not derive this flag from `phase === 'ready'`. Preparation must be able to finish while hidden, and the public `ready` state comes only after a successful usable frame. Using `ready` as the preparation prerequisite creates a circular dependency.

### Use the existing `hostHasSize` measurement

Initial measurement, resize-observer updates and the continuous render gate are implemented. Complete effective keyboard suspension and remove the loader render that bypasses this gate.

Use the `host: HTMLElement` passed to the client constructor: it is the viewport container into which you append the canvas. Measure that element's layout dimensions, for example:

```ts
this.hostHasSizeSubject.next(host.clientWidth > 0 && host.clientHeight > 0);
```

Evaluate this once during setup after adding the canvas, then in the existing resize observer's callback. That callback can retain access to the constructor's `host` through its closure; alternatively, deliberately store the host as a client field if several methods need it. No second `ResizeObserver` is required.

When the result is positive, call `engine.resize()` before allowing a resumed frame. When either dimension is zero, suspend rendering and input until another measurement becomes positive. This catches a collapsed container or one under `display: none`. It is a size test, not a test for whether the element is scrolled into view, covered by another element or fully transparent.

Do not measure Babylon's backing-buffer dimensions to obtain this flag: a canvas/engine can retain nonzero dimensions after its host collapses. Keep the host measurement as the source of truth. See section 5 for the suspension behavior it drives.

### Reconcile decisions separately from side effects

The existing subscriptions now provide reactive coordination, and their returned subscriptions are retained in `subs` and removed on destruction. `updateRenderState()` owns paused-state reconciliation; the camera subscription owns attachment. Keep this division and avoid adding another competing render path.

For input, the current helper already attaches/detaches the camera according to the decision. Finish applying that decision to held keyboard state. Babylon's installed input manager guards repeated attachment, so an extra `controlsAttached` flag is not itself a missing feature here. You can deduplicate boolean decisions or track the attached camera to reduce repeated effects, but preserve detachment before replacing the camera/scene. Actual attachment state is an effect of the decision, not another prerequisite for accepting input.

Rendering has a different decision:

```ts
const canRender = scenePrepared && documentVisible && hostHasSize && !destroyed && !hasError;
```

MainMenu still needs to render, and moving focus to Angular or opening a modal should stop game input without automatically stopping all rendering. Sections 5 and 6 add suspension and lifecycle publication to this same reconciliation. In particular, do not gate the first eligible render solely on the existing public `phase === 'ready'`: that first successful frame is what permits publishing `ready`.

Keep the menu camera detached. When a pointer interaction should focus the Game canvas, check readiness, visibility, size and UI permission **without requiring `canvasFocused` yet**, then focus it. The focus event updates the full input decision. Requiring `canAcceptInput` before allowing focus would prevent an unfocused canvas from ever acquiring input. Its existing `tabIndex = 0` also permits keyboard focus.

Add a visible focus indication to the viewport host using `:focus-within`. Allow Tab to move focus out normally.

For example, a prepared Game scene that loses canvas focus stays rendered/ready but releases input. If its host then becomes zero-sized, `scenePrepared` remains `true`, `hostHasSize` becomes `false`, and section 6's state becomes paused. Restoring the size resizes and renders that same scene; it does not import the scene again.

**Checkpoint:** camera interaction works after focusing the viewport, then stops when focus moves to an Angular button or text field.

## 3 Collect input without changing world state

**Status: key collection and camera keyboard separation implemented; effective keyboard ownership and binding policy remain.** [ViewportInput](../../src/game/babylon/input/viewport-input.ts) already exposes a readonly `stateObs` backed by the physical-key map in [key-map.ts](../../src/game/babylon/input/key-map.ts), plus:

```ts
setEnabled(enabled: boolean): void;
clear(): void;
dispose(): void;
```

Keep this map and observable output; a separate held-key set is unnecessary. Movement-intent derivation can follow in Phase 3 when movement bindings are introduced.

The helper already listens for canvas `keydown` and window `keyup`, uses `event.code`, ignores unsupported codes, repeated events and default-prevented keydown, and tracks left/right modifiers separately. Window keyup releases keys even while disabled. Disabling, canvas blur, browser blur, hidden documents and disposal clear the key map. [Input tests](../../src/game/babylon/input/viewport-input.spec.ts) cover the core key-map behavior; [activity tests](../../src/game/babylon/lifecycle/browser-activity.spec.ts) also exercise clearing through browser focus/visibility events.

Remaining work: decide which bindings are accepted for the game and which modified shortcuts to ignore. The current helper records supported physical codes, including modifiers, and does not call `preventDefault()`; apply prevention only to an accepted game binding. Preserve repeat suppression so a key held through suspension does not silently reactivate when focus returns.

The new `errorObs.subscribe(() => this.viewportInput.clear())` actually clears on every lifecycle-state emission, because the mapped boolean is not filtered or deduplicated. That includes loading/error transitions and paused/ready changes. Existing held keys are therefore cleared, but fresh keydown is still accepted during host suspension: apply the full effective input decision to prevent that. Keep requested UI permission separate from this effective gate. Pointer-cancel/capture behavior still needs direct coverage.

For that separation, a client-owned requested-permission subject can start `true` and be updated only by `setInputEnabled()`. Derive effective permission from that source plus scene/activity/focus/lifetime state, then apply it to `ViewportInput.setEnabled()`. Replace the decision's current use of the helper's `enabledObs` with the independent requested-permission source before doing this; otherwise disabling the helper feeds `false` back into the decision and can prevent recovery. The runtime owns retaining/reapplying the requested permission across remounts; neither value belongs in saved gameplay state.

The Game camera now removes its default keyboard input when controls attach:

```ts
camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
```

The exported Game camera is an ArcRotateCamera, so this removal matches the authored scene. Retain pointer/wheel controls while the viewport owns input. In the installed Babylon 9.30.0 implementation, `detachControl()` already resets rotation, zoom and panning inertia after attachment; the review probe confirmed rotation/zoom reset. Preserve that behavior rather than adding a redundant reset solely to satisfy the earlier guide wording.

**Checkpoint:** hold a movement key, switch focus away, release it elsewhere, then return. The input snapshot should be empty until a fresh key press.

## 4 Give Angular an explicit input blocking hook

**Status: contract, forwarding, camera detach and a test dialog hook implemented; retained permission and multiple-dialog ownership remain.**

Focus handles ordinary buttons and text fields. An explicit permission flag also lets a modal block input immediately, including while a pointer gesture is underway.

The hook is already a required method on [GameClient](../../src/contracts/game-client.ts):

```ts
setInputEnabled(on: boolean): void;
```

[GameRuntimeService](../../src/app/features/game/game-runtime.service.ts) already forwards it while a client is ready. Babylon forwards it to `ViewportInput.setEnabled()`; its `enabledObs` also updates `cameraObs`, and disabling it now detaches camera controls. Phaser implements a no-op. Keep the existing required contract.

Store the requested permission in the service even before a client is mounted or ready, and reapply it when mounting a replacement client. The current ready-only guard drops those requests. Preserve the helper's requested permission as a source for reconciliation, and verify that detach also cancels active pointer gestures/inertia.

Treat this as permission, independent of focus: setting it to `true` must not force focus or attach controls while another condition blocks input.

`openSaveDialog()` now disables input before opening the test Save dialog and enables it when that dialog closes. Extend this to derive permission from all blocking dialogs. Closing one must not re-enable input while another remains open, and a loading/paused request must be retained by the runtime.

**Checkpoint:** disabling input stops an active gesture immediately. Re-enabling it still requires viewport focus.

## 5 Handle document visibility and zero sized hosts together

**Status: continuous rendering suspends and resumes correctly; loader rendering and keyboard suspension remain.** `renderFrame()` now calls `canRenderCurrentScene()` on every callback, and `updateRenderState()` publishes paused when a prepared scene is blocked. Hidden/zero-sized continuous suspension and same-scene resumption pass browser probes. The remaining unconditional `scene.render()` in `loadScene()` bypasses the gate once during preparation.

Listen to `visibilitychange` on `host.ownerDocument`, and initialise the visibility flag from that document. Window blur should clear input; document visibility should control hidden-tab suspension. These are different signals. Browsers also throttle background animation callbacks, so explicit suspension remains necessary. [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

The current `BrowserActivity` is a shared singleton using global `document`/`window`, with cleanup on `beforeunload`. Make its lifetime explicit: if it remains shared for the application, each client/helper should unsubscribe its own consumers without shutting down the shared source while another viewport uses it. Give the shared source an explicit application-level cleanup owner. If you instead make activity tracking client-owned, add idempotent disposal and call it at client teardown. Use the host's owning document and its `defaultView`, or explicitly scope the shared instance to that document. Preserve the already-working positive visibility semantics and bound handlers.

The existing resize observer already records whether both host dimensions are positive and calls `engine.resize()`. Now reconcile after measurement: when the host is zero-sized, suspend rendering and input; when it becomes usable again, call `engine.resize()` before resuming.

Do not infer host visibility from `engine.getRenderWidth()`: the installed engine can retain or substitute a backing-buffer size when its canvas has no visible dimensions.

Keep the single render callback registered. Make it return early while rendering is blocked; resuming should not register another callback.

### Correct the render path

The core of the reference below is now implemented as `canRenderCurrentScene()`, `updateRenderState()` and `renderFrame()`. The subscription no longer draws, and the loader no longer publishes premature ready. Keep that work. Two corrections remain:

1. Remove the direct `scene.render()` after `scenePreparedSubject.next(true)` in `loadScene()`. Preparation should leave all drawing to the registered callback.
2. Keep one function identity for `runRenderLoop()` and `stopRenderLoop()`. The reference below uses an arrow-function field; register and stop `this.renderFrame` directly in that form. If you keep a class method, bind it once into a retained callback field and pass that field to both calls. Do not bind only at registration.

This remains a reference for the intended behavior; it does not mean the remaining corrections were applied to runtime source:

```ts
private canRenderCurrentScene(): boolean {
  return (
    this.currentScene !== undefined &&
    this.scenePreparedSubject.value &&
    this.browserActivity.isVisible &&
    this.hostHasSizeSubject.value &&
    !this.destroyedSubject.value &&
    !this.hasError
  );
}

private updateRenderState(destroyed: boolean, hasError: boolean, scenePrepared: boolean): void {
  if (destroyed || hasError || !scenePrepared || !this.currentScene) return;

  const state = this.stateSubject.value;
  if (!this.canRenderCurrentScene() && state.phase !== 'paused') {
    this.stateSubject.next({ ...state, phase: 'paused' });
  }
}

private readonly renderFrame = () => {
  const scene = this.currentScene;
  const transition = this.transition;
  if (!scene || !this.canRenderCurrentScene()) return;

  try {
    // Initial/resumed frames resize before drawing.
    if (this.stateSubject.value.phase !== 'ready') this.engine.resize();
    scene.render();

    // Rendering callbacks may replace/dispose the scene or change activity.
    if (!this.isCurrentTransition(transition) || this.currentScene !== scene || !this.canRenderCurrentScene()) return;

    const state = this.stateSubject.value;
    if (state.phase !== 'ready') {
      this.stateSubject.next({ ...state, phase: 'ready' });
    }
  } catch (error) {
    if (this.isCurrentTransition(transition) && this.currentScene === scene) {
      this.reportError(error);
    }
  }
};
```

The existing subscription is already wired to the lifecycle helper and retained in `subs`:

```ts
renderObs.subscribe(([scenePrepared, destroyed, hasError]) => this.updateRenderState(destroyed, hasError, scenePrepared));
```

`canRenderCurrentScene()` reads the subjects' latest values each frame; it is a derived decision, not another stored flag. It intentionally permits a prepared scene in `loading` or `paused` to draw its first eligible frame. Requiring `phase === 'ready'` here would deadlock readiness after removing the loader's premature publication.

`updateRenderState()` publishes `paused` immediately when a prepared scene is blocked. On recovery it leaves the phase alone until the loop resizes and successfully renders. The phase-change checks prevent `stateSubject.next()` from recursively publishing the same state through `renderObs`, and avoid state emissions on every frame. Keep error handling around the actual render call; a thrown RxJS subscriber callback is not caught by the loader's surrounding `try/catch`.

For example: hidden preparation emits `scenePrepared = true`, reconciliation publishes `paused`, and frame callbacks return without drawing. Visibility recovery allows that same scene to render; only then is `ready` published. Canvas blur or UI blocking still releases input while rendering continues if visibility/size remain usable. Section 7 will add clock resets at suspension/scene/error boundaries.

**Checkpoint:** hide the host, restore it, and verify correct dimensions, a visible scene and exactly one active render callback.

## 6 Represent suspension without weakening readiness checks

**Status: you are here; paused publication and first-eligible-frame readiness are implemented.** `'paused'` is in `GamePhase` in [game-state.ts](../../src/contracts/game-state.ts). `updateRenderState()` now publishes it for blocked prepared scenes; `renderFrame()` publishes ready after a successful eligible frame. Hidden preparation correctly reports paused, although section 5's direct loader render still needs removal. An optional plain reason can explain suspension:

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

After `whenReadyAsync()`, the client checks the transition token and emits preparation through the subject. Paused publication and eligible-frame readiness are now connected correctly. Preserve those decisions while removing the direct loader draw, so a hidden prepared scene renders zero frames until it can resume.

Here, `transition` is the existing client counter that identifies a load attempt. The token passed into `loadScene()` is that attempt's captured value. `isCurrentTransition(token)` checks that the client is alive and no newer transition has replaced it. It must pass after each await before that load changes `scenePrepared`, publishes state or attaches input. A late completion must not prepare the replacement scene by updating a shared flag.

| Event                                                           | `scenePrepared`  | `hostHasSize`                | Outcome                                                                                       |
| --------------------------------------------------------------- | ---------------- | ---------------------------- | --------------------------------------------------------------------------------------------- |
| New scene load begins                                           | `false`          | Latest measured size         | Loading; controls released.                                                                   |
| Current scene finishes preparation while the document is hidden | `true`           | Latest measured size         | Paused; retain the scene and wait for visibility.                                             |
| Canvas focus moves to Angular while the host remains usable     | `true`           | `true`                       | Ready/rendered; controls and held input released.                                             |
| Prepared scene's host collapses                                 | `true`           | `false`                      | Paused; no scene reload.                                                                      |
| Host/document becomes usable again                              | Still `true`     | `true`                       | Resize, render successfully, then ready; input additionally requires focus and UI permission. |
| Load fails, graphics context is lost or client is destroyed     | Reset to `false` | No longer sufficient for use | Error or stopped; release input and invalidate the appropriate work.                          |

**Remaining step 6 task:** include `'paused'` in the same-key scene guard. A current-source probe confirms that selecting the same paused scene currently disposes/reloads it. Preserve the existing scene/assets when the key is unchanged and phase is loading, ready or paused.

**Remaining step 6 task:** update the [page template](../../src/app/features/game/game-page/game-page.component.html) to expose paused feedback through `role="status"`. The new debug JSON displays state but is not an accessible status announcement. Preserve error/Retry behavior and do not automatically restore canvas focus on resume.

**Checkpoint:** let the authored scene and its assets finish loading while hidden. Returning should render that scene without a second import or premature `ready` event.

## 7 Reset timing when activity resumes

**Status: not started.** [frame-clock.ts](../../src/game/babylon/timing/frame-clock.ts) is empty and [its spec](../../src/game/babylon/timing/frame-clock.spec.ts) contains only a TODO.

Introduce a small clock with `sample(now)` and `reset()`. Reset its previous timestamp whenever rendering is suspended, a scene changes, an error occurs or the client is destroyed.

The first sample after resetting should return zero elapsed time. Subsequent samples return elapsed seconds.

In this interface, `now` is the monotonic frame timestamp in **milliseconds**, for example from `requestAnimationFrame` or `performance.now()`. A private previous-timestamp field starts as `undefined`; `reset()` returns it to `undefined`. On the first sample, store `now` and return zero. Later samples compare with the previous timestamp, update it and convert the millisecond difference to seconds. Zero is a valid timestamp, so it should not be the sentinel for "no previous sample". Keep the previous timestamp out of saved world data.

Later, Phase 3's fixed-step scheduler must reset its accumulator at the same boundary. Currently [Simulation](../../src/simulation/simulation.ts) is a logging scaffold, so Phase 2 only needs to establish and test this timing behaviour.

**Checkpoint:** a ten-second hidden period contributes zero catch-up time on the first resumed frame.

## 8 Use explicit Retry for WebGL context loss

**Status: not started.** There is no context-loss subscription in `BabylonGameClient` yet. Existing load-error and Retry tests establish the remount foundation, but do not verify graphics-context loss.

For this prototype, route context loss through the existing error/remount mechanism. It gives you a complete recovery path before adding automatic recovery.

Subscribe to:

```ts
engine.onContextLostObservable;
```

When notified, invalidate the current transition token, clear input, detach controls, reset timing and report an error such as:

> Graphics rendering was interrupted. Select Retry to reload the prototype.

Use the existing scene disposal and error publication path. Invalidating the token is essential: an authored-scene load already in progress must not subsequently publish `ready`.

Keep Babylon's built-in context handling enabled. Babylon can rebuild GPU resources and exposes loss/restoration observables, but under this policy restoration of the old engine should leave the application in `error` until Retry remounts it. [Babylon context-loss handling](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene/#handling-webgl-context-lost)

Store and remove your observable subscription during destruction.

**Checkpoint:** losing graphics capability displays an error. Retry disposes the old engine and creates one replacement canvas and engine.

## 9 Extend cleanup and the browser tests

**Status: client activity-subscription cleanup is now implemented and verified.** Reconciliation, focus/blur and lifecycle subscriptions are retained in `subs`, unsubscribed and removed during destruction. The activity-observer probe now passes. `ViewportInput.dispose()` remains idempotent, clears input and removes its listeners; the three lifecycle subjects complete. Remaining ownership work is canvas-subject completion, the exact loop callback reference, partial construction and broader tests. Shared `BrowserActivity` lifetime remains distinct from per-client consumers.

Expand the existing destruction sequence to release the new resources before disposing the scene and engine: disable and clear input, detach camera controls, release any tracked pointer capture, remove DOM listeners and observable subscriptions, then perform the existing cleanup.

Keep the existing `subs` cleanup rather than adding a second subscription owner. Complete `canvasActiveSubject` too, and ensure explicit loop stopping uses the exact registered callback. Add future context-loss subscriptions to the same ownership plan. The current constructor catch still only covers engine creation; if later setup throws, dispose everything already created before rethrowing.

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

Implemented groundwork, confirmed by source/test inspection on 18 October 2026:

- [x] Keyboard state uses physical codes and exposes readonly observable snapshots with enable/clear/dispose methods.
- [x] Canvas blur, browser blur, hidden documents and keyboard disabling clear held keys.
- [x] Browser visibility/focus are initialised and observed by the shared activity helper.
- [x] Preparation, host dimensions and destruction use `BehaviorSubject`s, with current values available synchronously and completion at teardown.
- [x] Reactive render/camera decision subscriptions consume the lifecycle, activity, focus and requested-permission sources.
- [x] Camera controls detach on input disable and canvas blur; default ArcRotate keyboard input is removed and tested inertia clears on detach.
- [x] Continuous rendering pauses for hidden/zero-sized activity and resumes the same scene; hidden preparation publishes paused.
- [x] Owned activity consumers unsubscribe on destruction; the prior observer-retention failure is resolved.
- [x] Required input-permission contract and runtime-to-Babylon keyboard forwarding exist.
- [x] The lifecycle includes paused publication and successful eligible-frame readiness; input and browser-activity specs exist.

Remaining integrated completion checks:

- [ ] Viewport focus and UI permission control keyboard, camera and pointer input.
- [ ] Held keys and gestures clear on blur, suspension, load, errors and teardown.
- [ ] Hidden documents and zero-sized hosts suspend rendering; resuming resizes and renders without duplicate loops or asset imports.
- [ ] The first resumed clock sample excludes suspended time.
- [ ] Context loss reports an error, rejects late loads and recovers through Retry.
- [ ] Multiple hosts, repeated mount/unmount and partial construction failures preserve resource ownership.
- [ ] Browser tests, accessibility checks, lint, custom lint-rule tests and the production build pass.

Record the completed checks in [Phase 2 of the migration plan](3d-migration.md#phase-2-preserve-lifecycle-and-input-ownership) before moving on to movement, camera configuration and picking in Phase 3.
