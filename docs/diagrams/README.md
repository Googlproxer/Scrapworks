# Scrapworks diagrams

The [technical design](../design/TDD.md) and [implementation roadmap](../plans/README.md) contain the editable Mermaid blocks. Standalone sources are under [src/](src/), and matching SVG and PNG files are stored in this folder for GitHub preview and export.

These diagrams describe the planned complete gameplay architecture. They do not imply that every system or class is implemented; current progress is recorded in the milestone plans.

## Regeneration

The optional [renderer](../../tools/diagrams/render-diagrams.cjs) supports the Mermaid subset used by these documents. Provide an absolute `node_modules` directory containing `@viz-js/viz` and `sharp`; these are diagram-tool dependencies, not required application dependencies.

From the repository root:

```sh
node tools/diagrams/render-diagrams.cjs /absolute/path/to/node_modules
node tools/diagrams/render-diagrams.cjs /absolute/path/to/node_modules --implementation
```

The first command renders the three technical-design diagrams. The second renders the five roadmap diagrams. Both update `docs/diagrams/src/*.mmd`, `docs/diagrams/*.svg`, and `docs/diagrams/*.png`. The script resolves its document and output paths from its own location, so it does not rely on documents outside the repository.
