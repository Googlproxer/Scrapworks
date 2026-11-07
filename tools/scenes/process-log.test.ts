import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import { BehaviorSubject } from 'rxjs';
import { test } from 'vitest';
import { waitForProcessLog } from './process-log.ts';

const origin = 'http://127.0.0.1:35545/';
// Vite's CI output colors the URL and separately bolds its port.
const colored =
  '  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://127.0.0.1:\x1b[1m35545\x1b[22m/\x1b[39m\n';

test('recognizes colored startup output already delivered before subscribing without changing raw logs', async () => {
  const child = new ChildProcess();
  const logs = new BehaviorSubject(colored);
  assert.equal(colored.includes(origin), false);
  await waitForProcessLog(child, logs, origin);
  assert.equal(logs.value, colored);
  assert.equal(logs.observed, false);
  assert.equal(child.listenerCount('exit'), 0);
});

test('waits for the complete URL when its port and ANSI sequence arrive in separate chunks', async () => {
  const child = new ChildProcess();
  const logs = new BehaviorSubject('');
  const ready = waitForProcessLog(child, logs, origin);
  const portStart = colored.indexOf('35545');
  for (const end of [portStart - 2, portStart + 2, portStart + 5]) {
    logs.next(colored.slice(0, end));
    assert.equal(logs.observed, true, 'A partial URL must not signal readiness');
  }
  logs.next(colored);
  await ready;
  assert.equal(logs.value, colored);
  assert.equal(logs.observed, false);
  assert.equal(child.listenerCount('exit'), 0);
});

test('accepts plain output and ignores a different listening port', async () => {
  const child = new ChildProcess();
  const logs = new BehaviorSubject('Local: http://127.0.0.1:3554/\n');
  const ready = waitForProcessLog(child, logs, origin);
  assert.equal(logs.observed, true);
  logs.next(logs.value + 'Local: ' + origin + '\n');
  await ready;
  assert.equal(logs.observed, false);
  assert.equal(child.listenerCount('exit'), 0);
});

test('reports process exit immediately and releases both subscriptions', async () => {
  const child = new ChildProcess();
  const logs = new BehaviorSubject('Build failed: fixture error');
  const failed = assert.rejects(waitForProcessLog(child, logs, origin), /fixture error/);
  child.emit('exit', 1, null);
  await failed;
  assert.equal(logs.observed, false);
  assert.equal(child.listenerCount('exit'), 0);
});
