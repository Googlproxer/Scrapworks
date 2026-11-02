import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScriptRegistry, sceneFeatures, sceneFeatureCatalogue } from './scene-features.ts';

test('recognized serialized camera, light, material and geometry features have explicit registrations', () => {
  const features = sceneFeatures(
    {
      cameras: [{ type: 'ArcRotateCamera' }],
      lights: [{ type: 3 }],
      meshes: [{ type: 'GroundMesh' }],
      materials: [{ customType: 'BABYLON.GridMaterial' }],
      skeletons: [],
      animationGroups: [],
    },
    'game.babylon',
  );
  assert.deepEqual(features, ['ArcRotateCamera', 'BABYLON.GridMaterial', 'GroundMesh', 'light:3']);
  for (const feature of features) assert.ok(sceneFeatureCatalogue[feature].length);
});

test('unsupported authored features report the scene and exact object path', () => {
  assert.throws(
    () => sceneFeatures({ cameras: [{ type: 'FutureCamera' }] }, 'game.babylon'),
    /FutureCamera at game.babylon.cameras\[0\]/,
  );
  assert.throws(
    () => sceneFeatures({ materials: [{ customType: 'BABYLON.UnknownMaterial' }] }, 'game.babylon'),
    /game.babylon.scene.materials.0.customType/,
  );
  assert.throws(
    () => sceneFeatures({ particleSystems: [{}] }, 'game.babylon'),
    /game.babylon.particleSystems/,
  );
});

test('generated script maps retain attached imports and map exports without broad Editor imports', () => {
  const result = normalizeScriptRegistry(
    'import { loadScene } from "babylonjs-editor-tools";\nimport * as attached from "./attached";\nexport const scriptsMap = { attached };\nexport { loadScene };\n',
  );
  assert.match(result, /import \* as attached/);
  assert.match(result, /export const scriptsMap/);
  assert.doesNotMatch(result, /loadScene|babylonjs-editor-tools/);
});
