import { GameEvent } from '@contracts/game-events';
import type { SceneKey } from '@contracts/game-state';
import { Loader, Scenes, type Scene } from 'phaser';

export function reportSceneLoading(scene: Scene, sceneKey: SceneKey): void {
  scene.game.events.emit(GameEvent.SCENE_LOADING, { sceneKey });

  const onLoadError = (file: Loader.File) => {
    scene.game.events.emit(GameEvent.SCENE_ERROR, { sceneKey, errorMessage: `Failed to load the required asset "${file.key}".` });
  };
  const onShutdown = () => {
    scene.load.off(Loader.Events.FILE_LOAD_ERROR, onLoadError);
    scene.events.off(Scenes.Events.DESTROY, onDestroy);
    scene.game.events.emit(GameEvent.SCENE_STOPPED, { sceneKey });
  };
  const onDestroy = () => {
    scene.load.off(Loader.Events.FILE_LOAD_ERROR, onLoadError);
    scene.events.off(Scenes.Events.SHUTDOWN, onShutdown);
  };

  scene.load.on(Loader.Events.FILE_LOAD_ERROR, onLoadError);
  scene.events.once(Scenes.Events.SHUTDOWN, onShutdown);
  scene.events.once(Scenes.Events.DESTROY, onDestroy);
}
