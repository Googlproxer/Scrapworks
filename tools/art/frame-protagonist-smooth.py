"""Frame the generated character scene in the current Blender viewport."""
import bpy
scene=bpy.data.scenes['Scrapworks - Smooth Protagonist v1']
camera=bpy.data.objects['Camera - three quarter']
if bpy.context.window:
    bpy.context.window.scene=scene
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.region_3d.view_location=(0,0,1.0)
            space.region_3d.view_distance=2.8
            space.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            space.region_3d.view_perspective='ORTHO'
            space.shading.type='SOLID';space.shading.color_type='MATERIAL'
result={'scene':scene.name,'viewport_framed':True}
