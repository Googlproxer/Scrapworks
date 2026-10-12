"""Add a review studio and cameras around the actual MPFB character."""
import bpy
import json
from mathutils import Vector
from pathlib import Path

root = Path(__file__).resolve().parents[2]
out = root / 'docs/art/characters/3d/protagonist-mpfb-v1'
scene = bpy.data.scenes['Scrapworks - MPFB Protagonist v1']
bpy.context.window.scene = scene
character = scene.collection.children['01 MPFB character']
studio = bpy.data.collections.new('02 Review studio')
scene.collection.children.link(studio)
depsgraph = bpy.context.evaluated_depsgraph_get()
points = [obj.matrix_world @ Vector(corner) for obj in character.objects if obj.type == 'MESH' for corner in obj.evaluated_get(depsgraph).bound_box]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
height = high.z - low.z
center = (low + high) * 0.5

def relocate(obj):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    studio.objects.link(obj)

def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def camera(name, position, target, scale):
    data = bpy.data.cameras.new(name)
    data.type = 'ORTHO'
    data.ortho_scale = scale
    obj = bpy.data.objects.new(name, data)
    studio.objects.link(obj)
    obj.location = position
    aim(obj, target)
    return obj

target = (center.x, center.y, center.z)
front = camera('MPFB Camera front', (0, -6, center.z), target, height * 1.16)
three_quarter = camera('MPFB Camera three-quarter', (3.7, -6, center.z + 0.13), target, height * 1.16)
back = camera('MPFB Camera back', (0, 6, center.z), target, height * 1.16)
face = camera('MPFB Camera face', (0, -5, high.z - 0.21), (0, center.y, high.z - 0.21), 0.57)
for name, position, power, size, color in [
    ('MPFB Key light', (-2.5, -3.5, 3.6), 420, 3.0, (1.0, 0.87, 0.76)),
    ('MPFB Fill light', (2.5, -1.8, 2.8), 240, 2.5, (0.76, 0.85, 1.0)),
    ('MPFB Rim light', (1.3, 2.0, 3.2), 550, 2.0, (1.0, 0.92, 0.82)),
]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.shape = 'DISK'
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    studio.objects.link(obj)
    obj.location = position
    aim(obj, target)

bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, low.z - 0.002))
floor = bpy.context.object
floor.name = 'MPFB Studio floor'
relocate(floor)
mat = bpy.data.materials.new('MPFB Studio blue-grey')
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value = (0.055, 0.075, 0.095, 1)
bsdf.inputs['Roughness'].default_value = 0.85
floor.data.materials.append(mat)
scene.world = bpy.data.worlds.new('MPFB Studio world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.10, 0.13, 0.17, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 840
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
scene.camera = three_quarter
bpy.context.view_layer.update()

validation = {
    'bounds_meters': {'min': list(low), 'max': list(high)},
    'height_meters_including_hair_and_boots': height,
    'objects': [], 'missing_images': [],
}
for obj in character.objects:
    item = {'name': obj.name, 'type': obj.type}
    if obj.type == 'MESH':
        evaluated = obj.evaluated_get(depsgraph).to_mesh()
        item.update({'base_vertices': len(obj.data.vertices), 'evaluated_vertices': len(evaluated.vertices), 'uv_layers': len(obj.data.uv_layers), 'armature': [m.object.name for m in obj.modifiers if m.type == 'ARMATURE' and m.object], 'materials': [m.name for m in obj.data.materials if m]})
        obj.evaluated_get(depsgraph).to_mesh_clear()
    validation['objects'].append(item)
for obj in character.objects:
    if obj.type != 'MESH':
        continue
    for mat in obj.data.materials:
        if mat and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image:
                    if not node.image.packed_file:
                        validation['missing_images'].append(node.image.name)
if validation['missing_images']:
    raise RuntimeError('Unpacked character textures: ' + repr(validation['missing_images']))
(out / 'blender-validation.json').write_text(json.dumps(validation, indent=2), encoding='utf-8')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.region_3d.view_location = center
            space.region_3d.view_distance = height * 1.5
            space.region_3d.view_rotation = three_quarter.rotation_euler.to_quaternion()
            space.region_3d.view_perspective = 'ORTHO'
            space.shading.type = 'MATERIAL'
            space.overlay.show_overlays = False
bpy.context.view_layer.objects.active = bpy.data.objects['Protagonist MPFB body']
bpy.ops.object.select_all(action='DESELECT')
bpy.data.objects['Protagonist MPFB body'].select_set(True)
bpy.data.libraries.write(str(out / 'protagonist-mpfb-v1.blend'), {scene}, fake_user=True, compress=True)
result = {'height': height, 'character_objects': len(validation['objects']), 'all_textures_packed': True, 'blend_file': str(out / 'protagonist-mpfb-v1.blend')}
