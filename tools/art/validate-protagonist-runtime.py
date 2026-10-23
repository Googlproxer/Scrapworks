"""Reimport, validate and render the actual runtime GLB in isolated Blender.

blender --background --factory-startup --disable-autoexec --python tools/art/validate-protagonist-runtime.py
Pass -- --no-render to run only the numeric checks.
"""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/characters/3d/protagonist-runtime-v2'
GLB = ROOT / 'public/assets/models/protagonist-v2.glb'


def vertices(obj):
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(graph)
    mesh = evaluated.to_mesh()
    points = [obj.matrix_world @ v.co for v in mesh.vertices]
    evaluated.to_mesh_clear()
    return points


def activate(rig, action):
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]
    for track in rig.animation_data.nla_tracks:
        track.mute = True


def inspect():
    data = GLB.read_bytes()
    document = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
    triangles = sum(document['accessors'][p['indices']]['count'] // 3
                    for m in document['meshes'] for p in m['primitives'])
    assert len(data) <= 5 * 1024 * 1024
    assert triangles <= 40000
    assert len(document['meshes']) == 10
    assert len(document['materials']) == 10
    assert len(document['skins']) == 1 and len(document['skins'][0]['joints']) == 52
    clip_names = {'Idle', 'Walk', 'Run', 'TurnLeft', 'TurnRight'}
    assert {a['name'] for a in document['animations']} == clip_names
    assert all('uri' not in image and image['mimeType'] == 'image/webp' for image in document['images'])
    assert all('uri' not in buf for buf in document['buffers'])
    assert not document.get('cameras')
    assert not document.get('extensions', {}).get('KHR_lights_punctual')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    rig = next(o for o in scene.objects if o.type == 'ARMATURE')
    meshes = [o for o in scene.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
    boots = next(o for o in meshes if 'boots' in o.name.lower())
    body = next(o for o in meshes if any(slot.material and slot.material.name.startswith('Human.body') for slot in o.material_slots))
    assert all(o.data.uv_layers for o in meshes)
    assert all(o.vertex_groups for o in meshes)
    images = [{'name': i.name, 'width': i.size[0], 'height': i.size[1]} for i in bpy.data.images if i.packed_file]
    assert len(images) == 13
    assert all(i['width'] > 0 and i['height'] > 0 for i in images)
    assert all(max(i['width'], i['height']) <= 2048 for i in images)
    actions = {a.name: a for a in bpy.data.actions if a.name in clip_names}
    assert len(actions) == 5
    summaries = []
    for name, action in actions.items():
        activate(rig, action)
        start, end = map(lambda f: int(round(f)), action.frame_range)
        floors = []
        hip = []
        body_poses = []
        rotations = []
        headings = []
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            floors.append(min(v.z for v in vertices(boots)))
            hip.append((rig.matrix_world @ rig.pose.bones['mixamorig:Hips'].head).copy())
            headings.append((rig.matrix_world @ rig.pose.bones['mixamorig:Hips'].matrix).to_quaternion())
            if frame in [start, (start + end) // 2]:
                body_poses.append(vertices(body))
            if frame in [start, end]:
                rotations.append({p.name: p.rotation_quaternion.copy() for p in rig.pose.bones})
        displacement = hip[-1] - hip[0]
        angles = [rotations[0][n].rotation_difference(rotations[1][n]).angle for n in rotations[0]]
        loop_angle = max(min(a, abs(2 * math.pi - a)) for a in angles)
        deformation = max((a-b).length for a, b in zip(body_poses[0], body_poses[1]))
        yaw_range = max(abs((heading @ headings[0].inverted()).to_swing_twist('Z')[1]) for heading in headings)
        if name.startswith('Turn'):
            assert yaw_range < 0.02, (name, 'unremoved turn yaw', yaw_range)
        # Quaternion q and -q describe the same rotation.
        assert loop_angle < 0.01, (name, loop_angle)
        assert math.hypot(displacement.x, displacement.y) < 0.0001, (name, displacement)
        assert min(floors) >= -0.002, (name, min(floors))
        assert deformation > 0.001, (name, deformation)
        assert rig.location.length < 0.00001
        summaries.append({'name': name, 'frames': [start, end], 'seconds': (end-start)/30,
                          'boot_floor_range_m': [min(floors), max(floors)],
                          'hip_loop_displacement_m': list(displacement),
                          'maximum_body_vertex_deformation_m': deformation,
                          'maximum_hip_heading_change_rad': yaw_range,
                          'maximum_loop_bone_rotation_difference_rad': loop_angle})
    activate(rig, actions['Idle'])
    scene.frame_set(1)
    points = [p for obj in meshes for p in vertices(obj)]
    bounds = [[min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)]]
    assert 1.5 < bounds[1][2] - bounds[0][2] < 1.8
    report = {'runtime_sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'triangles': triangles,
              'meshes': len(meshes), 'materials': len(document['materials']), 'skin_joints': 52,
              'image_count': len(document['images']), 'images': images, 'texture_encoding': 'WebP only; exact retained source WebP payloads',
              'external_resources': False, 'all_meshes_have_uvs_and_skin_weights': True,
              'idle_bounds_blender_m': bounds, 'idle_height_m': bounds[1][2]-bounds[0][2],
              'clips': summaries, 'root_stationary': True, 'reimport_succeeded': True}
    (OUT / 'validation-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('VALIDATION_REPORT ' + json.dumps(report))
    return scene, rig, actions


def render(scene, rig, actions):
    previews = OUT / 'previews'
    previews.mkdir(exist_ok=True)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 360
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.32, 0.36, 0.43, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.65
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.003))
    floor = bpy.context.object
    floor.name = 'Validation floor'
    material = bpy.data.materials.new('Validation neutral floor')
    material.diffuse_color = (0.17, 0.19, 0.22, 1)
    material.use_nodes = True
    material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.17, 0.19, 0.22, 1)
    material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    floor.data.materials.append(material)
    for name, location, energy, size in [('Key', (-3,-4,5), 650, 4), ('Fill',(3,-1,3),400,4),('Rim',(1,4,4),550,3)]:
        light_data = bpy.data.lights.new(name, 'AREA')
        light_data.energy = energy
        light_data.shape = 'DISK'
        light_data.size = size
        light = bpy.data.objects.new(name, light_data)
        scene.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (Vector((0,0,0.8)) - light.location).to_track_quat('-Z','Y').to_euler()
    camera_data = bpy.data.cameras.new('Validation camera')
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 2.05
    camera = bpy.data.objects.new('Validation camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    shots = [('Idle',1,a,f'idle-turn-{int(a):03d}') for a in [0,90,180,270]]
    shots += [('Walk',f,25,f'walk-{f:02d}') for f in [1,8,15,22]]
    shots += [('Run',f,25,f'run-{f:02d}') for f in [1,6,11,17]]
    shots += [('TurnLeft',f,25,f'turn-left-{f:02d}') for f in [1,10,19,28]]
    shots += [('TurnRight',f,25,f'turn-right-{f:02d}') for f in [1,10,19,28]]
    index = []
    for name, frame, angle, filename in shots:
        activate(rig, actions[name])
        scene.frame_set(frame)
        radians = math.radians(angle)
        camera.location = (4*math.sin(radians), -4*math.cos(radians), 1.85)
        camera.rotation_euler = (Vector((0,0,0.82)) - camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(previews / (filename + '.png'))
        bpy.ops.render.render(write_still=True)
        index.append({'file':filename+'.png','clip':name,'frame':frame,'camera_degrees':angle})
    (previews / 'index.json').write_text(json.dumps(index, indent=2)+'\n',encoding='utf-8')


if __name__ == '__main__':
    scene, rig, actions = inspect()
    if '--no-render' not in sys.argv:
        render(scene, rig, actions)
