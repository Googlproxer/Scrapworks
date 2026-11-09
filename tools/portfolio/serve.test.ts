import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { brotliCompressSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { staticPreview } from './serve.ts';

test('static handoff serves routes, Brotli and original fallback with correct types', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scrapworks-preview-'));
  const server = staticPreview(dir);
  try {
    await fs.writeFile(path.join(dir, 'index.html'), '<h1>Fixture</h1>');
    await fs.writeFile(path.join(dir, 'main.js'), 'export const fixture = true;');
    await fs.writeFile(
      path.join(dir, 'main.js.br'),
      brotliCompressSync('export const fixture = true;'),
    );
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    expect(await (await fetch(url + '/3d')).text()).toContain('Fixture');
    const compressed = await fetch(url + '/main.js', { headers: { 'Accept-Encoding': 'br' } });
    expect(compressed.headers.get('Content-Encoding')).toBe('br');
    expect(compressed.headers.get('Vary')).toBe('Accept-Encoding');
    expect(compressed.headers.get('Content-Type')).toBe('text/javascript');
    expect(await compressed.text()).toContain('fixture');
    const original = await fetch(url + '/main.js', { headers: { 'Accept-Encoding': 'identity' } });
    expect(original.headers.get('Content-Encoding')).toBeNull();
    expect(await original.text()).toContain('fixture');
    expect((await fetch(url + '/%2e%2e%2foutside.txt')).status).toBe(403);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    expect(path.dirname(path.resolve(dir))).toBe(path.resolve(os.tmpdir()));
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('portfolio performance entry rejects CI before any build or browser work', () => {
  const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'run.ts')], {
    cwd: os.tmpdir(),
    env: { ...process.env, CI: 'true' },
    encoding: 'utf8',
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('local/manual only');
});
