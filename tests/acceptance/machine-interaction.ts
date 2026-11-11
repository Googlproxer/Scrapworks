import type { EngineStore } from '@babylonjs/core/Engines/engineStore';
import type { Page } from 'playwright';
import type { BuildingView } from '../../src/contracts/world.ts';

/** Read-only camera projection followed by the real, rebindable world interaction action. */
export async function interactWithMachine(
  page: Page,
  engineChunk: string,
  building: BuildingView,
  action: 'keyboard' | 'click' = 'keyboard',
): Promise<void> {
  await page.locator('canvas').focus();
  for (let attempt = 0; attempt < 24; attempt++) {
    const point = await page.evaluate(
      async ({ file, id, attempt }) => {
        const module: Record<string, unknown> = await import(new URL(file, document.baseURI).href);
        const store = Object.values(module).find(
          (value): value is typeof EngineStore =>
            typeof value === 'function' && 'LastCreatedEngine' in value && 'Instances' in value,
        )!;
        const engine = store.LastCreatedEngine!,
          scene = engine.scenes.at(-1)!,
          camera = scene.activeCamera!;
        const meshes = scene.meshes.filter(
          (mesh) => mesh.metadata?.worldEntity === id && mesh.getTotalVertices() > 0,
        );
        const mesh = meshes[attempt % meshes.length];
        if (!mesh) throw new Error(`Missing machine presentation: ${id}`);
        const box = mesh.getBoundingInfo().boundingBox;
        const center = box.centerWorld,
          m = scene.getTransformMatrix().m;
        const x = center.x,
          y = attempt < meshes.length ? center.y : (center.y + box.maximumWorld.y) / 2,
          z = center.z;
        const w = x * m[3] + y * m[7] + z * m[11] + m[15];
        const clipX = (x * m[0] + y * m[4] + z * m[8] + m[12]) / w;
        const clipY = (x * m[1] + y * m[5] + z * m[9] + m[13]) / w;
        const viewport = camera.viewport.toGlobal(
          engine.getRenderWidth(),
          engine.getRenderHeight(),
        );
        const canvas = engine.getRenderingCanvas()!.getBoundingClientRect();
        return {
          x:
            canvas.left +
            ((viewport.x + ((clipX + 1) * viewport.width) / 2) * canvas.width) /
              engine.getRenderWidth(),
          y:
            canvas.top +
            ((viewport.y + ((1 - clipY) * viewport.height) / 2) * canvas.height) /
              engine.getRenderHeight(),
        };
      },
      { file: engineChunk, id: building.id, attempt },
    );
    await page.mouse.move(point.x, point.y);
    await page.evaluate(() => window.testEvents.frames(2));
    const hit = await page.evaluate(async (file) => {
      const module: Record<string, unknown> = await import(new URL(file, document.baseURI).href);
      const store = Object.values(module).find(
        (value): value is typeof EngineStore =>
          typeof value === 'function' && 'LastCreatedEngine' in value && 'Instances' in value,
      )!;
      const scene = store.LastCreatedEngine!.scenes.at(-1)!;
      return scene.pick(scene.pointerX, scene.pointerY, (mesh) => !!mesh.metadata?.worldEntity)
        ?.pickedMesh?.metadata?.worldEntity as string | undefined;
    }, engineChunk);
    if (hit !== building.id) continue;
    if (action === 'keyboard') await page.keyboard.press('KeyE');
    else await page.mouse.click(point.x, point.y);
    await page.locator('#machine-inspection-title').waitFor();
    return;
  }
  throw new Error(`Cannot point at machine ${building.id}`);
}
