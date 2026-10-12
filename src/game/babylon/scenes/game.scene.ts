import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { Scene } from '@babylonjs/core/scene';

export function createGameScene(engine: Engine): Scene {
  const scene = new Scene(engine);
  scene.defaultMaterial = new StandardMaterial('prototype-material', scene);

  new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 4, 12, new Vector3(0, 0.85, 0), scene);

  new HemisphericLight('light', Vector3.Up(), scene);

  CreateGround('ground', { width: 20, height: 20 }, scene);

  const playerCap = CreateCapsule('player-placeholder', { height: 1.7, radius: 0.25 }, scene);
  playerCap.position.set(-3, 0.85, 0);

  const obstacle = CreateBox('obstacle', { size: 1.5 }, scene);
  obstacle.position.set(3, 0.75, 0);

  return scene;
}
