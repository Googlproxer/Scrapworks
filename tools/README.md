# Development and maintenance tools

Run these commands from the repository root after `yarn install --immutable`. Package scripts cover routine development, tests and main CI. Occasional diagnostics and investigations use their Node entry points directly; removing a package alias does not remove the tool.

## TypeScript tooling

Repository tool implementations and Node tooling tests use TypeScript. Node 24.21.0 executes the `.ts` entry points directly; no emitted JavaScript or build step is needed. The benchmark CLI supplies `--experimental-transform-types` when loading adapters that use parameter properties; include that flag when running benchmark test files directly. Run `yarn test:lint` to strictly typecheck all tools, the ESLint configuration and its rules, then run the lint-rule tests. This extends the existing CI check; it does not execute benchmarks. The benchmark projects also retain their separate TypeScript configurations.

Prefer TypeScript for future tools, as recorded in [AGENTS.md](../AGENTS.md). Update imports, subprocess paths, package scripts, workflows and documentation when renaming an entry point. Native Node source tests use the [repository resolver](world/register-typescript.ts) for application aliases; browser entry points continue through Angular or Vite.

Under `tools/`, two JavaScript compatibility loaders remain: `editor-mcp/index.cjs` exposes the Editor's required CommonJS plugin entry using the pinned `jiti` dependency, and `editor-mcp/run-server.mjs` forwards the existing local MCP configuration to `run-server.ts`. They contain no tool implementation. The Editor's own bundled `index.mjs` is an external dependency and keeps its original filename. Python tools remain Python where they depend on Blender, Matplotlib or Python archive tooling.

The TypeScript migration on 1 November 2026 also renamed the manual browser probes, benchmark/report drivers and diagram renderer. Use the `.ts` commands in current guides. Dated raw manifests, results and report-specific evidence scripts retain their recorded filenames and source hashes; reproduce those with their recorded Git revision.

## Occasional diagnostics

| Purpose | Direct command | Prerequisites and output |
| --- | --- | --- |
| Check the live Babylon.js Editor connection | `node tools/editor-mcp/check.ts` | Open the project in the desktop Editor with its bridge enabled. Initializes MCP and reads the active scene; prints the result. See [Editor/MCP setup](../docs/plans/babylon-editor-setup.md). |
| Inventory source, exported and built assets | `node tools/scenes/inventory.ts --output tmp/asset-audit/latest.json` | Run `yarn scenes:export` first; run `yarn build` if built-output figures are needed. Writes file sizes, hashes, manifest usage and duplicates to the ignored JSON report. |
| Audit repository tracking and generated ignores | `node tools/cleanup/audit-repository.ts --output tmp/cleanup/repository.json` | Requires the Git checkout. Reads tracking/ignore state, reports untracked sources and writes ignored JSON; does not stage, commit or delete files. See [cleanup tools](cleanup/README.md) for the stricter opt-in `--require-tracked` check. |

The Editor check also accepts `--list` to show tool definitions, or a tool name followed by JSON arguments. Check [the setup guide](../docs/plans/babylon-editor-setup.md) before using live scene tools.

## ECS and worker investigations

Use **Node 24.21.0**, the pinned Yarn install and Playwright's matching Chromium (`yarn test:setup`). These are opt-in experiments: normal CI runs no benchmark commands. Full measurements can take hours; keep them sequential and separate hosted-runner results from reference-desktop evidence. Reporting charts use the Python dependencies and environment options described in the laboratory guides.

| Former package script | Direct replacement |
| --- | --- |
| `bench:ecs:check` | `node tools/ecs-bench/cli.ts check` |
| `bench:ecs:smoke` | `node tools/ecs-bench/cli.ts smoke` |
| `bench:ecs:node` | `node tools/ecs-bench/cli.ts node` |
| `bench:ecs:browser` | `node tools/ecs-bench/cli.ts browser` |
| `bench:ecs:full` | `node tools/ecs-bench/cli.ts full` |
| `bench:ecs:report` | `node tools/ecs-bench/cli.ts report` |
| `bench:worker:check` | `node tools/simulation-worker-bench/cli.ts check` |
| `bench:worker:smoke` | `node tools/simulation-worker-bench/cli.ts smoke` |
| `bench:worker:browser` | `node tools/simulation-worker-bench/cli.ts browser` |
| `bench:worker:report` | `node tools/simulation-worker-bench/cli.ts report` |

Append the same options previously passed to the package alias. `check` runs correctness checks; `smoke` adds small trials and does not qualify performance. ECS `node`/`browser` run one environment, while `full` includes both and the diagnostics. Worker `browser` runs the selected comparison or production qualification. `report` reads saved results without repeating measurements.

For the selected production runtime, use:

```sh
node tools/simulation-worker-bench/cli.ts smoke --production --presentation lean --phase lean --paced
node tools/simulation-worker-bench/cli.ts browser --production --presentation lean --phase lean --output tmp/simulation-worker-bench/<run>
node tools/simulation-worker-bench/cli.ts report --input tmp/simulation-worker-bench/<run> --destination docs/reports/simulation-worker/<date>
```

See the [ECS laboratory](ecs-bench/README.md) and [simulation-worker laboratory](simulation-worker-bench/README.md) for complete flags, reproducibility requirements, raw artifacts, profiles and report commands. Both CLIs support `--help` without starting an experiment. The [ECS investigation workflow](../.github/workflows/ecs-bench.yml) and [worker qualification workflow](../.github/workflows/simulation-worker-bench.yml) invoke these entry points directly and run only on manual dispatch.

## Alias removal and historical reports

The aliases above, plus `assets:audit`, `cleanup:audit` and `editor:mcp:check`, were removed from `package.json` on 1 November 2026. Dated reports preserve the commands and manifests used at their recorded revisions. On the current checkout, replace an old alias with its direct command above and retain its arguments; use the recorded source revision when reproducing an exact historical measurement.

## Production checks

The production dependency audit, `node tools/ecs-bench/verify-production.ts`, inspects build metadata rather than running benchmarks. Main CI retains this audit, the world/session tests and `node tools/world/production-browser.ts` for real built-worker acceptance. The [root development commands](../README.md#development-commands) list the remaining package scripts.
