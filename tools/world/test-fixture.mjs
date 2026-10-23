export function fixtureMarkers() {
  const marker = (id, kind, position, properties = {}) => ({
    id,
    name: id,
    position,
    scaling: [1, 1, 1],
    rotation: [0, 0, 0],
    metadata: { scrapworks: { version: 1, id, kind, ...properties } },
  });
  return [
    marker('test-world', 'WorldSettings', [-1000, 0, -1000], {
      columns: 10,
      rows: 10,
      cellSizeCm: 200,
      terrainId: 'soil',
    }),
    marker('spawn', 'PlayerSpawn', [100, 0, 100]),
    marker('scrap', 'Deposit', [-300, 0, 100], {
      resource: 'scrap',
      quantity: 100,
      footprint: { width: 1, depth: 1 },
    }),
    marker('blocker', 'Blocker', [300, 0, -100], { footprint: { width: 1, depth: 1 } }),
  ];
}
