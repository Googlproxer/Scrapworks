"""Validate the actual v3 GLB in isolated Blender; --render adds visual evidence.

Python is required for Blender's importer, evaluated skinning and rendering.
"""
import hashlib
import importlib.util
import json
import math
import struct
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/characters/Protag/v3/runtime'
GLB = ROOT / 'public/assets/models/protagonist-v3.glb'
SPEC = importlib.util.spec_from_file_location('protagonist_v3', Path(__file__).with_name('build-protagonist-runtime-v3.py'))
HELPERS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELPERS)


def activate(rig, action):
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]
    for track in rig.animation_data.nla_tracks:
        track.mute = True


def inspect():
    data = GLB.read_bytes()
    document = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
    exported = json.loads((OUT / 'export-report.json').read_text(encoding='utf-8'))
    triangles = sum(document['accessors'][p['indices']]['count'] // 3
                    for mesh in document['meshes'] for p in mesh['primitives'])
    assert triangles == exported['source_triangles']
    assert not exported['mesh_decimated']
    assert len(document['meshes']) == len(document['materials']) == len(document['skins']) == 1
    assert len(document['skins'][0]['joints']) == 65
    names = {'Idle', 'Walk', 'Run', 'TurnLeft', 'TurnRight'}
    assert {a['name'] for a in document['animations']} == names
    assert len(document['images']) == 3
    assert all('uri' not in i and i['mimeType'] == 'image/webp' for i in document['images'])
    assert all('uri' not in b for b in document['buffers'])
    material = document['materials'][0]
    assert material['pbrMetallicRoughness']['baseColorTexture']
    assert material['pbrMetallicRoughness']['metallicRoughnessTexture']
    assert material['normalTexture']
    assert not document.get('cameras')
    assert not document.get('extensions', {}).get('KHR_lights_punctual')
    assert exported['all_skin_influences_retained']
    assert exported['maximum_vertex_skin_influences'] <= 8
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            assert 'TEXCOORD_0' in primitive['attributes']
            assert 'JOINTS_0' in primitive['attributes'] and 'WEIGHTS_0' in primitive['attributes']
            if exported['maximum_vertex_skin_influences'] > 4:
                assert 'JOINTS_1' in primitive['attributes'] and 'WEIGHTS_1' in primitive['attributes']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    rig = next(o for o in scene.objects if o.type == 'ARMATURE')
    mesh = next(o for o in scene.objects if o.type == 'MESH')
    assert all(abs(rig.matrix_world[r][c] - Matrix.Identity(4)[r][c]) < 1e-5
               for r in range(4) for c in range(4))
    assert mesh.data.uv_layers and mesh.vertex_groups
    assert max(sum(g.weight > 0 for g in v.groups) for v in mesh.data.vertices) <= 8
    assert all(abs(sum(g.weight for g in v.groups) - 1) < 0.00002 for v in mesh.data.vertices)
    images = [{'name': i.name, 'width': i.size[0], 'height': i.size[1]} for i in bpy.data.images if i.packed_file]
    assert len(images) == 3 and all(max(i['width'], i['height']) <= 2048 for i in images)
    actions = {a.name: a for a in bpy.data.actions if a.name in names}
    assert set(actions) == names
    feet = HELPERS.ground_indices(mesh)
    clips = []
    for name, action in actions.items():
        activate(rig, action)
        start, end = [int(round(f)) for f in action.frame_range]
        floors, hips, headings, poses, rotations = [], [], [], [], []
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            points = HELPERS.coordinates(mesh, evaluated=True)
            floors.append(float(points[feet, 2].min()))
            hips.append((rig.matrix_world @ rig.pose.bones['mixamorig:Hips'].head).copy())
            headings.append((rig.matrix_world @ rig.pose.bones['mixamorig:Hips'].matrix).to_quaternion())
            if frame in [start, (start+end)//2]:
                poses.append(points.copy())
            if frame in [start, end]:
                rotations.append({p.name: p.rotation_quaternion.copy() for p in rig.pose.bones})
        displacement = hips[-1] - hips[0]
        angles = [rotations[0][n].rotation_difference(rotations[1][n]).angle for n in rotations[0]]
        loop_angle = max(min(a, abs(2*math.pi-a)) for a in angles)
        deformation = float(np.linalg.norm(poses[0]-poses[1], axis=1).max())
        yaw_range = max(abs((h @ headings[0].inverted()).to_swing_twist('Z')[1]) for h in headings)
        assert math.hypot(displacement.x, displacement.y) < 0.0001, (name, displacement)
        assert loop_angle < 0.01, (name, loop_angle)
        assert min(floors) >= -0.002, (name, min(floors))
        assert max(floors) < (0.15 if name == 'Run' else 0.02), (name, max(floors))
        assert deformation > 0.001, (name, deformation)
        if name.startswith('Turn'):
            assert yaw_range < 0.02, (name, yaw_range)
        clips.append({'name': name, 'frames': [start, end], 'seconds': (end-start)/30,
                      'boot_floor_range_m': [min(floors), max(floors)],
                      'hip_loop_displacement_m': list(displacement),
                      'maximum_vertex_deformation_m': deformation,
                      'maximum_loop_bone_rotation_difference_rad': loop_angle,
                      'maximum_hip_heading_change_rad': yaw_range})
    activate(rig, actions['Idle'])
    scene.frame_set(1)
    points = HELPERS.coordinates(mesh, evaluated=True)
    height = float(np.ptp(points[:, 2]))
    assert 1.8 < height < 2.05
    report = {'runtime_sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
              'triangles': triangles, 'mesh_decimated': False, 'meshes': 1, 'materials': 1,
              'skin_joints': 65, 'maximum_vertex_skin_influences': exported['maximum_vertex_skin_influences'],
              'all_skin_influences_retained': True, 'images': images, 'external_resources': False,
              'idle_height_m': height, 'idle_bounds_blender_m': [points.min(axis=0).tolist(), points.max(axis=0).tolist()],
              'clips': clips, 'root_stationary': True, 'reimport_succeeded': True,
              'source_hashes_unchanged': HELPERS.digest(HELPERS.SOURCE) == exported['source_blend_sha256'] and HELPERS.digest(HELPERS.ARCHIVE) == exported['source_archive_sha256'],
              'prior_budget': {'triangles': 40000, 'bytes': 5*1024*1024,
                               'triangle_target_met': triangles <= 40000, 'transfer_target_met': len(data) <= 5*1024*1024},
              'budget_exception': 'User explicitly requested the complete mesh and retains later polygon optimisation.'}
    assert report['source_hashes_unchanged']
    (OUT / 'validation-report.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print('VALIDATION_REPORT '+json.dumps(report), flush=True)
    return scene, rig, actions


def render(scene, rig, actions):
    previews = OUT / 'previews'
    previews.mkdir(exist_ok=True)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 360, 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Validation world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.32, 0.36, 0.43, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.65
    scene.view_settings.view_transform = 'AgX'
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.003))
    floor = bpy.context.object
    floor_mat = bpy.data.materials.new('Validation floor')
    floor_mat.diffuse_color = (0.17, 0.19, 0.22, 1)
    floor.data.materials.append(floor_mat)
    for name, location, energy, size in [('Key', (-3,-4,5),650,4), ('Fill',(3,-1,3),400,4), ('Rim',(1,4,4),550,3)]:
        light_data = bpy.data.lights.new(name, 'AREA')
        light_data.energy, light_data.size = energy, size
        light = bpy.data.objects.new(name, light_data)
        scene.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (Vector((0,0,0.95))-light.location).to_track_quat('-Z','Y').to_euler()
    camera_data = bpy.data.cameras.new('Validation camera')
    camera_data.type, camera_data.ortho_scale = 'ORTHO', 2.25
    camera = bpy.data.objects.new('Validation camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    shots = [('Idle', 1, a, f'idle-{a:03d}') for a in [0,90,180,270]]
    shots += [('Walk', f, 25, f'walk-{f:02d}') for f in [1,8,15,22]]
    shots += [('Run', f, 25, f'run-{f:02d}') for f in [1,6,11,17]]
    index = []
    for name, frame, angle, filename in shots:
        activate(rig, actions[name])
        scene.frame_set(frame)
        radians = math.radians(angle)
        camera.location = (4*math.sin(radians), -4*math.cos(radians), 1.95)
        camera.rotation_euler = (Vector((0,0,0.95))-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(previews / (filename+'.png'))
        bpy.ops.render.render(write_still=True)
        index.append({'file': filename+'.png', 'clip': name, 'frame': frame, 'camera_degrees': angle})
    (previews / 'index.json').write_text(json.dumps(index, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    scene, rig, actions = inspect()
    if '--render' in sys.argv:
        render(scene, rig, actions)
