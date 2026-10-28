# Scrapworks diagrams

Updated 27 October 2026. The gameplay/research diagrams now describe planned Mini Fabricator production, extraction, sorting, solid recovery as scrap/source ores, with liquid loss, renewable-first power and timed field/lab research. The system-interaction diagram marks planned opening/factory ECS from Milestone 3. The core class/frame diagrams retain implemented `WorldScene`, Toolkit, session and `PlayerMotor` ownership. Editor-marker compilation and plain WorldDefinition/WorldState remain the movement fixture's state boundary; GameState is a separate renderer lifecycle contract.

The [technical design](../design/TDD.md) and [implementation roadmap](../plans/README.md) contain the editable Mermaid blocks. Standalone sources are under [src/](src/), and matching SVG and PNG files are stored in this folder for GitHub preview and export.

The factory, save and research diagrams remain future design; they do not imply those systems are implemented. Current acceptance and remaining work are recorded in the migration and milestone plans.

## Regeneration

The optional [renderer](../../tools/diagrams/render-diagrams.cjs) supports the Mermaid subset used by these documents. Provide an absolute `node_modules` directory containing `@viz-js/viz` and `sharp`; these are diagram-tool dependencies, not required application dependencies.

From the repository root:

```sh
node tools/diagrams/render-diagrams.cjs /absolute/path/to/node_modules
node tools/diagrams/render-diagrams.cjs /absolute/path/to/node_modules --implementation
```

The first command renders the three technical-design diagrams. The second renders the five roadmap diagrams. Both update `docs/diagrams/src/*.mmd`, `docs/diagrams/*.svg`, and `docs/diagrams/*.png`. The script resolves its document and output paths from its own location, so it does not rely on documents outside the repository.
