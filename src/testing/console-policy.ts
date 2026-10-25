import { expect } from 'vitest';

type DiagnosticMethod = 'error' | 'warn' | 'trace';
interface Diagnostic {
  readonly method: DiagnosticMethod;
  readonly arguments: readonly unknown[];
}

const observed: Diagnostic[] = [];
const expected: Diagnostic[] = [];
const capture = {
  error: (...args: unknown[]) => observed.push({ method: 'error', arguments: args }),
  warn: (...args: unknown[]) => observed.push({ method: 'warn', arguments: args }),
  trace: (...args: unknown[]) => observed.push({ method: 'trace', arguments: args }),
};

/** Declare the exact diagnostics a failure-path test must produce, in call order. */
export function expectConsoleMessage(method: DiagnosticMethod, ...args: unknown[]): void {
  expected.push({ method, arguments: args });
}

export function installConsoleCapture(): void {
  for (const method of ['error', 'warn', 'trace'] as const) {
    // Direct wrappers survive vi.restoreAllMocks(), including local teardown hooks.
    console[method] = capture[method];
  }
}

export function assertConsoleMessages(): void {
  const actual = observed.splice(0);
  const declared = expected.splice(0);
  expect(actual, 'Unexpected or missing console diagnostics').toEqual(declared);
}
