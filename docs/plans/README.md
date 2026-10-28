# Scrapworks Implementation Plan

Updated 27 October 2026 for agreed progression, Mini Fabricator and renewable-first peaceful terraforming. Milestone 3 retains its migration credits and now includes bootstrap field research. These are planning changes; later gameplay implementation has not resumed. The 23 October migration acceptance remains a dated checkpoint; [28 October full CI](../reports/ci/2026-10-28/README.md) closes Milestone 1 reproducibility.

Build a browser-first 3D game with Angular UI, Babylon presentation, Editor-authored layout, a plain TypeScript simulation, and local Dexie/IndexedDB snapshots. The [GDD](../design/GDD.md), [player progression decisions](../design/player-progression.md), [TDD](../design/TDD.md), and [Art Document](../art/README.md) own their respective requirements.

## Migration to 3D

The [migration plan](3d-migration.md) and [acceptance record](../reports/migration/2026-10-23/README.md) record the completed renderer migration. The [acceptance checklist](3d-implementation-checklist.md), [runtime walkthrough](3d-phase-2-walkthrough.md) and [Editor setup](babylon-editor-setup.md) explain the implemented ownership and authoring workflow.

Babylon is the sole world renderer at `/`; `/3d` redirects to it. Saved Editor markers compile into a versioned plain world definition, and one session advances authoritative movement/collision at 20 Hz. The fixture includes an animated protagonist, orbit/follow camera, picking, controls, pause/suspension and isolated development placement checks. Normal worlds start with no inventory, equipment, machines or research unlocks.

Core objects now use Toolkit scripts composed by `WorldScene`, with plain `PlayerMotor` retaining authoritative movement. The existing session clock also dispatches optional ordered script tick hooks independently of physics. See the [core object design](../design/TDD.md#core-object-scripts) and [timing contract](../design/TDD.md#simulation-timing-and-save-boundaries). Future factory systems use the [deferred ECS architecture](../design/TDD.md#future-factory-ecs), with Miniplex the first candidate to evaluate.

The [cleanup record](3d-cleanup.md) describes retired tools/assets and their recovery sources. Fresh [authoring workflow validation](../reports/workflow/2026-10-23/README.md) verifies export/reload, failed-save retention and recovery.

Manual salvage, recipe jobs, inventory interaction, research, machines, transport, restoration and gameplay saves remain unimplemented. Controls settings persisting through IndexedDB do not establish world saving.

## Milestones at a glance

The [Fibery project tracker](fibery-tracking.md) provides the live task board, milestone hierarchy and current-design work view. Its initial import preserves the implementation credit and outstanding requirements below; it does not resume gameplay implementation.

| Milestone                                                                           | Playable result                                | Current state                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [1. Project and integration](milestone-01-project-and-integration.md)               | One reliable canvas and authored fixture       | Complete for integration: reviewed changes committed; clean pinned-Yarn install and full CI pass. See [CI evidence](../reports/ci/2026-10-28/README.md).                                    |
| [2. Simulation foundation](milestone-02-simulation-foundation.md)                   | A world advances and pauses predictably        | Plain world/session, typed fixture command, detached views, 20 Hz clock and pause implemented and tested.                                                   |
| [3. Character and manual opening](milestone-03-character-and-manual-opening.md)     | Find scrap, field-research tools/recipes and use the Mini Fabricator | Movement, collision, picking and deposit data implemented. Onboarding, salvage, timed field research, recipe/device jobs and inventory pending. |
| [4. First local save](milestone-04-first-local-save.md)                             | Restore Mini Fabricator and field research in progress | Gameplay snapshots and restore unimplemented. Controls IndexedDB reload verified separately; old save dialog remains test data. |
| [5. Research](milestone-05-research.md)                                             | Expand the tree toward dedicated craftables and scalable labs | Not started. Bootstrap research is planned in Milestone 3; physical factory/lab integration follows in Milestone 6. |
| [6. First working machines](milestone-06-first-working-machines.md)                 | Manually supply renewable-powered recycling, fabrication and labs | Not started. Random recycler outputs, fabrication arity, extraction and full recovery are planned. |
| [7. Transport](milestone-07-transport.md)                                           | Automate direct supply and sort mixed recycler output | Not started. Trains and loading/unloading stations are later-game work. |
| [8. Restoration and energy choices](milestone-08-restoration-and-energy-choices.md) | Research greenhouses and demonstrate peaceful terraforming | Not started. Expanded weather/storage, optional coal and pollution mitigation remain planned. |
| [9. Save resilience](milestone-09-save-resilience.md)                               | Autosave, recover, and transfer progress       | Unvalidated test-data import/export scaffold only.                                                                                                          |
| [10. Portfolio prototype](milestone-10-portfolio-prototype.md)                      | Complete, understandable small-map demo        | Migration presentation, controls, production packaging and small-fixture profiling verified. Complete factory route and representative performance pending. |

Use the linked milestone files as the detailed checklists rather than duplicating their tasks here. Keep one small authored map, adding one useful system at a time. Start empty-handed; accounts, cloud sync, remote control, combat, and a large technology tree remain deferred.

## Detailed milestone plans

Milestones 2–3 received foundation work during migration. The 27 October design revision preserves that credit and moves the small timed field-research/recipe-unlock slice into Milestone 3, alongside onboarding, salvage and MiniFab crafting. The MiniFab is researched and assembled from scrap alone, presented beside inventory and always works without power; optional physical winding charges a local speed boost independently of factory electricity. Milestone 4 must save work, contributions, charge and distinct research/upgrade ownership. Milestone 5 expands the tree and lab rules; Milestone 6 integrates the renewable-powered placed factory, and Milestone 7 adds sorting and direct transport. Milestone 8 demonstrates researched greenhouse restoration without a fail state. No gameplay implementation is part of this documentation update.

Opening targets are improved-tool research in about a minute and first manually fed automatic crafting within 15–20 minutes for relaxed new players or under five minutes for experienced players. Base components remain useful downstream. MiniFab acquisition/form/baseline power are settled; [open decisions](../design/player-progression.md#decisions-to-settle-before-implementation) include recipe costs/durations, crank/charge balance, timed contribution rules, scrap-value accounting, recycler distribution and weather/restoration balance. Later MiniFab onboard solar/wind/coal, grid and inventory automation each need the related technology where applicable, separate MiniFab research and actual crafted upgrades. Grid waits for electricity; pure ores, trains and resource-configuration UI need explicit later slices.

## Current code layout

```text
scrapworks/
  scrapworks.bjseditor       One Editor project
  art/                   Blender projects, source artwork, references and provenance
  assets/                Authored scenes and export inputs
  public/scene/          Generated browser scenes and worlds/game.json (ignored)
  public/assets/         Existing browser-served runtime assets
  src/
    app/features/        Angular UI, controls, GameRuntimeService and plain GameSession
    contracts/           Lifecycle, input, WorldDefinition and detached WorldView
    game/                Babylon client, WorldScene, Toolkit scripts and entity views
    simulation/          Authoritative rules, PlayerMotor and plain world data
    core/                Framework-independent utilities
    scripts.ts           Generated presentation-script registry (ignored)
  docs/
    design/              GDD and TDD
    art/                 Visual design document
    plans/               Active roadmap and detailed checklists
    diagrams/            Mermaid sources and exported images


  tools/                 World compiler, export, Editor, art, diagram and cleanup utilities
```

Add simulation model/content/system modules as the next milestone needs them. Keep simulation, contracts, and core free of frameworks, renderers, storage, the DOM, and wall-clock reads. UI and scene adapters send commands and consume views; they do not own a second world.

Editor markers compile into a versioned plain `WorldDefinition` for initial layout. `Simulation` owns private mutable `WorldState`; `GameState` describes renderer lifecycle. `GameSession` owns the accumulator and sampled movement. Gameplay coordinates use metres on X/Z, with centimetres converted at the Editor/presentation boundary. No gameplay snapshot codec or SaveRepository exists yet.

## Suggested simulation schedule

The session dispatches ordered, active script tick handlers before each authoritative step. That step executes queued placement commands in order, advances sampled movement/collision through `PlayerMotor`, increments the tick and exposes a detached completed view. It uses 50 ms steps with at most five steps per frame; excess elapsed time is discarded, and pause/suspension clears the accumulator and input. Factory ECS systems will integrate at the session level, not through scene-script subscriptions. The longer factory schedule below remains a future recommendation to settle before Milestone 6 and verify with eventual saved-state continuation tests.

| Phase within one tick     | Responsibility                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Commands and movement  | Validate salvage, crafting/device targets, research contributions, recovery and placement in order; apply sampled movement with fixed delta time |
| 2. Transport              | Move existing items and water with destination reservations; production output from this tick waits until the next transport phase                    |
| 3. Production preparation | Establish eligible precursor/factory/lab jobs, reserve ingredients once, and calculate energy requests; retain any already-rolled recycler output |
| 4. Power                  | Generate energy, resolve storage and demand in stable order, and record actual fuel use and emissions                                                 |
| 5. Production work        | Advance player/Mini Fabricator/factory work and funded field/lab research; commit output/history or completed unlock once, respecting capacity |
| 6. Environment            | Consume available greenhouse water and update pollution and restoration; freshly supplied resources are used according to this documented phase order |
| 7. Time and objective     | Advance the simulation tick, saved daylight/weather/event state and peaceful terraforming checkpoint progress |
| 8. Publication            | Publish read-only views and supply any requested detached snapshot of the completed step                                                              |

Power allocation should be deterministic, such as ordering competing consumers by stable machine ID. Decide whether a generator burns a whole fuel item into stored energy or advances a fuel job over time, and save that progress. Decide when batteries charge relative to consumer allocation. Exact quantities remain balance values, but these accounting rules must be explicit.

## Acceptance route and focused checks

Perform this route at the end of each relevant milestone and for the completed prototype:

1.  Start from the agreed empty-handed bootstrap, complete movement onboarding and find scrap promptly.
2.  Field-research tools and basic recipes; research and manually assemble the MiniFab from scrap alone, without refined inputs or electricity.
3.  Request a stack-bounded final item with missing precursors from the inventory-side panel; let power-free crafting proceed while doing other work. Optionally wind the crank/right stick for speed, verify baseline continues after depletion and check the opening timing targets.
4.  Save during precursor work and field research, reload and complete each material payment, output and unlock once.
5.  Establish a coal-free solar/wind-powered recycler, fabricator and laboratory; verify faster shared research as labs scale.
6.  Add extraction, direct transport and sorting for random recycler output; verify machine recipe arity and full scrap recovery without material duplication.
7.  Save with pending random output, lab work, transit items, storage, weather and unfinished restoration; restore identical continued outcomes and random sequences.
8.  Research and construct greenhouses, then demonstrate the chosen small-map terraforming checkpoint through renewable variability without a fail state.
9.  Compare optional coal-heavy choices and later mitigation; research, green alternatives and recovery must stay reachable.
10. Load invalid snapshots and inject failed writes; preserve the current world and last good revision. Export/import and repeat continuation checks.

Focus automated tests on rule invariants, conservation, research atomicity, save round trips, and migrations. Use a small browser integration check for actual IndexedDB persistence and canvas lifecycle; an in-memory repository cannot establish that browser storage works. Keep visual polish checks manual until the presentation stabilizes.

## Additional implementation diagrams

The [class diagram](../design/TDD.md#core-class-diagram) and [application overview](../design/TDD.md#application-system-interaction-diagram) describe current boundaries and identify future branches. The dependency and fixed-step diagrams below show implemented migration behavior. Save, load, research and the [gameplay overview](../design/TDD.md#gameplay-system-interactions) remain future design.

### Module dependency diagram

Runtime arrows mean imports or interface dependencies. The Editor-to-compiler-to-definition arrows show the build-time authoring path. Simulation depends only on plain layout data and shared grid rules; it never imports the Editor or renderer. Future gameplay persistence will add a repository boundary separately.

[SVG image](../diagrams/module-dependencies.svg) / [PNG image](../diagrams/module-dependencies.png) / [Mermaid source](../diagrams/src/module-dependencies.mmd)

```mermaid
flowchart LR
    Angular[Angular components]
    Babylon[WorldScene core scripts and input adapter]
    Toolkit[Babylon Toolkit lifecycle without physics]
    Editor[Editor scenes and markers]
    Compiler[World definition compiler]
    Definition[Plain initial world definition]
    Application[GameRuntimeService and GameSession]
    Simulation[Simulation and plain PlayerMotor own world state]
    Grid[Plain grid and placement rules]
    Model[Plain commands, tick contracts and detached WorldView]
    Settings[Controls settings IndexedDB adapter]

    Editor -->|compile layout| Compiler
    Compiler -->|validates and emits| Definition
    Simulation -->|uses plain layout| Definition
    Angular -->|uses| Application
    Babylon -->|uses| Application
    Babylon -->|script lifecycle| Toolkit
    Application -->|runs| Simulation
    Angular -->|controls settings only| Settings
    Simulation -->|uses| Grid
    Simulation -->|uses| Model
    Babylon -->|reads and submits| Model
```

### Fixed step loop diagram

Only complete simulation steps publish authoritative world data. The session runs at 20 Hz with five-step catch-up using the existing browser frame source, independently of physics. Ordered script tick hooks run before simulation commands and movement. Presentation consumes detached completed views; placement confirmation queues work for a subsequent tick. Paused/suspended frames clear timing and input. Gameplay snapshot capture and factory jobs remain future work.

[SVG image](../diagrams/fixed-step-loop.svg) / [PNG image](../diagrams/fixed-step-loop.png) / [Mermaid source](../diagrams/src/fixed-step-loop.mmd)

```mermaid
flowchart TB
    Frame[Browser frame callback]
    Input[Sample one ActionFrame and dispatch UI actions]
    Controls[Validate ownership and interpret camera and player input]
    Paused{Session paused or runtime inactive?}
    Reset[Clear accumulator and held or queued input]
    Accumulate[Accumulate seconds capped at 0.25]
    Enough{At least 0.05 seconds and fewer than five steps?}
    Hooks[Dispatch ordered active gameplay tick handlers]
    Commands[Revalidate and execute typed placement commands in order]
    Movement[Advance movement and collision by 0.05 seconds]
    Time[Increment simulation tick]
    Deduct[Subtract 0.05 seconds and consume step budget]
    Publish[Expose detached completed WorldView]
    Present[Update player and entity views]
    Feedback[Camera follow, occlusion, picking and placement feedback]
    Render[Draw scene]
    Next[Request next browser frame]

    Frame -->|begin| Input
    Input -->|shared frame| Controls
    Controls -->|advance session once| Paused
    Paused -->|yes| Reset
    Reset -->|latest state| Publish
    Paused -->|no| Accumulate
    Accumulate -->|check| Enough
    Enough -->|yes| Hooks
    Hooks -->|before authoritative step| Commands
    Commands -->|then| Movement
    Movement -->|then| Time
    Time -->|then| Deduct
    Deduct -->|check again| Enough
    Enough -->|no| Publish
    Publish -->|completed state| Present
    Present -->|then| Feedback
    Feedback -->|queue confirmation for subsequent tick| Render
    Render -->|finish frame| Next
    Next -->|next callback| Frame
```

### Save flow diagram

Future design, not implemented. Capture will be synchronous at a safe boundary. The detached snapshot will be written asynchronously while gameplay may continue. An unsuccessful transaction must leave the last committed revision available.

[SVG image](../diagrams/save-flow.svg) / [PNG image](../diagrams/save-flow.png) / [Mermaid source](../diagrams/src/save-flow.mmd)

```mermaid
flowchart TB
    Request[Manual save or autosave request]
    Queue[Serialize operation for its bound slot and world]
    Capture[Capture detached completed-step state]
    Encode[Encode versioned snapshot and metadata]
    Write[Write snapshot, metadata and revision transaction]
    Commit{Transaction committed?}
    Success[Update last saved status and report success]
    Failure[Keep last successful revision and report failure]

    Request -->|enqueue| Queue
    Queue -->|safe boundary| Capture
    Capture -->|plain data| Encode
    Encode -->|asynchronous storage| Write
    Write -->|result| Commit
    Commit -->|yes| Success
    Commit -->|no| Failure
```

### Load flow diagram

Future design, not implemented. Load must pause gameplay and autosaves after earlier persistence work finishes. Failure must leave the old world intact. Success replaces the world only after a candidate has been fully validated and constructed. File import will use the same validation path before storing a new slot.

[SVG image](../diagrams/load-flow.svg) / [PNG image](../diagrams/load-flow.png) / [Mermaid source](../diagrams/src/load-flow.mmd)

```mermaid
flowchart TB
    Request[Request load and suspend new autosaves]
    Queue[Finish earlier persistence work and discard stale requests]
    Pause[Pause simulation and gameplay command input]
    Read[Read chosen snapshot]
    Version{Supported schema version?}
    Migrate[Migrate a copy through supported versions]
    Valid{Valid current state and content references?}
    Build[Construct candidate world separately]
    Ready{Candidate constructed successfully?}
    Swap[Replace world and bind slot; clear commands and reset clock]
    Publish[Rebuild published views and render data]
    Reject[Preserve current world and report rejection reason]
    Resume[Restore prior running or pause state and visibility rules]
    Result[Report load result and restore autosave policy]

    Request -->|serialize| Queue
    Queue -->|ready| Pause
    Pause -->|read| Read
    Read -->|snapshot available| Version
    Read -->|missing or read error| Reject
    Version -->|yes| Migrate
    Version -->|no| Reject
    Migrate -->|migration completed| Valid
    Migrate -->|migration error| Reject
    Valid -->|yes| Build
    Valid -->|no| Reject
    Build -->|result| Ready
    Ready -->|yes| Swap
    Ready -->|no| Reject
    Swap -->|committed session replacement| Publish
    Publish -->|ready| Resume
    Reject -->|unchanged session| Resume
    Resume -->|finish| Result
```

### Research transaction diagram

Future design, not implemented. Contribution checks use authoritative state at command execution, and each accepted payment/reservation commits synchronously. Timed field/lab work occurs on later simulation steps; funded work grants an unlock once at completion. Contribution granularity and worker coordination remain open design details. This replaces the earlier immediate pay-and-unlock diagram.

[SVG image](../diagrams/research-transaction.svg) / [PNG image](../diagrams/research-transaction.png) / [Mermaid source](../diagrams/src/research-transaction.mmd)

```mermaid
flowchart TB
    Command[Research contribution command executes]
    Known{Technology ID is valid?}
    Unlocked{Already unlocked?}
    Prerequisites{Prerequisite technologies unlocked?}
    Totals{Extraction or production eligibility met?}
    Demand{Unfunded requirement remains?}
    Stock{Authoritative source can pay contribution?}
    Commit[Commit contribution once; preserve histories]
    Work[Advance funded field and lab work on fixed steps]
    Complete{Funded work complete?}
    Unlock[Grant unlock once]
    Publish[Publish contribution and progress or unlock feedback]
    Reject[Reject with reason; leave stock and research unchanged]

    Command -->|validate| Known
    Known -->|yes| Unlocked
    Known -->|no| Reject
    Unlocked -->|yes| Reject
    Unlocked -->|no| Prerequisites
    Prerequisites -->|yes| Totals
    Prerequisites -->|no| Reject
    Totals -->|yes| Demand
    Totals -->|no| Reject
    Demand -->|yes| Stock
    Demand -->|no| Reject
    Stock -->|yes| Commit
    Stock -->|no| Reject
    Commit -->|subsequent simulation steps| Work
    Work -->|check progress| Complete
    Complete -->|yes| Unlock
    Complete -->|no| Publish
    Unlock -->|completed technology| Publish
```

## Phase 7 stopping point

Migration implementation is complete and its stopping point remains recorded by the [23 October evidence](../reports/migration/2026-10-23/README.md). The 27 October request authorizes saving progression decisions and updating milestones, not implementing their gameplay. Milestone 3's researched opening/Mini Fabricator and Milestone 4's gameplay saves remain unimplemented; the [progression specification](../design/player-progression.md) supersedes older gameplay ordering while preserving dated migration evidence.
