# Scrapworks documentation

Updated 4 October 2026.

Scrapworks is a web portfolio game about building an automated factory to restore a dead planet. Its design is maintained in three documents:

- [Game Design Document](design/GDD.md): gameplay, progression, research, environmental trade-offs, controls, and prototype scope.
- [Technical Design Document](design/TDD.md): technology recommendations, class and system interaction diagrams, state ownership, simulation timing, and save and load design.
- [Art Document](art/README.md): visual style, world and machinery progression, character readability, and sprite specifications.

Each document distinguishes agreed decisions from proposals that remain open for discussion.

## Current implementation

The Angular–Phaser integration is complete: a routed game page owns a scoped runtime and a component-owned canvas, the RxJS client reports lifecycle state, and Play Game switches to the current placeholder scene. The latest application suite passes 24 tests; normal lint and the production build pass.

Milestone 1 remains partially complete. The representative grid scene, verified Dexie reload experiment, custom formatter checks, and dependency commit are still open. Simulation, manual gameplay, research, automation, and resilient saves are not complete.

## Repository organisation

- `design/`: gameplay and technical design.
- `plans/`: the roadmap and detailed milestone progress.
- `art/`: art direction, concept samples, exact generation prompts, and preparation records.
- `diagrams/`: rendered diagrams, with Mermaid sources under `diagrams/src/`.
- [Diagram renderer](../tools/diagrams/render-diagrams.cjs): the optional diagram-generation tool.

Runtime images are kept in [public/assets](../public/assets/); source samples and generation records are documentation assets. All these paths are relative to the repository, including references inside art metadata.

Follow the [Implementation Plan](plans/README.md) for ordered milestones, completion checks, a suggested module layout, and detailed diagrams for the game loop, persistence, and research.

The [Tiled world integration plan](plans/tiled-world-integration.md) covers map authoring, exports, coordinate conversion, scene rendering, and the boundary with simulation state and saves.
