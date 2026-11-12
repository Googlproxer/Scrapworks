# Local split-physics-worker experiment

The controlling protocol is [the experiment plan](../../docs/plans/split-physics-worker-experiment.md). The current execution record is [the follow-up](../../docs/plans/split-physics-worker-execution.md). **The user released the complete local experiment on 11 November 2026.** Preparation remains separate from execution. No browser, replay, sweep, timing run, soak or lifecycle loop is started by preparation.

Execution concluded on 12 November 2026 with a [retain-B0 decision](../../docs/decisions/split-physics-worker-experiment.md). The [local report and complete evidence index](../../docs/reports/split-physics-worker/2026-11-11/README.md) distinguish executed coverage from failed/incomplete/unavailable qualification. Neither prototype adoption nor production migration follows from these tools.

## Archived branch and local evidence

The experiment is preserved on `codex/split-physics-worker`. Git contains the tools, focused tests, execution record and durable decision. Reports, builds, temporary projects and installed dependencies remain ignored and local; pushing this branch does not upload them. Keep `docs/reports/split-physics-worker/2026-11-10/`, `docs/reports/split-physics-worker/2026-11-11/`, `dist/physics-worker-bench/` and `tmp/physics-worker-bench/` for the completed experiment's receipts/artifacts. A fresh checkout cannot analyze missing raw traces or infer their results.

Run `node tools/physics-worker-bench/verify-artifacts.ts` to verify retained artifacts without starting a server or a measurement. It allows descendant tooling/documentation commits, checks production against the frozen base rather than current HEAD, and retains protocol/producer/build/helper hash checks. `--live` additionally requires the owned loopback suite host. `prepare` intentionally still requires an explicitly matching reference/setup receipt; it does not silently establish a new baseline from a later commit. Original held-state preparation receipts and the protocol's hold text are historical; the user release and completed stage results are recorded separately under the execution directory.

All code executes on this PC. The entry points reject CI environment markers. Nothing in this directory is added to GitHub Actions, hosted jobs or scheduled execution. Node 26 and the repository's pinned Yarn/dependencies are used.

## Preparation

```powershell
node tools/physics-worker-bench/cli.ts prepare
node tools/physics-worker-bench/cli.ts status
node --test tools/physics-worker-bench/preparation.test.ts
node node_modules/typescript/bin/tsc -p tools/tsconfig.json
```

`prepare` validates every hash in the already frozen uninstrumented B0 receipt before copying source. It creates isolated projects under ignored `tmp/physics-worker-bench/<id>/`, then builds production-optimized B0, B1 and C1 under ignored `dist/physics-worker-bench/<id>/`. They share read-only public assets and installed dependencies through junctions. Source, generated overlays, Angular caches and build outputs remain separate. Windows sandboxing can require approval for the junction creation. Normal application code, authored scenes and the original frozen B0 build are not edited.

The overlays are deliberately tied to the frozen source using exact, counted anchors. A source mismatch fails preparation; it must never silently choose a new timing boundary. Files in `tools/physics-worker-bench` and every prepared artifact are hashed in the receipts. Changes to the probe/protocol/overlays require rebuilding and recording a new preparation before any comparison.

## Variants and transport

- B0 preserves the original tick/controller architecture and adds bounded diagnostic observations only. The original uninstrumented B0 artifact remains available for overhead comparison.
- B1 extracts generator phases around the physics movement boundary. Both phases remain synchronous in one worker, with the same normalization, command order, Rapier steps and post-movement work.
- C1 awaits physics between those same synchronous phases. One simulation worker owns one native physics worker through a direct MessageChannel. There is at most one physics request outstanding. Ordered collider deltas, movement and changed poses cross the boundary; the ECS world does not.

Requests and replies identify protocol, generation, completed logical tick, substep target and collider revision. Tick N represents exactly 3N native substeps. Structural changes after movement use an additional **non-stepping flush only when such edits exist**, acknowledged before tick publication. This is an explicit implementation detail to measure: it preserves the original post-movement collider boundary without adding another physics step. Capture requests obtain the native snapshot before constructing the gameplay capture. Worker handlers serialize operations; failed candidate preparation disposes its pair before authority replacement. None of these claims is qualified until replay and lifecycle testing passes.

The physics worker installs its bootstrap listener before asynchronously loading Rapier. Native worker bootstrap/fatal boundaries and pre-application input diagnostics use native callbacks; other message ownership uses RxJS subscriptions and releases them before port/worker disposal. Deterministic calculations remain synchronous and free of clocks/RxJS. Probe timings live outside deterministic calculations in the isolated overlays.

## Acquisition command, only after user release

```powershell
node tools/physics-worker-bench/cli.ts probes --start-authorized --variant B0 --browser chromium --device keyboard
```

Options include `--browser firefox`, `--device synthetic-gamepad`, `--variant B1|C1`, `--runs 5`, `--cycles 200`, `--seed 20261110`, `--hold-ms 600`, and diagnostic-only `--headless`. Defaults are five fresh browser processes, 15 seconds of warm-up per run, and 200 start/reverse/release cycles per run. The command uses a loopback-only server and temporary browser contexts; it never accesses the user's browser profile or gameplay saves. Sources are inspected for controls when the document loads. No remote site is used.

This command is **one acquisition primitive**, not an assertion that the full experiment is complete. Its opening-course samples are unqualified until the causal detector, course clearance, timing resolution, instrumentation overhead, arrival-phase coverage, actual display mode, sample accounting and comparison protocol have been validated. Candidate ranking remains gated on B1/C1 correctness. It does not replace the required generated matrix, 10,000-tick continuation check, autosave/capture checks, faults, 30-minute soaks or 100 lifecycle cycles. Those stages remain in the execution checklist and must be implemented/executed in their prescribed order after release; do not stop after a successful first-stage run.

The TypeScript Playwright runner follows the repository's language requirement and reuses its existing browser stack. Headed runs are required for the actual LG C2/display qualification; headless runs are diagnostics. No browser is launched until an explicit run entry point is invoked with the user release flag. The flag is not permission to override the user's hold.

## Evidence and limits

Preparation receipts stay under ignored `docs/reports/split-physics-worker/2026-11-10/`; actual execution traces/results use `2026-11-11/`. The protocol records the USB keyboard, USB DualSense and 4K/120 Hz LG C2 supplied by the user. Actual mode, browser viewport/cadence, driver and connection details are recorded during execution. A 120 Hz baseline has its own frame assessment; emulating 60 Hz does not qualify a physical 60 Hz run.

Keyboard observation occurs in a pre-application capture listener. Synthetic DualSense samples are returned through `navigator.getGamepads`, so Babylon DeviceSourceManager, bindings, action evaluation and controller polling still run. Synthetic sampling does not establish physical controller timing. Main-thread input and submitted-frame timestamps define software latency. Worker-local clocks are retained for diagnosis and are never directly subtracted from main-thread clocks.

The bounded trace ring counts overflows; any overflow invalidates a run. The detector requires a matching accepted input/publication generation and a submitted render. Release requires retrospective stationary confirmation. Every armed attempt, including interrupted and right-censored attempts, remains in the result. Its current free-space detector does not qualify contact/platform probes; those require the specified support-relative detector and image/frame validation before their results can pass.

Physical input-to-photon timing and the human A/B check are explicitly unavailable at the user's direction. Other hardware is outside the single-device execution scope. Neither can be represented by synthetic samples, RAF timings or a passing automated route. A final decision must retain these limits and all failed/incomplete strata.

## Bundled-browser execution

`node tools/physics-worker-bench/suite-host.ts` starts a loopback-only owned test server on port 4319. Open its pages through the bundled browser. `/schedule?kind=baseline|latency|validation|supplement|overhead` configures a reviewable local queue; its Start link begins execution. `/task?name=correctness|ordering|matrix|isolation|faults|lifecycle|soak` selects a worker stage; return to `/` and press Start. Soak defaults to 1,800 seconds per architecture. These are application-owned diagnostic pages, separate from the user's game and saves. Every rendered job gets its own test-only IndexedDB namespace.

The primary bundled-browser schedule uses fresh documents/worlds/workers, not fresh browser processes. This is an explicit deviation from the fresh-process qualification protocol. `headless-schedule.ts --start-authorized --firefox` executes an already configured queue with a fresh headless process per job as a separate local diagnostic; it never controls external browser UI. Headless renderers cannot replace headed display or physical-input evidence. Do not run it concurrently with other measurements.

The scale screen uses 76 S/P specifications, three repetitions and the same accepted stream in B0/B1/C1. Complete capture hashes are compared outside timed spans. Fixture generation preserves the original native timeline before applying prepared edits, and never weakens game validators. Renewable factory fixtures keep research/transport/power workloads visible; counts before/after expose finite research and stock depletion. Native-only and frozen-physics simulation controls are labelled attribution diagnostics, not coherent game or save continuations.

`node tools/physics-worker-bench/analyze.ts` processes completed raw receipts after measurements. It retains failed probes, phase bins and stage distributions, and computes paired run/block quantile confidence bounds. It never promotes insufficient, blocked, software-rendered or physically unobserved evidence into a qualification pass.

Postprocessing commands, only after acquisition is idle:

```powershell
node tools/physics-worker-bench/analyze.ts
node tools/physics-worker-bench/analyze-controls.ts
node tools/physics-worker-bench/audit-probe-failures.ts
node tools/physics-worker-bench/diagnose-startup.ts
node tools/physics-worker-bench/finalize-evidence.ts
```

The confidence analysis can take tens of minutes. `finalize-evidence` writes full latency/confidence tables, tabulated compute scaling curves, phase/stage/companion summaries, exact whole-soak deadlines and labelled pressure/reconnect results. `audit-probe-failures` reports main-clock capture/hold coincidence and first corridor crossings without removing failures. `diagnose-startup` applies the unchanged production codec to fixture seeds and validator-only final-capture envelopes; those envelopes are not actual saves. `prepare-replays.ts` uses each job's own exported initial manual seed and actual committed autosave, records missing-save strata, and prepares accepted logical streams for the browser `accepted` task. A native-only restore is a narrower check than application save loading.

The three post-acquisition `control=reconnect-only` jobs use explicit disconnect/reconnect/neutral/fresh markers; they are semantic diagnostics and never enter the primary quantile comparisons. Original six-condition-cohort traces and frozen primary helpers remain unchanged. No command implicitly launches CI or an external browser UI.
