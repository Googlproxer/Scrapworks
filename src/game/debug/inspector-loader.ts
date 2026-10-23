import type { InspectorLoader } from './scene-inspector';

/** Production deliberately has no import path to the Inspector or its editor dependencies. */
export const loadInspector: InspectorLoader = async () => null;
