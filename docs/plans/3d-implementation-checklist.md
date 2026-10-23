# Scrapworks migration validation checklist

Updated 23 October 2026. The earlier [17 October implementation checklist](../history/3d/implementation-checklist-2026-10-17.md) is preserved as history. The active [migration plan](3d-migration.md) governs implementation and final acceptance. Its Phase 7 is documentation-only: reconcile milestone progress, then stop.

## 0 Review the preserved repository

Preserve the existing authoring, source art and provenance. The [cleanup baseline](3d-cleanup-baseline.md) records earlier preservation work; retired scene sources are recoverable from Git commit `6cd9f6f` using the [recovery instructions](../../assets/README.md#recovering-retired-scene-sources). Generated exports and caches remain ignored. A successful local build does not establish a clean dependency install or a Git commit; report those separately.

## Integration checks

- Verify one default Babylon route plus the `/3d` redirect, Angular menu/title/loading/errors and the explicit test-save label.
- Verify focus/modal ownership, custom controls, pause/visibility/zero-size behavior, context loss/Retry, late-load disposal and independent-host teardown.
- Verify the authored 10 by 10 fixture, centimetre/metre conversion, parent transforms, cell boundaries and quarter-turn footprints. Malformed saved markers must retain the previous scene/world publication.
- Verify deterministic movement, diagonal speed, collision, empty starting possessions, camera-relative input, ground/entity picking, animated character presentation and placement feedback. Free test placement is a developer fixture only.
- Verify production imports contain no Phaser and browser output excludes source libraries, historical maps, retired scene content and obsolete public copies.

## Commands

```sh
yarn scenes:export
yarn build
yarn test
yarn lint
yarn test:lint
yarn test:world
yarn test:export
yarn test:workflow
yarn assets:check --build
yarn cleanup:audit
yarn docs:check
```

After these pass, update README/TDD/art/setup/cleanup records and the affected milestone checkboxes from demonstrated behavior. Keep historical reports intact. Do not continue into the former checklist's gameplay/save slice during this migration request.
