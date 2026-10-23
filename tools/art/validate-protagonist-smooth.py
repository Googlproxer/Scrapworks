"""Check the GLB structure and re-import it in an isolated background Blender."""
import bpy
import hashlib
import json
import struct
import tempfile
from pathlib import Path

root=Path(__file__).resolve().parents[2]
out=root/'art/characters/3d/protagonist-smooth-v1'
validation_temp=out/'.validation-temp'
validation_temp.mkdir(exist_ok=True)
tempfile.tempdir=str(validation_temp)
data=(out/'protagonist-smooth-v1.glb').read_bytes()
magic,version,size=struct.unpack_from('<4sII',data)
assert magic==b'glTF' and version==2 and size==len(data)
json_size,chunk=struct.unpack_from('<I4s',data,12)
assert chunk==b'JSON'
model=json.loads(data[20:20+json_size])
assert not model.get('skins') and not model.get('animations')
assert model.get('images') and all('bufferView' in image for image in model['images'])
primitives=[p for m in model['meshes'] for p in m['primitives']]
assert all('POSITION' in p['attributes'] and 'NORMAL' in p['attributes']
           and 'TEXCOORD_0' in p['attributes'] for p in primitives)
triangles=sum(model['accessors'][p['indices']]['count']//3 for p in primitives)
for filename in ['albedo-atlas.png','roughness-atlas.png']:
    png=(out/filename).read_bytes()
    assert png[:8]==b'\x89PNG\r\n\x1a\n'
    assert struct.unpack_from('>II',png,16)==(1024,1024)
source=root/'art/characters/protagonist-south-idle-v2.png'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='fe4718cc934c9adc174b3fa6e3fe7b8a48cf901a8ab6fa9cea5c932b945cf085'

# This validator is only run in a separate background process.
assert bpy.app.background
bpy.ops.wm.open_mainfile(filepath=str(out/'protagonist-smooth-v1.blend'))
assert bpy.context.scene.name=='Scrapworks - Smooth Protagonist v1'
assert len(bpy.data.scenes)==1
assert all(i.packed_file or i.packed_files for i in bpy.data.images if i.type=='IMAGE')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(out/'protagonist-smooth-v1.glb'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(meshes)>=100 and all(o.data.uv_layers for o in meshes)
assert not any(o.type in {'LIGHT','CAMERA','ARMATURE'} for o in bpy.context.scene.objects)
assert all(i.packed_file or i.packed_files for i in bpy.data.images if i.type=='IMAGE')
report={'glb_version':version,'mesh_objects_reimported':len(meshes),
    'triangles':triangles,'materials':len(model['materials']),
    'embedded_images':len(model['images']),'glb_bytes':len(data),
    'texture_size':[1024,1024],'original_player_png_unchanged':True,
    'rigged':False,'animated':False,'studio_excluded':True,
    'standalone_blend_opens_to_character':True,'blend_images_packed':True,
    'validation':'GLB structure, embedded textures, UVs/normals, actual Blender re-import'}
(out/'validation-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
