import { describe, expect, it } from 'vitest';
import type { WorldDefinition } from '../../../contracts/world.ts';
import {
  createTerrainScatter,
  cornerHealth,
  scatterFits,
  terrainBlockedCells,
} from './terrain-layout.ts';
import { kaykitScatter } from '../../../../art/world/kaykit-forest-v1/runtime/meshes.ts';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';

const definition = (): WorldDefinition => ({
  version: 1,
  id: 'terrain-layout-test',
  grid: { origin: { x: -7, z: 3 }, columns: 10, rows: 8, metresPerCell: 1.5 },
  terrain: Array<string>(80).fill('soil'),
  spawn: { x: -5, y: 0, z: 5 },
  deposits: [],
  blockers: [],
});

describe('layered terrain placement', () => {
  it('keeps a deterministic, jittered layout independently of health and varies by world', () => {
    const world = definition(),
      a = createTerrainScatter(world),
      b = createTerrainScatter(world);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(100);
    expect(a).not.toEqual(createTerrainScatter({ ...world, id: 'another-world' }));
    expect(
      a.every((candidate) => Math.abs(((candidate.x - world.grid.origin.x) % 1.5) - 0.75) > 1e-5),
    ).toBe(true);
    expect(new Set(a.map((candidate) => candidate.chunk)).size).toBeGreaterThan(1);
  });

  it('clears every cell in a rotated multi-cell footprint', () => {
    const world = definition();
    const blocked = terrainBlockedCells(world, [
      {
        id: 'machine',
        position: { x: -3.25, y: 0, z: 6.75 },
        footprint: { width: 2, depth: 3 },
        rotation: 1,
      },
    ]);
    expect([...blocked].sort((a, b) => a - b)).toEqual([22, 23, 24, 32, 33, 34]);
  });

  it('rejects silhouettes extending into water or occupied neighbours', () => {
    const world = definition();
    const candidate = { ...createTerrainScatter(world)[0], x: -4.1, z: 5.25, radius: 0.3 };
    const terrain = [...world.terrain];
    terrain[12] = 'water';
    expect(scatterFits(candidate, { ...world, terrain }, new Set())).toBe(false);
    expect(scatterFits(candidate, world, new Set([12]))).toBe(false);
    expect(scatterFits({ ...candidate, x: -4.5 }, world, new Set([12]))).toBe(true);
  });

  it('shares corner health across cells while excluding water from the average', () => {
    const world = definition(),
      terrain = [...world.terrain],
      health = Array<number>(80).fill(0);
    terrain[0] = 'water';
    health[0] = 100;
    health[1] = 30;
    health[10] = 60;
    health[11] = 90;
    expect(cornerHealth(world.grid, terrain, health, 1, 1)).toBeCloseTo(0.6);
    expect(cornerHealth(world.grid, terrain, health, 0, 0)).toBe(0);
  });

  it('allows exact contact with the far world edge without indexing outside the grid', () => {
    const world = definition();
    const candidate = { ...createTerrainScatter(world)[0], x: 7.5, z: 6, radius: 0.5 };
    expect(scatterFits(candidate, world, new Set())).toBe(true);
    expect(scatterFits({ ...candidate, x: 7.51 }, world, new Set())).toBe(false);
  });

  it('retains low triangle budgets and native LH outward-facing normals', () => {
    for (const source of kaykitScatter) {
      expect(source.indices.length / 3).toBeLessThanOrEqual(48);
      const normals: number[] = [];
      VertexData.ComputeNormals([...source.positions], [...source.indices], normals);
      let aligned = 0;
      for (let i = 0; i < normals.length; i += 3)
        if (
          normals[i] * source.normals[i] +
            normals[i + 1] * source.normals[i + 1] +
            normals[i + 2] * source.normals[i + 2] >
          0
        )
          aligned++;
      expect(aligned / (normals.length / 3)).toBeGreaterThan(0.95);
    }
  });
});
