import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWorldDefinition } from '../../src/contracts/world.ts';

const near = (a, b = 0) => Math.abs(a - b) < 1e-6;
const finiteVector = (value, fallback, label) => {
  const vector = value ?? fallback;
  if (!Array.isArray(vector) || vector.length !== fallback.length || !vector.every(Number.isFinite))
    throw new Error(`${label}: expected ${fallback.length} finite values`);
  return vector;
};

/** Reads only saved JSON. Attached presentation scripts are never imported or executed. */
export function compileMarkers(nodes) {
  const byId = new Map();
  for (const node of nodes) {
    if (node.id != null) byId.set(node.id, node);
    if (node.uniqueId != null) byId.set(node.uniqueId, node);
  }
  const transform = (node, visited = new Set()) => {
    if (visited.has(node)) throw new Error(`Marker hierarchy cycle at ${node.name ?? node.id}`);
    visited.add(node);
    const position = finiteVector(node.position, [0, 0, 0], 'Marker position');
    const scaling = finiteVector(node.scaling, [1, 1, 1], 'Marker scaling');
    if (!scaling.every((value) => near(value, 1)))
      throw new Error('Marker hierarchy must use unit scale');
    let yaw;
    if (node.rotationQuaternion) {
      const [qx, qy, qz, qw] = finiteVector(
        node.rotationQuaternion,
        [0, 0, 0, 1],
        'Marker quaternion',
      );
      if (!near(qx) || !near(qz) || !near(Math.hypot(qx, qy, qz, qw), 1))
        throw new Error('Marker quaternion must be a unit Y rotation');
      yaw = 2 * Math.atan2(qy, qw);
    } else {
      const rotation = finiteVector(node.rotation, [0, 0, 0], 'Marker rotation');
      if (!near(rotation[0]) || !near(rotation[2]))
        throw new Error('Markers must remain on the flat X/Z plane');
      yaw = rotation[1];
    }
    const quarter = yaw / (Math.PI / 2);
    if (!near(quarter, Math.round(quarter)))
      throw new Error('Marker rotations must use quarter turns');
    const parentId = node.metadata?.parentId ?? node.parentId;
    if (parentId == null) return { position, quarter: Math.round(quarter) };
    const parent = byId.get(parentId);
    if (!parent) throw new Error(`Missing marker parent ${parentId}`);
    const inherited = transform(parent, visited);
    const angle = (inherited.quarter * Math.PI) / 2;
    const [x, y, z] = position;
    return {
      position: [
        inherited.position[0] + x * Math.cos(angle) + z * Math.sin(angle),
        inherited.position[1] + y,
        inherited.position[2] - x * Math.sin(angle) + z * Math.cos(angle),
      ],
      quarter: inherited.quarter + Math.round(quarter),
    };
  };
  const markers = nodes.filter((node) => node.metadata?.scrapworks);
  const settings = markers.filter((node) => node.metadata.scrapworks.kind === 'WorldSettings');
  const spawns = markers.filter((node) => node.metadata.scrapworks.kind === 'PlayerSpawn');
  if (settings.length !== 1 || spawns.length !== 1)
    throw new Error('Game requires exactly one WorldSettings and PlayerSpawn marker');
  const ids = new Set();
  for (const node of markers) {
    const marker = node.metadata.scrapworks;
    if (marker.version !== 1) throw new Error('Unsupported world marker version');
    if (!['WorldSettings', 'PlayerSpawn', 'Deposit', 'Blocker'].includes(marker.kind))
      throw new Error(`Unsupported marker kind ${marker.kind}`);
    if (typeof marker.id !== 'string' || !marker.id || ids.has(marker.id))
      throw new Error('Duplicate or missing world marker ID');
    ids.add(marker.id);
  }
  const settingsTransform = transform(settings[0]);
  if (((settingsTransform.quarter % 4) + 4) % 4 !== 0 || !near(settingsTransform.position[1]))
    throw new Error('WorldSettings must define an unrotated ground origin');
  const metadata = settings[0].metadata.scrapworks;
  const toMetres = (node) => {
    const values = transform(node).position.map((value) => {
      const metres = value / 100;
      return Math.abs(metres) < 1e-10 ? 0 : Number(metres.toFixed(9));
    });
    return { x: values[0], y: values[1], z: values[2] };
  };
  if (
    !Number.isInteger(metadata.columns) ||
    !Number.isInteger(metadata.rows) ||
    metadata.columns < 1 ||
    metadata.rows < 1 ||
    metadata.columns > 1000 ||
    metadata.rows > 1000
  )
    throw new Error('Invalid authored grid dimensions');
  const entity = (node) => ({
    id: node.metadata.scrapworks.id,
    position: toMetres(node),
    footprint: node.metadata.scrapworks.footprint,
    rotation: ((transform(node).quarter % 4) + 4) % 4,
  });
  const definition = {
    version: 1,
    id: metadata.id,
    grid: {
      origin: { x: settingsTransform.position[0] / 100, z: settingsTransform.position[2] / 100 },
      columns: metadata.columns,
      rows: metadata.rows,
      metresPerCell: metadata.cellSizeCm / 100,
    },
    terrain: Array(metadata.columns * metadata.rows).fill(metadata.terrainId),
    spawn: toMetres(spawns[0]),
    deposits: markers
      .filter((node) => node.metadata.scrapworks.kind === 'Deposit')
      .map((node) => ({
        ...entity(node),
        kind: node.metadata.scrapworks.resource,
        quantity: node.metadata.scrapworks.quantity,
      })),
    blockers: markers.filter((node) => node.metadata.scrapworks.kind === 'Blocker').map(entity),
  };
  assertWorldDefinition(definition);
  return definition;
}

export async function compileWorld(sceneDirectory) {
  if (sceneDirectory instanceof URL) sceneDirectory = fileURLToPath(sceneDirectory);
  const nodes = [];
  for (const folder of ['nodes', 'meshes']) {
    for (const name of await fs.readdir(path.join(sceneDirectory, folder)).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    })) {
      if (!name.endsWith('.json')) continue;
      const value = JSON.parse(await fs.readFile(path.join(sceneDirectory, folder, name), 'utf8'));
      if (folder === 'nodes') nodes.push(value);
      else nodes.push(...(value.meshes ?? []), ...(value.transformNodes ?? []));
    }
  }
  return compileMarkers(nodes);
}
