"""Export the character alone through Blender's glTF exporter."""
import bpy
import json
import tempfile
from pathlib import Path

root=Path(__file__).resolve().parents[2]
out=root/'art/characters/3d/protagonist-smooth-v1'
export_temp=out/'.export-temp'
export_temp.mkdir(exist_ok=True)
tempfile.tempdir=str(export_temp)
scene=bpy.data.scenes['Scrapworks - Smooth Protagonist v1']
if bpy.context.window:
    bpy.context.window.scene=scene
for other_scene in list(bpy.data.scenes):
    if other_scene != scene and not other_scene.objects:
        bpy.data.scenes.remove(other_scene)
if bpy.context.mode!='OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
for obj in scene.objects:
    obj.select_set(False)
selected=[]
for child in scene.collection.children:
    if child.name.startswith(('01 ','02 ','03 ','04 ')):
        for obj in child.objects:
            if obj.type=='MESH':
                obj.select_set(True)
                selected.append(obj)
bpy.context.view_layer.objects.active=selected[0]
path=out/'protagonist-smooth-v1.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
    export_apply=True,export_yup=True,export_materials='EXPORT',export_normals=True)
result={'glb_file':str(path),'selected_meshes':len(selected),'bytes':path.stat().st_size,
    'includes_rig':False,'includes_animations':False,'includes_studio':False}
(out/'export-report.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
scene.camera=bpy.data.objects['Camera - three quarter']
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.region_3d.view_location=(0,0,1.0)
            space.region_3d.view_distance=2.8
            space.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()
            space.region_3d.view_perspective='ORTHO'
            space.shading.type='SOLID';space.shading.color_type='MATERIAL'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'protagonist-smooth-v1.blend'))
