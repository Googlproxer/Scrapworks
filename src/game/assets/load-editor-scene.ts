import { AssetContainer } from '@babylonjs/core/assetContainer';
import { SceneLoaderFlags } from '@babylonjs/core/Loading/sceneLoaderFlags';
import type { Scene } from '@babylonjs/core/scene';
// Register Babylon's serialized types so ordinary Editor changes remain loadable.
import '@babylonjs/core';
// Editor materials such as GridMaterial register their serialized classes here.
import '@babylonjs/materials';
import type { SceneKey } from '@contracts/game-state';
import { loadScene, scriptsMap } from '../../scripts';

type AuthoredSceneKey = Extract<SceneKey, 'MainMenu' | 'Game'>;
const filenames: Record<AuthoredSceneKey, string> = {
  MainMenu: 'main-menu.babylon',
  Game: 'game.babylon',
};
SceneLoaderFlags.ForceFullSceneLoadingForIncremental = true;
SceneLoaderFlags.ShowLoadingScreen = false; // Angular owns loading and error presentation.

export async function loadEditorScene(
  scene: Scene,
  key: AuthoredSceneKey,
): Promise<AssetContainer> {
  const rootUrl = new URL('scene/', document.baseURI).href;
  await loadScene(rootUrl, filenames[key], scene, scriptsMap);
  // Scene ownership starts before loading. A disposed scene must never re-enter the client.
  if (scene.isDisposed) throw new Error('Scene was disposed while loading');
  const camera = scene.activeCamera;
  const assets = new AssetContainer(scene);
  assets.moveAllFromScene();
  scene.activeCamera = camera;
  return assets;
}
