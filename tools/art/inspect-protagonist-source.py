"""Inspect downloaded CC0 base mesh and anatomy markers, without Blender."""
import gzip
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2] / 'docs/art/characters/3d/protagonist-smooth-v1/sources'
vertices, faces, groups = [], [], {}
group = ''
for line in (root / 'makehuman-base.obj').read_text().splitlines():
    bits = line.split()
    if not bits:
        continue
    if bits[0] == 'v':
        vertices.append([float(x) for x in bits[1:4]])
    elif bits[0] == 'g':
        group = bits[1]
        groups.setdefault(group, [])
    elif bits[0] == 'f':
        ids = [int(x.split('/')[0]) - 1 for x in bits[1:]]
        faces.append(ids)
        groups[group].append(ids)

for name in ['caucasian-female-young', 'universal-female-young-averagemuscle-averageweight']:
    with gzip.open(root / (name + '.target.gz'), 'rt') as fh:
        for line in fh:
            bits = line.split()
            if len(bits) == 4 and not bits[0].startswith('#'):
                i = int(bits[0])
                for k in range(3):
                    vertices[i][k] += float(bits[k + 1])

def stats(name):
    ids = set(i for face in groups[name] for i in face)
    v = [vertices[i] for i in ids]
    return {'vertices': len(ids), 'faces': len(groups[name]),
            'min': [round(min(p[k] for p in v), 4) for k in range(3)],
            'max': [round(max(p[k] for p in v), 4) for k in range(3)],
            'center': [round(sum(p[k] for p in v)/len(v), 4) for k in range(3)]}

print(json.dumps({name: stats(name) for name in groups if name in ['body', 'helper-tights', 'helper-tshirt']
    or (name.startswith('joint-') and any(x in name for x in ['eye', 'head', 'neck', 'spine', 'pelvis', 'shoulder', 'elbow', 'hand', 'knee', 'ankle']))}, indent=2))
