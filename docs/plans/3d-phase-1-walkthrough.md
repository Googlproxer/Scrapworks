# Babylon Phase 1 implementation walkthrough

Prepared 11 October 2026. Companion to [Phase 1 of the 3D migration plan](3d-migration.md#phase-1-prove-babylon-inside-the-existing-application).

Begin directly at Phase 1; Phase 0 is being skipped. This is guidance for implementing the migration yourself. The snippets describe the proposed implementation, rather than a review of subsequent code changes.

Start with a `/3d` prototype that uses the existing game page and client interface. When this walkthrough was prepared, `@babylonjs/core` and `@babylonjs/loaders` were already installed at **9.30.0**, so the package installation step was complete.

Work through these checkpoints in order.

**Implementation status, 11 October 2026:** Phase 1 is complete. See the [migration plan's verification record](3d-migration.md#phase-1-prove-babylon-inside-the-existing-application). The current implementation uses [the Babylon client](../../src/game/babylon/babylon-game-client.ts), separate [game](../../src/game/babylon/scenes/game.scene.ts) and [menu](../../src/game/babylon/scenes/main-menu.scene.ts) builders, and [Protag-v1.glb](../../public/assets/models/Protag-v1.glb). The snippets below remain the original implementation guidance.

## 1. Add a separate Babylon factory

Create these files under `L:\Angular\scrapworks\src\game\babylon\`:

| File                     | Responsibility                                               |
| ------------------------ | ------------------------------------------------------------ |
| `bootstrap.ts`           | Return a Babylon implementation of `GameClient`              |
| `babylon-game-client.ts` | Own the canvas, engine, lifecycle state and rendering        |
| `prototype-scene.ts`     | Build the ground, placeholder character, obstacle and camera |

Keep the factory synchronous:

```ts
import type { GameClient } from '@contracts/game-client';
import { BabylonGameClient } from './babylon-game-client';

export function createBabylonGameClient(host: HTMLElement): GameClient {
  return new BabylonGameClient(host);
}
```

The client can start asynchronous loading internally. Returning a `Promise<GameClient>` would require changing the current mounting service.

## 2. Connect it through a temporary route

In [app.routes.ts](../../src/app/app.routes.ts), import:

```ts
import { GAME_CLIENT_FACTORY } from '@app/features/game/game-client-factory';
import { createBabylonGameClient } from '@game/babylon/bootstrap';
```

Add this entry before the existing route:

```ts
{
  path: '3d',
  providers: [
    {
      provide: GAME_CLIENT_FACTORY,
      useValue: createBabylonGameClient,
    },
  ],
  loadComponent: () =>
    import('./features/game/game-page/game-page.component')
      .then((module) => module.GamePageComponent),
},
```

The current canvas-host component already mounts through `GameRuntimeService`; it contains no Phaser rendering calls. Reuse it for this checkpoint despite its current name.

Visiting `/3d` will use Babylon, while `/` continues using Phaser.

## 3. Implement the client's lifecycle

Implement the existing [GameClient interface](../../src/contracts/game-client.ts), using `BehaviorSubject<GameState>` as the current Phaser client does.

| Method             | Behavior                                                                               |
| ------------------ | -------------------------------------------------------------------------------------- |
| Constructor        | Create and append a canvas, create the Babylon engine, then publish `ready / MainMenu` |
| `subscribe()`      | Replay the current lifecycle state and return an unsubscribe function                  |
| `setScene('Game')` | Publish loading, construct the scene asynchronously, then publish ready                |
| `destroy()`        | Stop rendering, dispose owned resources, remove the canvas and publish stopped         |

Initially, `MainMenu` can simply mean "engine initialized, waiting for Play Game." The existing Angular page displays the button.

Make the canvas fill its host with `width: 100%`, `height: 100%` and `display: block`. Set its `tabIndex` to `0` and call `engine.resize()` after attaching it.

Store the render callback:

```ts
private readonly renderFrame = () => {
  this.scene?.render();
};
```

Start rendering with `engine.runRenderLoop(this.renderFrame)` and stop that same callback during destruction.

Catch errors inside the asynchronous scene-loading method. Publish them through `GameState.errorMessage`, because an asynchronous rejection will not reach the mounting service's synchronous `try/catch`.

## 4. Build the primitive scene

In `L:\Angular\scrapworks\src\game\babylon\prototype-scene.ts`:

```ts
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { Scene } from '@babylonjs/core/scene';

export function createPrototypeScene(engine: Engine, canvas: HTMLCanvasElement): Scene {
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 4, 12, new Vector3(0, 0.85, 0), scene);

  camera.attachControl(canvas, true);

  new HemisphericLight('light', Vector3.Up(), scene);

  CreateGround('ground', { width: 20, height: 20 }, scene);

  const player = CreateCapsule('player-placeholder', { height: 1.7, radius: 0.25 }, scene);
  player.position.y = 0.85;

  const obstacle = CreateBox('obstacle', { size: 1.5 }, scene);
  obstacle.position.set(3, 0.75, 0);

  return scene;
}
```

`ArcRotateCamera` orbits a target, provides attached mouse/touch controls, and gives an initial perspective view. See the [Babylon camera documentation](https://doc.babylonjs.com/features/featuresDeepDive/cameras/camera_introduction).

The first visible checkpoint is `/3d` → Play Game → ground, capsule and box, with camera rotation and zoom.

## 5. Add the protagonist import

Copy the [existing protagonist GLB](../art/characters/3d/protagonist-mpfb-v1/protagonist-mpfb-v1.glb) into:

```text
L:\Angular\scrapworks\public\assets\models\protagonist-mpfb-v1.glb
```

Create a separate helper at `L:\Angular\scrapworks\src\game\babylon\load-protagonist.ts`:

```ts
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { Scene } from '@babylonjs/core/scene';
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic';

registerBuiltInLoaders();

export function loadProtagonist(scene: Scene) {
  return LoadAssetContainerAsync('/assets/models/protagonist-mpfb-v1.glb', scene);
}
```

This returns an asset container without immediately adding it to the scene. Dynamic registration loads the importer when needed. See the [Babylon loading documentation](https://doc.babylonjs.com/features/featuresDeepDive/importers/loadingFileTypes).

In the client's loading method:

1. Create the scene.
2. Await `loadProtagonist(scene)`.
3. Check that the client is still alive; dispose the returned assets if it was destroyed while loading.
4. Call `assets.addAllToScene()` and retain the container for cleanup.
5. Await `scene.whenReadyAsync()`.
6. Render successfully once, then publish `ready / Game`.

Initially, place the model beside the capsule to compare scale and ground contact. An A-pose is expected: the current source GLB has a rig but no animation clips.

## 6. Finish the Phase 1 checks

- [x] `/` still uses Phaser; `/3d` uses Babylon.
- [x] Play Game enters a visible prototype scene.
- [x] The GLB's materials, transparency and proportions look reasonable.
- [x] An incorrect model URL produces the Angular error display.
- [x] Leaving the route removes the canvas and stops the render loop.
- [x] `yarn run ng -- build` succeeds.

Movement, animation, factory rules and extensive lifecycle tests belong to later phases. Implement the client and primitive scene first; add the model after that works.
