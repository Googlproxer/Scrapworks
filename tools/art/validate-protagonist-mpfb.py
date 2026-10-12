"""Reimport the GLB in Blender and validate bounds, skins, UVs and images."""
import bpy
import json
from mathutils import Vector
from pathlib import Path

out = Path(__file__).resolve().parents[2] / 'docs/art/characters/3d/protagonist-mpfb-v1'
source = bpy.data.scenes['Scrapworks - MPFB Protagonist v1']
scene = bpy.data.scenes.new('MPFB GLB roundtrip check')
bpy.context.window.scene = scene
bpy.ops.import_scene.gltf(filepath=str(out / 'protagonist-mpfb-v1.glb'))
imported = list(scene.objects)
# Blender's glTF importer creates a hidden Icosphere for bone custom shapes.
helpers = [o for o in imported if any(c.name.startswith('glTF_not_exported') for c in o.users_collection)]
meshes = [o for o in imported if o.type == 'MESH' and o not in helpers]
rigs = [o for o in imported if o.type == 'ARMATURE']
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
points = [o.matrix_world @ Vector(c) for o in meshes for c in o.evaluated_get(depsgraph).bound_box]
low = [min(p[i] for p in points) for i in range(3)]
high = [max(p[i] for p in points) for i in range(3)]
expected = json.loads((out / 'blender-validation.json').read_text(encoding='utf-8'))['bounds_meters']
delta = max(abs(actual[i] - expected[key][i]) for actual, key in [(low, 'min'), (high, 'max')] for i in range(3))
binding = {o.name: len([m for m in o.modifiers if m.type == 'ARMATURE' and m.object]) for o in meshes}
print(json.dumps({'meshes': [(m.name, len(m.data.vertices), [c.name for c in m.users_collection]) for m in meshes], 'rigs': [(r.name, len(r.data.bones)) for r in rigs]}), flush=True)
if len(meshes) != 10 or len(rigs) != 1 or len(rigs[0].data.bones) < 53:
    raise RuntimeError('Unexpected MPFB GLB hierarchy')
if delta > 0.02 or not all(binding.values()) or not all(len(o.data.uv_layers) > 0 for o in meshes):
    raise RuntimeError('GLB bounds, rigging or UV validation failed')

# Verify actual deformation, then restore the rest pose before the preview.
rig = rigs[0]
bone = next((b for b in rig.pose.bones if 'lowerarm' in b.name.lower()), None)
if bone is None:
    raise RuntimeError('No forearm bone in MPFB game rig')
def vertices():
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    result = []
    for obj in meshes:
        evaluated_obj = obj.evaluated_get(graph)
        mesh = evaluated_obj.to_mesh()
        result.extend(obj.matrix_world @ v.co for v in mesh.vertices)
        evaluated_obj.to_mesh_clear()
    return result
before = vertices()
original = bone.matrix_basis.copy()
bone.rotation_mode = 'XYZ'
bone.rotation_euler.x = 0.25
after = vertices()
max_motion = max((a - b).length for a, b in zip(after, before))
bone.matrix_basis = original
bpy.context.view_layer.update()
if max_motion < 0.005:
    raise RuntimeError('Exported MPFB rig did not deform its meshes')
report = {'reimported_successfully': True, 'mesh_objects': len(meshes), 'bones': len(rig.data.bones),
    'all_meshes_skinned': True, 'all_meshes_have_uvs': True, 'bounds_max_difference_meters': delta,
    'forearm_pose_test_max_movement_meters': max_motion, 'animations_included': False,
    'blender_importer_bone_shape_helpers_excluded': len(helpers)}
(out / 'roundtrip-validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
scene.collection.children.link(source.collection.children['02 Review studio'])
scene.camera = bpy.data.objects['MPFB Camera three-quarter']
scene.world = source.world
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 840
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
scene.render.filepath = str(out / 'preview-glb-roundtrip.png')
bpy.ops.render.render(write_still=True, scene=scene.name)
print(json.dumps(report), flush=True)
