# Local preload diagnostics

Build production with stats before running these tools. Both browser commands reject CI; they use temporary browser contexts and do not touch a personal browser profile. Install the repository's Chromium and Firefox Playwright browsers first.

```sh
yarn build:prod:stats
node tools/preload/check.ts
node tools/preload/run.ts --output docs/reports/data-preloading/YYYY-MM-DD/candidate.json
node tools/preload/analyse.ts docs/reports/data-preloading/YYYY-MM-DD/baseline.json docs/reports/data-preloading/YYYY-MM-DD/candidate.json
```

`check.ts` verifies pending/ready menu accessibility and stable button positions at 320×240 and 1440×900, all three New Game/Continue/Resume menu actions, keyboard selection, worker adoption, byte reuse, no menu world requests, background-download recovery, and invalid-byte eviction/Retry with a retained healthy session. Save setup uses the normal gameplay viewport before returning to each menu size. Screenshots go under the current UTC date in ignored `docs/reports/data-preloading/`.

`run.ts` defaults to Chromium and Firefox, five repetitions and 0/1/3/10 second menu dwells. Options: `--browser chromium|firefox|all`, `--repetitions N`, `--dwells 0,1000,3000,10000`, `--directory <browser output>`, `--headed`. Each cohort starts a fresh context, starts New Game, creates a manual save through the UI, reloads, and selects Continue using that context's browser cache. Saves are discarded with the context. There is no gameplay progression route or accelerated clock.

The measurement starts at the captured DOM click event and ends when gameplay UI exists, the loading cover is gone and the viewport is focused after the game's first frame. Automation actionability time is excluded. This is software readiness, not physical input-to-photon latency. Resource timings, worker counts, adopted worker identity, page errors and supported long-task observations are included. Nested worker fetches and native/GPU memory are not comprehensively observed. The static preview uses Brotli and `no-cache` assets with `no-store` HTML; Continue is a revalidating warm-cache cohort, not a separately measured no-store deployment.

Freeze a baseline build and retain its stats fingerprint before changing runtime code. Run candidate timings without builds or other test processes competing for resources. Inspect per-browser/cohort distributions and menu timing; do not sum overlapping stages. The preloading implementation record and limits are in [the plan](../../docs/plans/game-data-preloading.md).
