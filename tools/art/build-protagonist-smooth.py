"""Build the first smooth Scrapworks character study in a separate Blender scene.

Execute through the official Blender MCP server. The current scene is retained.
The anatomy uses CC0 MPFB assets; clothes, hair, boots and presentation are authored
here. This is an unrigged visual prototype with editable subdivision modifiers.
"""
import bpy
import bmesh
import gzip
import json
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/characters/3d/protagonist-smooth-v1'
SOURCE = OUT / 'sources'
SCENE_NAME = 'Scrapworks - Smooth Protagonist v1'

# Only replace an earlier scene created by this script, never the user's scene.
old_scene = bpy.data.scenes.get(SCENE_NAME)
if old_scene:
    if not old_scene.get('scrapworks_generated'):
        raise RuntimeError('The intended scene name is already in use.')
    for window in bpy.context.window_manager.windows:
        if window.scene == old_scene:
            window.scene = next(s for s in bpy.data.scenes if s != old_scene)
    for obj in list(old_scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(old_scene)

scene = bpy.data.scenes.new(SCENE_NAME)
scene['scrapworks_generated'] = True
scene['stage'] = 'Unrigged smooth visual prototype; facial likeness needs refinement'
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0
if bpy.context.window:
    bpy.context.window.scene = scene

def collection(name):
    item = bpy.data.collections.new(name)
    scene.collection.children.link(item)
    return item

BODY = collection('01 Anatomy and face')
CLOTH = collection('02 Tank top and lowered jumpsuit')
HAIR = collection('03 Ponytail and swept fringe')
BOOTS = collection('04 Work boots')
STUDIO = collection('05 Preview studio')
REFERENCE = collection('06 Modelling reference')
character_objects = []

PALETTE = [
    ('Skin', '#dba078', .54), ('Cream cotton', '#eee5ce', .88),
    ('Orange canvas', '#cc543c', .85), ('Navy reinforcement', '#293b59', .83),
    ('Brown hair', '#663b25', .58), ('Hair highlight', '#8c5330', .59),
    ('Boot leather', '#252b2d', .49), ('Rubber sole', '#161a1e', .94),
    ('Lips', '#a85a50', .49), ('Eye white', '#ede9e2', .30),
    ('Brown iris', '#583822', .35), ('Pupil and lashes', '#101013', .29),
    ('Brass eyelets', '#ad8550', .38), ('Dark hair', '#422a21', .44),
    ('Canvas seam', '#a34130', .83), ('Boot lace', '#555a53', .85),
]

def rgb(hex_colour):
    return tuple(int(hex_colour[k:k+2], 16)/255 for k in (1,3,5))

def linear(value):
    return value/12.92 if value <= .04045 else ((value+.055)/1.055)**2.4

# A reusable material atlas, with subtle mottling rather than painted lighting.
# It is generated from material values, not from the concept image.
SIZE = 1024
albedo = bpy.data.images.new('SW Protagonist Albedo Atlas v1', width=SIZE, height=SIZE)
roughness = bpy.data.images.new('SW Protagonist Roughness Atlas v1', width=SIZE, height=SIZE)
roughness.colorspace_settings.name = 'Non-Color'
albedo_pixels, rough_pixels = [], []
for row in range(SIZE):
    for col in range(SIZE):
        slot = (row//256)*4 + col//256
        colour = rgb(PALETTE[slot][1])
        variation = .006 * math.sin(col*.21) * math.sin(row*.17)
        albedo_pixels.extend([max(0,min(1,v+variation)) for v in colour] + [1])
        value = PALETTE[slot][2]
        rough_pixels.extend([value,value,value,1])
albedo.pixels.foreach_set(albedo_pixels)
roughness.pixels.foreach_set(rough_pixels)
for image, filename in [(albedo,'albedo-atlas.png'),(roughness,'roughness-atlas.png')]:
    image.filepath_raw = str(OUT / filename)
    image.file_format = 'PNG'
    image.save()
# Reload as file textures so Blender interprets the PNG's sRGB values correctly.
albedo=bpy.data.images.load(str(OUT/'albedo-atlas.png'),check_existing=False)
albedo.colorspace_settings.name='sRGB';albedo.pack()
roughness=bpy.data.images.load(str(OUT/'roughness-atlas.png'),check_existing=False)
roughness.colorspace_settings.name='Non-Color';roughness.pack()

materials = []
for i,(name,colour,rough) in enumerate(PALETTE):
    mat = bpy.data.materials.new('SW ' + name)
    mat.diffuse_color = (*[linear(v) for v in rgb(colour)], 1)
    mat.use_nodes = True
    nodes,links = mat.node_tree.nodes,mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = rough
    base = nodes.new('ShaderNodeTexImage')
    base.image = albedo
    links.new(base.outputs['Color'],bsdf.inputs['Base Color'])
    rough_node = nodes.new('ShaderNodeTexImage')
    rough_node.image = roughness
    links.new(rough_node.outputs['Color'],bsdf.inputs['Roughness'])
    if i == 0:
        bsdf.inputs['Subsurface Weight'].default_value = .075
        bsdf.inputs['Subsurface Radius'].default_value = (.9,.4,.2)
    if i == 12:
        bsdf.inputs['Metallic'].default_value = .65
    materials.append(mat)

def atlas_uv(obj, original_uv=None):
    mesh = obj.data
    uv = mesh.uv_layers.new(name='MaterialAtlas')
    for polygon in mesh.polygons:
        slot = polygon.material_index
        for j,loop_id in enumerate(polygon.loop_indices):
            if original_uv is not None:
                u,v = original_uv[polygon.index][j]
            else:
                p = mesh.vertices[mesh.loops[loop_id].vertex_index].co
                u = (math.atan2(p.y,p.x)/(2*math.pi)+.5)%1
                v = (p.z*.7)%1
            uv.data[loop_id].uv = ((slot%4 + .04+.92*u)/4,(slot//4 + .04+.92*v)/4)

def mesh_object(name, verts, faces, target, slot=0, uv=None, face_slots=None, subdivision=0):
    mesh = bpy.data.meshes.new(name + ' control mesh')
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    target.objects.link(obj)
    for mat in materials:
        mesh.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth = True
        face.material_index = face_slots[face.index] if face_slots is not None else slot
    atlas_uv(obj,uv)
    if subdivision:
        mod = obj.modifiers.new('Smooth editable subdivision','SUBSURF')
        mod.levels = subdivision
        mod.render_levels = subdivision
    character_objects.append(obj)
    return obj

def sphere(name, center, scale, target, slot, segments=32, rings=20):
    verts, faces = [],[]
    for j in range(rings+1):
        phi = math.pi*j/rings
        for i in range(segments):
            theta = 2*math.pi*i/segments
            verts.append((center[0]+scale[0]*math.sin(phi)*math.cos(theta),
                          center[1]+scale[1]*math.sin(phi)*math.sin(theta),
                          center[2]+scale[2]*math.cos(phi)))
    for j in range(rings):
        for i in range(segments):
            ni = (i+1)%segments
            faces.append((j*segments+i,j*segments+ni,(j+1)*segments+ni,(j+1)*segments+i))
    return mesh_object(name,verts,faces,target,slot)

def tube(name, points, widths, target, slot, sides=12):
    pts = [Vector(p) for p in points]
    verts,faces=[],[]
    for j,p in enumerate(pts):
        tangent = (pts[min(j+1,len(pts)-1)]-pts[max(j-1,0)]).normalized()
        axis = Vector((0,1,0)) if abs(tangent.y)<.9 else Vector((1,0,0))
        u = tangent.cross(axis).normalized()
        v = tangent.cross(u).normalized()
        w = widths[j]
        rx,ry = (w,w) if isinstance(w,(int,float)) else w
        for i in range(sides):
            theta = 2*math.pi*i/sides
            verts.append(tuple(p+u*(rx*math.cos(theta))+v*(ry*math.sin(theta))))
    for j in range(len(pts)-1):
        for i in range(sides):
            n=(i+1)%sides
            faces.append((j*sides+i,j*sides+n,(j+1)*sides+n,(j+1)*sides+i))
    faces.extend([tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+i for i in range(sides))])
    return mesh_object(name,verts,faces,target,slot,subdivision=1)

def bezier(points, count=24):
    p=[Vector(v) for v in points]
    return [tuple(p[0]*(1-t)**3 + p[1]*3*t*(1-t)**2 + p[2]*3*t*t*(1-t)+p[3]*t**3)
            for t in [j/(count-1) for j in range(count)]]

def ring_shell(name, rings, target, slot, sides=48, subdivision=1):
    verts,faces=[],[]
    for cx,cy,z,rx,ry in rings:
        for i in range(sides):
            angle=2*math.pi*i/sides
            verts.append((cx+rx*math.cos(angle),cy+ry*math.sin(angle),z))
    for j in range(len(rings)-1):
        for i in range(sides):
            n=(i+1)%sides
            faces.append((j*sides+i,j*sides+n,(j+1)*sides+n,(j+1)*sides+i))
    obj=mesh_object(name,verts,faces,target,slot,subdivision=subdivision)
    solid=obj.modifiers.new('Fabric or leather thickness','SOLIDIFY')
    solid.thickness=.002
    return obj

# Parse the OBJ ourselves to preserve vertex IDs for its CC0 morphs and helpers.
raw,texcoords,groups=[],[],{}
group=''
for line in (SOURCE/'makehuman-base.obj').read_text().splitlines():
    bits=line.split()
    if not bits: continue
    if bits[0]=='v': raw.append(Vector([float(v) for v in bits[1:4]]))
    elif bits[0]=='vt': texcoords.append([float(v) for v in bits[1:3]])
    elif bits[0]=='g': group=bits[1]; groups.setdefault(group,[])
    elif bits[0]=='f':
        groups[group].append([tuple(int(v)-1 for v in term.split('/')[:2]) for term in bits[1:]])

MORPHS = [('caucasian-female-young',1),('universal-female-young-averagemuscle-averageweight',1),
          ('l-eye-scale-incr',.85),('r-eye-scale-incr',.85),('head-scale-horiz-incr',.25),
          ('nose-scale-depth-decr',.18),('nose-scale-horiz-decr',.12)]
for name,weight in MORPHS:
    with gzip.open(SOURCE/(name+'.target.gz'),'rt') as fh:
        for line in fh:
            bits=line.split()
            if len(bits)==4 and not bits[0].startswith('#'):
                raw[int(bits[0])] += Vector([float(v) for v in bits[1:]])*weight

floor=min(raw[v[0]].y for f in groups['body'] for v in f)
SCALE=.105
def transform(p):
    p=p.copy()
    if p.y>5.35:
        blend=min(1,(p.y-5.35)/.7)
        p.x*=1+.18*blend
        p.z=.40+(p.z-.40)*(1+.10*blend)
        p.y=5.35+(p.y-5.35)*(1+.04*blend)
    return Vector((p.x*SCALE,-p.z*SCALE,(p.y-floor)*SCALE+.04))

positions=[transform(v) for v in raw]
def joint(name):
    ids=set(v[0] for f in groups[name] for v in f)
    return sum((positions[i] for i in ids),Vector())/len(ids)

def subset(name, group, predicate, target, slot, adjust=None, slots=None, subdivision=2):
    chosen=[]
    for f in groups[group]:
        center=sum((raw[v[0]] for v in f),Vector())/len(f)
        if predicate(center): chosen.append(f)
    ids=sorted(set(v[0] for f in chosen for v in f))
    remap={old:new for new,old in enumerate(ids)}
    verts=[tuple(adjust(positions[i].copy(),raw[i])) if adjust else tuple(positions[i]) for i in ids]
    faces=[tuple(remap[v[0]] for v in f) for f in chosen]
    uv=[[texcoords[v[1]] for v in f] for f in chosen]
    face_slots=[slots(sum((raw[v[0]] for v in f),Vector())/len(f)) for f in chosen] if slots else None
    return mesh_object(name,verts,faces,target,slot,uv,face_slots,subdivision)

def shirt_region(p):
    if p.y<1.25 or abs(p.x)>1.63: return False
    upper=5.15
    if p.z>.4:
        upper=4.12+.78*min(1,abs(p.x)/.95)**1.7
    return p.y<upper

def body_slot(p):
    return 0

body=subset('Body - visible skin and face','body',
    lambda p: p.y>1.05 or abs(p.x)>2.5,BODY,0,slots=body_slot)

def shirt_adjust(p,raw):
    p.x*=1.018
    p.y += -.012 if raw.z>.3 else .008
    return p
shirt=subset('Cream tank top','body',shirt_region,CLOTH,1,shirt_adjust)
smooth=shirt.modifiers.new('Soften cotton neckline and contour','SMOOTH')
smooth.factor=.6;smooth.iterations=12
bpy.context.view_layer.objects.active=shirt
bpy.ops.object.modifier_move_up(modifier=smooth.name)
solid=shirt.modifiers.new('Cotton thickness','SOLIDIFY');solid.thickness=.002

def trouser_adjust(p,source):
    leg=1 if source.x>=0 else -1
    centre_x=leg*(.105 if source.y>-.5 else .155)
    p.x=centre_x+(p.x-centre_x)*1.15
    p.y=-.025+(p.y+.025)*1.17
    fold=.004*math.sin(p.z*51+math.atan2(p.y+.025,p.x-centre_x)*3)
    fold*=.35+.65*math.exp(-((p.z-.42)/.25)**2)
    outward=Vector((p.x-centre_x,p.y+.025,0)).normalized()
    p+=outward*(.008+fold)
    return p

pants=subset('Work trousers - orange and navy panels','helper-tights',
    lambda p:p.y<1.4 and p.y>-6.45 and abs(p.x)<2.65,CLOTH,2,trouser_adjust,
    slots=lambda p:3 if (p.y-floor)*SCALE+.04<.66 else 2)
adjacent_materials={v.index:set() for v in pants.data.vertices}
for polygon in pants.data.polygons:
    for vertex_id in polygon.vertices:
        adjacent_materials[vertex_id].add(polygon.material_index)
for vertex in pants.data.vertices:
    if adjacent_materials[vertex.index]=={2,3}:
        vertex.co.z=.66
solid=pants.modifiers.new('Canvas thickness','SOLIDIFY');solid.thickness=.0025
for side in (-1,1):
    points=[v.co for v in pants.data.vertices if side*v.co.x>0 and abs(v.co.z-.66)<.03]
    xmin,xmax=min(p.x for p in points),max(p.x for p in points)
    ymin,ymax=min(p.y for p in points),max(p.y for p in points)
    cx,cy=(xmin+xmax)/2,(ymin+ymax)/2
    rx,ry=(xmax-xmin)/2+.0015,(ymax-ymin)/2+.0015
    ring_shell('Reinforced knee panel seam '+str(side),[(cx,cy,.638,rx,ry),
        (cx,cy,.640,rx,ry),(cx,cy,.692,rx,ry),(cx,cy,.694,rx,ry)],CLOTH,3)

# The lowered torso of the jumpsuit gathers around the waist.
waist_z=(1.15-floor)*SCALE+.04
ring_shell('Navy waistband',[(0,-.022,waist_z-.015,.196,.126),
    (0,-.022,waist_z-.012,.196,.126),(0,-.022,waist_z+.035,.190,.120),
    (0,-.022,waist_z+.038,.190,.120)],CLOTH,3)
ring_shell('Lowered jumpsuit folded upper half',[
    (0,-.020,waist_z-.09,.219,.142),(0,-.020,waist_z-.07,.225,.145),
    (0,-.020,waist_z-.03,.239,.143),(0,-.020,waist_z+.006,.232,.137),
    (0,-.020,waist_z+.012,.217,.131),(0,-.020,waist_z-.022,.213,.130),
    (0,-.020,waist_z-.045,.204,.130)],CLOTH,2)
sphere('Front sleeve knot',(0,-.175,waist_z-.052),(.032,.023,.036),CLOTH,2)
for side in (-1,1):
    path=bezier([(side*.015,-.177,waist_z-.042),(side*.09,-.194,waist_z-.09),
                 (side*.13,-.206,waist_z-.15),(side*.114,-.191,waist_z-.225)],28)
    widths=[(.029+.008*math.sin(math.pi*j/27),.014) for j in range(28)]
    tube(('Left' if side<0 else 'Right')+' empty tied sleeve',path,widths,CLOTH,2,16)
    cuffpath=path[-6:]
    tube(('Left' if side<0 else 'Right')+' cream sleeve cuff',cuffpath,
         [(.032,.016)]*len(cuffpath),CLOTH,1,16)
    # Low-profile cargo pocket with a separate flap and dark construction seams.
    sphere('Cargo pocket '+str(side),(side*.222,-.008,.77),(.011,.060,.086),CLOTH,2)
    tube('Pocket flap seam '+str(side),[(side*.235,-.055,.815),(side*.237,.002,.818),
         (side*.235,.047,.815)],[.0015]*3,CLOTH,14,8)

# Eyes are separate, editable meshes centred on the source anatomy markers.
eye_centers=[]
def front_surface(x,z):
    nearest=sorted((abs(p.x-x)+abs(p.z-z),p.y) for p in positions if p.z>1.45 and p.y<-.065)[:5]
    return min(p[1] for p in nearest)-.0025
for side,label in [('l','Left'),('r','Right')]:
    c=joint('joint-'+side+'-eye')
    eye_centers.append(c)
    radius=.0215
    sphere(label+' sclera',c,(radius,radius,radius),BODY,9,40,28)
    sphere(label+' brown iris',c+Vector((0,-radius*.91,0)),(.0102,.0025,.0102),BODY,10)
    sphere(label+' pupil',c+Vector((0,-radius*1.045,0)),(.0048,.0012,.0048),BODY,11)
    sphere(label+' catchlight',c+Vector((-.0025,-radius*1.09,.0035)),(.0015,.0006,.0015),BODY,9,16,12)
    brow=bezier([(c.x-.023,c.y-.011,c.z+.025),(c.x-.010,c.y-.022,c.z+.034),
                 (c.x+.010,c.y-.020,c.z+.032),(c.x+.023,c.y-.009,c.z+.025)],20)
    brow=[(x,front_surface(x,z),z) for x,y,z in brow]
    tube(label+' eyebrow',brow,[.0018+.0012*math.sin(math.pi*j/19) for j in range(20)],BODY,13,8)

# Hair cap follows the actual head mesh. Individual locks form the silhouette.
def scalp_region(p):
    if p.y<5.85: return False
    threshold=7.30 if p.z>.7 else (6.25 if abs(p.x)>.65 else 5.88)
    return p.y>threshold
def scalp_adjust(p,source):
    head=joint('joint-head')
    return head+(p-head)*1.055+Vector((0,0,.003))
subset('Hair scalp foundation','body',scalp_region,HAIR,4,scalp_adjust,subdivision=1)
eye_z=sum(c.z for c in eye_centers)/2
top=max(positions[v[0]].z for f in groups['body'] for v in f)
random.seed(104)
for i in range(28):
    a=2*math.pi*i/28
    offset=Vector((.055*math.cos(a),.018*math.sin(a),.033*math.sin(a)))
    controls=[Vector((0,.054,top+.024))+offset*.30,
              Vector((.010,.157,top+.140))+offset,
              Vector((.025,.200,eye_z+.025))+offset*1.2,
              Vector((.020,.128,eye_z-.145))+offset*.6+Vector((random.uniform(-.04,.04),0,random.uniform(-.025,.04)))]
    pts=bezier(controls,30)
    widths=[.001+.020*(math.sin(math.pi*(j/29)*.93)**.75) for j in range(30)]
    widths[-1]=.001
    tube('Ponytail lock %02d'%i,pts,widths,HAIR,5 if i%5==0 else (13 if i%7==0 else 4),12)
# Navy elastic around the high ponytail attachment.
ring_shell('Navy ponytail band',[(0,.057,top+.010,.032,.030),
    (0,.057,top+.012,.034,.032),(0,.057,top+.025,.034,.032),
    (0,.057,top+.027,.031,.029)],HAIR,3,32)
for i in range(9):
    shift=(i-4)*.009
    pts=bezier([(.052+shift,-.012,top+.014),(.055+shift,-.127,top-.019),
                (-.076+shift,-.160,eye_z+.066),(-.088+shift,-.118,eye_z-.048)],28)
    widths=[(.003+.014*math.sin(math.pi*j/27)**.65,.008) for j in range(28)]
    widths[-1]=(.001,.001)
    tube('Side swept fringe %02d'%i,pts,widths,HAIR,5 if i%4==0 else 4,12)
for side in (-1,1):
    for i in range(4):
        pts=bezier([(side*(.054+i*.007),.008,top-.015),
            (side*.094,-.045,eye_z+.064),(side*.109,-.041,eye_z-.071),
            (side*(.096+i*.004),-.024,eye_z-.148)],24)
        tube('Temple wisp %d %d'%(side,i),pts,[.001+.010*math.sin(math.pi*j/23) for j in range(24)],HAIR,4,10)

for side,label in [(1,'Left'),(-1,'Right')]:
    x=joint('joint-'+('l' if side>0 else 'r')+'-ankle').x
    ring_shell(label+' thick boot sole',[(x,-.092,.022,.069,.157),(x,-.092,.025,.071,.161),
        (x,-.092,.058,.071,.161),(x,-.092,.066,.068,.157)],BOOTS,7)
    sphere(label+' leather foot',(x,-.089,.089),(.065,.151,.059),BOOTS,6,48,24)
    ring_shell(label+' leather boot shaft',[(x,-.018,.084,.052,.063),
        (x,-.018,.103,.057,.069),(x,-.012,.153,.058,.068),
        (x,-.009,.238,.056,.064),(x,-.008,.276,.060,.063),
        (x,-.008,.285,.060,.063)],BOOTS,6)
    ring_shell(label+' padded boot collar',[(x,-.008,.273,.062,.064),
        (x,-.008,.277,.063,.065),(x,-.008,.291,.063,.065),
        (x,-.008,.295,.060,.063)],BOOTS,6)
    for i in range(7):
        z=.122+i*.022
        front=-.082 if i<4 else -.078
        tube(label+' lace %02d'%i,[(x-.033,front,z),(x,front-.007,z+.009),
             (x+.033,front,z+.012)],[.0015]*3,BOOTS,15,8)
        for sign in (-1,1):
            sphere(label+' brass eyelet %d %d'%(i,sign),(x+sign*.038,front-.002,z),(.0035,.0019,.0035),BOOTS,12,16,12)
    for i in range(9):
        y=-.22+i*.031
        for sign in (-1,1):
            sphere(label+' tread %d %d'%(i,sign),(x+sign*.047,y,.023),(.023,.011,.012),BOOTS,7,16,10)

# Embed the approved design and generated modelling reference as image empties.
for i,(filename,name) in enumerate([('modelling-reference.png','Generated smooth turnaround'),
    ('../../protagonist-south-idle-v2.png','Approved illustrated character')]):
    image=bpy.data.images.load(str((OUT/filename).resolve()),check_existing=True)
    image.pack()
    obj=bpy.data.objects.new(name,None)
    obj.empty_display_type='IMAGE';obj.data=image;obj.empty_display_size=2.0
    obj.location=(2.0+i*1.8,.5,1.0);obj.rotation_euler=(math.pi/2,0,0)
    obj.hide_render=True
    REFERENCE.objects.link(obj)
REFERENCE.hide_viewport=True

def plain_material(name,colour,roughness=1):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    node=mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value=(*[linear(v) for v in colour],1)
    node.inputs['Roughness'].default_value=roughness
    return mat
groundmesh=bpy.data.meshes.new('Studio ground mesh')
groundmesh.from_pydata([(-200,-200,0),(200,-200,0),(200,200,0),(-200,200,0)],[],[(0,1,2,3)])
ground=bpy.data.objects.new('Studio ground',groundmesh);STUDIO.objects.link(ground)
groundmesh.materials.append(plain_material('Studio warm grey',(.66,.68,.70)))

def aim(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def camera(name,location,target,scale):
    data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=scale
    obj=bpy.data.objects.new(name,data);STUDIO.objects.link(obj);obj.location=location;aim(obj,target)
    return obj
front=camera('Camera - front',(0,-5,1.04),(0,0,1.04),2.09)
three=camera('Camera - three quarter',(3,-5,2.0),(0,0,1.0),2.11)
back=camera('Camera - back',(0,5,1.04),(0,0,1.04),2.09)
for name,loc,power,size in [('Key',(-2.5,-3,4),450,4),('Fill',(3,-2,2.5),280,3),('Rim',(0,2.5,3.7),500,3)]:
    data=bpy.data.lights.new('Studio '+name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new('Studio '+name,data);STUDIO.objects.link(obj);obj.location=loc;aim(obj,(0,0,1))
scene.world=bpy.data.worlds.new('Studio world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.55,.60,.65,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=768;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=-.7
scene.camera=three
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.region_3d.view_location=(0,0,1.0)
            space.region_3d.view_distance=2.8
            space.region_3d.view_rotation=three.rotation_euler.to_quaternion()
            space.region_3d.view_perspective='ORTHO'
            space.shading.type='SOLID';space.shading.color_type='MATERIAL'

# Save only this study's scene and dependencies, preserving the original file.
for obj in character_objects:
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0000001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data);bm.free();obj.data.update()
bpy.context.view_layer.update()
scene['character_height_m']=round(top+.14,4)
scene['source_revision']='d0a32e57a7f915cb2f2b95410e2117648c7bbb7e'
scene['control_mesh_vertices']=sum(len(o.data.vertices) for o in character_objects)
bpy.data.libraries.write(str(OUT/'protagonist-smooth-v1.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)

result={'scene':scene.name,'blend_file':str(OUT/'protagonist-smooth-v1.blend'),
        'character_objects':len(character_objects),'control_vertices':scene['control_mesh_vertices'],
        'atlas_size':[SIZE,SIZE],'stage':scene['stage'],'preserved_original_scene':True}
(OUT/'build-report.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
