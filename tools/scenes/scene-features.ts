import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

/** Recognized serialized features. Extend deliberately alongside an export/load regression. */
export const sceneFeatureCatalogue: Readonly<Record<string, readonly string[]>> = {
  'character:glTF': ['@babylonjs/loaders/glTF'],
  'camera-input:ArcRotateCameraKeyboardMoveInput': [
    '@babylonjs/core/Cameras/Inputs/arcRotateCameraKeyboardMoveInput',
  ],
  'camera-input:ArcRotateCameraMouseWheelInput': [
    '@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput',
  ],
  'camera-input:ArcRotateCameraPointersInput': [
    '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput',
  ],
  'camera-input:FreeCameraKeyboardMoveInput': [
    '@babylonjs/core/Cameras/Inputs/freeCameraKeyboardMoveInput',
  ],
  'camera-input:FreeCameraMouseInput': ['@babylonjs/core/Cameras/Inputs/freeCameraMouseInput'],
  'camera-input:FreeCameraTouchInput': ['@babylonjs/core/Cameras/Inputs/freeCameraTouchInput'],
  'camera-input:FreeCameraGamepadInput': [
    '@babylonjs/core/Cameras/Inputs/freeCameraGamepadInput',
    '@babylonjs/core/Gamepads/gamepadSceneComponent',
  ],
  UniversalCamera: [
    '@babylonjs/core/Cameras/universalCamera',
    '@babylonjs/core/Gamepads/gamepadSceneComponent',
  ],
  FreeCamera: ['@babylonjs/core/Cameras/freeCamera'],
  ArcRotateCamera: ['@babylonjs/core/Cameras/arcRotateCamera'],
  'light:0': ['@babylonjs/core/Lights/pointLight'],
  'light:1': ['@babylonjs/core/Lights/directionalLight'],
  'light:2': ['@babylonjs/core/Lights/spotLight'],
  'light:3': ['@babylonjs/core/Lights/hemisphericLight'],
  'BABYLON.GridMaterial': ['@babylonjs/materials/grid/gridMaterial'],
  'BABYLON.StandardMaterial': ['@babylonjs/core/Materials/standardMaterial'],
  'BABYLON.PBRMaterial': ['@babylonjs/core/Materials/PBR/pbrMaterial'],
  Mesh: ['@babylonjs/core/Meshes/mesh'],
  GroundMesh: ['@babylonjs/core/Meshes/groundMesh'],
  TransformNode: ['@babylonjs/core/Meshes/transformNode'],
};

const baseline = [
  '@babylonjs/core/Loading/Plugins/babylonFileLoader',
  '@babylonjs/core/Materials/standardMaterial',
  '@babylonjs/core/Animations/animatable',
  '@babylonjs/core/Animations/animationGroup',
  '@babylonjs/core/Materials/colorCurves',
];

export function sceneFeatures(value: unknown, filename: string): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid scene: ${filename}`);
  const scene = value as Record<string, unknown>;
  const features = new Set<string>();
  const requireFeature = (feature: string, location: string) => {
    if (!Object.hasOwn(sceneFeatureCatalogue, feature))
      throw new Error(
        `Unsupported scene feature ${feature} at ${filename}.${location}. Add a tested registration to sceneFeatureCatalogue.`,
      );
    features.add(feature);
  };
  for (const category of ['cameras', 'lights', 'meshes', 'transformNodes'] as const) {
    const entries = scene[category];
    if (entries !== undefined && !Array.isArray(entries))
      throw new Error(`Invalid ${filename}.${category}`);
    for (const [index, entry] of ((entries as unknown[]) ?? []).entries()) {
      if (!entry || typeof entry !== 'object')
        throw new Error(`Invalid ${filename}.${category}[${index}]`);
      const record = entry as Record<string, unknown>;
      const feature =
        category === 'lights'
          ? `light:${record.type}`
          : category === 'transformNodes'
            ? 'TransformNode'
            : String(record.type ?? (category === 'meshes' ? 'Mesh' : 'UniversalCamera'));
      requireFeature(feature, `${category}[${index}]`);
      if (category === 'cameras' && record.inputsmgr && typeof record.inputsmgr === 'object')
        for (const input of Object.keys(record.inputsmgr))
          requireFeature(`camera-input:${input}`, `${category}[${index}].inputsmgr.${input}`);
    }
  }
  function visit(v: unknown, location: string): void {
    if (!v || typeof v !== 'object') return;
    if (!Array.isArray(v)) {
      const r = v as Record<string, unknown>;
      if (r.customType !== undefined)
        requireFeature(String(r.customType), location + '.customType');
    }
    for (const [key, child] of Object.entries(v)) visit(child, location + '.' + key);
  }
  visit(scene, 'scene');
  for (const category of [
    'particleSystems',
    'postProcesses',
    'spriteManagers',
    'reflectionProbes',
    'sounds',
    'shadowGenerators',
  ]) {
    const entries = scene[category];
    if (Array.isArray(entries) && entries.length)
      throw new Error(
        `Unsupported scene feature ${category} at ${filename}.${category}. Add a tested feature adapter before export.`,
      );
  }
  return [...features].sort();
}

export function normalizeScriptRegistry(source: string): string {
  const file = ts.createSourceFile('scripts.ts', source, ts.ScriptTarget.Latest, true);
  const remove = file.statements.filter(
    (statement) =>
      (ts.isImportDeclaration(statement) &&
        statement.moduleSpecifier.getText(file).slice(1, -1) === 'babylonjs-editor-tools') ||
      ts.isExportDeclaration(statement),
  );
  for (const statement of remove.reverse())
    source = source.slice(0, statement.getStart(file)) + source.slice(statement.end);
  return source;
}

export async function sceneRegistrationFiles(
  stage: string,
): Promise<{ manifest: string; source: string }> {
  const output = path.join(stage, 'public/scene');
  const features: Record<string, string[]> = {};
  // Current retained character asset is a separate loader dependency, not a scene script.
  features['assets/models/protagonist-v3.glb'] = ['character:glTF'];
  for (const filename of (await fs.readdir(output))
    .filter((name) => name.endsWith('.babylon'))
    .sort())
    features[filename] = sceneFeatures(
      JSON.parse(await fs.readFile(path.join(output, filename), 'utf8')),
      filename,
    );
  const imports = [
    ...new Set([
      ...baseline,
      ...Object.values(features)
        .flat()
        .flatMap((feature) => sceneFeatureCatalogue[feature]),
    ]),
  ].sort();
  const manifest = JSON.stringify({ version: 1, features, imports });
  const hash = crypto.createHash('sha256').update(manifest).digest('hex');
  const inputs = imports.filter((name) => name.includes('/Cameras/Inputs/'));
  const inputTypes = inputs.map((name) => {
    const filename = name.slice(name.lastIndexOf('/') + 1);
    return { name, type: filename[0].toUpperCase() + filename.slice(1) };
  });
  const source = [
    '// Generated by scene export.',
    ...imports.filter((name) => !inputs.includes(name)).map((name) => `import '${name}';`),
    ...(inputs.length
      ? ["import { CameraInputTypes } from '@babylonjs/core/Cameras/cameraInputsManager';"]
      : []),
    ...inputTypes.map(({ name, type }) => `import { ${type} } from '${name}';`),
    ...inputTypes.map(({ type }) => `Object.assign(CameraInputTypes, { ${type} });`),
    '',
    `export const sceneRegistrationHash =\n  '${hash}';`,
    '',
  ].join('\n');
  return { manifest: manifest + '\n', source };
}

export async function generateSceneRegistrations(stage: string): Promise<void> {
  const files = await sceneRegistrationFiles(stage);
  await fs.writeFile(path.join(stage, 'public/scene/registrations.json'), files.manifest);
  await fs.writeFile(path.join(stage, 'src/scene-registrations.ts'), files.source);
  const registry = path.join(stage, 'src/scripts.ts');
  await fs.writeFile(registry, normalizeScriptRegistry(await fs.readFile(registry, 'utf8')));
}
