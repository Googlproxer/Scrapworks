# Dialog footer clearance

Native runtime browser captures, 14 November 2026. These show the shared action-row spacing after moving the right-hand action closer to the edge.

- [Wide Controls footer](controls-wide.png): 1600×1000 window, cropped in the browser to the lower 170 px of the dialog.
- [Compact Graphics footer](graphics-compact.png): 320×240 window, scrolled to the actions and captured over the lower 170 px.

The [runtime guide](../../../../../../docs/art/ui-runtime.md) describes the shared layout. Both sides use matching action-row insets; the shell reserves clearance beneath its scroll region so buttons cannot slide over the corner artwork. Labels wrap at word boundaries, keeping paired actions in one row for controller navigation.

Detailed local screenshot and artwork-clearance checks remain ignored under `docs/reports/footer-spacing-2026-11-14/`. No CI gameplay route was added.
