import { TargetCamera } from '@babylonjs/core';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Scene } from '@babylonjs/core/scene';

export function createMainMenuScene(engine: Engine): Scene {
  const scene = new Scene(engine);
  scene.defaultMaterial = new StandardMaterial('menu-material', scene);

  const camera = new TargetCamera('camera', new Vector3(0, 0.85, 5), scene);

  new HemisphericLight('light', Vector3.Up(), scene);

  CreateGround('ground', { width: 20, height: 20 }, scene);

  const title = CreatePlane('title', { size: 2 }, scene);
  title.position.set(0, 5, 0);

  camera.setTarget(title.position);

  return scene;
}
