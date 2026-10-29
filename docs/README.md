# Scrapworks documentation

Updated 29 October 2026. Scrapworks is a browser-first 3D factory-restoration game. Angular owns the interface, Babylon.js owns presentation, Babylon.js Editor owns authored scenes/layout, and plain TypeScript owns world state, movement and placement rules. Factory progression and gameplay saves remain planned.

## Design and planning

- [Game Design Document](design/GDD.md): opening, progression, environmental choices and prototype scope.
- [Player progression](design/player-progression.md): agreed decisions, pacing, Mini Fabricator, research, recovery and open questions.
- [Opening catalogue](design/opening-catalogue.md): agreed crafting/research order and UI-bound safe handcrafting, with provisional costs/timings and a checked bootstrap budget.
- [Fibery catalogue and trees](design/balance/README.md): connected databases, entity-linked crafting/research whiteboards and import receipt.
- [Implementation roadmap](plans/README.md): ten milestones with verified groundwork and outstanding gameplay tasks.
- [Fibery project tracking](plans/fibery-tracking.md): working task board, milestone hierarchy and current design decisions.
- [Art Document](art/README.md): approved finish, identity, readability and 3D production guidance.
- [Source art](../art/README.md): editable Blender sources, references, exact prompts and provenance.

## Implementation and authoring

- [Technical Design Document](design/TDD.md): ownership, current implementation and planned systems.
- [3D migration](plans/3d-migration.md) and [acceptance checklist](plans/3d-implementation-checklist.md): completed migration scope and evidence.
- [Runtime walkthrough](plans/3d-phase-2-walkthrough.md): lifecycle, input, Toolkit scripts and session ownership.
- [Editor/MCP setup](plans/babylon-editor-setup.md): authoring, export and desktop tools.
- [World markers](../tools/world/README.md): authored metadata, units and compilation.
- [Export tools and policy](../tools/scenes/README.md): source boundaries, manifest-driven packaging and recovery.
- [Diagrams](diagrams/README.md): authoritative Mermaid sources and matching SVG/PNG exports.
- [Cleanup record](plans/3d-cleanup.md): current retirement policy and recovery sources.

## Verified implementation

Babylon is the sole renderer at `/`; `/3d` redirects to it. Angular owns menus, Controls, loading/errors and Retry. The Game scene supplies a 10 by 10 fixture, world markers, camera and neutral character binding. The plain simulation owns fixed-step movement, collision and development-fixture placement; new worlds have empty inventory, equipment and research.

Saved markers compile to plain world definitions and publish atomically with scene exports. `yarn dev` watches saved authoring inputs and retains the last working export on failure. Toolkit scripts present state and feed the existing session scheduler. ECS selection/foundation is now the first Milestone 3 work package, before new core-loop systems; Milestone 6 extends that same runtime for factories. The [29 October ECS investigation](reports/ecs/2026-10-29/README.md) selects Miniplex 2.0.0 after the [isolated laboratory](../tools/ecs-bench/README.md) comparison. All four candidates remain development-only dependencies; production Simulation still uses its existing plain state scaffold and the remaining foundation is pending.

The [23 October migration evidence](reports/migration/2026-10-23/README.md), its refinements and [authoring workflow validation](reports/workflow/2026-10-23/README.md) record dated results. The [28 October cleanup](plans/3d-cleanup.md) retires superseded tools and assets. Controls IndexedDB persistence and the test-data save dialog do not establish gameplay saves. Manual salvage, crafting, research, machines, transport and restoration remain unimplemented. The migration stopped after Phase 7 as requested; planning work does not resume gameplay implementation.
