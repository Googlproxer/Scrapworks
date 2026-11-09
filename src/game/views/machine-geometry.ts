import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { Material } from '@babylonjs/core/Materials/material';
import type { PlaceableKind } from '@contracts/factory';
import { isTransportKind, materialPorts, portDirection } from '@content/transport';
import { isPipe, fluidPorts } from '@content/environment';

/** Original editable procedural prototype silhouettes; centimetres, presentation only. */
export function machineGeometry(
  scene: Scene,
  kind: PlaceableKind,
  id: string,
  material: Material,
): Mesh {
  const root = MeshBuilder.CreateBox(
    `entity:${id}`,
    {
      width: 110,
      height: kind === 'conveyor' || isPipe(kind) ? 10 : 40,
      depth: kind === 'conveyor' ? 180 : 110,
    },
    scene,
  );
  root.material = material;

  const box = (
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
  ) => {
    const part = MeshBuilder.CreateBox(`${id}:${name}`, { width, height, depth }, scene);
    part.parent = root;
    part.position.set(x, y, z);
    part.material = material;
    return part;
  };

  const cylinder = (
    name: string,
    diameter: number,
    height: number,
    x: number,
    y: number,
    z: number,
  ) => {
    const part = MeshBuilder.CreateCylinder(
      `${id}:${name}`,
      { diameter, height, tessellation: 12 },
      scene,
    );
    part.parent = root;
    part.position.set(x, y, z);
    part.material = material;
    return part;
  };

  switch (kind) {
    case 'pipe':
    case 'pipe-junction':
      cylinder('water-pipe', 22, 180, 0, 15, 0).rotation.x = Math.PI / 2;
      if (kind === 'pipe-junction')
        cylinder('split-pipe', 22, 180, 0, 15, 0).rotation.z = Math.PI / 2;
      break;
    case 'water-pump':
      cylinder('pump-motor', 55, 70, 0, 50, 0);
      box('lake-intake', 25, 25, 100, 0, 15, 70);
      break;
    case 'water-return':
      cylinder('return-mouth', 45, 80, 0, 20, 60).rotation.x = Math.PI / 2;
      break;
    case 'water-treatment':
      cylinder('filter-left', 35, 100, -25, 60, 0);
      cylinder('filter-right', 35, 100, 25, 60, 0);
      break;
    case 'water-tank':
      cylinder('reservoir', 95, 120, 0, 70, 0);
      break;
    case 'battery':
      box('battery-bank', 95, 90, 70, 0, 60, 0);
      box('positive-terminal', 20, 15, 20, 25, 115, 0);
      break;
    case 'coal-generator':
      box('boiler', 100, 90, 100, 0, 60, 0);
      cylinder('chimney', 30, 120, 30, 130, 0);
      break;
    case 'greenhouse':
      box('greenhouse-frame', 100, 95, 110, 0, 60, 0);
      box('roof-ridge', 20, 25, 115, 0, 120, 0);
      break;
    case 'air-scrubber':
      cylinder('air-filter', 80, 120, 0, 70, 0);
      box('fan-housing', 90, 20, 90, 0, 140, 0);
      break;
    case 'conveyor':
      for (let i = -2; i <= 2; i++)
        cylinder(`roller-${i}`, 14, 100, 0, 8, i * 30).rotation.z = Math.PI / 2;
      break;
    case 'sorter':
      box('sorting-housing', 90, 75, 85, 0, 45, 0);
      cylinder('separator', 55, 25, 0, 95, 0);
      box('left-chute', 55, 20, 35, -65, 15, 0);
      box('right-chute', 55, 20, 35, 65, 15, 0);
      box('unmatched-chute', 35, 20, 55, 0, 15, 65);
      break;
    case 'solar-panel': {
      box('support', 15, 80, 15, 0, 50, 0);
      const panel = box('solar-array', 140, 8, 100, 0, 90, 0);
      panel.rotation.x = -0.35;
      for (let i = -1; i <= 1; i++)
        box(`cell-divider-${i}`, 2, 3, 96, i * 35, 97, 0).rotation.x = -0.35;
      break;
    }
    case 'wind-turbine': {
      cylinder('mast', 20, 160, 0, 90, 0);
      const rotor = box('rotor', 14, 120, 8, 0, 165, 12);
      rotor.rotation.z = 0.5;
      const blade = box('cross-blade', 120, 14, 8, 0, 165, 12);
      blade.rotation.z = 0.5;
      cylinder('hub', 25, 22, 0, 165, 12).rotation.x = Math.PI / 2;
      break;
    }
    case 'recycler':
      cylinder('hopper', 85, 70, 0, 55, 0);
      box('feed-mouth', 65, 16, 45, 0, 100, 0);
      box('outlet', 60, 20, 35, 0, 15, 65);
      break;
    case 'basic-fabricator':
      box('press-frame', 90, 90, 85, 0, 60, 0);
      box('press', 65, 20, 60, 0, 105, 0);
      break;
    case 'medium-fabricator':
      box('housing', 100, 85, 90, 0, 60, 0);
      box('assembly-arm', 20, 70, 20, 35, 110, 0);
      box('cross-arm', 85, 15, 20, 0, 145, 0);
      break;
    case 'extractor':
      cylinder('drill', 35, 110, 0, 70, 0);
      box('gantry', 105, 20, 100, 0, 130, 0);
      box('motor', 65, 50, 65, 0, 160, 0);
      break;
    case 'laboratory':
      box('desk', 105, 65, 85, 0, 45, 0);
      cylinder('sample-left', 22, 45, -25, 100, 0);
      cylinder('sample-right', 22, 60, 25, 105, 0);
      box('readout', 45, 35, 12, 0, 85, -35);
      break;
  }
  // Distinct port shapes and an asymmetric outlet preserve orientation without relying on colour.
  if (!isTransportKind(kind) && !isPipe(kind)) cylinder('power-terminal', 12, 25, -48, 35, -48);
  const ports = materialPorts(kind);
  for (const direction of ['input', 'output'] as const)
    for (const port of ports[direction]) {
      const d = portDirection({ rotation: 0 }, port);
      box(
        `${direction}-port-${port}`,
        d.column ? 20 : 35,
        18,
        d.row ? 20 : 35,
        d.column * 65,
        0,
        d.row * 65,
      );
    }
  const fluids = fluidPorts(kind);
  for (const direction of ['input', 'output'] as const)
    for (const port of fluids[direction]) {
      const d = portDirection({ rotation: 0 }, port);
      cylinder(`water-${direction}-${port}`, 18, 25, d.column * 70, 15, d.row * 70).rotation[
        d.column ? 'z' : 'x'
      ] = Math.PI / 2;
    }
  for (const part of [root, ...root.getChildMeshes()]) {
    part.metadata = { worldEntity: id };
    part.isPickable = true;
  }
  return root;
}
