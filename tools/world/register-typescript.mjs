import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const configFile = fileURLToPath(new URL('../../tsconfig.json', import.meta.url));
const configuration = ts.getParsedCommandLineOfConfigFile(
  configFile,
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    },
  },
);
if (configuration.errors.length)
  throw new Error(
    configuration.errors
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('\n'),
  );

const cache = ts.createModuleResolutionCache(
  path.dirname(configFile),
  ts.sys.useCaseSensitiveFileNames ? (name) => name : (name) => name.toLowerCase(),
  configuration.options,
);

// Native Node strips types but ignores tsconfig paths and extensionless TS imports.
// Use the same configuration as the browser build; leave packages and built-ins to Node.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('.ts') && !specifier.startsWith('node:')) {
      const { resolvedModule } = ts.resolveModuleName(
        specifier,
        fileURLToPath(context.parentURL),
        configuration.options,
        ts.sys,
        cache,
      );
      if (resolvedModule?.extension === ts.Extension.Ts && !resolvedModule.isExternalLibraryImport)
        return nextResolve(pathToFileURL(resolvedModule.resolvedFileName).href, context);
    }
    return nextResolve(specifier, context);
  },
});
