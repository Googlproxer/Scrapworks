# Babylon Phase 2 implementation walkthrough

Prepared 11 October 2026. Companion to [Phase 2 of the 3D migration plan](3d-migration.md#phase-2-preserve-lifecycle-and-input-ownership).

Active implementation guidance, with step 3 binding configuration reviewed against the working tree on 22 October 2026. Apply it to the current `loadEditorScene` path and `BabylonGameClient` ; the user implements these runtime changes and Codex maintains the tests. Existing behavior, review probes and permanent test coverage are recorded separately below.

Build on the completed Phase 1 client. The remaining work is input ownership, suspension when hidden, recovery from lost graphics capability, and broader lifecycle tests. Work through these checkpoints in order to implement Phase 2 yourself.

Phase 1 is complete and Phase 2 is in progress. Player movement and fixed-step simulation integration follow in Phase 3.

Updated 12 October 2026: initial [Phase 1.5 Editor integration](3d-migration.md#phase-15-integrate-babylonjs-editor-authoring) loads editable MainMenu and Game scenes through the official Editor loader. The 17 October cleanup added automatic development export/reload and failure retention. That setup was the baseline for the Phase 2 work recorded below; keep presentation settings editable in the Editor.

## Progress as of 22 October 2026

**Step 3's collector and constructor binding configuration are implemented and regression-tested.** The optional `ReadonlyMap<KeyCode, Action>` replaces the defaults and is copied into helper-owned storage. Tests now exercise standalone left/right Ctrl and Alt, configured Tab/Shift+Tab, alternative keys, empty maps and simultaneous held inputs through the public constructor. The full Chromium suite passes 98 tests; only the three planned clock cases remain TODO. The application still creates the helper with defaults; forwarding selected bindings through the client and providing an exit before enabling a gameplay Tab binding remain integration work.

Step 6 remains in progress. The loader no longer renders directly, and the render loop uses one stable callback for registration and stopping. Both fixes have browser regression coverage. The page and viewport are merged: `GamePageComponent` directly mounts/unmounts its `.game-container` renderer host through the scoped runtime. Keep that structure.

The page's focus indicator still follows `.game-container:focus-within` . Keyboard enablement now requires requested permission, client-supplied viewport eligibility, browser focus and document visibility. Recovering viewport/browser activity preserves a requested UI block. The runtime's previous ready-only permission guard has also been removed; the two loading/paused forwarding regressions pass.

Step 6 still needs the paused same-scene guard and accessible paused status. Keyboard ownership and runtime forwarding have passing permanent tests. Both the helper's viewport subject and the client's canvas subject now complete during teardown. Application binding wiring, bound-Tab exit behavior, shared activity lifetime, modal gesture coverage, frame timing and graphics recovery remain unfinished.

| Step                 | Status                                | Confirmed progress                                                                                                                         | Still open                                                                                                             |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1 Responsibilities   | Structure in place                    | The merged page owns its renderer host and mounting; runtime/client/helper ownership remains separate.                                     | Implement the planned clock in step 7 and partial-construction cleanup in step 9.                                      |
| 2 Camera focus       | Camera and keyboard gates covered     | Canvas focus, preparation/Game selection and host size feed both decisions; real-client ownership transitions are regression-tested.       | Complete modal pointer/gesture coverage.                                                                               |
| 3 Input collection   | Collector/configuration verified      | Default/custom maps, standalone Ctrl/Alt/Tab, simultaneous held inputs, copied configuration and empty-map behavior pass.                  | Forward selected bindings through the client; provide a documented keyboard exit before enabling gameplay Tab capture. |
| 4 Angular permission | Runtime and teardown regressions pass | Loading/paused forwarding tests are active. Remount/Retry retention and child-injector DestroyRef teardown pass.                           | Actual-modal gesture/remount and conditional distinct-key overlap coverage.                                            |
| 5 Suspension         | Render and keyboard gates implemented | Hidden first-frame deferral and zero-size keyboard suspension/recovery have permanent real-client coverage.                                | Shared activity-source lifetime/document ownership and coverage across multiple clients.                               |
| 6 Paused lifecycle   | Current step; in progress             | Prepared blocked scenes publish paused; the first successful eligible frame publishes ready.                                               | Avoid reloading a paused same-key scene and announce paused status accessibly.                                         |
| 7 Frame clock        | Planned; not implemented              | Three named TODO tests record first-sample, elapsed-seconds and reset behavior.                                                            | `frame-clock.ts` is still empty; implement the clock and activate those tests.                                         |
| 8 Context loss       | Not started                           | Error display and Retry/remount already have real Babylon coverage.                                                                        | Subscribe to context loss, invalidate pending loads and verify graphics recovery.                                      |
| 9 Cleanup/tests      | Full browser suite green              | 98 tests pass; only three planned clock TODOs remain. Typing, edited-test lint and production build pass. Both activity subjects complete. | Shared-source/partial-construction ownership, future Phase 2 cases and binding-file line-ending formatting.            |

### Missed items from steps 1–5

The direct loader render, callback-reference mismatch and focus-indicator issues are resolved. These earlier checkpoints remain:

| Earlier step                               | Remaining work                                                                                                                                                    | Concrete next action                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Step 4: remaining integration coverage** | The child-injector teardown test and loading/paused permission regressions now pass. Actual-modal gesture/remount and distinct-key overlap coverage remains open. | Retain those integration cases as the corresponding features are completed; preserve the passing scope/permission tests.                     |
| **Step 3: application binding wiring**     | The helper's constructor configuration and custom-input tests are complete. BabylonGameClient still constructs it without bindings, so the page uses defaults.    | Forward the selected map through client construction when exposing configured controls. Provide a keyboard exit before enabling Tab capture. |
| **Step 5: activity-source ownership**      | `BrowserActivity` remains global-document scoped with `beforeunload` cleanup. Per-client consumers do unsubscribe correctly.                                      | Keep shared tracking alive for other clients and give it an explicit application/document lifetime owner.                                    |

### Step 3 binding-configuration review and validation on 22 October 2026

**The collector and constructor configuration have no outstanding functional correctness findings in this review.** A supplied map replaces the defaults, including an intentionally empty map. The helper copies entries rather than retaining the caller's map, so later caller mutations do not change active bindings. The client still derives eligibility from preparation, Game selection, host size, canvas focus, destruction and errors; requested UI permission and browser activity remain independent gates. Both owned activity subjects complete during teardown.

The reusable `defaultBindings()` factory supplies WASD, Space and left Shift when constructor configuration is omitted. Custom maps now capture Ctrl, Alt, Tab and alternative keys as ordinary independent inputs. Left/right modifier releases, overlapping movement/jump keys, Tab repeats and prevented keyup events preserve unrelated held state. Unbound keys, composition events and blocked input remain uncancelled. Configuration is a construction-time snapshot; live rebinding is not part of this API.

The test maintenance found during the review is resolved:

* Eligible fixtures retain `setViewportActive(true)`. Old tests expecting every supported code to be captured now respect the actual default bindings. A separate key-map suite preserves broad physical-code validation, including Ctrl/Alt/Tab and rejection of inherited object names.
* Helper tests now cover overlapping sprint/forward/jump/strafe, simultaneous opposing directions, independent releases, delivered events with Ctrl/Alt/Meta flags, selective default prevention, uncancelled Tab/Shift+Tab, composition, repeat suppression and unchanged-state emission suppression. Earlier ownership, clearing, recovery and disposal regressions remain.
* Eight constructor-configuration cases now cover complete replacement of defaults, an empty map, defensive copying, independent left/right Ctrl/Alt/Shift, configured Tab/Shift+Tab with other held inputs, and preservation of UI blocking across viewport recovery. These use the public API without mutating private fields.
* Two real-client keyboard tests cover MainMenu/loading/errors, prepared Game input, overlapping held inputs and releases, zero-size suspension/recovery, canvas blur/refocus, UI permission preservation, rendering while UI input is blocked and destruction. They also verify whether eligible/ineligible keydown events are consumed.
* The runtime's loading-time block and paused-time unblock TODOs are now executable tests. Both pass without remounting.
* The UI teardown unit test destroys a child environment injector, exercising `DestroyRef` while preserving an unrelated application dialog and verifying one-shot close completion. It no longer calls a removed lifecycle method.

Current validation:

* **Full Chromium suite: 98 passed, three TODO** (12 passing files and the planned clock suite skipped). All remaining TODOs belong to the unimplemented frame clock.
* **Application/test TypeScript checking, scene export and production Angular build: passed.**
* **Edited-test ESLint: passed with zero warnings.** Full-source ESLint reports 19 `prettier/prettier` line-ending errors in [key-bindings.ts](../../src/game/input/key-bindings.ts). Format that binding-definition file to the repository's LF convention; no type or behavioral error was found there. The earlier presentation-file formatting findings are resolved.
* The page integration suite, including overlay axe checks, focus restoration and page-owned teardown, passes as part of the full run.

Nine temporary review probes were used earlier to investigate the gate and runtime forwarding; their source was removed. Their ownership/permission scenarios are now represented by the retained tests above. The earlier 15 fixture failures and stale teardown TypeScript error are resolved.

Still open in integration: [BabylonGameClient](../../src/game/babylon-game-client.ts) constructs `new InputManager(this.canvas)` and has no selected-binding input to forward. The constructor configuration is therefore verified at helper level while the running page uses defaults. A documented keyboard exit is required before enabling a gameplay Tab binding. Action aggregation, normalized axes and queued jump-press handling remain Phase 3 work. Shared activity lifetime, modal gesture/remount coverage and the later paused-state/clock/context-loss checks also remain open. The walkthrough's completed dialog Tab/Shift+Tab check is preserved; automated focus-cycle coverage can be added separately.

Walkthrough links follow the move to `src/game/` . The repository documentation checker still has stale source links in other documents; the walkthrough's own links and formatting are checked with this update.

### Earlier review findings and validation (18 October 2026)

The failing tests had three causes:

* The merged page spec combined a mock factory with real Phaser scene expectations, and its mounting assertion ran before view initialization. It now drives lifecycle state through a contract-level mock and waits for Angular stability. Real authored-scene loading, Play Game, errors and Retry remain covered by the Babylon integration suite.
* `InputManager` used `!hasFocus || !isVisible` as enablement, disabling active input and enabling inactive input. Its requested permission now feeds a separate effective subject together with positive browser focus/visibility. New regressions cover fresh keydown while inactive and UI blocking across activity recovery.
* The clock spec was an empty file with only a comment. It now declares three explicit TODO tests for the still-unimplemented step 7 behavior.

The stale focus selector was also corrected after the merge. Tests now cover responsive page-host layout, focus-indicator visibility, zero hidden first frames, same-scene resumption and stopping the exact registered callback.

Validation on 18 October 2026:

* **Full Chromium suite: 69 passed, 3 TODO** (12 passing files and the planned clock suite reported as skipped). Existing real Babylon accessibility checks pass; paused-state accessibility coverage is still pending.
* **Source lint: passed with zero warnings.** The earlier CRLF formatting findings and unused legacy no-op argument were corrected.
* **Custom lint-rule tests: 30 passed.**
* **Scene export and production Angular build: passed.**
* Documentation link/diagram and walkthrough formatting checks pass; links to the removed viewport component are repaired.

The pinned Yarn launcher could not download its runtime in this environment. Validation used the installed Node entry points for scene export, Angular tests/build, ESLint and the custom lint tests. This verifies the current installed checkout; clean-install reproducibility is not claimed.

## Existing lifecycle foundations

The current implementation already provides these mechanisms:

| Foundation         | Current implementation                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| Renderer ownership | Each client owns its canvas, engine, scene and asset container         |
| Rendering          | One stable callback used for registration and explicit stopping        |
| Resizing           | `ResizeObserver` watches the host                                      |
| Async safety       | Runtime generation guards and client transition tokens                 |
| Destruction        | Idempotent; disconnects resize, stops rendering and disposes resources |
| Late assets        | Disposed after destruction or a superseded transition                  |
| Errors             | Angular error display and Retry through remounting                     |

Keep those mechanisms as you work through the following steps. The [Phase 1 walkthrough](../history/3d/phase-1-walkthrough-2026-10-11.md) and [migration plan verification record](3d-migration.md#phase-1-prove-babylon-inside-the-existing-application) describe the completed prototype.

## 1 Separate the new responsibilities

**Status: structure in place.** Extend [BabylonGameClient](../../src/game/babylon-game-client.ts), keeping it responsible for coordinating lifecycle. Use the helper modules already started:

| Existing file under `src/game/` | Responsibility                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `input/viewport-input.ts` | Existing keyboard state, permission and clearing; coordinate camera attachment through the client |
| `lifecycle/browser-activity.ts` | Existing shared document visibility and browser focus events                                      |
| `timing/frame-clock.ts` | Empty placeholder for frame timing that can reset after suspension                                |

The authored-scene loader already prepares scenes without attaching controls. Keep camera attachment under runtime input/lifecycle ownership. Angular should continue consuming plain contracts. Keep pending scenes and attached components within the same transition/disposal ownership as their assets.

Leave player movement and the fixed-step simulation integration for Phase 3. Phase 2 can establish an input snapshot and resettable clock without moving the character.

## 2 Make camera controls follow viewport focus

**Status: camera focus and full keyboard eligibility are implemented with permanent ownership regression coverage.** Camera attachment and the independent eligibility subscription remain separate, so keyboard input is blocked even without a current camera.

```ts
if (canAcceptInput) scene.activeCamera?.attachControl(this.canvas, true);
else scene.activeCamera?.detachControl();
```

The client calls `checkCanvasActive()` during setup and on canvas focus/blur. Those changes now feed both the camera decision and the keyboard eligibility gate. The merged page owns its renderer host and `.game-container:focus-within ~ #focus-indicator` cue; browser focus remains an independent helper input.

### Define the inputs to the decision

The decision is now reactive. The expression below describes the booleans emitted by the existing subjects/observables; they are not additional stored flags. Keep the streams as the sources of truth and use meaningful parameter names when flattening their tuples.

```ts
const canAcceptInput = scenePrepared && sceneKey === 'Game' && documentVisible && hostHasSize && canvasFocused && uiAllowsInput && !destroyed && !hasError;
```

| Value             | Meaning and owner                                                                                                                                 | Initial value / source                                                                                           | When it changes                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenePrepared` | Emitted by `scenePreparedSubject` : the **current** scene's required assets and Babylon preparation are complete; no successful frame is implied. | Existing `BehaviorSubject(false)` .                                                                              | `.next(true)` follows `whenReadyAsync()` and a current-transition check; `disposeCurrentScene()` emits `false` . Already consumed by both decisions; future context loss must also reset it. |
| `sceneKey` | The selected renderer scene, already represented in lifecycle state.                                                                              | Read the existing `stateSubject.value.sceneKey` ; it starts as `null` and is set when a scene transition begins. | Read the latest value during each reconciliation; do not retain a snapshot from construction.                                                                                                |
| `documentVisible` | Whether the viewport's owning document is visible, supplied by `BrowserActivity` .                                                                | Existing `isVisible` / `visibleObs` use `!document.hidden` ; document ownership is discussed in section 5.       | Already observed by both decisions. `document.hidden` itself has the opposite meaning.                                                                                                       |
| `hostHasSize` | The viewport host has positive layout width and height.                                                                                           | Existing `BehaviorSubject(false)` , measured during setup.                                                        | Initial measurement and ResizeObserver updates now feed rendering, camera attachment and keyboard viewport eligibility.                                                                      |
| `canvasFocused` | The client's `canvasActiveSubject` combined with the browser's focus signal.                                                                      | Initially samples `activeElement === canvas` ; browser focus is already a separate `cameraObs` input.            | Setup, canvas focus and canvas blur now update the subject. The browser-focus source independently handles window focus; keep both signals.                                                  |
| `uiAllowsInput` | Requested UI permission, independent of viewport/browser activity.                                                                                | `requestedEnabledSubject` starts `true` ; runtime retains `currentInputRequest` .                                  | UI requests are forwarded even while loading/paused and replayed on mount. Effective keyboard output also requires viewport eligibility, browser focus and visibility.                       |
| `destroyed` | Emitted by the client's lifetime `destroyedSubject` .                                                                                             | Existing `BehaviorSubject(false)` .                                                                              | `destroy()` emits `true` once and completes it. Never reset it for Retry, which creates another client.                                                                                      |
| `hasError` | A failure blocks controls until recovery. Reuse lifecycle state instead of adding a second independently maintained error flag.                   | Derive from `stateSubject.value.phase === 'error'` .                                                             | Read after error publication and on each reconciliation. An error message being empty must not make an error phase usable.                                                                   |

For synchronous decisions in `BabylonGameClient` , read `this.scenePreparedSubject.value` , `this.hostHasSizeSubject.value` , `this.destroyedSubject.value` and `this.hasError` . Subscriptions receive the emitted booleans directly. Keep requested UI permission distinct from the final effective input decision: feeding an effective `false` back into the permission source could prevent input from ever re-enabling. These are client/session facts, not gameplay fields to save in `WorldState` .

### Keep `scenePrepared` at the load boundary

This subject and its load/disposal emissions are already implemented. Keep it as the preparation source; a successful rendered frame remains a separate readiness requirement.

Creating `new Scene(this.engine)` and assigning `currentScene` happen **before** asynchronous loading completes. Neither `currentScene !== undefined` nor having an active camera proves preparation is finished.

Keep the existing load order: create/own the scene, await the authored loader, reject stale results, add the returned assets to the scene, then await `scene.whenReadyAsync()` . After that await, check the existing transition token again. Only the still-current load may call `scenePreparedSubject.next(true)` , which triggers the activity decisions.

Reset the flag before replacing or disposing the scene. Do **not** reset it just because the document becomes hidden, the canvas loses focus or a modal opens: the loaded scene remains prepared during suspension. Otherwise returning to the viewport could unnecessarily reload it.

Do not derive this flag from `phase === 'ready'` . Preparation must be able to finish while hidden, and the public `ready` state comes only after a successful usable frame. Using `ready` as the preparation prerequisite creates a circular dependency.

### Use the existing `hostHasSize` measurement

Initial measurement, resize-observer updates and the continuous render gate are implemented. Host size now also feeds the independent keyboard viewport-eligibility decision; retain permanent keyboard suspension/recovery coverage.

Use the `host: HTMLElement` passed to the client constructor: it is the viewport container into which you append the canvas. Measure that element's layout dimensions, for example:

```ts
this.hostHasSizeSubject.next(host.clientWidth > 0 && host.clientHeight > 0);
```

Evaluate this once during setup after adding the canvas, then in the existing resize observer's callback. That callback can retain access to the constructor's `host` through its closure; alternatively, deliberately store the host as a client field if several methods need it. No second `ResizeObserver` is required.

When the result is positive, call `engine.resize()` before allowing a resumed frame. When either dimension is zero, suspend rendering and input until another measurement becomes positive. This catches a collapsed container or one under `display: none` . It is a size test, not a test for whether the element is scrolled into view, covered by another element or fully transparent.

Do not measure Babylon's backing-buffer dimensions to obtain this flag: a canvas/engine can retain nonzero dimensions after its host collapses. Keep the host measurement as the source of truth. See section 5 for the suspension behavior it drives.

### Reconcile decisions separately from side effects

The existing subscriptions now provide reactive coordination, and their returned subscriptions are retained in `subs` and removed on destruction. `updateRenderState()` owns paused-state reconciliation; the camera subscription owns attachment. Keep this division and avoid adding another competing render path.

The client now derives and forwards keyboard viewport eligibility separately from camera attachment, even without a current scene/camera. That calculation does not depend on `enabledObs` ; the helper combines eligibility with requested permission and browser activity, then publishes effective output for keyboard collection and the camera decision. Keep the new subscription in `subs` and preserve detachment before replacing the camera/scene.

Rendering has a different decision:

```ts
const canRender = scenePrepared && documentVisible && hostHasSize && !destroyed && !hasError;
```

MainMenu still needs to render, and moving focus to Angular or opening a modal should stop game input without automatically stopping all rendering. Sections 5 and 6 add suspension and lifecycle publication to this same reconciliation. In particular, do not gate the first eligible render solely on the existing public `phase === 'ready'` : that first successful frame is what permits publishing `ready` .

Keep the menu camera detached. When a pointer interaction should focus the Game canvas, check readiness, visibility, size and UI permission **without requiring `canvasFocused` yet**, then focus it. The focus event updates the full input decision. Requiring `canAcceptInput` before allowing focus would prevent an unfocused canvas from ever acquiring input. Its existing `tabIndex = 0` also permits keyboard focus.

The merged page now provides the visible focus indication using `.game-container:focus-within` ; the old `app-game-viewport` selector was removed. Keep normal Tab navigation and the distinction between canvas focus and focus on page controls.

For example, a prepared Game scene that loses canvas focus stays rendered/ready but releases input. If its host then becomes zero-sized, `scenePrepared` remains `true` , `hostHasSize` becomes `false` , and section 6's state becomes paused. Restoring the size resizes and renders that same scene; it does not import the scene again.

**Checkpoint:** camera interaction works after focusing the viewport, then stops when focus moves to an Angular button or text field.

## 3 Collect input without changing world state

**Status: collection, constructor binding configuration, simultaneous inputs, eligibility and cleanup are implemented and tested.** Application wiring for selected bindings and the exit behavior needed before gameplay Tab capture remain open. [InputManager](../../src/game/input/viewport-input.ts) exposes readonly physical-key snapshots backed by [key-map.ts](../../src/game/input/key-map.ts), with:

```ts
constructor(canvas: HTMLCanvasElement, bindings?: ReadonlyMap<KeyCode, Action>);
setEnabled(enabled: boolean): void;         // requested UI permission
setViewportActive(active: boolean): void;  // client-supplied eligibility
clear(): void;
dispose(): void;
```

The client now computes eligibility independently of effective input:

```ts
const viewportActive = scenePrepared && isGame && hostHasSize && canvasFocused && !destroyed && !hasError;
```

The helper combines that value with the other three sources:

```ts
const enabled = requested && active && hasFocus && isVisible;
```

`requestedEnabledSubject` starts `true` and is updated only by requested UI permission. `viewportActiveSubject` starts `false` and is updated by the client's dedicated reconciliation subscription. `enabledSubject` publishes their combined result with browser focus/visibility. The subscription runs even when there is no current scene/camera, is retained in the client's `subs` , and does not feed effective output back into requested permission. Keep that separation.

The helper clears held state when effective input becomes false, rejects fresh keydown while blocked and ignores repeat events on recovery. Window keyup can still release keys while disabled or carrying modifiers/a prevented default. Retained tests confirm MainMenu/loading/error/zero-size blocks, focus recovery and preservation of an independent UI block. `errorObs.subscribe(() => this.inputManager.clear())` still clears on every lifecycle emission, but the eligibility gate also prevents subsequent presses while blocked; clearing alone is no longer the only protection.

### Current binding policy

The reusable `defaultBindings()` factory in [key-bindings.ts](../../src/game/input/key-bindings.ts) supplies:

| Physical code | Intended action |
| ------------- | --------------- |
| `KeyW` | Forward         |
| `KeyA` | Left            |
| `KeyS` | Backward        |
| `KeyD` | Right           |
| `Space` | Jump            |
| `ShiftLeft` | Sprint          |

If the constructor's binding argument is omitted, the helper creates its private map from those defaults. If a map is supplied, its entries replace the entire default map; an empty map intentionally captures no keys. The helper owns a copy. Editing or clearing the supplied map later does not change active input, and no runtime rebind method exists. Construction starts with all keys released, so installing this initial mapping requires no extra held-state reset.

The broad supported-code list and the binding map have different roles. `isKeyCode()` validates a physical code; `bindings.has(code)` decides whether an enabled keydown belongs to the current game controls. The latter is now implemented. The `Action` values in [key-bindings.ts](../../src/game/input/key-bindings.ts) label the map; they are not yet projected into an action stream or simulation commands.

Accepted bound keydowns call `preventDefault()` before repeat suppression. A repeated accepted event is therefore still consumed without republishing held state. Unsupported/unbound keys, composition events and disabled input do not prevent defaults. Updating one key preserves every other held key; repeating or releasing an already unchanged key does not republish a snapshot.

Modifier flags are not blanket rejection or clear conditions. A delivered W/Space event remains accepted while Ctrl, Alt or Meta is held. Standalone left/right Ctrl and Alt now have public-constructor configuration tests, as do configured Tab and Shift+Tab. Each key changes independently, even when several keys map to the same intended action. The running client still uses the defaults, where only left Shift is a standalone modifier binding and Tab/Shift+Tab remain uncancelled. This supersedes the earlier suggestion to reserve all modifier combinations or permanently exclude Tab.

The tests dispatch deliverable keyboard events; they do not guarantee that the browser/OS supplies every protected shortcut combination. Keep remapping available for combinations the environment cannot deliver. When Tab becomes bound, capture it only while gameplay owns input and provide a documented keyboard exit, such as Escape transferring focus to a page control. Page/dialog navigation must still work. See [W3C keyboard-exit guidance](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html).

### Keyboard regression coverage

* Eligible fixtures explicitly activate the viewport. Default fixtures use the shared default bindings; custom fixtures pass maps through the public constructor. Separate construction and physical-code tests verify the inactive production default and broad code support.
* Helper tests cover default bindings, uncancelled unbound keys/Tab/Shift+Tab, accepted modifier-bearing events, composition, repeated-event cancellation, unchanged-state suppression and snapshots that preserve earlier values.
* Configuration tests cover replacement rather than merging, empty maps, defensive copying, standalone left/right modifier pairs and alternative arrow/numpad/international keys. Configured Tab/Shift+Tab remains an independent held input through repeat and prevented-release events. Custom mappings preserve UI permission across viewport recovery and require a fresh press after clearing.
* The overlapping-input regression holds left Shift and W, adds Space and D, then releases each independently. A separate case holds all opposing movement keys; collection preserves them for later action/axis interpretation.
* Earlier eligibility-loss clearing/rejection, UI-block preservation, fresh-press recovery, independent browser focus/visibility and public-stream disposal/completion tests remain.
* Real-client tests cover menu/loading/error rejection, prepared Game input, overlapping inputs, selective default prevention, zero-size recovery, canvas blur/refocus, UI permission preservation, continued rendering while input is blocked and destruction.
* The two runtime loading/paused permission cases are executable, and the UI teardown test exercises DestroyRef through an owned child injector while leaving an unrelated dialog open.
* Both the helper's `viewportActiveSubject` and the client's `canvasActiveSubject` now complete during disposal/destruction.

### Remaining work and scope

* **Application binding wiring:** helper configuration is complete. `BabylonGameClient` still creates `new InputManager(this.canvas)`, and its construction path has no selected-binding parameter. When exposing configured controls in the application, forward the selected map through the client to the helper and retain a real-client regression proving custom keys are used. A settings UI and persistence are separate work.
* **Keyboard exit for a Tab binding:** configured Tab is correctly consumed at helper level, but no gameplay exit handler is installed. Before enabling that configuration in the running game, provide and document a keyboard action that releases gameplay input and transfers focus to a page control. Verify actual browser focus can leave and that page/dialog navigation remains usable. Synthetic cancellation tests do not prove this integration.
* **Live rebinding, if added later:** the current constructor deliberately snapshots configuration. Changing bindings during an existing session needs an explicit update/reconstruction path; a future update method should clear held input so old bindings cannot remain latched. This is not a defect in the construction-only API.
* **Phase 3 action interpretation:** derive all held actions from each snapshot, combining multiple keys for the same action with OR. Calculate both movement axes independently and clamp diagonal magnitude. Queue jump on an action's released-to-pressed transition and consume it once in simulation, including taps between ticks. The current key collector preserves simultaneous input; it does not yet produce movement, sprint speed or jump commands. These are later movement/simulation tasks, not defects in the Phase 2 collector.

Step 3's collector and constructor configuration are verified. Keep application binding wiring and the conditional gameplay Tab-exit integration open; they are not missing constructor functionality.

The Game camera now removes its default keyboard input when controls attach:

```ts
camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
```

The exported Game camera is an ArcRotateCamera, so this removal matches the authored scene. Retain pointer/wheel controls while the viewport owns input. In the installed Babylon 9.30.0 implementation, `detachControl()` already resets rotation, zoom and panning inertia after attachment; the review probe confirmed rotation/zoom reset. Preserve that behavior rather than adding a redundant reset solely to satisfy the earlier guide wording.

**Checkpoint:** hold a movement key, switch focus away, release it elsewhere, then return. The input snapshot should be empty until a fresh key press.

## 4 Give Angular an explicit input blocking hook

**Status: dialog typing, non-ready runtime forwarding and DestroyRef teardown regressions pass.** Remaining work is actual-modal gesture/remount and conditional distinct-key integration coverage.

Focus handles ordinary buttons and text fields. An explicit permission flag also lets a modal block input immediately, including while a pointer gesture is underway.

The hook is already a required method on [GameClient](../../src/contracts/game-client.ts):

```ts
setInputEnabled(on: boolean): void;
```

[GameRuntimeService](../../src/app/features/game/game-runtime.service.ts) stores every request, forwards it whenever a client exists and reapplies it on mount, independently of readiness. Babylon forwards it to `InputManager.setEnabled()` ; effective output now also requires viewport eligibility and browser activity. Keep the existing renderer-independent contract and the separate `setScene()` readiness guard.

### What is implemented

* [GamePageComponent](../../src/app/features/game/game-page/game-page.component.ts) provides `UiService` alongside its own `GameRuntimeService`. Its Save button delegates to `openUIDialog()` and passes `{ ariaLabelledBy: 'save-load-component' }`. The overlay has a name and an explicitly labelled close button, passes axe, receives initial focus and restores focus to the opener after close.
* [UiService](../../src/app/features/ui/ui.service.ts) uses independent component/data generics and `DialogConfig<D, DialogRef<unknown, C>>`, matching CDK's typed provider callbacks. Its owned-ref set retains only the `close` capability, so it needs no `DialogRef` assertions. A regression test passes typed data and a provider callback to a different component type.
* The helper reserves the supplied key and requests blocked input before opening. It rejects duplicate keys, removes keys/refs on close and releases input after the final tracked ref closes. If opening throws, it removes the reservation and restores permission from remaining ownership; retrying the same key is tested.
* The helper's page-scoped `DestroyRef.onDestroy` callback closes only owned refs. The repaired unit test destroys a child environment injector, leaves an unrelated dialog open and verifies one-shot close completion. Actual page destruction also passes.
* `GameRuntimeService.currentInputRequest` starts `true`, updates before client checks, survives replacement and is forwarded during loading/paused. Both non-ready permission cases now have executable passing regressions, alongside retention/Retry and ready-state error reporting tests.
* The requested permission in `InputManager` remains separate from browser focus/visibility. Browser activity recovery preserves a UI block. Disabling clears held keys and feeds the camera-detach decision.

The previous instruction to add a shared dialog count/set is now satisfied. Keep the set and route future blocking dialogs through this helper. `DialogKey` currently contains only `'save-dialog'` , so distinct-dialog overlap is prepared for by the algorithm but has not been exercised; a second production dialog is not required just to finish this review.

### What is still missing

| Priority                           | Gap and current consequence                                                                                                                                                                                                                                                                                      | Next action                                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Remaining integration coverage** | The updated tests exercise the actual Save button, modal accessibility, initial/returned focus, dismissal, teardown and runtime replay. They still do not cancel an active Babylon gesture through a modal, cycle Tab/Shift+Tab inside the focus trap or carry the actual open modal through suspension/remount. | Complete the unchecked acceptance cases below. When another blocking key exists, verify closing one dialog keeps the other blocking; duplicate-key coverage does not prove distinct-key overlap. |

The retained value is `GameRuntimeService.currentInputRequest` : preserve it across loading, pause, errors and client replacement. The runtime now forwards stored permission independently of readiness, and keyboard eligibility independently checks scene/host/focus state. Permission changes must not force canvas focus or bypass those gates.

### Acceptance cases before closing step 4

* [x] Application and UI/page tests compile with the corrected CDK config generics. The page spy checks mount/open/close as `true`,  `false`,  `true`.
* [x] A requested block set before mounting is applied to the first client and replacement clients; Retry replay is also covered by permanent runtime tests.
* [x] Open the Save dialog through the actual page button while ready: the scoped client receives the input block and focus enters the named overlay.
* [ ] With a real Babylon client, verify that opening a modal clears held keys and stops an active camera drag/inertia while rendering can continue.
* [ ] Open during loading or pause, then become ready/resume: input remains blocked. Close during pause, then resume: permission is released without forcing canvas focus.
* [ ] Keep a dialog open across Retry/remount: the replacement client receives the current block. Close it and verify only a focused, eligible viewport accepts fresh input.
* [x] Verify permission is blocked before dialog construction; a thrown open releases its reservation, restores input when no owned dialog remains and permits retry with the same key.
* [x] Close using the component button, Escape and backdrop: each path removes ownership once and releases permission after the final tracked close.
* [x] Destroy the page with a dialog open: its overlay is removed. Unit coverage also verifies close completion and preservation of an unrelated dialog; repeated/late closes do not issue more client updates.
* [x] Check the open overlay for an accessible name, a descriptive close control, initial focus and restoration to the opener. Axe runs against the actual overlay, covering content outside the page fixture.
* [x] Verify Tab and Shift+Tab cycle inside the open dialog rather than reaching the canvas or background page controls.
* [ ] When another blocking key exists, open two distinct dialogs, close either one first and verify permission stays blocked until the final close.

**Checkpoint:** a dialog block survives every runtime lifecycle state and replacement, releases only when its owner is finished, and never grants input without viewport eligibility. Runtime forwarding and DestroyRef teardown now have passing permanent regressions. Keep the unchecked actual-modal integration cases open.

## 5 Handle document visibility and zero sized hosts together

**Status: guarded rendering, hidden first-frame deferral, stable callback ownership and keyboard viewport eligibility are implemented and regression-tested.** The corrected keyboard gate honors visibility independently of browser focus. Permanent real-client tests verify hidden first-frame deferral and zero-size keyboard suspension/recovery, and the input/activity fixtures now activate eligibility explicitly. Shared activity-source ownership remains open.

Listen to `visibilitychange` on `host.ownerDocument` , and initialise the visibility flag from that document. Window blur should clear input; document visibility should control hidden-tab suspension. These are different signals. Browsers also throttle background animation callbacks, so explicit suspension remains necessary. [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

The current `BrowserActivity` is a shared singleton using global `document` / `window` , with cleanup on `beforeunload` . Make its lifetime explicit: if it remains shared for the application, each client/helper should unsubscribe its own consumers without shutting down the shared source while another viewport uses it. Give the shared source an explicit application-level cleanup owner. If you instead make activity tracking client-owned, add idempotent disposal and call it at client teardown. Use the host's owning document and its `defaultView` , or explicitly scope the shared instance to that document. Preserve the already-working positive visibility semantics and bound handlers.

The existing resize observer already records whether both host dimensions are positive and calls `engine.resize()` . Now reconcile after measurement: when the host is zero-sized, suspend rendering and input; when it becomes usable again, call `engine.resize()` before resuming.

Do not infer host visibility from `engine.getRenderWidth()` : the installed engine can retain or substitute a backing-buffer size when its canvas has no visible dimensions.

Keep the single render callback registered. Make it return early while rendering is blocked; resuming should not register another callback.

### Correct the render path

The core of the reference below is implemented as `canRenderCurrentScene()` , `updateRenderState()` and the arrow-function `renderFrame` . The loader and subscriptions do not draw. Registration and explicit stopping both use `this.renderFrame` . Preserve those invariants when extending the client; the example records the intended render ownership:

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

The existing subscription is already wired to the lifecycle helper and retained in `subs` :

```ts
renderObs.subscribe(([scenePrepared, destroyed, hasError]) => this.updateRenderState(destroyed, hasError, scenePrepared));
```

`canRenderCurrentScene()` reads the subjects' latest values each frame; it is a derived decision, not another stored flag. It intentionally permits a prepared scene in `loading` or `paused` to draw its first eligible frame. Requiring `phase === 'ready'` here would deadlock readiness after removing the loader's premature publication.

`updateRenderState()` publishes `paused` immediately when a prepared scene is blocked. On recovery it leaves the phase alone until the loop resizes and successfully renders. The phase-change checks prevent `stateSubject.next()` from recursively publishing the same state through `renderObs` , and avoid state emissions on every frame. Keep error handling around the actual render call; a thrown RxJS subscriber callback is not caught by the loader's surrounding `try/catch` .

For example: hidden preparation emits `scenePrepared = true` , reconciliation publishes `paused` , and frame callbacks return without drawing. Visibility recovery allows that same scene to render; only then is `ready` published. Canvas blur or UI blocking still releases input while rendering continues if visibility/size remain usable. Section 7 will add clock resets at suspension/scene/error boundaries.

**Checkpoint:** hide the host, restore it, and verify correct dimensions, a visible scene and exactly one active render callback.

## 6 Represent suspension without weakening readiness checks

**Status: you are here; paused publication and first-eligible-frame readiness are implemented.** `'paused'` is in `GamePhase` in [game-state.ts](../../src/contracts/game-state.ts). `updateRenderState()` now publishes it for blocked prepared scenes; `renderFrame()` publishes ready after a successful eligible frame. Hidden preparation reports paused and now renders zero frames until visibility permits a successful frame. An optional plain reason can explain suspension:

```ts
readonly pauseReason?: 'document-hidden' | 'viewport-hidden';
```

Keep scene preparation separate from the published phase. A useful state order is:

| Condition                                  | Published state |
| ------------------------------------------ | --------------- |
| Destroyed                                  | `stopped` |
| Failed                                     | `error` |
| Required assets still loading              | `loading` |
| Scene prepared, but rendering blocked      | `paused` |
| Rendering usable and a frame has succeeded | `ready` |

After `whenReadyAsync()` , the client checks the transition token and emits preparation through the subject. Paused publication and eligible-frame readiness are connected correctly, and the direct loader draw is gone. Preserve this behavior while completing the same-key guard and accessible paused presentation below.

Here, `transition` is the existing client counter that identifies a load attempt. The token passed into `loadScene()` is that attempt's captured value. `isCurrentTransition(token)` checks that the client is alive and no newer transition has replaced it. It must pass after each await before that load changes `scenePrepared` , publishes state or attaches input. A late completion must not prepare the replacement scene by updating a shared flag.

| Event                                                           | `scenePrepared` | `hostHasSize` | Outcome                                                                                       |
| --------------------------------------------------------------- | ---------------- | ---------------------------- | --------------------------------------------------------------------------------------------- |
| New scene load begins                                           | `false` | Latest measured size         | Loading; controls released.                                                                   |
| Current scene finishes preparation while the document is hidden | `true` | Latest measured size         | Paused; retain the scene and wait for visibility.                                             |
| Canvas focus moves to Angular while the host remains usable     | `true` | `true` | Ready/rendered; controls and held input released.                                             |
| Prepared scene's host collapses                                 | `true` | `false` | Paused; no scene reload.                                                                      |
| Host/document becomes usable again                              | Still `true` | `true` | Resize, render successfully, then ready; input additionally requires focus and UI permission. |
| Load fails, graphics context is lost or client is destroyed     | Reset to `false` | No longer sufficient for use | Error or stopped; release input and invalidate the appropriate work.                          |

**Remaining step 6 task:** include `'paused'` in the same-key scene guard. A current-source probe confirms that selecting the same paused scene currently disposes/reloads it. Preserve the existing scene/assets when the key is unchanged and phase is loading, ready or paused.

**Remaining step 6 task:** update the [page template](../../src/app/features/game/game-page/game-page.component.html) to expose paused feedback through `role="status"` . The new debug JSON displays state but is not an accessible status announcement. Preserve error/Retry behavior and do not automatically restore canvas focus on resume.

**Checkpoint:** let the authored scene and its assets finish loading while hidden. Returning should render that scene without a second import or premature `ready` event.

## 7 Reset timing when activity resumes

**Status: planned, not implemented.** [frame-clock.ts](../../src/game/timing/frame-clock.ts) is empty. [Its spec](../../src/game/timing/frame-clock.spec.ts) now declares three explicit TODO cases, so the runner reports planned work instead of failing an empty suite. Replace them with executable tests as you implement this step.

Introduce a small clock with `sample(now)` and `reset()` . Reset its previous timestamp whenever rendering is suspended, a scene changes, an error occurs or the client is destroyed.

The first sample after resetting should return zero elapsed time. Subsequent samples return elapsed seconds.

In this interface, `now` is the monotonic frame timestamp in **milliseconds**, for example from `requestAnimationFrame` or `performance.now()` . A private previous-timestamp field starts as `undefined` ; `reset()` returns it to `undefined` . On the first sample, store `now` and return zero. Later samples compare with the previous timestamp, update it and convert the millisecond difference to seconds. Zero is a valid timestamp, so it should not be the sentinel for "no previous sample". Keep the previous timestamp out of saved world data.

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

Use the existing scene disposal and error publication path. Invalidating the token is essential: an authored-scene load already in progress must not subsequently publish `ready` .

Keep Babylon's built-in context handling enabled. Babylon can rebuild GPU resources and exposes loss/restoration observables, but under this policy restoration of the old engine should leave the application in `error` until Retry remounts it. [Babylon context-loss handling](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene/#handling-webgl-context-lost)

Store and remove your observable subscription during destruction.

**Checkpoint:** losing graphics capability displays an error. Retry disposes the old engine and creates one replacement canvas and engine.

## 9 Extend cleanup and the browser tests

**Status: client activity-subscription cleanup and both activity-subject completions are implemented; broader cleanup remains.** The viewport-eligibility subscription is retained in subs and unsubscribed on destruction. InputManager completes viewportActiveSubject, and the client now completes canvasActiveSubject. Shared activity lifetime and partial-construction cleanup remain separate work.

Expand the existing destruction sequence to release the new resources before disposing the scene and engine: disable and clear input, detach camera controls, release any tracked pointer capture, remove DOM listeners and observable subscriptions, then perform the existing cleanup.

Keep the existing `subs` cleanup rather than adding a second subscription owner. Preserve both subject completions and the tested exact callback identity when stopping the loop. Add future context-loss subscriptions to the same ownership plan. The current constructor catch still only covers engine creation; if later setup throws, dispose everything already created before rethrowing.

Extend [client tests](../../src/game/babylon-game-client.spec.ts) and [page tests](../../src/app/features/game/game-page/babylon-game-page.component.spec.ts) with these cases:

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

Test actual context loss using `WEBGL_lose_context` , rather than only dispatching a synthetic DOM event. The extension deliberately simulates loss and restoration. [MDN WebGL testing extension](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_lose_context)

Keep the existing late-load and stale-transition tests. Add accessibility checks for the paused state, then run:

```sh
yarn test
yarn run lint
yarn run test:lint
yarn run build
```

## Completion check

Phase 2 is complete when the viewport reliably releases input, suspension preserves the scene without advancing time, graphics failure has a working recovery path, and repeated creation/removal leaves no owned resources behind.

Implemented groundwork from the earlier reviews, with corrected keyboard ownership and runtime forwarding verified on 22 October 2026:

* [x] Keyboard state uses physical codes and exposes readonly observable snapshots with enable/clear/dispose methods.
* [x] Current WASD/Space/left Shift bindings are independently collected and selectively prevent defaults; unbound keys and composition events are untouched.
* [x] Overlapping sprint/forward/jump/strafe keys and independent releases have helper and real-client regression coverage. Modifier flags do not globally reject or clear bound inputs.
* [x] The input constructor accepts and copies an optional binding map. Public-API tests cover standalone Ctrl/Alt/Tab, alternative keys, empty maps and configuration isolation from caller mutations.
* [x] Canvas blur, browser blur, hidden documents and keyboard disabling clear held keys.
* [x] Browser visibility/focus are initialised and observed by the shared activity helper.
* [x] Preparation, host dimensions and destruction use `BehaviorSubject`s, with current values available synchronously and completion at teardown.
* [x] Reactive render/camera decision subscriptions consume the lifecycle, activity, focus and requested-permission sources.
* [x] Camera controls detach on input disable and canvas blur; default ArcRotate keyboard input is removed and tested inertia clears on detach.
* [x] Continuous rendering pauses for hidden/zero-sized activity; hidden preparation renders zero frames and resumes the same authored scene/loop.
* [x] Loop registration and stopping use the same callback, with a permanent regression assertion.
* [x] The merged page owns the renderer host and its focus cue; responsive layout, mount/teardown and cue visibility have browser coverage.
* [x] Input respects requested UI permission and browser focus/visibility; activity recovery preserves a UI block.
* [x] Keyboard collection also honors prepared Game selection, host size, canvas focus, destruction and errors through the independent viewport gate; corrected review probes pass.
* [x] Owned activity consumers unsubscribe on destruction; the prior observer-retention failure is resolved.
* [x] Required input-permission contract and runtime-to-Babylon keyboard forwarding exist.
* [x] The Save button uses a page-scoped shared dialog helper with key tracking, duplicate rejection, single-close handling and final-close permission release.
* [x] Requested permission is stored before client checks and applied when mounting/replacing a client; permanent retention and Retry tests pass.
* [x] UiService uses page-scoped DestroyRef cleanup, with passing page and child-injector teardown tests.
* [x] The lifecycle includes paused publication and successful eligible-frame readiness; input and browser-activity specs exist.

Integrated completion checks:

* [ ] Viewport focus and UI permission control keyboard, camera and pointer input.
* [x] Runtime permission is retained/replayed and forwarded during loading/paused; both non-ready cases have executable passing tests.
* [x] Dialog opening blocks before construction, failed opens release their reserved keys and restore permission, and owned page teardown is verified by tests.
* [x] The Save overlay has an accessible name and close control, passes axe, and has initial-focus, focus-restoration and dismissal coverage.
* [ ] Retain automated keyboard focus-cycle coverage and verify distinct-key overlap when another blocking key is added. The step 4 Tab/Shift+Tab check remains recorded as complete.
* [ ] Held keys and gestures clear on blur, suspension, load, errors and teardown.
* [x] Hidden documents and zero-sized hosts suspend rendering; resuming resizes and renders without duplicate loops or asset imports.
* [ ] A paused same-key scene is retained and paused status is announced accessibly.
* [ ] The first resumed clock sample excludes suspended time.
* [ ] Context loss reports an error, rejects late loads and recovers through Retry.
* [ ] Multiple hosts, repeated mount/unmount and partial construction failures preserve resource ownership.
* [x] Eligible keyboard/activity fixtures are repaired, and permanent ownership regressions pass.
* [x] Expose helper binding configuration and test standalone Ctrl/Alt/Tab and alternative bindings through that public boundary.
* [ ] Forward selected bindings through application/client construction and verify them with the real client when enabling configured controls.
* [ ] Provide a documented keyboard exit before enabling a gameplay Tab binding; preserve normal page/dialog focus navigation.
* [x] The helper completes viewportActiveSubject during disposal.
* [x] The client completes canvasActiveSubject during destruction.
* [x] Test TypeScript checking passes; teardown testing uses owned-injector destruction rather than the removed lifecycle method.
* [x] The two runtime permission TODOs are executable, and keyboard ownership regressions are retained in the project.
* [x] Full browser validation passes: 98 tests and three planned clock TODOs. Type checking, scene export, production build and edited-test lint pass.
* [ ] Format key-bindings.ts to LF line endings; full-source ESLint currently reports 19 formatting errors there.
* [ ] Implement the three planned clock tests and the remaining Phase 2 lifecycle/paused-accessibility cases before closing the phase.

Record the completed checks in [Phase 2 of the migration plan](3d-migration.md#phase-2-preserve-lifecycle-and-input-ownership) before moving on to movement, camera configuration and picking in Phase 3.
