import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { TransportViews } from './transport-views';
import { Simulation } from '@simulation/simulation';
import { editableView } from '../../testing/editable-view';
import { emptyTransport } from '@content/transport';

function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    views = new TransportViews(scene);
  const sim = new Simulation({
    version: 1,
    id: 'transport-view',
    grid: { origin: { x: 0, z: 0 }, columns: 3, rows: 3, metresPerCell: 2 },
    terrain: Array<string>(9).fill('soil'),
    spawn: { x: 1, y: 0, z: 1 },
    deposits: [],
    blockers: [],
  });
  const view = editableView(sim.view);
  sim.dispose();
  view.buildings = [
    {
      id: 'belt',
      buildingId: 'conveyor',
      cell: { column: 1, row: 1 },
      position: { x: 3, y: 0, z: 3 },
      rotation: 1,
      footprint: { width: 1, depth: 1 },
    },
  ];
  view.factory!.transport = {
    connections: [],
    segments: [
      { id: 'belt', ...emptyTransport(), units: [{ item: 'plate', lane: 0, progress: 5 }] },
    ],
  };
  return {
    scene,
    views,
    view,
    dispose: () => {
      views.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

function network() {
  const f = fixture(),
    transport = f.view.factory!.transport!;
  f.view.buildings.push({
    ...structuredClone(f.view.buildings[0]),
    id: 'destination',
    cell: { column: 2, row: 1 },
    position: { x: 5, y: 0, z: 3 },
  });
  transport.segments.push({ id: 'destination', ...emptyTransport() });
  transport.connections.push({
    id: 'edge',
    from: 'belt',
    output: 'front',
    to: 'destination',
    input: 'back',
    cooldown: 0,
    lastItem: null,
  });
  return { ...f, transport };
}

it('projects bounded transit with directional cues and clears resources after world replacement/disposal', () => {
  const { scene, views, view, dispose } = fixture();
  try {
    views.sync(view);
    const mesh = scene.getMeshByName('transit:belt:0')!;
    expect(mesh.position.x).toBe(300);
    expect(mesh.isPickable).toBe(false);
    expect(scene.getMeshByName('material:belt:front')).not.toBeNull();
    view.factory!.transport!.segments[0].units[0].progress = 10;
    views.sync(view);
    expect(scene.getMeshByName('transit:belt:0')).toBe(mesh);
    expect(mesh.position.x).toBe(375);
    view.factory!.transport!.segments = [];
    views.sync(view);
    expect(mesh.isDisposed()).toBe(true);
    expect(scene.getMeshByName('material:belt:front')).toBeNull();
    views.dispose();
    expect(scene.materials.filter((m) => m.name.startsWith('transit-material:'))).toHaveLength(0);
  } finally {
    dispose();
  }
});

it('reuses arrows and geometry across status-only publications while updating waiting feedback', () => {
  const { scene, views, view, transport, dispose } = network(),
    createLines = vi.spyOn(MeshBuilder, 'CreateLines'),
    createMarker = vi.spyOn(MeshBuilder, 'CreateLineSystem');
  try {
    views.sync(view);
    const names = ['material:edge', 'material:belt:front', 'material:destination:front'],
      arrows = names.map((name) => scene.getMeshByName(name) as LinesMesh),
      geometries = arrows.map((arrow) => arrow.geometry),
      vertices = arrows.map((arrow) => [...arrow.getVerticesData('position')!]),
      initialCreates = createLines.mock.calls.length;
    let marker: LinesMesh | null = null;
    for (const status of [
      'moving',
      'idle',
      'blocked',
      'disconnected',
      'incompatible',
      'moving',
      'blocked',
      'idle',
    ] as const) {
      transport.segments[0].status = status;
      // Worker publications supply fresh detached objects, even when geometry is unchanged.
      views.sync(structuredClone(view));
      for (let i = 0; i < arrows.length; i++) {
        expect(scene.getMeshByName(names[i])).toBe(arrows[i]);
        expect(arrows[i].isDisposed()).toBe(false);
        expect(arrows[i].geometry).toBe(geometries[i]);
        expect([...arrows[i].getVerticesData('position')!]).toEqual(vertices[i]);
      }
      expect(createLines).toHaveBeenCalledTimes(initialCreates);
      const blocked = ['blocked', 'disconnected', 'incompatible'].includes(status);
      expect(arrows[1].color.toHexString().toLowerCase()).toBe(blocked ? '#f4c46f' : '#9ee1ce');
      for (const arrow of [arrows[0], arrows[2]])
        expect(arrow.color.toHexString().toLowerCase()).toBe('#9ee1ce');
      const current = scene.getMeshByName('transport-waiting:belt') as LinesMesh | null;
      if (blocked || marker) {
        expect(current).not.toBeNull();
        if (marker) expect(current).toBe(marker);
        marker = current;
        expect(marker!.isEnabled()).toBe(blocked);
        expect(marker!.position.asArray()).toEqual([300, 80, 300]);
        expect(marker!.isPickable).toBe(false);
      } else expect(current).toBeNull();
    }
    expect(createMarker).toHaveBeenCalledTimes(1);
    views.dispose();
    expect(marker!.isDisposed()).toBe(true);
    expect(arrows.every((arrow) => arrow.isDisposed())).toBe(true);
  } finally {
    createLines.mockRestore();
    createMarker.mockRestore();
    dispose();
  }
});

it('updates changed endpoints and turns without replacing retained arrows, then releases removed topology', () => {
  const { scene, views, view, transport, dispose } = network();
  try {
    transport.segments[0].status = 'blocked';
    views.sync(view);
    const edge = scene.getMeshByName('material:edge') as LinesMesh,
      oldOutlet = scene.getMeshByName('material:belt:front')!,
      destination = scene.getMeshByName('material:destination:front')!,
      marker = scene.getMeshByName('transport-waiting:belt')!;

    // A replacement world can reuse IDs with different positions, rotations and routes.
    view.buildings[1].cell = { column: 1, row: 2 };
    view.buildings[1].position = { x: 3, y: 0, z: 5 };
    view.buildings[1].rotation = 0;
    transport.segments[0].turn = 'left';
    transport.connections[0].output = 'left';
    views.sync(structuredClone(view));
    expect(scene.getMeshByName('material:edge')).toBe(edge);
    expect([...edge.getVerticesData('position')!.slice(0, 6)]).toEqual([
      300, 35, 360, 300, 35, 440,
    ]);
    expect(scene.getMeshByName('material:destination:front')).toBe(destination);
    expect([...destination.getVerticesData('position')!.slice(0, 6)]).toEqual([
      300, 55, 500, 300, 55, 580,
    ]);
    expect(oldOutlet.isDisposed()).toBe(true);
    expect(scene.getMeshByName('material:belt:front')).toBeNull();
    const outlet = scene.getMeshByName('material:belt:left')!;
    expect(outlet).not.toBeNull();

    transport.connections = [];
    views.sync(view);
    expect(edge.isDisposed()).toBe(true);
    expect(scene.getMeshByName('material:belt:left')).toBe(outlet);
    expect(scene.getMeshByName('material:destination:front')).toBe(destination);

    view.factory = undefined;
    views.sync(view);
    expect(outlet.isDisposed()).toBe(true);
    expect(destination.isDisposed()).toBe(true);
    expect(marker.isDisposed()).toBe(true);
    expect(scene.meshes).toHaveLength(0);
  } finally {
    dispose();
  }
});
