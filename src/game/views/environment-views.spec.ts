import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { EnvironmentViews } from './environment-views';
import { WorldFrame } from './world-frame';
import { testScenePorts } from '../../testing/game-ports';
import { Simulation } from '@simulation/simulation';
import { editableView } from '../../testing/editable-view';

class Projection extends EnvironmentViews {
  public pulse(): void {
    super.onUpdate();
  }
}

describe('Environmental world presentation', () => {
  it('projects local health into terrain/vegetation, keeps selection above terrain and releases owned resources', () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      frame = new WorldFrame(testScenePorts());
    const definition = {
      version: 1 as const,
      id: 'ecology-presentation',
      grid: { origin: { x: 0, z: 0 }, columns: 2, rows: 2, metresPerCell: 2 },
      terrain: ['soil', 'soil', 'water', 'soil'],
      spawn: { x: 1, y: 0, z: 1 },
      deposits: [],
      blockers: [],
    };
    const sim = new Simulation(definition),
      view = editableView(sim.view);
    sim.dispose();
    frame.view = view;
    const projection = new Projection(new TransformNode('ecology', scene), definition, frame);
    try {
      projection.pulse();
      const terrain = scene.getMeshByName('environment-cells')!,
        water = scene.getMeshByName('environment-water')!;
      const vegetation = scene.meshes.filter(
        (mesh): mesh is Mesh =>
          mesh instanceof Mesh && ['grass', 'shrub'].includes(mesh.metadata?.kind),
      );

      const growth = () =>
        vegetation.reduce(
          (total, mesh) => total + (mesh.isEnabled() ? mesh.thinInstanceCount : 0),
          0,
        );

      const dry = [...terrain.getVerticesData(VertexBuffer.ColorKind)!];
      const pollutedWater = [...water.getVerticesData(VertexBuffer.ColorKind)!];
      expect(vegetation.length).toBeGreaterThan(0);
      expect(terrain.getVerticesData(VertexBuffer.PositionKind)![1]).toBeLessThan(1);
      expect(water.getVerticesData(VertexBuffer.PositionKind)![1]).toBeLessThan(1);
      expect(growth()).toBe(0);
      view.factory!.environment!.health.fill(100);
      view.factory!.environment!.average = 100;
      const before = JSON.stringify(view);
      projection.pulse();
      expect(terrain.getVerticesData(VertexBuffer.ColorKind)).not.toEqual(dry);
      expect(water.getVerticesData(VertexBuffer.ColorKind)).not.toEqual(pollutedWater);
      expect(growth()).toBeGreaterThan(0);
      expect(JSON.stringify(view)).toBe(before);
      const geometry = terrain.geometry;
      projection.pulse();
      expect(terrain.geometry).toBe(geometry);
      projection.dispose();
      expect(terrain.isDisposed()).toBe(true);
      expect(water.isDisposed()).toBe(true);
      expect(vegetation.every((mesh) => mesh.isDisposed())).toBe(true);
      expect(scene.meshes).toHaveLength(0);
      expect(scene.materials).toHaveLength(0);
      expect(scene.fogMode).toBe(Scene.FOGMODE_NONE);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
