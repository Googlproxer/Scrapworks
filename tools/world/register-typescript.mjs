import fs from 'node:fs';
import { registerHooks } from 'node:module';

// The browser build resolves extensionless TS imports. Match that resolution for pure Node tests.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith('.') &&
      context.parentURL?.endsWith('.ts') &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (fs.existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});
