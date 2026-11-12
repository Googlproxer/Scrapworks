import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  LoadAssetContainerAsync,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';
import type { AbstractMesh, Material } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CellMaterial } from '@babylonjs/materials/cell/cellMaterial';
import type { RenderRequest, RenderResult, Variant } from './presets.ts';
import { featherVariants } from './presets.ts';
import { featheredCell } from './feathered-cell.ts';

async function main(): Promise<void> {
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('Missing test canvas');
  // Metres throughout this isolated fixture; the production Editor scene uses cm.
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, false);
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString('#E7D8C1FF');
  scene.imageProcessingConfiguration.exposure = 1;
  scene.imageProcessingConfiguration.contrast = 1;
  scene.imageProcessingConfiguration.toneMappingEnabled = false;
  const camera = new ArcRotateCamera(
    'comparison-camera',
    Math.PI / 2,
    1.3,
    3.8,
    new Vector3(0, 0.95, 0),
    scene,
  );
  camera.minZ = 0.05;
  camera.maxZ = 60;
  camera.fov = 0.65;
  const fill = new HemisphericLight('fill', Vector3.Up(), scene);
  const sun = new DirectionalLight('sun', new Vector3(0.5, -1, -0.6).normalize(), scene);
  sun.position.set(-3, 6, 4);
  sun.shadowMinZ = 0.1;
  sun.shadowMaxZ = 18;
  sun.diffuse = new Color3(1, 0.96, 0.9);
  sun.specular = sun.diffuse.clone();

  const floor = MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, scene);
  const floorMaterial = new StandardMaterial('ground-matte', scene);
  floorMaterial.diffuseColor = Color3.FromHexString('#BCA486');
  floorMaterial.specularColor = Color3.Black();
  floor.material = floorMaterial;
  floor.receiveShadows = true;
  const lines: Vector3[][] = [];
  for (let i = -10; i <= 10; i += 2) {
    lines.push([new Vector3(i, 0.002, -10), new Vector3(i, 0.002, 10)]);
    lines.push([new Vector3(-10, 0.002, i), new Vector3(10, 0.002, i)]);
  }
  const grid = MeshBuilder.CreateLineSystem('two-metre-grid', { lines }, scene);
  grid.color = Color3.FromHexString('#93836F');
  grid.alpha = 0.28;
  const props: AbstractMesh[] = [];
  for (const [x, z, height] of [
    [2, 0.6, 0.6],
    [-2.4, -1.2, 0.9],
    [1, -2.7, 0.35],
  ]) {
    const box = MeshBuilder.CreateBox('scale-block', { width: 0.7, depth: 0.7, height }, scene);
    box.position.set(x, height / 2, z);
    box.material = floorMaterial;
    box.receiveShadows = true;
    props.push(box);
  }

  const character = await LoadAssetContainerAsync('/model.glb', scene);
  character.addAllToScene();
  const meshes = character.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
  if (meshes.length !== 1)
    throw new Error(`Expected one complete character mesh, got ${meshes.length}`);
  const mesh = meshes[0];
  const original = mesh.material;
  if (!(original instanceof PBRMaterial) || !original.albedoTexture)
    throw new Error('Expected textured protagonist PBR material');
  const albedo = original.albedoTexture;
  if (!(albedo instanceof Texture)) throw new Error('Expected a 2D base-colour texture');
  // glTF's sRGB GPU upload is correct for PBR. Standard/Cell expect the original
  // gamma-encoded image samples. Re-upload identical embedded bytes without
  // hardware sRGB decoding; do not repaint, grade, or modify the texture image.
  const diffuseAlbedo = await new Promise<Texture>((resolve, reject) => {
    const texture = new Texture('/fixture/base-color.webp', scene, {
      invertY: false,
      useSRGBBuffer: false,
      gammaSpace: true,
      samplingMode: albedo.samplingMode,
      onLoad: () => resolve(texture),
      onError: (message) => reject(new Error(message ?? 'Base-colour upload failed')),
    });
    texture.coordinatesIndex = albedo.coordinatesIndex;
    texture.wrapU = albedo.wrapU;
    texture.wrapV = albedo.wrapV;
    texture.uOffset = albedo.uOffset;
    texture.vOffset = albedo.vOffset;
    texture.uScale = albedo.uScale;
    texture.vScale = albedo.vScale;
    texture.uAng = albedo.uAng;
    texture.vAng = albedo.vAng;
    texture.wAng = albedo.wAng;
    texture.level = albedo.level;
    texture.hasAlpha = albedo.hasAlpha;
  });

  const matte = original.clone('matte-pbr')!;
  matte.bumpTexture = null;
  matte.metallicTexture = null;
  matte.ambientTexture = null;
  matte.metallic = 0;
  matte.roughness = 1;
  matte.specularIntensity = 0;
  matte.environmentIntensity = 0;
  const diffuse = new StandardMaterial('diffuse-standard', scene);
  diffuse.diffuseColor = original.albedoColor.clone();
  diffuse.diffuseTexture = diffuseAlbedo;
  diffuse.specularColor = Color3.Black();
  diffuse.backFaceCulling = original.backFaceCulling;
  diffuse.alpha = original.alpha;
  const cellHigh = new CellMaterial('stock-cell-five-level', scene);
  cellHigh.diffuseTexture = diffuseAlbedo;
  cellHigh.diffuseColor = original.albedoColor.clone();
  cellHigh.computeHighLevel = true;
  cellHigh.backFaceCulling = original.backFaceCulling;
  const cellBasic = new CellMaterial('stock-cell-basic', scene);
  cellBasic.diffuseTexture = diffuseAlbedo;
  cellBasic.diffuseColor = original.albedoColor.clone();
  cellBasic.computeHighLevel = false;
  cellBasic.backFaceCulling = original.backFaceCulling;
  const materials: Record<Variant, Material> = {
    current: original,
    'pbr-original': original,
    'pbr-matte': matte,
    standard: diffuse,
    'cell-high': cellHigh,
    'cell-basic': cellBasic,
    'cell-soft': cellHigh,
    'cell-feather-zero': featheredCell(
      'feather-zero-control',
      scene,
      diffuseAlbedo,
      original.albedoColor,
      0,
      original.backFaceCulling,
    ),
    'cell-feather-fine': featheredCell(
      'feather-fine',
      scene,
      diffuseAlbedo,
      original.albedoColor,
      0.01,
      original.backFaceCulling,
    ),
    'cell-feather-subtle': featheredCell(
      'feather-subtle',
      scene,
      diffuseAlbedo,
      original.albedoColor,
      0.025,
      original.backFaceCulling,
    ),
    'cell-feather-soft': featheredCell(
      'feather-soft',
      scene,
      diffuseAlbedo,
      original.albedoColor,
      0.05,
      original.backFaceCulling,
    ),
  };
  for (const material of Object.values(materials))
    material.onError = (_effect, error) => {
      window.protagonistTestError = error;
    };
  for (const item of meshes) item.receiveShadows = true;
  const shadow = new ShadowGenerator(2048, sun);
  shadow.usePercentageCloserFiltering = true;
  shadow.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadow.bias = 0.001;
  shadow.normalBias = 0.012;
  for (const item of [...meshes, ...props]) shadow.addShadowCaster(item);

  let lastPose = '';
  async function render(request: RenderRequest): Promise<RenderResult> {
    engine.resize();
    const pose = request.pose ?? 'Idle';
    const phase = request.phase ?? 0;
    const poseKey = `${pose}:${phase}`;
    if (poseKey !== lastPose) {
      for (const animation of character.animationGroups) animation.stop();
      const animation = character.animationGroups.find(
        (group) => group.name.split('|').at(-1) === pose,
      );
      if (!animation) throw new Error(`Missing clip ${pose}`);
      animation.start(true, 1);
      animation.goToFrame(animation.from + (animation.to - animation.from) * phase);
      animation.pause();
      lastPose = poseKey;
    }
    for (const skeleton of character.skeletons) skeleton.prepare();
    for (const item of meshes) {
      item.computeWorldMatrix(true);
      item.refreshBoundingInfo({ applySkeleton: true });
    }
    const bounds = mesh.getBoundingInfo().boundingBox;
    const centre = bounds.minimumWorld.add(bounds.maximumWorld).scale(0.5);
    const isOverhead = request.view.startsWith('overhead');
    camera.setTarget(new Vector3(centre.x, isOverhead ? 0.85 : centre.y, centre.z));
    camera.fov = isOverhead ? 0.8 : 0.65;
    camera.beta = isOverhead ? Math.PI / 4 : 1.3;
    camera.radius =
      request.view === 'overhead-default' ? 12 : request.view === 'overhead-near' ? 6 : 3.8;
    camera.alpha =
      request.view === 'back'
        ? -Math.PI / 2
        : request.view === 'three-quarter'
          ? Math.PI / 4
          : Math.PI / 2;
    grid.setEnabled(isOverhead);
    for (const prop of props) prop.setEnabled(isOverhead);
    const current = request.variant === 'current';
    const feather = featherVariants.find((item) => item.id === request.variant);
    const soft = request.variant === 'cell-soft' || request.variant.startsWith('cell-feather-');
    fill.intensity = current ? 1 : soft ? 0.75 : 0.3;
    fill.diffuse = current
      ? Color3.White()
      : soft
        ? new Color3(1, 0.98, 0.94)
        : new Color3(0.84, 0.9, 1);
    fill.groundColor = current
      ? Color3.Black()
      : soft
        ? new Color3(0.6, 0.55, 0.5)
        : new Color3(0.24, 0.21, 0.2);
    sun.setEnabled(!current);
    sun.intensity = soft ? 0.85 : 1;
    shadow.setDarkness(soft ? 0.25 : 0);
    scene.shadowsEnabled = request.shadows && !current;
    sun.shadowEnabled = scene.shadowsEnabled;
    mesh.material = materials[request.variant];
    await mesh.material.forceCompilationAsync(mesh);
    if (scene.shadowsEnabled) await shadow.forceCompilationAsync();
    // Render actual WebGL frames, including the shadow depth pass, then capture.
    for (let frame = 0; frame < 6; frame++) {
      scene.render();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    await scene.whenReadyAsync();
    scene.render();
    if (window.protagonistTestError) throw new Error(window.protagonistTestError);
    return {
      request,
      camera: {
        alpha: camera.alpha,
        beta: camera.beta,
        radius: camera.radius,
        target: camera.target.asArray(),
        fov: camera.fov,
      },
      meshCount: meshes.length,
      triangles: meshes.reduce((sum, item) => sum + item.getTotalIndices() / 3, 0),
      skinInfluences: meshes.map((item) => item.numBoneInfluencers),
      bounds: { min: bounds.minimumWorld.asArray(), max: bounds.maximumWorld.asArray() },
      material: mesh.material.getClassName(),
      albedoSize: albedo.getSize(),
      bandHalfWidth:
        feather?.halfWidth ?? (request.variant === 'cell-feather-zero' ? 0 : undefined),
      lighting: {
        sun: current ? 0 : sun.intensity,
        fill: fill.intensity,
        shadowDarkness: shadow.getDarkness(),
      },
      backend: `WebGL ${engine.webGLVersion}`,
      gpu: engine.getGlInfo(),
    };
  }
  window.protagonistTest = {
    render,
    dispose: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}

void main().catch((error: unknown) => {
  window.protagonistTestError =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
});
