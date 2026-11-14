import { pathToFileURL } from 'node:url';
import path from 'node:path';

/** Long browser diagnostics must fail before starting browsers or writing output. */
export function assertLocalDiagnostic(
  diagnostic: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (environment['CI'] || environment['GITHUB_ACTIONS'])
    throw new Error(`${diagnostic} is local/manual only; never run it in CI/GitHub Actions.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  assertLocalDiagnostic('Full browser and renderer diagnostics');
