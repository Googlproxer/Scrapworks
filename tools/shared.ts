import fs from 'node:fs/promises';

/** Read repository-owned JSON using the caller's declared file schema. */
export async function readJson<T>(file: string | URL): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function hasCode(error: unknown, code: string): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === code;
}

export interface ExportPolicy {
  version: number;
  additionalSceneAssets: string[];
  excludedPublicAssets: { path: string; source: string }[];
  retainedPublicAssets: { path: string; consumer: string }[];
  provenance: { source: string }[];
}

export type SceneManifest = Record<string, string[]>;

export interface BuildOutput {
  entryPoint?: string;
  bytes?: number;
  imports?: { path: string; kind: string; external?: boolean }[];
  inputs?: Record<string, unknown>;
}

export interface BuildMetadata {
  outputs: Record<string, BuildOutput>;
}

/** Tests deliberately mutate detached read-only views to prove isolation. */
export type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

export function mutable<T>(value: T): Mutable<T> {
  return value as Mutable<T>;
}
