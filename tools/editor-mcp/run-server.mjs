import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const candidates = [
  process.env.SCRAPWORKS_BABYLON_EDITOR_PATH,
  path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'BabylonJS Editor'),
  path.join(process.env.USERPROFILE ?? '', 'AppData/Local/Programs/BabylonJS Editor'),
].filter(Boolean);
const editorDirectory = candidates.find((directory) => existsSync(path.join(directory, 'resources/app.asar.unpacked/build/mcp/index.mjs'))) ?? candidates[0];
const server = path.join(editorDirectory, 'resources/app.asar.unpacked/build/mcp/index.mjs');

if (!existsSync(server)) {
  throw new Error(`Babylon.js Editor's bundled MCP server was not found at ${server}. Set SCRAPWORKS_BABYLON_EDITOR_PATH to the installed Editor directory.`);
}

process.env.BABYLONJS_EDITOR_MCP_URL ??= 'http://127.0.0.1:3712';
await import(pathToFileURL(server).href);
