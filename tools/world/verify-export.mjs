import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { compileWorld } from './compile.mjs';
import { assertWorldDefinition } from '../../src/contracts/world.ts';

/** The Editor scene manifest does not include this independently compiled boundary. */
export async function verifyWorldExport(root) {
  const output = path.join(root, 'public/scene');
  const world = JSON.parse(await fs.readFile(path.join(output, 'worlds/game.json'), 'utf8'));
  assertWorldDefinition(world);
  if (!isDeepStrictEqual(world, await compileWorld(path.join(root, 'assets/game.scene'))))
    throw new Error('Compiled Game world differs from saved authored markers; export scenes again');
  const assets = JSON.parse(await fs.readFile(path.join(output, 'assets-list.json'), 'utf8'));
  if (!Array.isArray(assets) || !assets.includes('worlds/game.json'))
    throw new Error('Compiled Game world is absent from assets-list.json');
  return world;
}
