# Scrapworks Technical Design Document

Updated 9 November 2026 for Milestone 8 implementation. Schema-1 saves wrap version-3 world/physics data with `restoration-1` content; SaveCoordinator, SaveRepository and prepared worker/renderer replacement implement the manual slot. The [local-save report](../reports/milestone-04/2026-11-08/README.md) and [factory report](../reports/milestone-06/2026-11-08/README.md) record their verification. Migration, opening and ECS performance evidence retain their dated scope.

Scrapworks uses Angular for UI and Babylon.js with Babylon.js Editor for its 3D world. A plain authored-world definition and fixed-step simulation connect presentation to one authoritative ECS world. Opening, local saves, research, industry, transport and M8 water/restoration/energy execute in that world. The [factory catalogue](factory-catalogue.md) and [restoration catalogue](restoration-catalogue.md) record actual provisional values. The [GDD](GDD.md), [player progression design](player-progression.md) and [roadmap](../plans/README.md) retain their ownership.

## Agreed technical requirements

- Keep the game browser-first, with Angular UI and a fully 3D world/character.
- Author scenes and world layout in one Scrapworks Editor project; attached scripts handle presentation and scene bindings.
- Keep authoritative gameplay in plain TypeScript and save progress locally through versioned data snapshots.
- Defer accounts/cloud saves, remote control and navigation systems until a defined requirement needs them. The current playable physics test supplies the defined requirement for Rapier integration.

The [runtime architecture decision](../decisions/runtime-architecture.md) defines version-2 contracts, ownership, notifications, scene registrations and enforcement.

## Technical stack and current implementation

| Responsibility      | Choice                           | Current implementation                                                                                                                                                                 |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application and UI  | Angular 22, signals, CDK         | Shell, shared viewport, field-kit inventory/research/handcraft/MiniFab panels, winding, exit warning, menus and Retry.                                                                 |
| 3D presentation     | Babylon.js 9.32.0                | Sole renderer at `/`, with `/3d` compatibility redirect; authored scene bindings and runtime character presentation.                                                                   |
| Core object scripts | Scene-owned native Babylon hooks | TypeScript-attached scripts own player input/presentation, camera, selection and placement. Babylon physics remains disabled; Rapier runs inside simulation.                           |
| Physical simulation | Rapier 0.21.0, WebAssembly       | Worker-owned character controller and static/dynamic/kinematic bodies, three 60 Hz substeps per gameplay tick, changed-only pose publication and native-state continuation.            |
| Authoring           | Babylon.js Editor 5.5.3          | Saved inputs export/reload automatically; validated marker metadata compiles into a plain world definition.                                                                            |
| Client subscription | RxJS in main-thread `GameClient` | Per-client replay, unsubscribe, mounting and asynchronous transition guards.                                                                                                           |
| Gameplay            | Plain TypeScript                 | Private Miniplex authority, typed movement/opening/factory commands, deterministic 20 Hz personal work, wired power, recycling/fabrication/extraction and one shared field/lab research pass, with detached views. |
| Persistence         | Dexie / IndexedDB                | Schema-1 manual gameplay slot, transaction/token checks, candidate worker/scene/UI restore and production IndexedDB reload acceptance. Separate controls settings store.                  |

The [cleanup record](../plans/3d-cleanup.md) defines current asset boundaries and retired-source recovery. The [Editor setup guide](../plans/babylon-editor-setup.md) owns export/MCP commands. The [Art Document](../art/README.md) owns camera and visual-production requirements.

## Technical structure diagrams

The class diagram describes the implemented session, opening, factory and environment systems. The application diagram includes transactional gameplay persistence. The gameplay overview includes implemented transport/environment branches. Angular, Babylon and Editor objects remain outside authoritative plain records.

### Core class diagram

The application runtime owns one host `GameSession`; the existing render callback supplies bounded credits to one dedicated module worker. `Simulation` exclusively owns private Miniplex components and world resources and delegates authoritative player movement to plain [`PlayerMotor`](../../src/simulation/player-motor.ts). [`WorldScene`](../../src/game/views/world-scene.ts) composes native presentation behaviors and entity views that consume the initial definition and detached `WorldView` values. [`WorldSessionBridge`](../../src/contracts/game-client.ts) connects these scene objects to the application-owned session without exposing its mutable state.

[SVG image](../diagrams/core-class-diagram.svg) / [PNG image](../diagrams/core-class-diagram.png) / [Mermaid source](../diagrams/src/core-class-diagram.mmd)

```mermaid
classDiagram
    direction TB

    class GameRuntimeService {
        +mount(host)
        +unmount()
        +retry()
    }
    class GameClient {
        <<interface>>
        state$ and typed notification streams
        +setScene(key)
        +destroy()
    }
    class BabylonGameClient {
        state$ and typed notification streams
        +setScene(key)
        +destroy()
    }
    class GameSession {
        +advance(deltaSeconds)
        +registerCompletedTickHandler(handler, order)
        +setMovement(direction, sprint)
        +setPaused(paused)
        +enqueue(command)
        +view
    }
    class Simulation {
        +step(movement, commandBatch)
        detached SimulationStepResult
        +publish() and capture()
    }
    class PlayerMotor {
        movement and collision
        authoritative facing
    }
    class OpeningSystem {
        +command(intent)
        +step(delta)
        +interrupt()
        atomic slot transactions
        handcraft salvage MiniFab research
    }
    class OpeningData {
        <<data>>
        salvage and handcraft jobs
        shared research queue and field enable
        MiniFab request buffers charge
        eight toolbar assignments and active slot
    }
    class FieldKitComponent {
        inventory research crafting MiniFab factory environment
        commands and detached signals
        accessible exit confirmation
    }
    class PlaceableToolbarComponent {
        eight slots reference bag stock
        selected placeable and build feedback
    }
    class MiniplexWorld {
        private native queries
        owned EntityData components
        stable ID and collision indexes
    }
    class FactorySystem {
        construction and atomic local transfers
        TransportSystem directed material phase
        wired proportional power
        seeded recycling fabrication extraction
        supplied lab source preparation
        EnvironmentSystem water and persistent health
        EnergySystem forecast dispatch and actual work settlement
    }
    class MachineData {
        <<data>>
        local input and output slots
        committed job inputs and partial work
        bounded pending result and history marker
        random permutation cursor and state
    }
    class WorldResources {
        <<data>>
        tick
        stepSeconds
        nextEntityId
        research
        productionTotals
        extractionTotals
        power material and fluid connections
        saved health source attribution weather and objective
    }
    class WorldDefinition {
        <<data>>
        version
        grid
        terrain
        spawn
        deposits
        blockers
    }
    class WorldView {
        <<data>>
        lean numeric cache and bounded details
        movement presentation
        deeply readonly completed data
    }
    class WorldScene {
        compose scripts and entity views
        explicit frame phases
        +dispose()
    }
    class PresentationBehavior {
        Native Babylon lifecycle
        optional onGameTick(context)
        automatic tick subscription
    }
    class WorldSessionBridge {
        <<interface>>
        +initialize()
        +frame(seconds, movement, sprint, active, simulationActive)
        +completeFrame()
        +registerCompletedTickHandler(handler, order)
    }
    class InputManager {
        +takeFrame()
        +setEnabled(enabled)
        +clear()
    }
    class FrameClock {
        +sample(timestamp)
        +reset()
    }

    GameRuntimeService "1" *-- "1" GameSession : owns session
    GameRuntimeService --> GameClient : lifecycle and input bridge
    BabylonGameClient ..|> GameClient : implements
    BabylonGameClient "1" *-- "1" WorldScene : owns scene composition
    BabylonGameClient "1" *-- "1" InputManager : owns input
    BabylonGameClient "1" *-- "1" FrameClock : owns frame timing
    class WorkerSimulationPort {
        bounded requests and failure notifications
    }
    class SimulationRuntime {
        serial protocol and command ledger
    }
    class PresentationCache {
        dense numeric rows and bounded details
    }
    class PresentationPacket {
        version and base version
        transferred numeric rows
        mappings and removals
        bounded detached details
    }
    GameSession "1" *-- "1" WorkerSimulationPort : owns worker
    WorkerSimulationPort --> SimulationRuntime : serial messages
    SimulationRuntime "1" *-- "1" Simulation : owns authority
    GameSession "1" *-- "1" PresentationCache : completed publication
    Simulation "1" *-- "1" PlayerMotor : owns movement rules
    Simulation "1" *-- "1" OpeningSystem : owns opening executors
    Simulation "1" *-- "1" FactorySystem : owns factory executors
    MiniplexWorld "1" *-- "many" MachineData : building components
    FactorySystem --> MachineData : mutate inside fixed step
    OpeningSystem --> FactorySystem : ordered factory work before shared research
    MiniplexWorld "1" *-- "1" OpeningData : player component
    OpeningSystem --> OpeningData : mutate inside fixed step
    FieldKitComponent --> GameRuntimeService : sequenced opening requests
    PlaceableToolbarComponent --> GameRuntimeService : slot selection and B build
    Simulation "1" *-- "1" MiniplexWorld : owns component records
    Simulation "1" *-- "1" WorldResources : owns global records
    Simulation ..> WorldDefinition : initializes world
    WorldScene ..> WorldDefinition : binds authored layout
    Simulation ..> PresentationPacket : publishes detached data
    PresentationCache ..> PresentationPacket : applies ordered versions
    PresentationCache ..> WorldView : exposes completed data
    WorldScene ..> WorldView : displays completed state
    GameSession ..> WorldView : exposes current view
    WorldScene "1" *-- "many" PresentationBehavior : composes core objects
    PresentationBehavior ..> WorldSessionBridge : sends intent and registers ticks
    WorldScene ..> WorldSessionBridge : advances once per frame
    GameRuntimeService --> WorldSessionBridge : supplies guarded adapter
    WorldSessionBridge ..> GameSession : delegates to current session
```

A filled diamond means ownership, a dotted arrow means a dependency, and the hollow triangle means interface implementation. Presentation receives detached read-only views; simulation alone changes live world data.

### Application system interaction diagram

This is a component and data flow diagram: it shows where commands, state, and saves travel. The fixed-step loop advances gameplay independently of the rendering frame rate. Signals hold the selected UI view of state rather than a second authoritative world.

[SVG image](../diagrams/system-interactions.svg) / [PNG image](../diagrams/system-interactions.png) / [Mermaid source](../diagrams/src/system-interactions.mmd)

```mermaid
flowchart TB
    subgraph Authoring[Authored initial layout]
        Editor[Editor scenes and markers]
        Compiler[World definition compiler]
        Definition[Plain WorldDefinition]
    end

    subgraph Presentation[Presentation]
        UI[Angular panels and menus]
        Scene[WorldScene and native presentation behaviors]
        Facade[GameRuntimeService session bridge]
        Views[Published read-only views]
    end

    subgraph Gameplay[Gameplay]
        Loop[Host GameSession 20 Hz credits]
        Hooks[Main-thread completed presentation hooks]
        Sim[Worker Simulation and PlayerMotor]
        State[(Private Miniplex components and resources)]
        Content[Versioned checked-in opening catalogue]
        ECS[OpeningSystem salvage handcraft MiniFab and research]
        Factory[FactorySystem with TransportSystem before power production and lab sources]
    end

    subgraph Persistence[Local gameplay persistence]
        Saves[SaveCoordinator and GameplaySaveService]
        Codec[Schema one codec and candidate validation]
        Repository[SaveRepository interface]
        Local[(IndexedDB through Dexie)]
        Files[Future Milestone nine file backups]
    end

    Editor -->|saved layout| Compiler
    Compiler -->|validate and convert units| Definition
    Definition -->|initialise world| Sim
    UI -->|player commands| Facade
    Scene -->|movement and world commands| Facade
    Facade -->|sequenced commands and activity revisions| Sim
    Scene -->|advance once per browser frame| Loop
    Facade -->|session ownership| Loop
    Scene -->|register and dispose tick hooks| Hooks
    Views -->|queue bounded completed summaries| Hooks
    Hooks -->|commands for a future step| Facade
    Loop -->|one in-flight batch and five total step credits| Sim
    Sim -->|ordered systems within fixed step| ECS
    Sim -->|owned factory executor| Factory
    Factory <-->|machine buffers jobs topology and random state| State
    Factory -->|powered locally supplied labs for one shared coordinator| ECS
    ECS <-->|authoritative component data| State
    Content -->|rules and costs| Sim
    Sim <-->|read and update| State
    Sim -->|publish completed state| Views
    Views -->|Angular signals| UI
    Views -->|render data| Scene
    UI -->|manual save load and delete| Saves
    Saves <-->|capture and prepared session replacement| Facade
    Saves -->|encode or validate| Codec
    Saves <-->|versioned snapshots| Repository
    Repository <-->|transactional slot storage| Local
    Saves <-->|future import and export| Files
```

Commands are checked inside the worker and completed state is published as detached views. Manual gameplay persistence awaits committed transactions, validates a separate candidate world, prepares its scene/UI and preserves the active session on failure. Milestone 9 adds JSON file transfer and recovery.

A future cloud repository can implement `SaveRepository` . Accounts, synchronization, and conflict handling remain later work; they are not needed by the prototype simulation.

### Gameplay system interactions

This closer view shows the dependencies between gameplay systems. Arrows describe resources and rules shared through `WorldState` ; they do not require the systems to call each other or maintain duplicate inventories. Construction establishes the machines and connections that power, transport, and production subsequently use.

[SVG image](../diagrams/gameplay-interactions.svg) / [PNG image](../diagrams/gameplay-interactions.png) / [Mermaid source](../diagrams/src/gameplay-interactions.mmd)

```mermaid
flowchart TB
    Player[Player movement and manual salvage]
    Production[Power-free MiniFab and factory production]
    Research[Timed field and scalable lab research]
    Construction[Construction]
    Transport[Direct transport and output sorting]
    Power[Solar and wind first; optional coal and storage]
    Environment[Greenhouse terraforming and pollution]
    Extraction[Resource extraction and history]
    Recovery[Solid recovery to scrap or source ores]
    Winding[Optional winding and local MiniFab charge]

    Player -->|collected scrap in inventory| Production
    Player -->|inventory contributions and field work| Research
    Extraction -->|raw materials and extraction history| Production
    Extraction -->|raw-resource eligibility| Research
    Production -->|completed output and cumulative totals| Research
    Research -->|unlocked recipes| Production
    Research -->|unlocked equipment| Construction
    Production -->|crafted equipment in inventory| Construction
    Construction -->|placed production machines| Production
    Construction -->|extraction equipment| Extraction
    Construction -->|transport connections| Transport
    Construction -->|power machines and connections| Power
    Transport -->|machine input buffers| Production
    Production -->|machine output buffers| Transport
    Power -->|factory power and later MiniFab boosts| Production
    Winding -->|bonus speed with power-free baseline| Production
    Power -->|green contribution and optional emissions| Environment
    Research -->|greenhouse and mitigation unlocks| Environment
    Transport -->|purified water supply| Environment
    Construction -->|dismantled equipment and contents| Recovery
    Recovery -->|scrap or source ores without new history| Production
```

Production increases cumulative totals only when craft/machine output completes. Newly extracted resources have separate history; transfers, existing-output collection and refunds add neither history. Timed field and lab research validate prerequisites/eligibility and contribute materials exactly once, then grant the unlock when funded work completes. Enabled Field Research consumes uncommitted inventory gradually in the background, waits/resumes on shortages and preserves per-technology contributions/work on pause or switch. Consumed research materials are non-refundable; each paced cycle atomically consumes one of every still-required material, with all-input availability required and no overspending a completed material cost. Production, Mini Fabricator precursor planning and construction enforce unlocks. Greenhouses initiate restoration; green technology and optional pollution influence greening without a fail state or research lockout.

The dependency arrows do not prescribe tick order. Actual M6 order is validated manual commands/movement → handcraft/salvage → requested MiniFab → factory job preparation, network power and work → one shared lab/field research pass → structural commits/tick/publication. Manual/current handcraft and requested MiniFab commitments retain priority over the field bag draw; labs use only their own buffers. Revalidate every transaction; a completed pending result uses no further productive power. Automatic transport and environmental phases remain later work. Current-tick machine output is not eligible for future automatic transport until the next transport phase.

### Opening and factory state

The player ECS entity owns the 24-slot bag, separate tool slot and `OpeningData` component, including eight stock-referencing toolbar assignments and the active index. Tools stay equipped separately; Placeables use the toolbar/B world-build path. `OpeningSystem` executes personal work and the shared research pass; `FactorySystem` owns placed-machine preparation, power, production and lab sources in that same fixed step. Its plain `TransportSystem` executes phase-start/reserved transfers before factory work. All use shared atomic stock transactions. Active-slot placement is sequenced/validated in the worker; previews are advisory and use the same nearest-footprint reach/actual-body overlap rules as execution. Ground piles have stable-ID entities/native queries; research ledgers, histories, time, ID allocation, power and material edges remain world resources. The composed [opening catalogue](../../src/content/opening.ts) contains 14 technologies/seventeen recipes, including [first-factory research](../../src/content/first-factory.ts), [equipment definitions](../../src/content/factory.ts) and [transport rules](transport-catalogue.md), separate contribution/eligibility costs and stable Source IDs. Fibery/import receipts are not runtime dependencies. Numeric deltas, bounded detail subscriptions and at most twelve unit projections per sorter avoid publishing machine inventories every render frame. Plain capture/rebuild and gameplay storage include opening, factory and transport state. Known pre-transport saves receive detached compatibility handling, while existing control profiles retain rebindings when toolbar actions are added.

### Handcrafting cancellation boundary

Safe handcrafting runs only while its UI is visible; the adapter publishes intent/visibility and the plain simulation owns progress, input commitment, cancellation and refunds. Preflight checks output space after actual per-unit input consumption. The batch protects result/refund capacity across units and its exit warning; other additions/transfers and MiniFab deliveries wait. Enabled Field Research is a consume-only exception after player commands: take uncommitted stock only, never current craft inputs or protected capacity. Research may use finished outputs and affect later batch affordability, so revalidate each next unit. Idle crafting UI does not protect inventory. Warn/suspend before intentional exit; confirmed exit or forced teardown cancels unfinished work, refunds original inputs exactly once and releases protection afterward. Research withdrawals cannot occupy refund space, so refunds never spill. Load/world replacement resolves unseen handcraft cancellation before research draws/other writers. Supplied MiniFab work may finish and hold output. See [the progression rules](player-progression.md#handcrafting-and-interruption).

### Inventory capacity and salvage overflow

Inventory has 24 bag slots, a separate equipped-tool slot and no weight metric. Item definitions own stack caps (initially 100 for simple materials); player reach starts at a 2 m ground-plane radius and capacity/reach can grow later. Salvage atomically debits the deposit, inserts what fits and creates recoverable ground resources for the remainder, with an inventory-full notice. Count newly extracted quantity once across both destinations; pickup adds no history. Ground IDs, types, quantities and positions belong in plain world/snapshot state.

Handcrafting checks its inventory destination after actual per-unit input consumption. MiniFab instead starts against actual input/output buffer capacity: ingest one complete operation from uncommitted inventory just before work, directly reuse eligible precursor output and commit new production once into its output buffer. Delivery/direct reuse is only a transfer. Initial buffers hold one operation's ingredients/result (including a recipe's multi-output batch); capacities upgrade later toward item stacks. When output is full and bag delivery fails, retain output and pause/notify/resume. A validated next-input ingestion may precede held-output delivery if it genuinely frees sufficient bag capacity; buffered/partial-stack consumption cannot invent a freed bag slot. Player commands precede automatic intake/delivery; active handcraft capacity protection defers those bag transfers while already supplied MiniFab work may continue. Salvage overflow remains ground drops; MiniFab never spills. See [the capacity rules](player-progression.md#inventory-interaction-range-and-overflow).

## State ownership and module boundaries

The simulation owns authoritative player/world state, movement, collision and placement validation. Planned crafting, research, transport, power and restoration modules will join this boundary. Angular and Babylon send commands to the same session and display published views. Scene frames, animation callbacks, and UI handlers must not advance production or directly spend inventory.

Angular owns the shell, menus, dialogs, controls and gameplay panels. Babylon owns rendering, cameras, picking, visual effects, animation, and input adaptation. Signals expose lifecycle, selection and detached world views without becoming an authoritative world owner.

The centred field kit has Inventory & Crafting, Research and Factory tabs in a bounded shell, with scrollable contents and reserved work/progress rows. Avoid preventable layout shifts throughout the UI: blank space may be reserved for conditional content, especially live status, work and results, so controls stay anchored. Machine inspection keeps a responsive reservation for every possible job result, stable material summaries/collection controls and fixed-width power figures across cycle gaps and buffer updates; empty placeholders are hidden from assistive technology. Toolbar help reserves its wrapped height across machine/connector/empty selections and build toggles. Switching away from active handcrafting uses the same stay/cancel guard as closing the kit. Salvage and deliberate ground pickup belong to world interaction. UI input ownership stops movement/camera input without stopping the worker, renderer or idle animation; pausing dialogs suspend simulation and character animation separately.

Power connections are toolbar Placeables with a two-click presentation draft: choose a first machine, preview its rotated terminal to the targeted cell/terminal, then choose the second machine. Clicking the first cell again cancels that attempt without a command or stock movement. Build exit, input/UI loss, slot/world changes and anchor removal clear the draft. A sequenced active-connector command revalidates the completed edge and atomically spends one item in the worker; geometry/topology previews share the plain-TypeScript validator. Draft anchors never enter world state or saves. Existing power statistics and disconnection remain in Factory inspection. See the [factory catalogue](factory-catalogue.md).

`UiService.openNotification({message, title?, tone?, colour?, icon?, timeout?, key?})` returns an ID and `dismiss()` reference. The notification host is a sibling of the renderer/field kit and fixes its stack to the global viewport's top-right corner. Five notifications are visible in FIFO order; additional notifications queue until a slot opens. Timeouts start on promotion, default to 8,000 ms and pause while hovered or focused; zero is persistent. Keys replace matching visible or queued notices. Colour affects the accent while readable text/background colours remain fixed. Icons are plain text, never HTML. Notification ownership/timers end with the UI service. Opening feedback emits shortages, blocked actions and completion transitions without repeating every worker publication; alerts never reflow the kit.

Use `src/app/features/` for Angular/session integration, `src/game/` for 3D presentation, `src/contracts/` for plain boundaries, `src/simulation/` for authoritative rules, and `src/core/` for framework-independent utilities. Simulation/contracts/core remain free of framework, storage, DOM, and wall-clock dependencies. Phaser source and its package dependency have been removed.

The Editor owns saved cameras, lights, materials, static geometry, and world markers in `assets/`. The compiler in `tools/world/` extracts marker metadata into versioned `WorldDefinition` records without executing attached scripts, validates IDs, bounds, alignment, footprints and hierarchy transforms, and converts centimetres to metres on X/Z. Mutable `WorldState` belongs exclusively to the simulation; detached views cross into presentation. Scene serialization and attached components are not gameplay saves.

`GamePageComponent` provides a scoped runtime and directly owns the renderer host. The runtime owns its `GameClient` subscription, readonly signals, generation guards, mount/unmount, retry, and application session. Babylon owns one engine/frame callback, scene assets, resize observation, transition guards, first-frame readiness and late-load disposal. Its frame advances the application-owned scheduler; no independent simulation timer is started. See the [migration plan](../plans/3d-migration.md) for current lifecycle acceptance and the [dated Phase 2 walkthrough](../plans/3d-phase-2-walkthrough.md) for implementation history.

The document supplies a branded loading shell before JavaScript; Angular keeps the same presentation while its route loads. `GAME_CLIENT_LOADER` dynamically imports the renderer after Angular renders the UI and two animation-frame callbacks allow an intervening paint. Scene changes use the same cancelable paint barrier. The opaque loading cover makes the underlying UI/viewport inert until the destination's first ready frame, including pauses before that frame. `GameClient.loading$` reports `LoadingStatus` (current task text and nullable 0–1 progress) separately from lifecycle state, so progress does not invalidate input. Editor and character loaders supply measured task progress; unmeasured setup remains indeterminate. `LoadingIndicatorComponent` can present any asset task independently of the branded `LoadingScreenComponent`. Runtime ownership and generation guards discard canceled imports and stale scene progress. Responsive menu WebP derivatives are reproduced by [the image preparation tool](../../tools/art/prepare-menu-images.ts), with original PNGs and provenance under `art/`.

### Core object scripts

[PresentationBehavior](../../src/game/lifecycle/presentation-behavior.ts) and [ScenePresentationLifecycle](../../src/game/lifecycle/scene-presentation-lifecycle.ts) own the code-attached behaviors. One ordered before-render dispatcher starts each enabled behavior on its first owned frame and then runs updates. One late dispatcher runs once before render targets, even when Babylon repeats that hook per camera. There is no global playing flag or extra ticker. Editor-attached scripts retain the Editor lifecycle.

| Responsibility                                      | Owner                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Shared movement and sprint input                    | `PlayerController` interprets the frame's shared `ActionFrame` and submits plain intent. |
| Authoritative position, collision and facing        | Session-owned `PlayerMotor` in plain simulation code.                                    |
| Character rig, interpolation, turning and animation | `PlayerView`.                                                                            |
| Orbit, zoom, following and occlusion                | `CameraController`.                                                                      |
| Picking and interaction feedback                    | `SelectionController`.                                                                   |
| Build mode, rotation, preview and confirmation      | `PlacementController`.                                                                   |
| Entity meshes and materials                         | Individual view objects, synchronized by entity ID.                                      |

`WorldScene` is the composition root for those objects. `BabylonGameClient` retains browser/render lifecycle responsibilities rather than gameplay-feature branches. The integration defines frame phases explicitly, so incidental construction or array order does not determine behavior:

1. Sample one shared `ActionFrame`, dispatch application/UI actions, and validate ownership.
2. Run camera controls and player input interpretation.
3. Advance the session once, executing zero to five gameplay ticks.
4. Publish completed world state and update player/entity presentation.
5. Follow the player, update occlusion, pick the world and update placement feedback.
6. Draw the scene.

[attachPresentationBehaviors](../../src/game/lifecycle/attach-presentation-behaviors.ts) registers numeric phases: camera input (10), player interpretation (20), session pin/completion/credits (30), player presentation (40), entities (50), selection (60), placement (70). Late hooks run camera follow/occlusion, selection and placement. Ordered hooks execute synchronously so exceptions reach the renderer boundary. Node/ancestor enablement and frame generation/revision guards stop invalid work immediately. Disposal releases observers and tick subscriptions, then destroys resources in reverse order. Healthy sessions survive renderer Retry; failed workers restart only on explicit Retry.

### ECS foundation from Milestone 3

Architecture revision, 28 October 2026: adopt ECS for the opening simulation before inventory, salvage, research and crafting are implemented. [Milestone 3 Step 0](../plans/milestone-03-character-and-manual-opening.md#step-0-establish-and-prove-the-ecs-foundation) selects/proves the library and establishes its actual runtime. [Milestone 6](../plans/milestone-06-first-working-machines.md) adds factory entities/power/processing to that same foundation. The [ECS laboratory](../../tools/ecs-bench/README.md) now pins four development-only candidates for synthetic Node/Chromium investigation; it does not implement an ECS in production Simulation or grant gameplay implementation credit.

The [29 October ECS investigation](../reports/ecs/2026-10-29/README.md) selects **Miniplex 2.0.0**. Miniplex and bitECS meet the 100,000-entity combined simulation/publication budget in both environments; Miniplex has the simpler verified integration. Production adoption now uses one private worker authority and the actual component/lean-view contracts. See the [implementation evidence](../reports/ecs-worker-implementation/2026-10-30/README.md) for qualification and remaining limits.

Worker decision, 29 October 2026, requalified 30 October: start with **one dedicated browser worker owning Simulation and its private ECS world**, with sequential ECS systems. The [lean investigation](../reports/simulation-worker/2026-10-30/README.md) compares **Miniplex 2.0.0 and bitECS 0.4.0**, each inline and in one worker, and retains Miniplex. Both now pass the unchanged normal-workload compute, receiving, callback and input gates using transferred numeric presentation rows and bounded on-demand inventory/selection details. The [rich bridge's failed qualification](../reports/simulation-worker/2026-10-29/README.md) remains historical. Angular/Babylon and physical input remain on the main thread, communicating through plain commands, completed views and explicit detail subscriptions; full captures remain separate. The laboratory establishes the asynchronous session/tick-hook handoff, lifecycle and measured browser costs. Its original prototype remains isolated under tools. Production now uses the asynchronous boundary described by the current class/frame diagrams; the implementation report keeps its measurements separate from laboratory results.

Browser results govern worker qualification: 100,000 meaningful entities on the reference desktop, **60 FPS required and 120 FPS diagnostic**. Begin with authoritative movement views and interpolation; investigate local visual prediction only if latency warrants it. Preserve pause/suspension and no offline catch-up. Node remains a correctness/diagnostic environment; the historical ECS report keeps its original dual-runtime gate. Source-backed assessment of future threading is included now; implementation of multiple simulation workers, shared-memory stores and parallel ECS systems remains deferred until profiling demonstrates a need for more simulation throughput.

The [production implementation plan](../plans/ecs-worker-implementation.md) is complete through Step 0, with [production qualification](../reports/ecs-worker-implementation/2026-10-30/README.md). Its two user-confirmed policies are implemented: existing `onGameTick` hooks are main-thread completed-tick **presentation** notifications, drained during an owned render frame; failure Retry starts a fresh world from the authored initial definition, with no automatic checkpoints. Healthy renderer-only Retry retains its live session; page teardown disposes it. A failed worker or presentation hook requires a fresh authored world.

- **Single authority:** Simulation owns one ECS runtime, component stores and explicit world resources. Component values remain plain gameplay data; queries/indexes/library handles are private runtime machinery. The old mutable WorldState scaffold has been removed. WorldView is a detached projection, not another writable world. WorldDefinition remains authored initialization; renderer GameState remains lifecycle state.
- **Opening composition:** meaningful entities include the player/inventory owner, deposits, ground piles and personal processing jobs/devices. Production entities are player, deposits, piles and development placement buildings. Opening jobs, buffers and charge are player-owned components; generic owner/work/reservation schemas are absent. Keep content immutable and shared time/ID allocation, research and histories as explicit world resources where appropriate; do not invent entities for every item unit or singleton field.
- **Shared domain logic:** slot capacity/transactions, recipe costs/eligibility, work progression, recovery/history rules and result accounting remain plain functions independent of the ECS library. Systems query relevant components and invoke those rules. Handcraft UI requirements, MiniFab charge/precursors and factory arity/power remain executor policies; later machines do not require replacing the opening's inventory or production engine.
- **Existing clock:** retain one application-owned 20 Hz scheduler and the five-step catch-up contract. GameSession supplies host frame credits, counts in-flight steps against the same five-step allowance, and permits one advance request at a time. The worker has no ticker. Simulation's fixed step invokes ordered ECS systems with explicit structural-mutation boundaries; manual/current-handcraft spending precedes requested MiniFab then Field Research. Do not derive priorities from incidental query iteration or run authoritative systems through presentation tick subscriptions. Reuse PlayerMotor's tested movement algorithms against ECS-owned data; camera and player native presentation behaviors continue as presentation/input adapters.
- **Stable boundaries:** game-owned stable IDs identify persisted entities/references; library-recycled IDs and object identity are runtime details. Angular/Babylon consume projections and submit commands without ECS query/component handles. Preserve the useful GameClient/WorldView interface while changing its internal state representation. Profile changed/selective projections and explicit snapshots so repeated full-world cloning does not erase the ECS benefit.
- **Snapshot groundwork:** capture plain versioned component/resource data and rebuild a fresh runtime/queries/ID mapping. Verify continued simulation is equivalent and restoring components never fabricates production/refunds/research contributions. Milestone 4 implements persistence around this boundary; never serialize the ECS world, observers, queries or renderer objects as the save schema.

The prior comparison selected Miniplex 2.0.0 because its measured browser result qualifies and its plain objects/application-owned scheduling fit the maintainability criteria. Its object-identity focus still requires explicit stable IDs. The worker study retains that preference while identifying bitECS's more direct future shared-numeric path and migration obligations; neither library supplies an automatic parallel-system scheduler. A worker boundary is application infrastructure and needs its own qualification. See the dated comparison above, [Miniplex official documentation](https://github.com/hmans/miniplex) and [bitECS threading guidance](https://bitecs.dev/docs/multithreading).

The selection spike must measure representative active/idle/blocked processing, inventory/buffer access, structural churn, memory/allocations and capture/rebuild/view costs at increasing scales in the intended JavaScript environments. Record evidence and select the storage model before feature code, without implementing future factory content. ECS by itself promises neither automatic parallelism nor a frame-rate improvement; optimize measured bottlenecks. Intermediate changes within simulation are expected, while game rules, public presentation boundaries and the tested clock/motor should carry forward.

Production/extraction histories, per-technology consumed-material ledgers and work, the active field technology/enable state, material-wait state and unlocks belong to the saved world. Enabled Field Research runs on simulation steps with the UI closed and alongside other work. It draws uncommitted player stock gradually, after player commands, without full upfront payment/reservation. Missing next inputs wait automatically; disabling field work stops bag withdrawals even while labs continue from their own buffers. Pause/switch retains invested materials/work with no cancellation/refund. Enabled field contributions may join lab research against shared remaining demand without double spending, overshoot or free work; each paced cycle consumes one whole unit of every still-required item atomically, waits for a complete bundle and retains partial cycle time without unpaid catch-up. Already satisfied material totals are excluded. Provisional interval = fully supplied technology work seconds / largest cost quantity; shared lab coordination remains later integration work. Load resolves unseen handcraft refunds before any research draw, and creates no offline progress. See [the progression design](player-progression.md#research-progression).

### Progression state and invariants

The opening MiniFab, baseline charge/winding, M6 shared labs/wired factory/recycling and M7 direct transport/conveyors/sorting execute in the same simulation. M8 adds paid environment utilities, weather and energy; upgrade progression and later material branches remain future requirements. All records remain plain and simulation-owned; Editor scripts and Angular views submit requests and consume projections. The [factory report](../reports/milestone-06/2026-11-08/README.md) and [transport report](../reports/milestone-07/2026-11-09/README.md) record verification and qualification limits.

- MiniFab is a personal subsystem with a separate Angular panel beside inventory. Initial recipes must be researched and handcraftable; later crafted/researched modules can enable hazards/liquids. It follows both component branches and is hand-assembled without factory electricity. Plain state holds one requested target/batch, precursor plan, current operation/input buffer, completed output buffer, capacities, work and blocked reasons. Pull each complete operation at start from uncommitted inventory, optionally reuse output directly, and wait on stock shortages. Reject invalid/locked/cyclic chains without spending; share intermediates without hidden storage. Per-request intake is initial capability; autonomous min/max targets remain a later upgrade.
- Baseline MiniFab work always progresses at 1x without power when ingredients/buffers allow. Initial local charge provides 60 active seconds at 2x speed, draining only during actual processing. Idle, paused, missing-stock, output-blocked and inventory-wait states spend no charge. Split steps at battery expiry/job completion, preserving inputs/work and using baseline speed for uncharged time. Five turns fill initially; gear T decreases toward one. Charge gain = capacity * abs(accepted angular travel degrees) / (360*T), capped at capacity, with concurrent work drain still applied. Unlimited capacity level n = 60*1.5^n boosted seconds, physical level-n cost = base recipe * 2^(n-1); stored charge is not refilled by capacity upgrades. Turns-to-full is independent of capacity. Tier costs/spacing and later source stacking remain future content.
- Winding adapters report actual accepted handle angular travel while the focused/grabbed crank owns input. Pointer drag and selected right-stick direction align the handle; keyboard Up/Right/Down/Left/Up is one turn-equivalent. Credit fractional clockwise/counterclockwise/back-and-forth travel continuously, with no full-turn gate. Filter device noise/centre ambiguity/stale jumps, not genuine reversals; unchanged held keys/centre stick earn nothing. Enforce equivalent configurable angular rate/capacity bounds across adapters and frame schedules. Release/focus/selection ownership changes end the gesture without replaying gaps. Save charge/ranks, not active gestures; no factory electricity or accelerometer implementation is required.
- MiniFab upgrade state distinguishes related general technology, MiniFab-specific research, crafted upgrade ownership and applied effects. Solar/wind/coal/grid upgrades improve speed and coal incurs pollution; no research-complete callback grants the physical upgrade. Grid integration waits for electricity. Inventory-driven min/max automation is a separate later upgrade with unresolved trigger semantics. Persist local charge/capacity and applied upgrades, not current gesture paths or device permission handles.
- Content distinguishes a recipe's distinct ingredient count from quantities: Basic Fabricator accepts one type, Medium two, Advanced three or four. Higher tiers cannot execute lower-arity recipes; recycler and Mini Fabricator capabilities are separate.
- Recycler output comes from a specified random output catalog rather than a selected deterministic recipe. Use a simulation-owned seeded PRNG, save its state and persist any rolled pending output. Blocked output, load and repeated commands cannot reroll a batch.
- Disassembly must preflight its entire body-material return and intact buffers against post-removal bag capacity. If insufficient, leave item/device/job/contents intact, with no partial dismantle, early cancellation or ground spill. A successful atomic action cancels unfinished work with original inputs, recovers contents once and preserves research/history.
- Dismantling completed buildings/items returns full embodied solid value as scrap for scrap-origin material or source ore for other material; source ores require full reprocessing. Liquids are lost, with exact future equivalence/provenance deferred until advanced materials exist. Research inputs are permanently consumed and never refundable. Every completed re-craft counts as production; recovery/refunds/transfers do not. MiniFab cancellation discards partial work and preserves original inputs; return to inventory or retain input/output buffers if blocked. While residue remains, replacement requires the same input types (quantities may differ), and output must clear before another recipe starts. Exact same cancelled recipe may start with uncleared output only if a full next result fits. Save cancellation recipe identity/input types and residual contents; never duplicate refunds or bypass restrictions on load.
- Daylight, fluctuating wind, the non-event wind minimum and Dunkelflaute events derive from saved simulation time/weather state. Save any random state; do not read wall-clock time or use presentation randomness for gameplay decisions. Coal-free progression is required, and weather/pollution cannot create a permanent progression lockout.
- Finite resource quantities are deliberately generous. Future resource configuration and train/loading-station systems remain outside the first prototype.

The [9 November M8 plan](../plans/milestone-08-restoration-and-energy-choices.md#agreed-scope-and-decisions--9-november-2026) implements plain contracts: persistent 0–100% health on all land/water cells; signed local influences, fair saturation sharing and an expanding positive frontier at a lower deterministic cadence; connected lake sources with cell-derived capacity, rain-led refill, uniform edge pumping and treatment/return quality; pipes with even filling, splitting/cardinal overflow and exact source-attributed unconsumed-water return on dismantling; batteries and forecast-driven slow coal base load with coal/water inputs, renewable curtailment and higher untreated-water emissions. Returning unconsumed water is an explicit exception to process-liquid loss: consumed water/fuel remains spent, and solid recovery remains atomic. Save all budgets/cadence cursors, source quantities/quality/attribution, pipe/tank/process state, weather/PRNG, coal transitions/forecast decisions and charge needed for exact same-map continuation. Reaching 100% health on every map cell records the checkpoint once and permits continued play. Keep simulation authority in the existing worker; visuals neither move water nor advance restoration.

## Simulation timing and save boundaries

`GameSession.advance(deltaSeconds)` retains a 50 ms accumulator (20 Hz), a five-step catch-up limit and the existing browser frame source. It adds no timer or animation loop and does not depend on physics, physics substeps or global Babylon timing. A zero-tick render frame still updates presentation; excess elapsed time beyond the bounded catch-up budget is discarded.

The [Rapier integration](../../tools/world/README.md#physics-ownership-and-continuation) nests three 1/60 s physics steps inside each authoritative gameplay tick. Physics has no independent clock. Version-3 captures include pinned native physics bytes and project-owned stable identity alongside plain ECS data; geometry/pose validation protects candidate replacement and exact continuation. Protocol/presentation remain version 2, with sparse transferred quaternion rows for physical entities. The current crate/barrel/stack/moving-block layout is authored in the active Game scene and remains test content; performance qualification of large active-body populations is separate work.

`registerCompletedTickHandler(handler, order?)` registers main-thread presentation notifications. The owned render frame pins the latest completed publication, drains at most five summaries in tick/order/registration order, then submits future credits. Context includes the completed tick, fixed duration, world generation and publication tick/version; a catch-up notification may describe an earlier tick than the pinned view. New registrations never replay committed ticks. Unsubscription and ownership changes stop dispatch immediately. Hook commands affect a future step; hook failure retains the completed view and requires explicit authored-world Retry. Worker message handlers never execute scene scripts.

The narrow `PresentationBehavior` base connects an implemented optional `onGameTick(context)` method through `WorldSessionBridge` during native `start` and disconnects it during destruction. The adapter checks script and object activation at dispatch time. Native Babylon lifecycle registration and application tick registration remain distinct; the renderer hooks never become simulation scheduling mechanisms.

Continuous movement is sampled state. Discrete commands are captured once and queued until a tick consumes them, so catch-up cannot repeat a button press. Placement confirmation happens after the current frame's session advance and therefore targets a subsequent tick. Each authoritative step processes queued commands, advances player movement, increments the tick and publishes completed state. A failed step cannot expose partial state.

The bridge distinguishes active gameplay input from active simulation. Focusing the field kit blocks movement/camera/selection but keeps simulation work running. The existing render callback remains the only frame source. Window focus/visibility loss, menus, binding capture, Inspector and renderer failure suspend simulation and clear transient actions. Intentional handcraft exits warn and suspend its unit; confirmed exit or forced interruption refunds that unit exactly once. MiniFab supplied work and research survive UI closure. Resumption cannot replay hidden or blocked time. A completed step is the gameplay save boundary. Local manual saving is implemented; offline production is excluded.

## Persistent game state

Keep active gameplay state in memory. Save a versioned data snapshot containing:

- Player position, inventory, tools and MiniFab subsystem ownership, target/batch, precursor plan, local charge/capacity, crafted/applied upgrades, input/output buffers and capacities, remaining work, blocked reasons and cancelled recipe/input-type residue; later power-source/automatic policies only when implemented. Active winding gestures and device permission handles are session state, not save data.
- Remaining deposits, placed machines, and connections.
- Machine buffers, work progress, and items in transit.
- Stored energy and water.
- Cumulative production/extraction histories, per-technology consumed-material ledgers and remaining/partial work, shared research queue, field enable state, local lab buffers and research unlocks.
- Seeded random-stream state, already-selected recycler outputs, daylight/wind/weather/event state and any deterministic coordination state.
- Pollution, vegetation, and simulation time.

Store identifiers and data rather than Angular services, Babylon meshes/materials, scene handles, or Editor components. Recipe and technology definitions belong to the game content; saves reference their identifiers and record a compatible content version.

Milestone 4 establishes the [opening field checklist](../plans/milestone-04-first-local-save.md#snapshot-field-checklist). M5 adds queue/unqueued research ledgers; M6 adds machine components/buffers/jobs, completed-result history markers, deposit claims, topology and recycler PRNG/permutation/cursor. M7 adds bounded transit units/progress, conveyor paths, strict sorter filters/lanes, directed material edges, cooldowns, last-item service and per-destination arbitration cursors. M8 adds health, source-attributed water, seeded weather, batteries, coal and latched restoration. The [M9 field audit](save-resilience.md#snapshot-field-audit) maps all current contract groups to validators and continuation evidence. Content is `restoration-1`; the first M9 envelope is schema 2 with world 3/physics 3 and exact Rapier 0.21.0 compatibility. Pre-M9 schema-1 saves are retained for deliberate deletion and are not migrated. Daylight/wind derive from saved simulation time, with no independent wall clock. Changed authored maps reject before candidate construction. Stack limits, reach, recipe dependencies and base capacities remain immutable content; gearing/capacity levels stay zero until upgrades exist. Internal SimulationCapture command ledgers/queues are excluded from durable snapshots. The object representation remains; format optimization is still deferred.

## Local storage and save operations

Use the installed Dexie integration for IndexedDB persistence. Controls settings retain their separate adapter. M9 extends M4's SaveCoordinator and gameplay-specific repository to named runs and immutable revisions. Dexie database version 2 separates run heads, revision metadata and payloads, retaining the legacy slots table until deliberate deletion. Metadata listing remains usable when a payload is corrupt. Settings namespaces remain unchanged.

The [9 November M9 decisions](../plans/milestone-09-save-resilience.md#agreed-scope-and-decisions--9-november-2026) are implemented: autosaves run every 2 minutes of completed active simulation time, skip unchanged boundaries and suspend while paused/hidden/held, without catch-up or offline progress. Each run retains its latest 5 autosaves and 3 manual revisions, including the heads. One run-wide expected token protects both kinds across tabs; append, head update and bounded pruning are one transaction. Explicit requests precede one coalesced automatic request. Recovery loads an immutable source; subsequent saves append from the latest head with recovered-source provenance. Active run deletion suspends its autosaves until a deliberate manual Save. See the [operation rules](save-resilience.md#commit-recovery-and-operation-rules).

Write each snapshot and its metadata together in a transaction. Report save success only after the write completes, and preserve the last successful revision if a later write fails. Avoid relying on a final save when the tab closes.

## Save format and loading

Give saves a durable-envelope schema, compatible content/physics versions, authored-world identity, stable runId, saved timestamp and committed write token. The current simulation worldId equals the authored definition ID; it is not a unique playthrough identity. Keep slot identity, run identity and session/renderer generations distinct. Run IDs and timestamps belong to application composition, outside deterministic simulation.

For M8, the user requires strict authored-map binding: compare the save's exact authored-map revision/content with the current shipped map before constructing a candidate worker/scene. Any map change makes an older-map save invalid even if its world ID is unchanged. Report that incompatibility without attempting load or map repair; offer deliberate deletion/New Game and preserve an active world. There is no deployed build and M7/old-map saves need no migration. Use a stable revision/fingerprint of authored definition content, distinct from mutable resource depletion, health and run identity. Same-map saves must continue exactly. M9's future format migrations do not override map incompatibility without a separate product decision.

Show Continue alongside New Game when committed revision metadata exists. The run/history controls identify the selected run, save kind and revision. Confirm before Load/New Game discards unsaved progress and explicitly confirm deletion scope. New Game receives a distinct run identity, leaving existing runs intact; its first autosave needs no prior manual checkpoint. Saving never silently replaces a different run. Continued simulation after a capture remains unsaved even when its asynchronous write later succeeds. Autosaves preserve an explicitly inspected history selection and do not disable focused controls.

Validate unknown loaded data and build a separate candidate worker, including matching authored definition and exact compatible Rapier native bytes/version. Await a complete publication and prepare presentation/UI before committing through GameSessionOwner. GameSession.hold() preserves the old session under a non-destructive load guard. Normal pause/clearInput interruption remains separate; initial restored activity acknowledgements preserve saved work until its first active step. Candidate/read/validation failure preserves the old job, inventory, world and pause/UI ownership.

When a saved handcraft job exists, reopen Inventory & Crafting and resume its saved unit only after UI readiness and normal activity/visibility rules permit it. Do not repay inputs, refund that resumable unit or advance it invisibly. Fresh session counters, cleared movement/salvage/winding intent, reset elapsed clocks and rebuilt presentation mappings prevent command replay and offline progress. Background MiniFab/research retain their existing spending and exactly-once completion rules. Normal handcraft exit/forced-interruption behavior still applies after restoration.

M9 establishes the [format/support matrix](save-resilience.md#format-and-compatibility), with no existing-save preservation guarantee for M4–M8. The detached sequential migration pipeline currently has a schema-2 identity path; no older real M9 format exists yet. Synthetic ordering/failure fixtures are distinguished from actual historical support. Future supported migrations operate on a copy before candidate construction, independently of exact map/native compatibility. Unsupported versions or invalid data preserve both active play and stored sources; successful loading alone writes nothing.

Database schema changes and game save migrations are separate concerns.

## File backups and browser storage limits

JSON export/import is implemented. Browser storage is local to the browser profile and website origin; clearing site data can remove saves, and best-effort storage can be evicted. Optional player-initiated persistent storage is accompanied by file backups because the request may be denied and users can still clear stored data. These limits are documented in [MDN browser storage guidance](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

M9 separates file inspection/validation, committing an accepted import as a new local run, and deliberate activation through candidate worker/scene/UI preparation. Bound encoded input before parsing and decoded structure before reconstruction; reuse gameplay/native validation and exact authored-map checks. Repeated imports get distinct local identities while retaining source provenance and simulation IDs. Export normally identifies a chosen valid committed revision; when IndexedDB is unavailable/full, allow a freshly captured and fully validated emergency download without a database write or a false saved marker. Optional storage estimates/persistence requests belong to the browser boundary, and persistence is requested through a deliberate player action. Accessible status/history controls reserve space and retain focus as results change.

## Future cloud persistence

Keep persistence behind a small save repository interface for listing, loading, saving, and deleting slots. The local IndexedDB repository is implemented. A future cloud repository can use the same versioned snapshot format, while accounts, synchronization, and conflicting revisions remain separate future work. This does not require a backend for the initial prototype.

## Initial verification requirements

The first implementation checks should cover:

- Saving and loading a running factory without changing inventory, research, production totals, or machine progress.
- Continuing the simulation with the same results after restoration.
- Migrating supported older save schemas.
- Invalid saves or failed writes preserving the last usable state.
- Research consuming the required materials exactly once while retaining cumulative production totals.
- Crafting and placement rejecting equipment whose technology has not been researched.
