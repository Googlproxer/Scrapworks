"""Apply MPFB's young-adult age setting and refit its complete asset hierarchy."""
import bpy
import importlib
import json
from mathutils import Vector
from pathlib import Path

out = Path(__file__).resolve().parents[2] / 'art/characters/3d/protagonist-mpfb-v1'
scene = bpy.data.scenes['Scrapworks - MPFB Protagonist v1']
bpy.context.window.scene = scene
pkg = next(name for name in bpy.context.preferences.addons.keys() if name.endswith('.mpfb'))
HumanService = importlib.import_module(pkg + '.services.humanservice').HumanService
TargetService = importlib.import_module(pkg + '.services.targetservice').TargetService
HumanObjectProperties = importlib.import_module(pkg + '.entities.objectproperties').HumanObjectProperties
body = bpy.data.objects['Protagonist MPFB body']
# In MPFB's installed age property, young adult is 0.5 (child is 0.1875).
HumanObjectProperties.set_value('age', 0.5, entity_reference=body)
TargetService.reapply_macro_details(body)
HumanService.refit(body)
macro = TargetService.get_macro_info_dict_from_basemesh(body)
body['scrapworks_macro_settings'] = json.dumps(macro)
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
character = scene.collection.children['01 MPFB character']
points = [obj.matrix_world @ Vector(c) for obj in character.objects if obj.type == 'MESH' for c in obj.evaluated_get(depsgraph).bound_box]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
height = high.z - low.z
center = (low + high) * 0.5
for view, position, target, scale in [
    ('front', (0, -6, center.z), center, height * 1.16),
    ('three-quarter', (3.7, -6, center.z + 0.13), center, height * 1.16),
    ('back', (0, 6, center.z), center, height * 1.16),
    ('face', (0, -5, high.z - 0.21), (0, center.y, high.z - 0.21), 0.57),
]:
    camera = bpy.data.objects['MPFB Camera ' + view]
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = scale
bpy.data.objects['MPFB Studio floor'].location.z = low.z - 0.002
for name in ('MPFB Key light', 'MPFB Fill light', 'MPFB Rim light'):
    light = bpy.data.objects[name]
    light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
report = json.loads((out / 'build-report.json').read_text(encoding='utf-8'))
report['macro_settings'] = macro
(out / 'build-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
validation = json.loads((out / 'blender-validation.json').read_text(encoding='utf-8'))
validation['bounds_meters'] = {'min': list(low), 'max': list(high)}
validation['height_meters_including_hair_and_boots'] = height
(out / 'blender-validation.json').write_text(json.dumps(validation, indent=2), encoding='utf-8')
HumanService.serialize_to_json_file(body, str(out / 'protagonist-mpfb-v1-preset.json'), save_clothes=True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_location = center
            area.spaces.active.region_3d.view_distance = height * 1.5
bpy.data.libraries.write(str(out / 'protagonist-mpfb-v1.blend'), {scene}, fake_user=True, compress=True)
result = {'mpfb_age': macro['age'], 'height_meters': height, 'refitted_assets_and_rig': True}
