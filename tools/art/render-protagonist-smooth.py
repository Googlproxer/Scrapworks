"""Render review views of the saved smooth prototype in background Blender."""
import bpy
import json
from pathlib import Path

root=Path(__file__).resolve().parents[2]
out=root/'art/characters/3d/protagonist-smooth-v1'
scene=bpy.data.scenes['Scrapworks - Smooth Protagonist v1']
bpy.context.window.scene=scene
scene.render.resolution_percentage=100
scene.cycles.samples=32
scene.cycles.use_denoising=True
for view in ['front','three quarter','back']:
    scene.camera=bpy.data.objects['Camera - '+view]
    scene.render.filepath=str(out/('preview-'+view.replace(' ','-')+'.png'))
    bpy.ops.render.render(write_still=True,scene=scene.name)
print(json.dumps({'rendered':['front','three-quarter','back']}))
