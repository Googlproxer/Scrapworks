import type { Candidate, Factory } from './model.ts';
export async function load(candidate: Candidate): Promise<Factory> {
  switch (candidate) {
    case 'reference': {
      const { Reference } = await import('./adapters/reference.ts');
      return (f, s) => new Reference(f, s);
    }
    case 'miniplex': {
      const { Miniplex } = await import('./adapters/miniplex.ts');
      return (f, s) => new Miniplex(f, s);
    }
    case 'bitecs':
    case 'bitecs-arrays': {
      const { BitECS } = await import('./adapters/bitecs.ts');
      return (f, s) => new BitECS(f, s, candidate === 'bitecs-arrays');
    }
    case 'koota':
    case 'koota-update': {
      const { Koota } = await import('./adapters/koota.ts');
      return (f, s) => new Koota(f, s, candidate === 'koota-update');
    }
    case 'becsy':
    case 'becsy-checked': {
      const { createBecsy, preloadBecsy } = await import('./adapters/becsy.ts');
      await preloadBecsy(candidate === 'becsy-checked');
      return (f, s) => createBecsy(f, s, candidate === 'becsy-checked');
    }
    default:
      throw new Error(`Unknown candidate: ${String(candidate)}`);
  }
}
