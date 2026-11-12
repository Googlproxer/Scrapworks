/** Extract selected CC0 KayKit sources and make a small, flat-palette geometry derivative. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

interface Gltf {
  nodes: {
    mesh: number;
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    matrix?: number[];
  }[];
  meshes: {
    primitives: { attributes: Record<string, number>; indices: number; mode?: number }[];
  }[];
  accessors: {
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  buffers: { uri: string }[];
}
const root = path.resolve(import.meta.dirname, '../..');
const directory = path.join(root, 'art/world/kaykit-forest-v1');
const archive = path.join(root, 'art/KayKit_Forest_Nature_Pack_1.0_FREE.zip');
const selected = [
  { id: 'Rock_2_A_Color1', kind: 'rock' },
  { id: 'Rock_1_A_Color1', kind: 'rock' },
  { id: 'Rock_1_B_Color1', kind: 'rock' },
  { id: 'Rock_1_C_Color1', kind: 'rock' },
  { id: 'Grass_1_SingleSided_Mesh', kind: 'grass' },
  { id: 'Grass_2_SingleSided_Mesh', kind: 'grass' },
  { id: 'Bush_2_A_Color1', kind: 'shrub' },
  { id: 'Bush_4_A_Color1', kind: 'shrub' },
] as const;
const names = [
  'License.txt',
  'Assets/gltf/forest_texture.png',
  ...selected.flatMap(({ id }) => [`Assets/gltf/${id}.gltf`, `Assets/gltf/${id}.bin`]),
];
await fs.mkdir(path.join(directory, 'source'), { recursive: true });
await fs.mkdir(path.join(directory, 'runtime'), { recursive: true });
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
// Windows' built-in ZIP reader avoids a new dependency. Extract only explicit names.
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskArchive = [System.IO.Compression.ZipFile]::OpenRead(${quote(archive)})
try {
  foreach ($taskName in @(${names.map(quote).join(',')})) {
    $taskEntry = $taskArchive.GetEntry('KayKit_Forest_Nature_Pack_1.0_FREE/' + $taskName)
    if ($null -eq $taskEntry) { throw ('Missing archive entry: ' + $taskName) }
    $taskTarget = Join-Path ${quote(path.join(directory, 'source'))} ([System.IO.Path]::GetFileName($taskName))
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntry, $taskTarget, $true)
  }
} finally { $taskArchive.Dispose() }
`,
  ],
  { stdio: 'pipe' },
);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const meshes = [];
const records = [];
for (const item of selected) {
  const source = path.join(directory, 'source', item.id);
  const gltfBytes = await fs.readFile(source + '.gltf');
  const gltf = JSON.parse(gltfBytes.toString('utf8')) as Gltf;
  if (
    gltf.nodes.length !== 1 ||
    gltf.nodes[0].mesh !== 0 ||
    gltf.nodes[0].matrix ||
    gltf.nodes[0].translation ||
    gltf.nodes[0].rotation ||
    gltf.nodes[0].scale
  )
    throw new Error(`Unexpected node transform: ${item.id}`);
  const primitive = gltf.meshes[0].primitives[0];
  if (
    gltf.meshes.length !== 1 ||
    gltf.meshes[0].primitives.length !== 1 ||
    (primitive.mode ?? 4) !== 4
  )
    throw new Error(`Expected one triangle primitive: ${item.id}`);
  const binary = await fs.readFile(path.join(directory, 'source', gltf.buffers[0].uri));
  const read = (index: number, type: string, components: number) => {
    const accessor = gltf.accessors[index],
      view = gltf.bufferViews[accessor.bufferView];
    if (
      accessor.type !== type ||
      view.buffer !== 0 ||
      ![5126, 5123].includes(accessor.componentType)
    )
      throw new Error(`Unsupported accessor: ${item.id}`);
    const size = accessor.componentType === 5126 ? 4 : 2;
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count * components }, (_, at) => {
      const offset =
        start +
        Math.floor(at / components) * (view.byteStride ?? components * size) +
        (at % components) * size;
      return accessor.componentType === 5126
        ? binary.readFloatLE(offset)
        : binary.readUInt16LE(offset);
    });
  };
  const positions = read(primitive.attributes['POSITION'], 'VEC3', 3);
  const normals = read(primitive.attributes['NORMAL'], 'VEC3', 3);
  const indices = read(primitive.indices, 'SCALAR', 1);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }
  // Convert glTF right-handed +Y-up into Babylon left-handed +Y-up, in metres.
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= (min[0] + max[0]) / 2;
    positions[i + 1] -= min[1];
    positions[i + 2] = -(positions[i + 2] - (min[2] + max[2]) / 2);
    normals[i + 2] = -normals[i + 2];
  }
  // Babylon's LH front-face convention needs the original index order after Z reflection.
  const round = (values: number[]) => values.map((value) => Number(value.toFixed(7)));
  meshes.push({
    ...item,
    width: max[0] - min[0],
    height: max[1] - min[1],
    depth: max[2] - min[2],
    positions: round(positions),
    normals: round(normals),
    indices,
  });
  records.push({
    ...item,
    vertices: positions.length / 3,
    triangles: indices.length / 3,
    gltfSha256: hash(gltfBytes),
    binarySha256: hash(binary),
  });
}
await fs.writeFile(
  path.join(directory, 'runtime/meshes.ts'),
  `// Generated by tools/art/prepare-kaykit-scatter.ts. Kay Lousberg, CC0; see ../README.md.\nexport interface ScatterGeometry { readonly id: string; readonly kind: 'rock' | 'grass' | 'shrub'; readonly width: number; readonly height: number; readonly depth: number; readonly positions: readonly number[]; readonly normals: readonly number[]; readonly indices: readonly number[]; }\nexport const kaykitScatter: readonly ScatterGeometry[] = ${JSON.stringify(meshes)};\n`,
);
await fs.writeFile(
  path.join(directory, 'provenance.json'),
  JSON.stringify(
    {
      date: '2026-11-13',
      author: 'Kay Lousberg',
      pack: 'KayKit Forest Nature Pack 1.0 FREE',
      source: 'https://kaylousberg.itch.io/kaykit-forest',
      licence: 'CC0; exact supplied notice in source/License.txt',
      archive: 'art/KayKit_Forest_Nature_Pack_1.0_FREE.zip',
      archiveSha256: hash(await fs.readFile(archive)),
      preparation:
        'Selected original positions/normals/topology retained. Centre X/Z, set bottom to Y=0 and mirror Z for Babylon LH, retaining index order for its front-face convention. Runtime uses shared flat colours instead of the source atlas. Scene metre-to-centimetre conversion happens at binding.',
      meshes: records,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(records));
