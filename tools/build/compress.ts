import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';

const compress = promisify(brotliCompress);
const textExtensions = new Set([
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.json',
  '.svg',
  '.txt',
  '.xml',
  '.babylon',
  '.gltf',
]);
const binaryExtensions = new Set(['.wasm', '.glb', '.bin']);

export interface CompressionReport {
  readonly files: number;
  readonly originalBytes: number;
  readonly brotliBytes: number;
}

async function eligibleFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Build output must not contain symbolic links: ${target}`);
    if (entry.isDirectory()) files.push(...(await eligibleFiles(target)));
    else if (
      entry.isFile() &&
      (textExtensions.has(path.extname(entry.name)) ||
        binaryExtensions.has(path.extname(entry.name)))
    )
      files.push(target);
  }
  return files.sort();
}

/** Add deterministic Brotli sidecars; original URLs and bytes remain usable by any host. */
export async function compressBuild(directory: string): Promise<CompressionReport> {
  const files = await eligibleFiles(directory);
  let next = 0;
  let written = 0;
  let originalBytes = 0;
  let brotliBytes = 0;
  // Bound native compression work and memory, including large scene/model/worker assets.
  await Promise.all(
    Array.from({ length: Math.min(4, files.length) }, async () => {
      while (next < files.length) {
        const file = files[next++];
        const bytes = await fs.readFile(file);
        const compressed = await compress(bytes, {
          params: {
            [constants.BROTLI_PARAM_QUALITY]: 11,
            [constants.BROTLI_PARAM_MODE]: textExtensions.has(path.extname(file))
              ? constants.BROTLI_MODE_TEXT
              : constants.BROTLI_MODE_GENERIC,
          },
        });
        if (compressed.length >= bytes.length) {
          // A repeated standalone run must not leave an outdated sidecar behind.
          await fs.rm(file + '.br', { force: true });
          continue;
        }
        await fs.writeFile(file + '.br', compressed);
        ++written;
        originalBytes += bytes.length;
        brotliBytes += compressed.length;
      }
    }),
  );
  return { files: written, originalBytes, brotliBytes };
}

export function printCompression(report: CompressionReport): void {
  console.log(
    `Brotli: ${report.files} sidecars; ${report.originalBytes} → ${report.brotliBytes} bytes (${report.originalBytes - report.brotliBytes} bytes saved).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  printCompression(await compressBuild(path.resolve(process.argv[2] ?? 'dist/scrapworks/browser')));
}
