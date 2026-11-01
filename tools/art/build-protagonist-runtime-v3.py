"""Build the v3 runtime derivative in an isolated Blender background process.

Python is required by Blender's bpy API. Original authoring files and the
user-supplied Mixamo archive are read only; the open Blender session is unused.
"""
import hashlib
import json
import math
import tempfile
import zipfile
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art/characters/Protag/v3/Protag-v3.blend'
ARCHIVE = SOURCE.parent / 'Protag_v3_rigged.zip'
OUT = SOURCE.parent / 'runtime'
RUNTIME = ROOT / 'public/assets/models/protagonist-v3.glb'
CLIPS = [('Idle', 'idle.fbx'), ('Walk', 'walking.fbx'), ('Run', 'running.fbx'),
         ('TurnLeft', 'left turn.fbx'), ('TurnRight', 'right turn.fbx')]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def coordinates(obj, evaluated=False):
    evaluated_obj = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()) if evaluated else obj
    mesh = evaluated_obj.to_mesh() if evaluated else obj.data
    points = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
    mesh.vertices.foreach_get('co', points)
    matrix = np.array(obj.matrix_world)
    result = points.reshape((-1, 3)) @ matrix[:3, :3].T + matrix[:3, 3]
    if evaluated:
        evaluated_obj.to_mesh_clear()
    return result


def rest_rotation(rig, bone):
    return (rig.matrix_world @ bone.matrix_local).to_quaternion()


def ground_indices(mesh):
    feet = {g.index for g in mesh.vertex_groups if any(p in g.name for p in ['Foot', 'Toe'])}
    points = coordinates(mesh)
    indices = [v.index for v in mesh.data.vertices if points[v.index, 2] < 0.30 and
               sum(g.weight for g in v.groups if g.group in feet) > 0.4]
    if not indices:
        raise RuntimeError('Cannot identify the skinned boot vertices')
    return np.array(indices)


def boot_floor(mesh, indices):
    return float(coordinates(mesh, evaluated=True)[indices, 2].min())


def normalize_character(rig, mesh):
    # Mixamo interprets the metre-valued OBJ as centimetres. Restore the authored
    # height by measuring both sources, rather than assuming FBX unit metadata.
    with bpy.data.libraries.load(str(SOURCE), link=False) as (available, requested):
        requested.objects = ['Protag_low']
    authored = requested.objects[0]
    authored_points = coordinates(authored)
    imported_points = coordinates(mesh)
    factor = float(np.ptp(authored_points[:, 2]) / np.ptp(imported_points[:, 2]))
    original_mesh_matrix = mesh.matrix_world.copy()
    mesh.parent = None
    mesh.matrix_world = Matrix.Scale(factor, 4) @ original_mesh_matrix
    rig.matrix_world = Matrix.Scale(factor, 4) @ rig.matrix_world
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [rig, mesh]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mesh.parent = rig
    mesh.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()
    # The original full PBR graph uses the corrected UVMap, and is independent
    # of Mixamo's diffuse-only material. Reuse it without changing its pixels.
    source_material = authored.data.materials[0]
    mesh.data.materials.clear()
    mesh.data.materials.append(source_material)
    mesh.data.uv_layers.active.name = 'UVMap'
    restored = coordinates(mesh)
    if restored.shape != authored_points.shape:
        raise RuntimeError('Mixamo changed the source vertex count')
    source_error = float(np.abs(restored - authored_points).max())
    if source_error > 0.00002:
        raise RuntimeError(f'Mixamo geometry/alignment mismatch: {source_error} m')
    # Keep the user-authored torso offset. Never recenter the bounding box.
    bpy.data.objects.remove(authored, do_unlink=True)
    return factor, source_error, restored


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    RUNTIME.parent.mkdir(parents=True, exist_ok=True)
    (ROOT / 'tmp').mkdir(exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = 'Scrapworks runtime protagonist v3'
    scene.render.fps = 30
    reports = []
    actions = []
    with zipfile.ZipFile(ARCHIVE) as archive, tempfile.TemporaryDirectory(
            prefix='protag-v3-build-', dir=ROOT / 'tmp') as stage:
        model_name = 'Protag-v3-Mixamo-upload.fbx'
        model_path = Path(stage) / model_name
        model_bytes = archive.read(model_name)
        model_path.write_bytes(model_bytes)
        bpy.ops.import_scene.fbx(filepath=str(model_path), automatic_bone_orientation=False, use_anim=False)
        rig = next(o for o in scene.objects if o.type == 'ARMATURE')
        mesh = next(o for o in scene.objects if o.type == 'MESH')
        factor, source_error, source_points = normalize_character(rig, mesh)
        rig.name = 'Protagonist'
        mesh.name = 'ProtagonistMesh'
        source_triangles = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
        # The user explicitly retains the complete mesh and owns later polygon
        # optimisation. Do not decimate or remove concealed geometry here.
        triangles = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
        assert triangles == source_triangles
        max_influences = max(sum(g.weight > 0 for g in v.groups) for v in mesh.data.vertices)
        if max_influences > 8:
            raise RuntimeError(f'Character exceeds Babylon\'s eight skin influences: {max_influences}')
        feet = ground_indices(mesh)
        target_rest = {b.name: rest_rotation(rig, b) for b in rig.data.bones}
        target_local = {b.name: (target_rest[b.parent.name].inverted() @ target_rest[b.name]
                               if b.parent else target_rest[b.name]) for b in rig.data.bones}
        for clip_name, member in CLIPS:
            path = Path(stage) / member
            payload = archive.read(member)
            path.write_bytes(payload)
            existing = set(bpy.data.objects)
            bpy.ops.import_scene.fbx(filepath=str(path), automatic_bone_orientation=False, use_anim=True)
            imported = set(bpy.data.objects) - existing
            source_rig = next(o for o in imported if o.type == 'ARMATURE')
            source_rig.matrix_world = Matrix.Scale(factor, 4) @ source_rig.matrix_world
            bpy.context.view_layer.update()
            source_action = source_rig.animation_data.action
            start, end = [int(round(f)) for f in source_action.frame_range]
            missing = set(target_rest) - set(source_rig.data.bones.keys())
            if missing:
                raise RuntimeError(f'{clip_name} lacks target bones: {missing}')
            correction = {}
            for bone in rig.data.bones:
                source_rest = rest_rotation(source_rig, source_rig.data.bones[bone.name])
                target_axis = target_rest[bone.name] @ Vector((0, 1, 0))
                source_axis = source_rest @ Vector((0, 1, 0))
                correction[bone.name] = source_rest.inverted() @ target_axis.rotation_difference(source_axis) @ target_rest[bone.name]
            scene.frame_set(start)
            first_hip = source_rig.matrix_world @ source_rig.pose.bones['mixamorig:Hips'].head
            first_heading = (source_rig.matrix_world @ source_rig.pose.bones['mixamorig:Hips'].matrix).to_quaternion()
            scene.frame_set(end)
            last_hip = source_rig.matrix_world @ source_rig.pose.bones['mixamorig:Hips'].head
            last_heading = (source_rig.matrix_world @ source_rig.pose.bones['mixamorig:Hips'].matrix).to_quaternion()
            _, source_yaw = (last_heading @ first_heading.inverted()).to_swing_twist('Z')
            source_rest_hip = source_rig.matrix_world @ source_rig.data.bones['mixamorig:Hips'].head_local
            action = bpy.data.actions.new(clip_name)
            action.use_fake_user = True
            rig.animation_data_create()
            rig.animation_data.action = action
            for pb in rig.pose.bones:
                pb.rotation_mode = 'QUATERNION'
                pb.location = (0, 0, 0)
                pb.scale = (1, 1, 1)
            poses = []
            min_floor, max_floor = math.inf, -math.inf
            is_turn = clip_name.startswith('Turn')
            for frame in range(start, end + 1):
                scene.frame_set(frame)
                heading = (source_rig.matrix_world @ source_rig.pose.bones['mixamorig:Hips'].matrix).to_quaternion()
                _, yaw = (heading @ first_heading.inverted()).to_swing_twist('Z')
                unwind = Quaternion((0, 0, 1), -yaw) if is_turn else Quaternion()
                rotations = {}
                for pb in rig.pose.bones:
                    source_pose = (source_rig.matrix_world @ source_rig.pose.bones[pb.name].matrix).to_quaternion()
                    desired = unwind @ source_pose @ correction[pb.name]
                    local_pose = rotations[pb.parent.name].inverted() @ desired if pb.parent else desired
                    pb.rotation_quaternion = target_local[pb.name].inverted() @ local_pose
                    rotations[pb.name] = desired
                motion = source_rig.matrix_world @ source_rig.pose.bones['mixamorig:Hips'].head - source_rest_hip
                fraction = (frame - start) / max(1, end - start)
                motion.x -= first_hip.x - source_rest_hip.x + (last_hip.x - first_hip.x) * fraction
                motion.y -= first_hip.y - source_rest_hip.y + (last_hip.y - first_hip.y) * fraction
                if is_turn:
                    motion = unwind @ motion
                root_pb = rig.pose.bones['mixamorig:Hips']
                root_pb.location = target_rest[root_pb.name].inverted() @ motion
                bpy.context.view_layer.update()
                floor = boot_floor(mesh, feet)
                min_floor, max_floor = min(min_floor, floor), max(max_floor, floor)
                poses.append((frame - start + 1, {p.name: p.rotation_quaternion.copy() for p in rig.pose.bones}, motion.copy()))
            for frame, rotations, motion in poses:
                motion.z -= min_floor
                for pb in rig.pose.bones:
                    pb.rotation_quaternion = rotations[pb.name]
                    pb.location = (0, 0, 0)
                    if pb.name == 'mixamorig:Hips':
                        pb.location = target_rest[pb.name].inverted() @ motion
                        pb.keyframe_insert('location', frame=frame, group=pb.name)
                    pb.keyframe_insert('rotation_quaternion', frame=frame, group=pb.name)
            for obj in imported:
                bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.actions.remove(source_action)
            action.frame_start, action.frame_end = 1, end - start + 1
            actions.append(action)
            duration = (end - start) / 30
            reports.append({'name': clip_name, 'source': member, 'source_sha256': hashlib.sha256(payload).hexdigest(),
                            'seconds': duration, 'frames': end-start+1, 'mapped_bones': len(rig.data.bones),
                            'reference_speed_mps': math.hypot(last_hip.x-first_hip.x, last_hip.y-first_hip.y)/duration,
                            'source_yaw_degrees': math.degrees(source_yaw), 'root_yaw_removed': is_turn,
                            'ground_offset_m': -min_floor, 'boot_floor_range_m': [0, max_floor-min_floor]})
            print(f'Prepared {clip_name}', flush=True)
    rig.animation_data.action = actions[0]
    rig.animation_data.action_slot = actions[0].slots[0]
    scene.frame_start, scene.frame_end = 1, int(actions[0].frame_range[1])
    scene.frame_set(1)
    for image in bpy.data.images:
        if image.source == 'FILE' and image.has_data and image.users:
            image.pack()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [rig, mesh]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(RUNTIME), export_format='GLB', use_selection=True,
        export_yup=True, export_skins=True, export_morph=False, export_materials='EXPORT',
        export_all_influences=True,
        export_image_format='WEBP', export_image_webp_fallback=False, export_image_quality=90,
        export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_frame_range=False, export_frame_step=1, export_optimize_animation_size=True,
        export_cameras=False, export_lights=False)
    bpy.data.orphans_purge(do_recursive=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.preferences.filepaths.file_preview_type = 'NONE'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'protagonist-runtime-v3.blend'), compress=True)
    report = {'source_blend': str(SOURCE.relative_to(ROOT)), 'source_blend_sha256': digest(SOURCE),
              'source_archive': str(ARCHIVE.relative_to(ROOT)), 'source_archive_sha256': digest(ARCHIVE),
              'rigged_member': model_name, 'rigged_member_sha256': hashlib.sha256(model_bytes).hexdigest(),
              'provenance': 'User-supplied Meshy character, edited in Blender and rigged in Mixamo. Animation FBX stacks identify mixamo.com; acquisition/license documents were not supplied.',
              'blender_version': bpy.app.version_string, 'import_scale_correction': factor,
              'maximum_authored_geometry_error_m': source_error,
              'authored_bounds_blender_m': [source_points.min(axis=0).tolist(), source_points.max(axis=0).tolist()],
              'source_triangles': source_triangles, 'runtime_triangles': triangles,
              'mesh_decimated': False,
              'budget_note': 'Full source mesh retained at the user\'s explicit request; polygon optimisation is deferred to the user. The prior 40k-triangle/5 MiB target is reported, not enforced for this source swap.',
              'skin_joints': len(rig.data.bones), 'runtime_glb': str(RUNTIME.relative_to(ROOT)),
              'maximum_vertex_skin_influences': max_influences,
              'all_skin_influences_retained': True,
              'runtime_sha256': digest(RUNTIME), 'runtime_bytes': RUNTIME.stat().st_size,
              'clips': reports, 'original_files_modified': False,
              'coordinates': 'Blender metres/Z up/faces -Y; GLB metres/Y up/faces +Z. Identity rig at ground origin. Authored torso offset retained.',
              'material': 'Original corrected Blender UVMap and full base colour, normal, packed metallic/roughness material; embedded WebP runtime textures.',
              'retarget': 'Bone-name mapping, anatomical axis alignment and rest-roll correction. Net horizontal travel removed; turn yaw unwound; constant per-clip ground correction preserves bob and flight.'}
    (OUT / 'export-report.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print('RUNTIME_REPORT '+json.dumps(report), flush=True)


if __name__ == '__main__':
    build()
