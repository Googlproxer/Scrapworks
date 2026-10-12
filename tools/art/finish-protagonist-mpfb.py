"""Reduce excessive normal-map detail on MPFB clothes for the review model."""
import bpy
import importlib
from pathlib import Path

out = Path(__file__).resolve().parents[2] / 'docs/art/characters/3d/protagonist-mpfb-v1'
scene = bpy.data.scenes['Scrapworks - MPFB Protagonist v1']
bpy.context.window.scene = scene
pkg = next(name for name in bpy.context.preferences.addons.keys() if name.endswith('.mpfb'))
NodeService = importlib.import_module(pkg + '.services.nodeservice').NodeService
for name, strength in [('Orange cargo trousers [MPFB]', 0.18), ('Charcoal ankle boots [MPFB]', 0.20)]:
    for material in bpy.data.objects[name].data.materials:
        for node in material.node_tree.nodes:
            if node.type == 'NORMAL_MAP':
                NodeService.set_socket_default_values(node, {'Strength': strength})
for material in bpy.data.objects['Brown ponytail [MPFB]'].data.materials:
    for node in material.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            NodeService.set_socket_default_values(node, {'Roughness': 0.86, 'Specular IOR Level': 0.22})
for material in bpy.data.objects['Protagonist MPFB body'].data.materials:
    for node in material.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            NodeService.set_socket_default_values(node, {'Roughness': 0.70, 'Specular IOR Level': 0.30})
# MPFB's generic game shader links alpha for every texture. Keep alpha only on
# the assets that require it; skin and mouth parts should export as opaque.
for name in ('Protagonist MPFB body', 'Teeth [MPFB]', 'Tongue [MPFB]'):
    for material in bpy.data.objects[name].data.materials:
        for node in material.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                NodeService.remove_link(material.node_tree, node, 'Alpha')
                NodeService.set_socket_default_values(node, {'Alpha': 1.0})
bpy.data.libraries.write(str(out / 'protagonist-mpfb-v1.blend'), {scene}, fake_user=True, compress=True)
result = {'clothing_normal_maps_softened': True, 'hair_highlights_softened': True}
