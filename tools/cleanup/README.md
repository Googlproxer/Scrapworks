# Cleanup tools

These tools preserve authoring work and check documentation. They use Python's standard library and Node's built-in modules; they do not add application dependencies.

## Audit source tracking and generated ignores

```sh
yarn cleanup:audit
node tools/cleanup/audit-repository.mjs --output tmp/cleanup/repository.json
node tools/cleanup/audit-repository.mjs --require-tracked
```

The audit reads Git with optional index locks disabled and verifies that HEAD/index hashes stay unchanged. It checks authored art, Editor assets, application sources, tools, docs and root configuration for accidental ignores, and checks that generated outputs/caches are ignored and absent from the index. It prints counts and writes detailed source paths when `--output` is supplied.

Untracked inputs are listed for review without making the ordinary audit fail. `--require-tracked` also fails when authored sources/tools/docs are untracked, so it is a deliberate post-review gate. The tool never stages, commits or deletes files. It does not establish clean dependency installation, asset licence rights or successful runtime cutover; use the [user checklist](../../docs/plans/3d-implementation-checklist.md) for those remaining steps.

## Preserve a worktree

Run from the repository root, choosing a new destination outside the source repository:

```sh
python tools/cleanup/checkpoint.py create ../_checkpoints/scrapworks/my-checkpoint
python tools/cleanup/checkpoint.py verify ../_checkpoints/scrapworks/my-checkpoint
```

The checkpoint contains all existing tracked and non-ignored untracked files, SHA-256 checksums, deleted-path records, staged and working-tree patches, and a Git history bundle. It leaves HEAD, the index, and the working tree in place. Ignored dependencies, generated exports, caches, browser storage, and unsaved Editor changes are excluded. Save authoring work in the Editor before creating a future checkpoint.

The archive is verified after creation. `RESTORE.txt` explains restoration into a new checkout; restore there before considering changes to the active repository. See the [current cleanup recovery record](../../docs/plans/3d-cleanup.md#recovery) for previously retired sources.

## Check documentation

```sh
node tools/cleanup/check-docs.mjs

```

The checker includes repository documentation and all `art/` and `tools/` Markdown. It validates local Markdown links and heading anchors and compares eight standalone Mermaid sources with the authoritative blocks in the TDD and roadmap. Fenced examples are excluded from link scanning.

After changing diagrams, run both commands in [the diagram regeneration guide](../../docs/diagrams/README.md), inspect the images, and rerun the checker. The checker does not fetch external URLs or prove that a documented feature is implemented.
