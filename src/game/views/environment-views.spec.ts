import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
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
        vegetation = scene.getMeshByName('environment-vegetation')!;
      const dry = [...terrain.getVerticesData(VertexBuffer.ColorKind)!];
      expect(terrain.getVerticesData(VertexBuffer.PositionKind)![1]).toBeLessThan(1);
      expect(vegetation.getTotalIndices()).toBe(3);
      view.factory!.environment!.health.fill(100);
      view.factory!.environment!.average = 100;
      const before = JSON.stringify(view);
      projection.pulse();
      expect(terrain.getVerticesData(VertexBuffer.ColorKind)).not.toEqual(dry);
      expect(vegetation.getTotalIndices()).toBeGreaterThan(3);
      expect(JSON.stringify(view)).toBe(before);
      const geometry = terrain.geometry;
      projection.pulse();
      expect(terrain.geometry).toBe(geometry);
      projection.dispose();
      expect(terrain.isDisposed()).toBe(true);
      expect(vegetation.isDisposed()).toBe(true);
      expect(scene.getMaterialByName('environment-soil')).toBeNull();
      expect(scene.fogMode).toBe(Scene.FOGMODE_NONE);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
