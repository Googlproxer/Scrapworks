import RAPIER from '@dimforge/rapier3d-compat';
import { RAPIER_VERSION } from '@contracts/physics';

// Module readiness precedes construction of any simulation. Fixed steps remain synchronous.
// The compat distribution embeds WASM, so worker URLs work under non-root deployments
// without a CDN, runtime fetch, extra worker, or a second asset-publication mechanism.
await RAPIER.init();
if (RAPIER.version() !== RAPIER_VERSION) throw new Error('Unexpected Rapier runtime version');

export { RAPIER };

export const PHYSICS_ENGINE_VERSION = RAPIER_VERSION;
