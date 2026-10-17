import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [path.join(directory, 'run-server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
let sequence = 0;
const reader = readline.createInterface({ input: child.stdout });
child.on('exit', (code) => {
  for (const request of pending.values()) request.reject(new Error(`Editor MCP server exited (${code})`));
  pending.clear();
});
reader.on('line', (line) => {
  const message = JSON.parse(line);
  const request = pending.get(message.id);
  if (request) {
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
});

function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, method === 'tools/call' ? 120000 : 30000);
    pending.set(id, { resolve: (result) => { clearTimeout(timer); resolve(result); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

try {
  const initialized = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'scrapworks-editor-check', version: '0.1.0' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  await request('ping');
  const catalog = await request('tools/list');
  if (process.argv[2] === '--list') {
    const names = (process.argv[3] ?? 'get_active_scene,get_scene_hierarchy,instantiate_mesh_asset,save_scene').split(',');
    console.log(JSON.stringify({ server: initialized.serverInfo, tools: catalog.tools.filter((tool) => names.includes(tool.name)) }, null, 2));
  } else {
    const name = process.argv[2] ?? 'get_active_scene';
    const argument = process.argv[3] ?? '{}';
    const args = JSON.parse(argument.startsWith('@') ? await fs.readFile(argument.slice(1), 'utf8') : argument);
    const result = await request('tools/call', { name, arguments: args });
    for (const content of result.content ?? []) {
      if (content.type === 'image' && process.argv[4]) {
        await fs.writeFile(process.argv[4], Buffer.from(content.data, 'base64'));
        delete content.data;
        content.savedTo = process.argv[4];
      }
    }
    console.log(JSON.stringify({ server: initialized.serverInfo, toolCount: catalog.tools.length, result }, null, 2));
    if (result.isError) process.exitCode = 1;
  }
} finally {
  reader.close();
  child.kill();
}
