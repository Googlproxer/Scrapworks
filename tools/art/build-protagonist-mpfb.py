"""Build the second protagonist entirely with MPFB's human and asset services.

Run through the live Blender MCP server. The previous prototype is preserved.
"""
import bpy
import hashlib
import importlib
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[2]
out = root / 'art/characters/3d/protagonist-mpfb-v1'
library = out / 'mpfb-library'
out.mkdir(parents=True, exist_ok=True)
pkg = next(name for name in bpy.context.preferences.addons.keys() if name.endswith('.mpfb'))

def service(module, name):
    return getattr(importlib.import_module(pkg + '.services.' + module), name)

HumanService = service('humanservice', 'HumanService')
TargetService = service('targetservice', 'TargetService')
LocationService = service('locationservice', 'LocationService')
AssetService = service('assetservice', 'AssetService')
GeneralObjectProperties = getattr(importlib.import_module(pkg + '.entities.objectproperties'), 'GeneralObjectProperties')
settings = importlib.import_module(pkg + '.ui.apply_assets.assetlibrary.assetsettingspanel').ASSET_SETTINGS_PROPERTIES
source_root = Path(LocationService.get_user_data())
scene_name = 'Scrapworks - MPFB Protagonist v1'
if scene_name in bpy.data.scenes:
    raise RuntimeError('MPFB protagonist scene already exists; preserving it')
scene = bpy.data.scenes.new(scene_name)
bpy.context.window.scene = scene
settings.set_value('second_root', str(library), entity_reference=scene)
character = bpy.data.collections.new('01 MPFB character')
scene.collection.children.link(character)

asset_specs = [
    ('eyes', 'high-poly', 'high-poly.mhclo', 'Eyes', 'Brown eyes'),
    ('eyebrows', 'eyebrow001', 'eyebrow001.mhclo', 'Eyebrows', 'Eyebrows'),
    ('eyelashes', 'eyelashes01', 'eyelashes01.mhclo', 'Eyelashes', 'Eyelashes'),
    ('teeth', 'teeth_base', 'teeth_base.mhclo', 'Teeth', 'Teeth'),
    ('tongue', 'tongue01', 'tongue01.mhclo', 'Tongue', 'Tongue'),
    ('hair', 'ponytail01', 'ponytail01.mhclo', 'Hair', 'Brown ponytail'),
    ('clothes', 'toigo_camisole_top', 'toigo_camisole_top.mhclo', 'Clothes', 'Cream sleeveless top'),
    ('clothes', 'cortu_cargo_pants', 'cortu_cargo_pants.mhclo', 'Clothes', 'Orange cargo trousers'),
    ('clothes', 'toigo_ankle_boots_male', 'toigo_ankle_boots_male.mhclo', 'Clothes', 'Charcoal ankle boots'),
]
for kind, folder in {(s[0], s[1]) for s in asset_specs} | {('skins', 'young_caucasian_female'), ('eyes', 'materials')}:
    shutil.copytree(source_root / kind / folder, library / kind / folder, dirs_exist_ok=True)

# MakeHuman material variants are loaded by MPFB, retaining authored normal maps.
variants = {
    'toigo_camisole_top': ('camisole_top.mhmat', (0.82, 0.76, 0.62), 0.82),
    'cortu_cargo_pants': ('cargo_pants.mhmat', (0.48, 0.115, 0.027), 0.88),
    'toigo_ankle_boots_male': ('boots_ankle_male.mhmat', (0.025, 0.032, 0.044), 0.65),
}
variant_paths = {}
for folder, (original, color, roughness) in variants.items():
    folder_path = library / 'clothes' / folder
    text = (folder_path / original).read_text(encoding='utf-8')
    lines = [line for line in text.splitlines() if not line.strip().startswith(('diffuseTexture ', 'diffuseColor ', 'name ', 'shininess ', 'roughness '))]
    lines.extend(['name Scrapworks_' + folder, 'diffuseColor ' + ' '.join(map(str, color)), 'roughness ' + str(roughness)])
    variant_path = folder_path / ('scrapworks_' + folder + '.mhmat')
    variant_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    variant_paths[folder] = variant_path
AssetService.update_all_asset_lists()

macro = TargetService.get_default_macro_info_dict()
macro.update({'gender': 0.0, 'age': 0.5, 'muscle': 0.56, 'weight': 0.46, 'height': 0.52, 'proportions': 0.65, 'cupsize': 0.4, 'firmness': 0.5})
macro['race'] = {'caucasian': 1.0, 'asian': 0.0, 'african': 0.0}
body = HumanService.create_human(macro_detail_dict=macro, feet_on_ground=True, scale=0.1)
body.name = 'Protagonist MPFB body'
HumanService.set_character_skin(str(library / 'skins/young_caucasian_female/young_caucasian_female.mhmat'), body, skin_type='GAMEENGINE')
rig = HumanService.add_builtin_rig(body, 'game_engine')
rig.name = 'Protagonist MPFB game rig'
rig.show_in_front = True
loaded = []
for kind, folder, filename, asset_type, label in asset_specs:
    path = library / kind / folder / filename
    kwargs = {}
    if folder in variant_paths:
        uuid = next(line.split(maxsplit=1)[1].strip() for line in path.read_text(encoding='utf-8').splitlines() if line.startswith('uuid '))
        kwargs['alternative_materials'] = {uuid: folder + '/' + variant_paths[folder].name}
    obj = HumanService.add_mhclo_asset(str(path), body, asset_type=asset_type, material_type='GAMEENGINE', subdiv_levels=1, **kwargs)
    obj.name = label + ' [MPFB]'
    obj['scrapworks_created_by'] = 'MPFB HumanService.add_mhclo_asset'
    obj['scrapworks_asset_file'] = str(path.relative_to(out))
    for mod in obj.modifiers:
        if mod.type == 'SUBSURF':
            mod.levels = 1
            mod.render_levels = 1
    loaded.append({'object': obj.name, 'type': asset_type, 'asset': str(path.relative_to(out)), 'source': GeneralObjectProperties.get_value('asset_source', entity_reference=obj)})
subdivision = body.modifiers.new('Body subdivision', 'SUBSURF')
subdivision.levels = subdivision.render_levels = 1
for polygon in body.data.polygons:
    polygon.use_smooth = True
body['scrapworks_created_by'] = 'MPFB HumanService.create_human'
body['scrapworks_macro_settings'] = json.dumps(macro)
rig['scrapworks_created_by'] = 'MPFB HumanService.add_builtin_rig(game_engine)'

# Move only the newly generated hierarchy into its own collection.
objects = [rig, body] + list(rig.children_recursive)
objects = list(dict.fromkeys(objects))
for obj in objects:
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    character.objects.link(obj)
    if obj.type == 'MESH':
        for material in obj.data.materials:
            if material and material.use_nodes:
                if hasattr(material, 'surface_render_method'):
                    material.surface_render_method = 'DITHERED'
                material.use_backface_culling = False
                for node in material.node_tree.nodes:
                    if node.type == 'TEX_IMAGE' and node.image and not node.image.packed_file:
                        node.image.pack()

# Retain MPFB's editable macros, asset associations and bound rig.
HumanService.serialize_to_json_file(body, str(out / 'protagonist-mpfb-v1-preset.json'), save_clothes=True)
report = {
    'generator': 'MPFB 2.0.17', 'blender_version': bpy.app.version_string,
    'scene': scene.name, 'body': body.name, 'rig': rig.name,
    'bones': len(rig.data.bones), 'macro_settings': macro, 'assets': loaded,
    'asset_library': str(library), 'asset_license': 'CC0',
    'asset_pack_pages': ['https://static.makehumancommunity.org/assets/assetpacks/' + p + '.html' for p in ('makehuman_system_assets', 'shirts01', 'pants01', 'shoes01')],
    'character_meshes': len([o for o in objects if o.type == 'MESH']),
    'procedurally_modelled_character_parts': 0,
}
(out / 'build-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
source_files = {str(p.relative_to(library)): hashlib.sha256(p.read_bytes()).hexdigest() for p in library.rglob('*') if p.is_file()}
(out / 'source-hashes.json').write_text(json.dumps(source_files, indent=2), encoding='utf-8')
bpy.context.view_layer.objects.active = body
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.data.libraries.write(str(out / 'protagonist-mpfb-v1.blend'), {scene}, fake_user=True, compress=True)
result = {key: report[key] for key in ('scene', 'body', 'rig', 'bones', 'character_meshes', 'procedurally_modelled_character_parts')}
