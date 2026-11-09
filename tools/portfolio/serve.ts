import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/** Standalone Node 24 static preview; also shipped beside the browser artifact. */
export function staticPreview(directory: string) {
  const root = path.resolve(directory);
  const mime: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.glb': 'model/gltf-binary',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm',
  };
  return http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      let target = path.resolve(root, '.' + pathname);
      if (target !== root && !target.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      if (!path.extname(target)) target = path.join(root, 'index.html');
      const real = await fs.realpath(target),
        realRoot = await fs.realpath(root);
      if (!real.startsWith(realRoot + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const type = mime[path.extname(real)] ?? 'application/octet-stream';
      const acceptsBrotli = /(?:^|,)\s*br\s*(?:,|$)/i.test(req.headers['accept-encoding'] ?? '');
      let file = real;
      if (
        acceptsBrotli &&
        (await fs.stat(real + '.br').then(
          (s) => s.isFile(),
          () => false,
        ))
      ) {
        file = real + '.br';
        res.setHeader('Content-Encoding', 'br');
      }
      res.setHeader('Content-Type', type);
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Cache-Control', real.endsWith('index.html') ? 'no-store' : 'no-cache');
      res.setHeader(
        'Content-Security-Policy',
        "worker-src 'self'; object-src 'none'; base-uri 'self'",
      );
      const bytes = await fs.readFile(file);
      res.setHeader('Content-Length', bytes.length);
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      directory: { type: 'string', default: 'dist/scrapworks/browser' },
      port: { type: 'string', default: '4173' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) console.log('node serve.ts --directory <browser output> --port 4173');
  else {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
    const server = staticPreview(values.directory);
    server.listen(port, '127.0.0.1', () => console.log(`Scrapworks: http://127.0.0.1:${port}/`));
  }
}
