import type { BenchOptions } from './model.ts';

export interface CliOptions extends BenchOptions {
  readonly output: string;
  readonly smoke: boolean;
}

export function parseOptions(args: readonly string[]): CliOptions {
  const smoke = args.includes('--smoke');
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--smoke') continue;
    if (
      ![
        '--samples',
        '--warmups',
        '--seed',
        '--populations',
        '--physics-bodies',
        '--output',
      ].includes(key)
    )
      throw new Error(`Unknown option: ${key}`);
    if (values.has(key) || !args[i + 1] || args[i + 1].startsWith('--'))
      throw new Error(`Missing or duplicate ${key}.`);
    values.set(key, args[++i]);
  }
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(values.get(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`Invalid ${key}: expected ${min}..${max}.`);
    return value;
  };
  const populations = (values.get('--populations') ?? (smoke ? '100' : '10000,100000,250000'))
    .split(',')
    .map((value) => Number(value));
  if (
    !populations.length ||
    new Set(populations).size !== populations.length ||
    populations.some((value) => !Number.isSafeInteger(value) || value < 10 || value > 250000)
  )
    throw new Error('Populations must be unique integers from 10 to 250000.');
  return {
    smoke,
    populations,
    samples: integer('--samples', smoke ? 3 : 11, 1, 1000),
    warmups: integer('--warmups', smoke ? 1 : 2, 0, 100),
    seed: integer('--seed', 20261108, 0, 0xffffffff),
    physicsBodies: integer('--physics-bodies', smoke ? 32 : 1000, 0, 5000),
    output: values.get('--output') ?? 'tmp/save-bench/latest',
  };
}
