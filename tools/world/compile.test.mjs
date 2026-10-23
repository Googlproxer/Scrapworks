import assert from 'node:assert/strict';
import test from 'node:test';
import { compileMarkers, compileWorld } from './compile.mjs';
import { fixtureMarkers } from './test-fixture.mjs';

test('compiles saved authored markers into a plain finite 10x10 world', async () => {
  const definition = await compileWorld(new URL('../../assets/game.scene', import.meta.url));
  assert.deepEqual(definition.grid, {
    origin: { x: -10, z: -10 },
    columns: 10,
    rows: 10,
    metresPerCell: 2,
  });
  assert.deepEqual(definition.spawn, { x: 1, y: 0, z: 1 });
  assert.equal(definition.terrain.length, 100);
  assert.equal(definition.deposits.length, 1);
  assert.equal(definition.blockers.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(definition)), definition);
});

test('composes parent translations and quarter-turns once, including rotated footprints', () => {
  const nodes = fixtureMarkers();
  const blocker = nodes[3];
  blocker.position = [100, 0, 0];
  blocker.metadata.parentId = 'parent';
  blocker.metadata.scrapworks.footprint = { width: 2, depth: 1 };
  nodes.push({
    id: 'parent',
    position: [300, 0, 0],
    rotation: [0, Math.PI / 2, 0],
    scaling: [1, 1, 1],
  });
  const definition = compileMarkers(nodes);
  assert.deepEqual(definition.blockers[0].position, { x: 3, y: 0, z: -1 });
  assert.equal(definition.blockers[0].rotation, 1);
});

test('rejects bad IDs, versions, dimensions, alignment and overlapping or out-of-bounds footprints', () => {
  const mutations = [
    (nodes) => {
      nodes[3].metadata.scrapworks.id = 'scrap';
    },
    (nodes) => {
      nodes[0].metadata.scrapworks.version = 2;
    },
    (nodes) => {
      nodes[0].metadata.scrapworks.columns = -1;
    },
    (nodes) => {
      nodes[3].position[0] = NaN;
    },
    (nodes) => {
      nodes[3].position[0] = 301;
    },
    (nodes) => {
      nodes[3].position[0] = 1100;
    },
    (nodes) => {
      nodes[3].position = [900, 0, 900];
      nodes[3].metadata.scrapworks.footprint.width = 2;
    },
    (nodes) => {
      nodes[3].position = nodes[2].position;
    },
    (nodes) => {
      nodes[1].position = nodes[3].position;
    },
  ];
  for (const mutate of mutations) {
    const nodes = fixtureMarkers();
    mutate(nodes);
    assert.throws(() => compileMarkers(nodes));
  }
});

test('rejects unsupported hierarchy scale, tilt, rotations, missing parents and cycles', () => {
  const mutations = [
    (nodes) => {
      nodes[3].scaling = [100, 100, 100];
    },
    (nodes) => {
      nodes[3].rotation = [0.2, 0, 0];
    },
    (nodes) => {
      nodes[3].rotation = [0, 0.2, 0];
    },
    (nodes) => {
      nodes[3].metadata.parentId = 'missing';
    },
    (nodes) => {
      nodes[3].metadata.parentId = 'blocker';
    },
  ];
  for (const mutate of mutations) {
    const nodes = fixtureMarkers();
    mutate(nodes);
    assert.throws(() => compileMarkers(nodes));
  }
});

test('does not execute attached presentation scripts and requires settings/spawn', () => {
  const nodes = fixtureMarkers();
  nodes[0].metadata.scripts = [{ key: 'does-not-exist.ts', enabled: true }];
  assert.equal(compileMarkers(nodes).version, 1);
  assert.throws(() => compileMarkers([]), /exactly one/);
  assert.throws(() => compileMarkers([...nodes, structuredClone(nodes[1])]), /exactly one/);
});
