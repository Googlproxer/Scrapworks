import { spawn } from 'node:child_process';

const stopping = new WeakMap();
export function stopProcessTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (stopping.has(child)) return stopping.get(child);
  const stopped = new Promise((resolve) => {
    child.once('exit', resolve);
    if (process.platform === 'win32') {
      // Node's Windows SIGTERM kills only the immediate child. Include its
      // Angular/esbuild or texture-tool descendants, with no visible window.
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      killer.once('error', () => child.kill());
      killer.once('exit', (code) => {
        if (code && child.exitCode === null) child.kill();
      });
    } else {
      child.kill('SIGTERM');
    }
  });
  stopping.set(child, stopped);
  return stopped;
}
