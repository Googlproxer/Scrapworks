# Editor source assets

Open `../scrapworks.bjseditor` in Babylon.js Editor 5.5.2. The `.scene` directories
are editable scene sources, including serialized geometry, materials, cameras, 
lights and the Game protagonist's skeleton. Commit the entire scene directory.

Use [the setup guide](../docs/plans/babylon-editor-setup.md) for editing, scene
export and the official desktop MCP connection. Scene units are centimetres. Gameplay uses metres on X/Z; the planned marker compiler converts at that boundary. `public/scene/` and `src/scripts.ts` are generated outputs, not authoring sources or gameplay saves. The [asset/export audit](../docs/reports/assets/2026-10-17/README.md) preserves library packs here while excluding unused generated copies. The [export tools and policy](../tools/scenes/README.md) retain scene-declared dependencies and explicit dynamic assets; adding a library file alone does not make it a runtime asset.
