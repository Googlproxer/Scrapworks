# Runtime ownership and production APIs

Accepted 2 November 2026 as part of the [architecture modernization](../plans/architecture-modernization.md).

Angular owns UI and preferences. Babylon owns world presentation and its existing frame source. Editor scenes own authored layout. One application session owns one Miniplex simulation worker. Deterministic contracts, core utilities and simulation rules have no Angular, Babylon, RxJS, storage, DOM or wall-clock dependencies.

## Composition and lifetimes

`GameRuntimeService` remains the Angular façade and composition root. `GameSessionOwner` owns world identity, initialization, failures, retained-session renderer Retry and disposal. `RendererConnection` owns the client and its subscription lifetime. `GameInputCoordinator` owns contexts, controller selection, capture, focus and ordered dispatch. `OpeningUiController` owns field-kit visibility, salvage targeting, commands and handcraft exit confirmation. Collaborators receive narrow capabilities without circular injection.

`GameClientOptions` supplies settings and required `session` and `actions` ports, with a separate development placement capability. The main-thread [client API](../../src/game/client-api.ts) exposes read-only `state$`, `selection$`, `placementFeedback$`, `inspectorState$` and `debugDrawStatus$`. Current-value streams deliver the initial/current value to new subscribers. Ordinary UI notifications are RxJS streams; frame actions and ordered completed-tick callbacks remain synchronous and propagate failures.

An owned frame dispatches actions, validates ownership, interprets camera/player input, pins one completed view, drains completed-tick callbacks, and submits future step credits. It never waits for those credits. Player and entity presentation share the pinned view. Generation, transition and input/activity revision checks follow callbacks that can invalidate the frame. Healthy sessions survive renderer Retry; failed authority requires a fresh world on Retry.

## Commands and transient events

Command submission returns sequence/generation identity or an explicit unavailable result. Every accepted command yields an applied, rejected or cancelled outcome. Each fixed step receives its command batch and returns a detached `SimulationStepResult`; the runtime owns the queue. Domain events identify research completion, handcraft batch completion/interruption, salvage attention, dismantling and MiniFab status changes. UI wording comes from typed outcomes and status codes, never English-message matching.

Events carry generation, tick and identity. They are delivered after the associated publication is accepted, once, without replay into a replacement world. Publication gaps retain events until a full resynchronization succeeds. The buffer is bounded to 4,096 events; overflow fails the visible session. Events are absent from captures. Pending captured commands retain exactly-once continuation. Notification grouping and the five-visible-notification limit remain in the notification center.

Selection is an entity ID, a grid cell, or null. Placement feedback is a separate channel. Inspection subscriptions change only when the selected entity ID changes; deliberate ground pickup remains an interaction on each selection action.

## Production authority and data

Production always uses the opening catalogue and deterministic handcraft, salvage, MiniFab and research executors, in the existing explicit order with shared inventory authority. Player, deposit, ground-pile and development placement shapes remain. Generic processor/owner entities, reservations, generic work/charge components, synthetic counters, custom content/system injection and profiling controls are absent.

Protocol and presentation packets remain version 2. Rapier integration advances world captures to version 3, requiring versioned native physics state alongside plain ECS data; older captures are rejected without a compatibility shim. Required fields depend on the operation. Capture/rebuild, inspection, publication, resynchronization and normal disposal remain supported. Inline controls and packet fixtures belong under `tools/testing`, outside the application graph.

The [playable Rapier test](../../tools/world/README.md#play-the-rapier-test) adds physical ECS entities and one private Rapier 0.21.0 world inside the same authoritative worker. The maintained character controller replaces custom collision response. Three physics substeps belong to each existing 50 ms tick; there is no additional scheduler. ECS structural boundaries reconcile native bodies; active/final-sleeping poses publish changed-only, with separate transferred quaternion rows preserving the existing base stride. Babylon interpolates those read-only poses and remains the sole presentation owner. Async WASM startup is confined to module readiness; the worker installs its process-lifetime listener before loading runtime authority and routes rejected startup to the existing native fatal-error boundary.

Presentation DTOs are deeply read-only and separate from mutable records and editable detached captures. Cache maps are private. Angular writable signals are private and exposed as read-only signals/computed selectors. Development publication freezing detects mutation, reusing already frozen values rather than cloning the population each frame.

## Presentation and authored features

`ScenePresentationLifecycle` installs one synchronous ordered before-render dispatcher and one late dispatcher before render targets. Behaviors start once on their first enabled owned frame. Updates run camera input, player interpretation, session frame phase, player presentation and entity presentation. Late work runs camera follow/occlusion, selection and placement once per frame. Node/ancestor enablement, invalidation, exceptions and reverse disposal remain explicit. Editor-attached scripts use their normal Editor lifecycle. Toolkit is removed.

Placement creates no preview or validation work outside the development placement capability. Active previews invalidate on cell, rotation, relevant completed world arrays or player position. Camera occlusion tracks and restores only the previous faded mesh and its original visibility.

The version-controlled [scene feature catalogue](../../tools/scenes/scene-features.ts) validates packed serialized features and generates registrations, a manifest and a fingerprint. Registrations load before scenes/characters; script maps contain attached imports and map exports and use public Editor subpaths. Unsupported authored features fail with scene/object paths before publication. Scenes, world definitions and both generated registries participate in publication rollback, preserving the last complete export. Watcher inventory reconciliation ignores directory-only metadata, generated output and cache changes while detecting rename/removal notifications.

## Persistence and measurements

The developer Save/Load utility retains its existing records and is loaded only through the development entry point. Imports are validated, writes awaited, failures visible and occupancy refreshed after committed success. It does not reference GameSession, capture, world replacement, live inventory or research. [Milestone 4](../plans/milestone-04-first-local-save.md) will build on its storage/dialog experience while introducing repository, codec, capture and replacement boundaries for gameplay persistence.

Historical synthetic reports remain laboratory evidence. [Current-game benchmarks](../../tools/game-bench/README.md) use real production captures/schemas and gameplay commands. Their distinct workload identifiers and end-to-end timings cannot be compared directly with the retired synthetic processor timings. Full benchmark runs remain opt-in.

Source boundary checks, production graph exclusions and [bundle limits](../../tools/architecture/bundle-limits.json) enforce this architecture. Static route bytes count shared static imports once, excluding dynamic imports and independent worker URLs. The modernization baseline is 13,349,796 bytes; require at least 40% reduction, warn at 5% and fail at 10% above the completed measured result.
