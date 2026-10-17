"""Export a staged MPFB hierarchy, leaving its editable source untouched."""
import bpy
import importlib
import json
import tempfile
from pathlib import Path

out = Path(__file__).resolve().parents[2] / 'art/characters/3d/protagonist-mpfb-v1'
scene = bpy.data.scenes['Scrapworks - MPFB Protagonist v1']
bpy.context.window.scene = scene
pkg = next(name for name in bpy.context.preferences.addons.keys() if name.endswith('.mpfb'))
ExportService = importlib.import_module(pkg + '.services.exportservice').ExportService
ObjectService = importlib.import_module(pkg + '.services.objectservice').ObjectService
body = bpy.data.objects['Protagonist MPFB body']
# Clear only a failed staging collection created by this script.
previous = scene.collection.children.get('MPFB temporary export staging')
if previous:
    if any(not o.name.endswith('_export') for o in previous.objects):
        raise RuntimeError('Unexpected objects in temporary export staging; preserving them')
    for obj in list(previous.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(previous)
staging = bpy.data.collections.new('MPFB temporary export staging')
scene.collection.children.link(staging)
export_root = ExportService.create_character_copy(body, name_suffix='_export', place_in_collection=staging)
export_body = ObjectService.find_object_of_type_amongst_nearest_relatives(export_root, 'Basemesh')
staged = list(staging.objects)
temp_dir = out / '.export-temp'
temp_dir.mkdir(exist_ok=True)
tempfile.tempdir = str(temp_dir)
path = out / 'protagonist-mpfb-v1.glb'
window = next(w for w in bpy.context.window_manager.windows if any(a.type == 'VIEW_3D' for a in w.screen.areas))
window.scene = scene
window.view_layer = scene.view_layers[0]
area = next(a for a in window.screen.areas if a.type == 'VIEW_3D')
region = next(r for r in area.regions if r.type == 'WINDOW')
with bpy.context.temp_override(window=window, area=area, region=region):
    for obj in scene.objects:
        obj.select_set(False)
    export_body.select_set(True)
    bpy.context.view_layer.objects.active = export_body
    # Freeze the current macro shape only on the MPFB export copy.
    if export_body.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    ExportService.bake_modifiers_remove_helpers(export_body, bake_masks=True, bake_subdiv=True, remove_helpers=True, also_proxy=True)
    for obj in scene.objects:
        obj.select_set(False)
    for obj in staged:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = export_root
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_materials='EXPORT', export_normals=True,
        export_skins=True, export_morph=False, export_animations=False)
report = {'file': str(path), 'bytes': path.stat().st_size, 'staged_objects': len(staged),
    'rigged': True, 'animations': False, 'studio_included': False,
    'source_macro_shape_keys_preserved': body.data.shape_keys is not None,
    'source_objects_preserved': True}
for obj in staged:
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.data.collections.remove(staging)
bpy.context.view_layer.objects.active = body
body.select_set(True)
(out / 'export-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
result = report
