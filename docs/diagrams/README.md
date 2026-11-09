# Scrapworks diagrams

Updated 9 November 2026. The core class and application diagrams include the implemented opening, factory, transport and environment systems, versioned catalogue, shared field/lab research and detached projections on the single worker. Movement/input ownership is distinct from simulation activity while the field kit is focused. Module/frame diagrams include water/energy dispatch, actual-work settlement and lower-cadence health. Mermaid blocks remain authoritative and their matching source/SVG/PNG artifacts are regenerated together.

The [technical design](../design/TDD.md) and [implementation roadmap](../plans/README.md) contain the editable Mermaid blocks. Standalone sources are under [src/](src/), and matching SVG and PNG files are stored in this folder for GitHub preview and export.

The save diagrams describe implemented Milestone 4 behavior with the current exact authored-map gate. The research transaction diagram includes Milestone 5's shared queue/head, retained ledgers, source-local paced payment and next-step advancement. The technical class/application diagrams include FactorySystem, machine buffers/jobs/history, powered labs and M8 water/health/weather/energy state on the same worker. Current acceptance is recorded in the milestone plans.

## Regeneration

The optional [renderer](../../tools/diagrams/render-diagrams.ts) supports the Mermaid subset used by these documents. Provide an absolute `node_modules` directory containing `@viz-js/viz` and `sharp`; these are diagram-tool dependencies, not required application dependencies.

From the repository root:

```sh
node tools/diagrams/render-diagrams.ts /absolute/path/to/node_modules
node tools/diagrams/render-diagrams.ts /absolute/path/to/node_modules --implementation
```

The first command renders the three technical-design diagrams. The second renders the five roadmap diagrams. Both update `docs/diagrams/src/*.mmd`, `docs/diagrams/*.svg`, and `docs/diagrams/*.png`. The script resolves its document and output paths from its own location, so it does not rely on documents outside the repository.
