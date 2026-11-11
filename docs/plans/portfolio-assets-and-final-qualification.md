# Portfolio assets and final qualification

Created 10 November 2026 after the user split the asset audit out of the [Milestone 10 delivery plan](milestone-10-portfolio-prototype.md). Updated 12 November: **Step A audited; selected world-art work and final qualification pending**. This is a separate work plan within M10's existing scope, not a new numbered milestone. The user's later human pacing playtest remains deferred.

The existing Fibery **M10.1** task owns this follow-up and retains Source ID `milestone.10.step.01.open`. Its dependency is **M10.7**, the current-asset local handoff. M10.4 owns the earlier current-asset performance baseline and portable test; it must not wait for this asset work. M10 remains incomplete until this follow-up supplies final asset-dependent qualification and refreshes the delivered artifact/material.

## Entry conditions and baseline

- M10.2–M10.7 have delivered onboarding, real-time balancing, current-asset baseline/test tooling, functional production verification, gameplay acceptance and a provisional local handoff.
- The M10.4 baseline identifies its source revision/dirty state, exported asset hashes, browser/version, OS/CPU/GPU where available, viewport/DPR, renderer settings, workload counts, seed, warmups/repetitions, thresholds and unsupported metrics. Retain the exact commands, fixture/checkpoint identity and representative scene screenshots.
- Record representative rendering/frame and input timing, simulation/publication/host work, memory where observable, raw/Brotli assets and cold/warm loading, actual save commits and complete load-to-playable costs. Existing M8/M9 phase profiles are historical context; they do not substitute for this current-asset renderer baseline.
- Keep detailed baseline/final results local and untracked under `docs/reports/`; keep durable methodology, summaries and limitations in tracked documents. Baseline results and gate failures must be reported honestly. Creating this plan records the requirement, not new measurements.

## Step A Audit and choose asset work

- [x] Audit normal-camera views of damaged/restored terrain, water/vegetation, every available machine, transport/ports and the protagonist; compare them with the [approved flat finish](../art/README.md#preferred-finish-across-all-artwork).
- [x] Record a keep/polish/replace decision per asset or coherent group, with screenshots, readability issues, expected benefit and source/licence/provenance. Select concrete replacements from this audit before model work; wholesale replacement is not assumed.
- [x] Preserve the complete protagonist mesh and existing identity/scale; polygon optimisation remains with the user. Identify required action clips only where a demonstrated demo interaction needs them.

The [12 November asset decisions](../art/runtime-asset-decisions.md) record all 19 placeable kinds and coherent environment/character/UI groups; the [detailed evidence and gallery](../reports/asset-audit/2026-11-11/README.md) stay local. Selected world replacements are deposit/blocker placeholders, crossed-plane vegetation and the greenhouse shell; other machine silhouettes are retained for polish. The subsequently approved gear-and-leaf favicon is now applied with retained provenance. No new action clip is required. The user explicitly requested discarding the old backdrop during the audit, so its original replacement and provenance are delivered, along with Meshy/Mixamo asset credits and included distribution notices. The remaining world assets, narrow-view readability and final performance/artifact work below are not complete. Fibery scope was read; its external task state was not changed.

## Step B Deliver the selected presentation work

- [ ] Prepare selected runtime models/exports with editable sources, pivots, ground alignment, material/lighting consistency and logical-footprint/port alignment. Keep sources/references/provenance under root `art/` and preserve complete active Editor scene directories.
- [ ] Keep protagonist, selected objects, construction footprints, facing ports and blocked transport readable across damaged/restored terrain, normal camera rotations/zoom and supported viewports, with cues beyond colour alone.
- [ ] Keep health/weather-driven landscape presentation independent of simulation rules and equipment technology stage; preserve the current improvised-to-clean progression without new tiers or map expansion.
- [ ] Verify attribution/licences for all shipped assets and exclude unused dependencies, source projects and retired artwork from runtime exports. Keep simulation quantities, authored-map identity, collision footprints and M9 compatibility stable unless an explicit supported change is separately documented.

## Step C Qualify the final assets

- [ ] Run the M10.4 portable test on this PC in **Chromium and Firefox** with the final assets, using the same normal/stress workloads, checkpoints/seeds, browser settings, viewport/DPR, warmups/repetitions and frozen performance gates as the current-asset baseline. Record every source/asset/browser/workload difference; make a fresh comparable baseline if necessary rather than attributing unrelated changes to art.
- [ ] Compare baseline/final rendering and input timing, active geometry/draw calls, memory, payload sizes, cold/warm loading, save commits and complete load-to-playable timing. Separate simulation/publication, host UI/rendering, capture/validation/codec/storage and worker/scene reconstruction. Do not infer final renderer performance from a passing baseline or worker-only profile.
- [ ] Resolve measured final performance failures with targeted changes, then repeat affected comparisons. Retain failed runs and any explicit threshold/scope decisions; do not silently weaken the frozen gates. Other hardware remains unqualified until the user runs the portable test there.
- [ ] Repeat affected Chromium/Firefox static-build, asset/base-path/CSP/Brotli, loading, resize/DPR, input/focus, pause/Retry, host recreation, save/load and accessibility checks. Re-run representative industrial/restored gameplay checkpoints; repeat broader acceptance only where changed presentation/content affects it.
- [ ] Confirm visual readability and approved finish with final assets while preserving the 400-cell latched objective, 30–60 minute pacing target and deterministic save continuation.

The proposed numeric gates and full workload methodology remain owned by [M10 Step 4](milestone-10-portfolio-prototype.md#step-4-measure-and-address-performance), avoiding independent threshold copies. Final rendering, loading, memory and delivery claims require this post-asset pass.

## Step D Refresh the local handoff and close

- [ ] Refresh screenshots/capture material, attribution, exact source/asset/build identity, browser/measurement results, limits and static-serving instructions against the final artifact. Replace provisional captures and clearly separate baseline from final results.
- [ ] Rebuild/package the final local production artifact and retain the portable test/instructions for later hardware. Hosting choice/upload/public release remain separate.
- [ ] Close the existing M10.1 task and M10 milestone only against delivered final asset/qualification/handoff evidence, preserving the five completed groundwork packages and M1–M9 credit. Stop at the portfolio prototype.

## Validation boundary

All asset-performance comparisons, soaks and full/virtual/accelerated gameplay routes are **local and manually invoked**, never CI/GitHub Actions. CI retains focused correctness/component/fixture checks, types, lint, builds and architecture/asset validation. Authoritative gameplay stays in plain TypeScript; Angular owns UI, Babylon owns presentation, and one Editor project owns authored scene layout.

## Completion

The selected audit work is delivered; final assets pass the frozen Chromium/Firefox performance gates and affected regression/readability checks on this PC; baseline/final evidence and limits are explicit; the local artifact/material are refreshed; and later hardware remains a documented follow-up. Until then, the earlier M10 handoff is a functional current-asset delivery with provisional presentation/performance claims.
