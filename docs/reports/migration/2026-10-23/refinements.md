# Controls and turning refinements — 23 October 2026

This follow-up implements the three requested refinements after the migration's documentation stopping point. It does not add later gameplay milestones.

## Character turning

The visual character follows the shortest angular path instead of snapping to a new movement heading. At the user's subsequent request, runtime `TurnLeft`/`TurnRight` playback is disabled because it conflicted with smooth rotation and walking. Smooth heading interpolation and Idle/Walk/Run playback remain active, without changing authoritative movement or collision positions.

The existing animation archive supplies both turn clips, which remain in the asset alongside Idle, Walk and Run. Original character sources remain unchanged. The derivative remains **4,236,032 bytes (4.04 MiB), 37,655 triangles and 10 materials**, with SHA-256 `b4503d89ff5a3e108da1ee3e8da0a081b2bca79803a5f3d1c379b702efbbe663`.

[Turning video](../../../../art/characters/protagonist-runtime-v2/browser-turning/turning.webm) · [Frame samples and assertions](../../../../art/characters/protagonist-runtime-v2/browser-turning/report.json) · [Asset derivation and checks](../../../../art/characters/protagonist-runtime-v2/README.md)

The linked video and frame assertions preserve the earlier turn-enabled checkpoint, when stationary turns and sharp reversals used pivot footwork. They do not show the current disabled-turn playback policy.

## Directional menu navigation

Navigation uses visible control rectangles. Left/right follows a row; up/down follows a column into the adjacent row. It skips disabled, hidden and inert controls, stays at layout edges, and adapts when the layout wraps or resizes. Scroll containers do not intercept spatial focus before their child controls; clipped rows can be reached before leaving the list.

The existing Save/Load test dialog is the browser regression fixture. Native Tab, text editing, selects and sliders keep their keyboard behavior. The tabs support Left/Right/Home/End, and controller navigation activates tabs once. Focus returns to the page after closing the dialog.

## Controls layout and naming

Keyboard/mouse and gamepad bindings have separate tabs. Each action occupies one table row, with primary and alternate bindings in columns. Direction editing expands only when requested. Controller selection, button-name style and deadzone controls sit above the gamepad bindings. Movement, camera and menu deadzones retain their individual saved values. Binding edits are still applied only on Save; switching tabs cancels pending capture.

[Keyboard/mouse screenshot](refinements/controls-keyboard-dpr1.png) · [Gamepad screenshot](refinements/controls-gamepad-dpr1.png) · [Small-window screenshot](refinements/controls-small-dpr1.png)

[BindingLabels](../../../../src/app/features/controls/binding-labels.service.ts) converts stored control IDs into readable names: `KeyA` becomes `A`; Xbox south is `A`; DualShock/DualSense south is `Cross`. The [message catalogue](../../../../src/app/features/controls/binding-label-messages.ts) uses stable IDs and named parameters. An injected `CONTROL_LABEL_TRANSLATOR` can supply translated messages and react to locale changes without changing saved profiles. Tests cover translated parameter ordering and fallback. This supplies a localisation boundary for control names; a complete translated application or language selector is not part of this change.

## Earlier turn-enabled verification checkpoint

These results were captured before the user's request to disable turn playback. Their files, counts and footage remain unchanged as dated evidence.

- **212 Chromium application tests passed across 20 files**, including 28 UI adapter tests, 15 Controls component tests, 6 label tests and 32 renderer cases.
- Production build, source ESLint, app/spec TypeScript, scene export and production asset/export audit passed.
- Documentation validation passed for 49 documents, 607 local links and 8 diagram sources; repository audit and whitespace checks passed.
- The [actual browser flow](refinements/results.json) passed at device pixel ratios 1 and 2: Save/Load row/column navigation, keyboard tab switching, Play/movement/camera, modal pause, held-release behavior, Ctrl/Alt/Tab rebinding, settings reload, separate deadzone editing, development placement and resizing.
- Keyboard, gamepad and small-window Controls states have zero axe violations; the game check also has zero violations. Browser checks recorded no page errors.
- Actual quick-tap/reversal character checks recorded 246 frames with no browser errors. Numeric asset checks confirm turn yaw is not applied twice and grounded turn feet remain within 2.5 mm.

## Turn playback disabled at the user's request

The current runtime leaves both turn groups stopped and uses smooth heading interpolation with Idle/Walk/Run. The GLB, editable derivative and original animation sources are unchanged.

- **33 focused Chromium renderer tests passed**: 19 world-presentation cases and 14 Babylon-client cases.
- Spec TypeScript, full-source ESLint and the production Angular build passed; the initial bundle totals 237.59 kB.
- The [current browser report](../../../../art/characters/protagonist-runtime-v2/browser-smooth-turning/report.json) records **247 samples and no browser errors**. Both turn groups remain stopped with zero contribution, stationary heading settles during Idle without moving simulation position, and moving reversals retain Walk. The [current video](../../../../art/characters/protagonist-runtime-v2/browser-smooth-turning/turning.webm) is stored separately from the earlier enabled-turn footage.
- The earlier full 212-test result and enabled-turn footage above remain their original checkpoint, rather than a rerun of the current playback policy.

Physical gamepads and target-GPU qualification remain unexecuted. Controller navigation/mappings have automated coverage. Earlier migration performance data and its three-clip hash remain dated evidence in [the original report](README.md); those measurements have not been relabelled as measurements of this five-clip revision.

Run the usual test/build/lint scripts, then `node tools/scenes/check-migration-browser.mjs http://localhost:4200 <output-directory>` and `node tools/art/check-turning-browser.mjs http://localhost:4200` against the running development server. The turning probe now checks disabled turn playback and writes to `browser-smooth-turning/`, preserving the prior enabled-turn evidence. In this environment the installed Angular CLI MCP ran tests/builds; Node Playwright required approved localhost access. Source files, authored artwork and existing test-save data remain preserved. All production Angular templates remain separate HTML files.
