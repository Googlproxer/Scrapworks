import type { RuntimeRequest, RuntimeReply } from '../contracts/simulation.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
const { WorkerSimulationPort } = await import('./worker-port.ts');
const { GameSession } = await import('./game-session.ts');
const { SimulationRuntime } = await import('./runtime.ts');
import { worldFixture } from '../../tests/support/world-fixture.ts';
const definition = worldFixture();

class FakeWorker extends EventTarget {
  public terminated = 0;
  public requests: RuntimeRequest[] = [];
  public removed: string[] = [];

  public override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ) {
    this.removed.push(type);
    super.removeEventListener(type, callback, options);
  }

  public reply(reply: RuntimeReply) {
    this.dispatchEvent(new MessageEvent('message', { data: reply }));
  }

  public crash(message: string) {
    const event = Object.assign(new Event('error', { cancelable: true }), { message });
    this.dispatchEvent(event);
    assert(event.defaultPrevented);
  }

  public postMessage(request: RuntimeRequest) {
    this.requests.push(request);
  }

  public terminate() {
    this.terminated++;
  }
}

const request = (id: number): RuntimeRequest => ({
  protocol: 2,
  id,
  generation: 1,
  revision: 0,
  operation: 'capture',
});

test('worker timeout, message failure and disposal settle every outstanding request exactly once', async () => {
  for (const reason of ['timeout', 'message', 'dispose', 'error']) {
    const worker = new FakeWorker(),
      port = new WorkerSimulationPort(worker as unknown as Worker);
    port.timeoutMs = 5;
    const failures = [];
    port.subscribeFailure((error) => failures.push(error.message));
    const pending = [1, 2, 3].map((id) => port.send(request(id)));
    const outcomes = Promise.allSettled(pending);
    if (reason === 'message') worker.dispatchEvent(new Event('messageerror'));
    if (reason === 'dispose') port.dispose();
    if (reason === 'error') worker.crash('crashed');
    assert((await outcomes).every((result) => result.status === 'rejected'));
    assert.equal(worker.terminated, 1);
    assert.equal(failures.length, 1);
    assert.deepEqual(worker.removed.sort(), ['error', 'message', 'messageerror']);
    worker.dispatchEvent(new Event('messageerror'));
    port.dispose();
    assert.equal(worker.terminated, 1);
    await assert.rejects(port.send(request(4)), /Disposed/);
  }
});
test('an idle worker crash reaches the owning session without a pending request', async () => {
  const worker = new FakeWorker(),
    port = new WorkerSimulationPort(worker as unknown as Worker),
    runtime = new SimulationRuntime();
  worker.postMessage = (request) => queueMicrotask(() => worker.reply(runtime.handle(request)));
  const failures = [];
  const session = new GameSession(definition, {
    portFactory: () => port,
    onFailure: (error) => failures.push(error),
  });
  await session.ready;
  session.setPaused(true);
  await session.settled();
  const before = session.view;
  worker.crash('idle crash');
  assert.equal(session.failed, true);
  assert.equal(failures.length, 1);
  assert.deepEqual(session.view, before);
  session.dispose();
  runtime.dispose();
});

test('worker failure notification respects unsubscribe and replays the terminal error to late owners', () => {
  const worker = new FakeWorker();
  const port = new WorkerSimulationPort(worker as unknown as Worker);
  const removed: Error[] = [];
  const received: Error[] = [];
  const late: Error[] = [];
  const unsubscribe = port.subscribeFailure((error) => removed.push(error));
  unsubscribe();
  port.subscribeFailure((error) => received.push(error));
  worker.crash('terminal crash');
  port.subscribeFailure((error) => late.push(error));
  port.dispose();
  assert.deepEqual(removed, []);
  assert.equal(received.length, 1);
  assert.deepEqual(late, received);
});
