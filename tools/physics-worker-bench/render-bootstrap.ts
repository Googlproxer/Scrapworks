import { installInputProbe } from './input-probe.ts';
import { installRendererFault } from './renderer-faults.ts';
const parameters = new URL(location.href).searchParams;
const nativeOpen = indexedDB.open.bind(indexedDB);
const namespace = parameters.get('job');
if (namespace) indexedDB.open = ((name: string, version?: number) => { const target = name === 'ScrapworksGameplaySaves' ? `ScrapworksPhysicsBench-${namespace}` : name; return version === undefined ? nativeOpen(target) : nativeOpen(target, version); }) as typeof indexedDB.open;
installInputProbe({ syntheticGamepad: parameters.get('device') === 'synthetic-gamepad' });
installRendererFault(parameters.get('fault') ?? 'none');
// Explicitly labelled stress controls. Ordinary baseline/latency URLs omit this parameter.
if (parameters.get('pressure') === 'main') setInterval(() => { const start = performance.now(); while (performance.now() - start < 6) { /* controlled main-thread pressure */ } }, 16);
if (parameters.get('pressure') === 'background') {
  const code = 'setInterval(() => { const start = performance.now(); while (performance.now() - start < 8) {} }, 16)';
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  const workers = [new Worker(url), new Worker(url)]; URL.revokeObjectURL(url);
  addEventListener('pagehide', () => workers.forEach(worker => worker.terminate()), { once: true });
}
