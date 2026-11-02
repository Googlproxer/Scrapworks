# Current-game benchmark

Run `node tools/game-bench/cli.ts` for correctness and a small smoke measurement, or add `--full` for an opt-in 2,000-step, 100,000-pile run. Use pinned Node/Yarn dependencies and installed Playwright Chromium. Run measurements without concurrent builds or tests for performance interpretation.

The five version-2 workloads are idle piles, salvage/research, handcraft, MiniFab, and a bounded 64-command pickup/removal burst. Fixtures are detached, validated captures of actual production entity shapes. Capture construction, initialization, verification and final capture are outside timed regions. Inline and worker controls use the same production session, runtime and codec; every case checks identical captured continuation and complete command outcomes.

`tmp/current-game-bench/result.json` records source hashes, revision, Node/browser/OS/hardware, workload configuration and measurements. Each sample includes dispatch, delivery and host cache application through settled completion. These are end-to-end smoke measurements, not isolated compute budgets or rendered-frame qualification. Smoke results can include cold/JIT effects and coarse timer resolution. Full historical qualification matrices remain separate and opt-in.

The retired synthetic production harness is recoverable at Git revision `1695131` under `tools/simulation-worker-bench/production-*.ts`. Its reports remain unchanged under `docs/reports/ecs-worker-implementation/`. The standalone synthetic comparison remains under `tools/simulation-worker-bench`; its `--production` option now reports the current-game command. Different workloads and timing boundaries must not be compared as before/after performance improvements.
