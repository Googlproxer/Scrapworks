import { describe, expect, it } from 'vitest';
import { assertLocalDiagnostic } from './local-only.ts';

describe('local browser diagnostic boundary', () => {
  it('permits a local run without changing its environment', () => {
    const environment = Object.freeze({ CI: '', GITHUB_ACTIONS: '' });
    expect(() => assertLocalDiagnostic('Browser probe', environment)).not.toThrow();
  });

  it.each([{ CI: 'true' }, { GITHUB_ACTIONS: 'true' }, { CI: '1' }, { GITHUB_ACTIONS: 'false' }])(
    'rejects a hosted/CI environment %j, including nonempty false strings',
    (environment) => {
      expect(() => assertLocalDiagnostic('Browser probe', environment)).toThrow(
        'Browser probe is local/manual only; never run it in CI/GitHub Actions.',
      );
    },
  );
});
