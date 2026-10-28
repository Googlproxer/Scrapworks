"""Build the runtime character in an isolated Blender background process.

blender --background --factory-startup --disable-autoexec --python tools/art/build-protagonist-runtime.py

The retained GLB is the geometry/material/skin source. Its editable authoring
project and all original files are preserved. Animation FBXs are read from the
retained archive into a temporary directory, never from the user's working copy.
"""
import hashlib
import json
import math
import struct
import tempfile
import zipfile
from pathlib import Path

import bpy
import bmesh
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art/characters/Protag-v1.glb'
ARCHIVE = ROOT / 'art/characters/Female Locomotion Pack.zip'
OUT = ROOT / 'art/characters/protagonist-runtime-v2'
RUNTIME = ROOT / 'public/assets/models/protagonist-v2.glb'
CLIPS = [('Idle', 'idle.fbx'), ('Walk', 'walking.fbx'), ('Run', 'running.fbx'),
         ('TurnLeft', 'left turn.fbx'), ('TurnRight', 'right turn.fbx')]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def world_bounds(objects):
    graph = bpy.context.evaluated_depsgraph_get()
    points = [o.matrix_world @ Vector(v) for o in objects
              for v in o.evaluated_get(graph).bound_box]
    return [[min(p[i] for p in points) for i in range(3)],
            [max(p[i] for p in points) for i in range(3)]]


def mesh_floor(objects):
    graph = bpy.context.evaluated_depsgraph_get()
    floors = []
    for obj in objects:
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        floors.append(min((obj.matrix_world @ v.co).z for v in mesh.vertices))
        evaluated.to_mesh_clear()
    return min(floors)


def rest_rotation(rig, bone):
    return (rig.matrix_world @ bone.matrix_local).to_quaternion()


def mask_body_beneath_trousers(meshes):
    """Omit concealed lower-body faces that otherwise poke through bent trousers.

    Semantic skin-weight selection protects hands even where they overlap the
    legs in the source pose. The original source mesh and garment are untouched.
    """
    body = next(o for o in meshes if any(slot.material and slot.material.name.startswith('Human.body') for slot in o.material_slots))
    lower = {g.index for g in body.vertex_groups if any(part in g.name for part in ['UpLeg', 'Leg', 'Foot', 'ToeBase'])}
    pelvis = {g.index for g in body.vertex_groups if g.name.endswith(':Hips')}
    hidden = set()
    for vertex in body.data.vertices:
        height = (body.matrix_world @ vertex.co).z
        limb_weight = sum(g.weight for g in vertex.groups if g.group in lower)
        pelvis_weight = sum(g.weight for g in vertex.groups if g.group in pelvis)
        if (height < 0.90 and limb_weight > 0.5) or (height < 0.82 and pelvis_weight + limb_weight > 0.8):
            hidden.add(vertex.index)
    mesh = bmesh.new()
    mesh.from_mesh(body.data)
    mesh.verts.ensure_lookup_table()
    faces = [f for f in mesh.faces if all(v.index in hidden for v in f.verts)]
    removed = sum(len(f.verts) - 2 for f in faces)
    bmesh.ops.delete(mesh, geom=faces, context='FACES')
    mesh.to_mesh(body.data)
    mesh.free()
    body.data.update()
    return removed


def retain_source_webp_images():
    """Reuse the exact existing runtime WebP encoding, avoiding lossy re-encode.

    Blender prefers the PNG fallback while importing the retained dual-encoded
    source. Repacking the existing WebP bytes preserves the original runtime
    appearance and removes the fallback payload without lowering resolution.
    """
    def read_glb(path):
        data = path.read_bytes()
        size = struct.unpack_from('<I', data, 12)[0]
        document = json.loads(data[20:20 + size])
        return document, data[28 + size:]
    source, source_binary = read_glb(SOURCE)
    target, target_binary = read_glb(RUNTIME)
    images = {}
    for image in source['images']:
        if image['mimeType'] != 'image/webp':
            continue
        view = source['bufferViews'][image['bufferView']]
        offset = view.get('byteOffset', 0)
        images[image['name']] = source_binary[offset:offset + view['byteLength']]
    replacements = {image['bufferView']: images[image['name']] for image in target['images']}
    binary = bytearray()
    for index, view in enumerate(target['bufferViews']):
        while len(binary) % 4:
            binary.append(0)
        offset = view.get('byteOffset', 0)
        data = replacements.get(index, target_binary[offset:offset + view['byteLength']])
        view['byteOffset'] = len(binary)
        view['byteLength'] = len(data)
        binary.extend(data)
    while len(binary) % 4:
        binary.append(0)
    target['buffers'][0]['byteLength'] = len(binary)
    document = json.dumps(target, separators=(',', ':')).encode('utf-8')
    document += b' ' * (-len(document) % 4)
    size = 12 + 8 + len(document) + 8 + len(binary)
    RUNTIME.write_bytes(struct.pack('<4sII', b'glTF', 2, size) +
                        struct.pack('<I4s', len(document), b'JSON') + document +
                        struct.pack('<I4s', len(binary), b'BIN\0') + binary)
    if size > 5 * 1024 * 1024:
        raise RuntimeError(f'Runtime character exceeds 5 MiB: {size} bytes')


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    RUNTIME.parent.mkdir(parents=True, exist_ok=True)
    (ROOT / 'tmp').mkdir(exist_ok=True)
    tempfile.tempdir = str(ROOT / 'tmp')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    scene = bpy.context.scene
    scene.name = 'Scrapworks runtime protagonist v2'
    scene.render.fps = 30
    rig = next(o for o in scene.objects if o.type == 'ARMATURE')
    rig.name = 'Protagonist'
    meshes = [o for o in scene.objects if o.type == 'MESH' and
              any(m.type == 'ARMATURE' and m.object == rig for m in o.modifiers)]
    boots = [o for o in meshes if 'boots' in o.name.lower()]
    if len(meshes) != 10 or len(rig.data.bones) != 52 or len(boots) != 1:
        raise RuntimeError('Unexpected retained protagonist hierarchy')
    source_bounds = world_bounds(meshes)
    concealed_triangles_removed = mask_body_beneath_trousers(meshes)
    target_rest = {b.name: rest_rotation(rig, b) for b in rig.data.bones}
    target_local = {b.name: ((target_rest[b.parent.name].inverted() @ target_rest[b.name])
                            if b.parent else target_rest[b.name]) for b in rig.data.bones}
    clips = []
    created_actions = []
    with zipfile.ZipFile(ARCHIVE) as archive, tempfile.TemporaryDirectory(prefix='scrapworks-character-') as temp:
        for clip_name, source_name in CLIPS:
            path = Path(temp) / source_name
            data = archive.read(source_name)
            path.write_bytes(data)
            existing = set(bpy.data.objects)
            bpy.ops.import_scene.fbx(filepath=str(path), automatic_bone_orientation=False, use_anim=True)
            imported = set(bpy.data.objects) - existing
            source_rig = next(o for o in imported if o.type == 'ARMATURE')
            source_action = source_rig.animation_data.action
            source_bone_count = len(source_rig.data.bones)
            start, end = (int(round(f)) for f in source_action.frame_range)
            missing = set(target_rest) - set(source_rig.data.bones.keys())
            if missing:
                raise RuntimeError(f'{clip_name} lacks target bones: {missing}')
            # The source is T-pose, the retained character is A-pose. Match bone
            # directions before calculating the residual roll/basis correction.
            # This retains target bind poses while reproducing anatomical motion.
            correction = {}
            for bone in rig.data.bones:
                source_bone = source_rig.data.bones[bone.name]
                source_rest = rest_rotation(source_rig, source_bone)
                target_axis = target_rest[bone.name] @ Vector((0, 1, 0))
                source_axis = source_rest @ Vector((0, 1, 0))
                align_axis = target_axis.rotation_difference(source_axis)
                correction[bone.name] = source_rest.inverted() @ align_axis @ target_rest[bone.name]
            scene.frame_set(start)
            first_hip = source_rig.matrix_world @ source_rig.pose.bones['mixamorig:Hips'].head
            first_heading = (source_rig.matrix_world @ source_rig.pose.bones['mixamorig:Hips'].matrix).to_quaternion()
            scene.frame_set(end)
            last_hip = source_rig.matrix_world @ source_rig.pose.bones['mixamorig:Hips'].head
            last_heading = (source_rig.matrix_world @ source_rig.pose.bones['mixamorig:Hips'].matrix).to_quaternion()
            _, source_yaw = (last_heading @ first_heading.inverted()).to_swing_twist('Z')
            is_turn = clip_name.startswith('Turn')
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
            min_floor = math.inf
            max_floor = -math.inf
            for frame in range(start, end + 1):
                scene.frame_set(frame)
                heading = (source_rig.matrix_world @ source_rig.pose.bones['mixamorig:Hips'].matrix).to_quaternion()
                _, yaw = (heading @ first_heading.inverted()).to_swing_twist('Z')
                # Turn FBXs rotate the complete skeleton by a quarter-turn.
                # Remove that heading from every world pose: the presentation
                # root performs the turn once, while the clip supplies footwork.
                unwind = Quaternion((0, 0, 1), -yaw) if is_turn else Quaternion()
                rotations = {}
                for pb in rig.pose.bones:
                    world_rotation = (source_rig.matrix_world @ source_rig.pose.bones[pb.name].matrix).to_quaternion()
                    desired = unwind @ world_rotation @ correction[pb.name]
                    local_pose = (rotations[pb.parent.name].inverted() @ desired) if pb.parent else desired
                    pb.rotation_quaternion = target_local[pb.name].inverted() @ local_pose
                    rotations[pb.name] = desired
                hip = source_rig.matrix_world @ source_rig.pose.bones['mixamorig:Hips'].head
                fraction = (frame - start) / max(1, end - start)
                motion = hip - source_rest_hip
                # Remove planar net travel AND initial planar offset. The hip's
                # cyclical side-to-side motion remains, with equal loop endpoints.
                motion.x -= first_hip.x - source_rest_hip.x + (last_hip.x - first_hip.x) * fraction
                motion.y -= first_hip.y - source_rest_hip.y + (last_hip.y - first_hip.y) * fraction
                if is_turn:
                    motion = unwind @ motion
                root_pb = rig.pose.bones['mixamorig:Hips']
                root_pb.location = target_rest[root_pb.name].inverted() @ motion
                bpy.context.view_layer.update()
                floor = mesh_floor(boots)
                min_floor = min(min_floor, floor)
                max_floor = max(max_floor, floor)
                poses.append((frame - start + 1, {p.name: p.rotation_quaternion.copy() for p in rig.pose.bones}, motion.copy(), floor))
            # Constant per-clip ground correction preserves the source vertical
            # bob and flight phases. Root horizontal translation remains zero.
            ground_offset = -min_floor
            for frame, rotations, motion, floor in poses:
                for pb in rig.pose.bones:
                    pb.rotation_quaternion = rotations[pb.name]
                    pb.location = (0, 0, 0)
                    if pb.name == 'mixamorig:Hips':
                        motion.z += ground_offset
                        pb.location = target_rest[pb.name].inverted() @ motion
                        pb.keyframe_insert('location', frame=frame, group=pb.name)
                    pb.keyframe_insert('rotation_quaternion', frame=frame, group=pb.name)
            for obj in imported:
                bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.actions.remove(source_action)
            action.frame_start = 1
            action.frame_end = end - start + 1
            created_actions.append(action)
            duration = (end - start) / 30
            clips.append({'name': clip_name, 'source': source_name, 'source_sha256': hashlib.sha256(data).hexdigest(),
                          'frames': end - start + 1, 'fps': 30, 'seconds': duration,
                          'source_horizontal_travel_m': math.hypot(last_hip.x-first_hip.x, last_hip.y-first_hip.y),
                          'reference_speed_mps': math.hypot(last_hip.x-first_hip.x, last_hip.y-first_hip.y) / duration,
                          'source_yaw_degrees': math.degrees(source_yaw),
                          'root_yaw_removed': is_turn,
                          'reference_turn_radians_per_second': abs(source_yaw) / duration if is_turn else 0,
                          'ground_offset_m': ground_offset, 'boot_floor_range_m': [0, max_floor-min_floor],
                          'mapped_bones': 52, 'omitted_terminal_bones': source_bone_count - 52})
    rig.animation_data.action = created_actions[0]
    rig.animation_data.action_slot = created_actions[0].slots[0]
    scene.frame_start = 1
    scene.frame_end = int(created_actions[0].frame_range[1])
    scene.frame_set(1)
    for image in bpy.data.images:
        if image.source == 'FILE' and image.has_data:
            image.pack()
    for obj in scene.objects:
        obj.select_set(False)
    for obj in [rig] + meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(RUNTIME), export_format='GLB', use_selection=True,
        export_yup=True, export_skins=True, export_morph=False, export_materials='EXPORT',
        export_image_format='WEBP', export_image_webp_fallback=False, export_image_quality=90,
        export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_frame_range=False, export_frame_step=1,
        export_optimize_animation_size=True, export_cameras=False, export_lights=False)
    retain_source_webp_images()
    bpy.data.orphans_purge(do_recursive=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.preferences.filepaths.file_preview_type = 'NONE'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'protagonist-runtime-v2.blend'), compress=True)
    report = {'source_glb': str(SOURCE.relative_to(ROOT)), 'source_glb_sha256': digest(SOURCE),
              'source_blend': 'art/characters/Protag-v1.blend',
              'source_blend_sha256': digest(ROOT / 'art/characters/Protag-v1.blend'),
              'animation_archive': str(ARCHIVE.relative_to(ROOT)), 'animation_archive_sha256': digest(ARCHIVE),
              'animation_provenance': 'Existing user-supplied archive; FBX stacks identify mixamo.com. No download receipt or license file accompanies the archive.',
              'blender_version': bpy.app.version_string, 'source_bounds_blender_m': source_bounds,
              'concealed_lower_body_triangles_removed': concealed_triangles_removed,
              'runtime_glb': str(RUNTIME.relative_to(ROOT)), 'runtime_bytes': RUNTIME.stat().st_size,
              'runtime_sha256': digest(RUNTIME), 'clips': clips,
              'retarget': 'Bone-name mapping with source/target rest-frame roll correction after anatomical bone-axis alignment; visible geometry, proportions and skin weights retained. Concealed lower-body faces are omitted to prevent trouser penetration.',
              'coordinate_convention': 'Blender metres, Z up, character faces -Y; glTF metres, Y up, character faces +Z. Root armature is identity; simulation owns horizontal world translation.',
              'original_files_modified': False}
    (OUT / 'export-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('RUNTIME_REPORT ' + json.dumps(report))


if __name__ == '__main__':
    build()
