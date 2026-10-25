import { AssetContainer } from '@babylonjs/core/assetContainer';
import { Engine } from '@babylonjs/core/Engines/engine';
import { AppendSceneAsync, LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { SceneSerializer } from '@babylonjs/core/Misc/sceneSerializer';
import { Scene } from '@babylonjs/core/scene';
import { assertWorldDefinition, type WorldDefinition } from '@contracts/world';
import { loadCharacter, type CharacterLoader } from '../assets/load-character';
import { loadEditorScene } from '../assets/load-editor-scene';

/** Suite-local immutable snapshots; every restoration creates new scene-owned assets. */
export class AuthoredWorldFixture {
  private constructor(
    private readonly worldSnapshot: string,
    private readonly characterSnapshot: string,
    private readonly definitionSnapshot: string,
    private readonly rootUrl: string,
  ) {}

  public static async load(): Promise<AuthoredWorldFixture> {
    const canvas = document.createElement('canvas');
    const engine = new Engine(canvas, true);
    try {
      const worldScene = new Scene(engine);
      const worldAssets = await loadEditorScene(worldScene, 'Game');
      worldAssets.addAllToScene();
      const worldSnapshot = JSON.stringify(await SceneSerializer.SerializeAsync(worldScene));

      const characterScene = new Scene(engine);
      const character = await loadCharacter(characterScene);
      character.addAllToScene();
      const characterSnapshot = JSON.stringify(
        await SceneSerializer.SerializeAsync(characterScene),
      );

      const response = await fetch(new URL('scene/worlds/game.json', document.baseURI));
      if (!response.ok) throw new Error(`World fixture failed to load (${response.status}).`);
      const definition: unknown = await response.json();
      assertWorldDefinition(definition);
      return new AuthoredWorldFixture(
        worldSnapshot,
        characterSnapshot,
        JSON.stringify(definition),
        new URL('scene/', document.baseURI).href,
      );
    } finally {
      // No engine, scene, material, skeleton or animation survives preparation.
      engine.dispose();
    }
  }

  public definition(): WorldDefinition {
    const definition: unknown = JSON.parse(this.definitionSnapshot);
    assertWorldDefinition(definition);
    return definition;
  }

  public async loadScene(scene: Scene): Promise<AssetContainer> {
    await AppendSceneAsync(`data:${this.worldSnapshot}`, scene, {
      pluginExtension: '.babylon',
      rootUrl: this.rootUrl,
    });
    if (scene.isDisposed) throw new Error('Fixture owner was disposed while loading.');
    const camera = scene.activeCamera;
    const assets = new AssetContainer(scene);
    assets.moveAllFromScene();
    scene.activeCamera = camera;
    return assets;
  }

  public readonly loadCharacter: CharacterLoader = (scene) =>
    LoadAssetContainerAsync(`data:${this.characterSnapshot}`, scene, {
      pluginExtension: '.babylon',
      rootUrl: this.rootUrl,
    });
}
