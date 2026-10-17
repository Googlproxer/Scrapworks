"""Inspect GLB structure without external dependencies."""
import json
import struct
from pathlib import Path

out = Path(__file__).resolve().parents[2] / 'art/characters/3d/protagonist-mpfb-v1'
data = (out / 'protagonist-mpfb-v1.glb').read_bytes()
magic, version, length = struct.unpack_from('<4sII', data)
assert magic == b'glTF' and version == 2 and length == len(data)
chunk_length, chunk_type = struct.unpack_from('<II', data, 12)
assert chunk_type == 0x4E4F534A
gltf = json.loads(data[20:20 + chunk_length])
primitives = [p for m in gltf.get('meshes', []) for p in m['primitives']]
report = {'valid_glb_header': True, 'bytes': len(data), 'meshes': len(gltf.get('meshes', [])),
    'triangles': sum(gltf['accessors'][p['indices']]['count'] // 3 for p in primitives),
    'materials': len(gltf.get('materials', [])), 'embedded_images': len(gltf.get('images', [])),
    'skins': len(gltf.get('skins', [])), 'joints_per_skin': [len(s['joints']) for s in gltf.get('skins', [])],
    'animations': len(gltf.get('animations', [])),
    'all_images_embedded': all('bufferView' in img for img in gltf.get('images', [])),
    'all_meshes_have_skin_attributes': all('JOINTS_0' in p['attributes'] and 'WEIGHTS_0' in p['attributes'] for p in primitives),
    'all_meshes_have_uvs': all('TEXCOORD_0' in p['attributes'] for p in primitives),
    'camera_or_light_nodes': [n.get('name') for n in gltf.get('nodes', []) if 'camera' in n or 'KHR_lights_punctual' in n.get('extensions', {})],
    'alpha_materials': [m['name'] for m in gltf['materials'] if m.get('alphaMode', 'OPAQUE') != 'OPAQUE'],
}
assert report['all_images_embedded'] and report['all_meshes_have_skin_attributes'] and report['all_meshes_have_uvs']
assert not report['camera_or_light_nodes']
(out / 'glb-inspection.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
