"""Render actual MPFB geometry from the saved Blender project."""
import bpy
from pathlib import Path

out = Path(__file__).resolve().parents[2] / 'docs/art/characters/3d/protagonist-mpfb-v1'
scene = bpy.data.scenes['Scrapworks - MPFB Protagonist v1']
bpy.context.window.scene = scene
for view in ('front', 'three-quarter', 'back', 'face'):
    scene.camera = bpy.data.objects['MPFB Camera ' + view]
    scene.render.filepath = str(out / ('preview-' + view + '.png'))
    bpy.ops.render.render(write_still=True, scene=scene.name)
    print('RENDERED ' + view, flush=True)
