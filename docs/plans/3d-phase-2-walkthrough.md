# Babylon Phase 2 lifecycle and input reference

Updated 28 October 2026 for documentation cleanup. This page describes current source boundaries, including the Toolkit refactor; migration acceptance is recorded in the [migration plan](3d-migration.md#phase-2-input-controls-and-lifecycle).

## Current ownership

- [GameRuntimeService](../../src/app/features/game/game-runtime.service.ts) owns the application session, renderer subscription, scoped lifetime, remount generation and UI permission forwarding.
- [BabylonGameClient](../../src/game/babylon-game-client.ts) owns one engine, canvas, render callback, scene transition token, resize observation and graphics failure recovery. An old asynchronous completion cannot publish into a newer transition.
- [InputManager](../../src/game/input/input-manager.ts), [binding types/defaults](../../src/game/input/bindings.ts) and [BrowserActivity](../../src/game/lifecycle/browser-activity.ts) separate requested permission from viewport eligibility, focus and visibility. Modal/input ownership neutralizes actions and suppresses physically held controls until release/centre.
- [FrameClock](../../src/game/timing/frame-clock.ts) supplies bounded frame timing; [GameSession](../../src/session/game-session.ts) owns the 20 Hz scheduler. Hidden, inactive, zero-sized or blocked intervals do not become simulation catch-up.
- [WorldScene](../../src/game/views/world-scene.ts) composes Toolkit scripts for player control/presentation, camera, selection and placement, plus entity views. [GameplayScript](../../src/game/toolkit/gameplay-script.ts) automatically registers an optional `onGameTick` hook with the application session during native `start` and unregisters it on destruction. Physics is not enabled or used for gameplay scheduling. See the [core object design](../design/TDD.md#core-object-scripts).

The frame shares one `ActionFrame`: UI dispatch and ownership checks precede camera/player input; the latest completed worker publication is pinned, completed-tick presentation hooks drain, future credits are submitted without waiting; that pinned state drives presentation; camera follow, picking and placement feedback precede drawing. [Explicit numeric attachment](../../src/game/toolkit/attach-scripts-in-order.ts) establishes native `update` and `late` ordering within one `scene.render()`. [PlayerMotor](../../src/simulation/player-motor.ts) keeps authoritative movement/collision/facing in plain simulation code. Healthy sessions survive renderer-only Retry; page teardown disposes the worker. A failed worker or presentation hook preserves the last completed published state and restarts on explicit Retry.

## Lifecycle acceptance

Controls use separate keyboard/mouse and gamepad tabs, action rows with binding columns, and stick deadzones above the gamepad bindings. The Angular adapter navigates the visible row/column layout while preserving native editing and Tab. [BindingLabels](../../src/app/features/controls/binding-labels.service.ts) provides injectable translated control names without changing stored physical codes. See the [follow-up evidence](../reports/migration/2026-10-23/refinements.md).

Verify initial loading and readiness after a usable rendered frame, same-scene requests while paused, visibility and zero-size suspension, resume without a jump, focus and overlapping dialogs, custom bindings and keyboard exit, context loss with Retry, late loads, independent hosts, and repeated teardown/remount. Keep the real Play Game button and accessible Angular loading/error/pause controls in browser checks.

The [browser client tests](../../src/game/babylon-game-client.spec.ts) and focused input/activity/timing tests are the current executable contracts. Run `yarn test`, `yarn lint`, `yarn test:world`, and the production/browser acceptance route after integration changes. Dated test totals in the archived walkthrough do not describe the current suite.

## Implementation boundary

The user authorized the runtime migration on 23 October. Phase 7 updates milestone statuses and stops. Manual salvage, crafting, research, machinery, transport, restoration and gameplay persistence remain separate work. The existing save database contains test records and is not a world-save format.
