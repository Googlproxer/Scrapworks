import type { TraceEvent } from './browser-probe.ts';

declare global {
  var __scrapworksFrameObserver: ((event: TraceEvent) => void) | undefined;
}

/** Sparse, untimed image validation. Never enabled in the frozen primary builds. */
export function installFrameImages(job: string) {
  const images: { label: string; frame: number; now: number; pose: TraceEvent | undefined; camera: TraceEvent | undefined; png: string }[] = [];
  let pose: TraceEvent | undefined, camera: TraceEvent | undefined;
  let pending: { label: string; resolve(): void; reject(error: Error): void } | undefined;
  globalThis.__scrapworksFrameObserver = event => {
    if (event.stage === 'present') pose = event;
    if (event.stage === 'camera') camera = event;
    if (event.stage !== 'frame-submitted' || !pending) return;
    const request = pending; pending = undefined;
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas || !pose) throw new Error('No rendered player for image validation');
      images.push({ label: request.label, frame: event.frame, now: event.now, pose, camera, png: canvas.toDataURL('image/png') });
      request.resolve();
    } catch (error) { request.reject(error instanceof Error ? error : new Error(String(error))); }
  };
  return {
    capture(label: string) {
      if (pending) throw new Error('Image request already pending');
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { pending = undefined; reject(new Error('Image frame did not arrive')); }, 5000);
        pending = { label, resolve: () => { clearTimeout(timer); resolve(); }, reject: error => { clearTimeout(timer); reject(error); } };
      });
    },
    async flush() {
      const response = await fetch('/capture/' + encodeURIComponent(job + '-images'), { method: 'POST', body: JSON.stringify({ job, images, qualification: 'Sparse qualitative render checks before input and after causal detector confirmation. Image readback stalls make these windows unsuitable for latency ranking. The response image can follow the first response frame.' }) });
      if (!response.ok) throw new Error('Image receipt failed');
    },
  };
}
