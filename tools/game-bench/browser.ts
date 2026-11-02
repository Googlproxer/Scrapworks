import { GameSession } from '../../src/session/game-session';
import { WorkerSimulationPort } from '../../src/session/worker-port';
import { InlineSimulationPort } from '../testing/inline-simulation-port';
import { commands, definition, fixture, workloads } from './fixtures';
import type { SessionEvent } from '../../src/contracts/session-event';

export async function runGameBench(steps = 100, population = 1000) {
  const results = [];
  for (const workload of workloads) {
    let expected: string | undefined;
    for (const execution of ['inline', 'worker'] as const) {
      const session = new GameSession(definition, {
        capture: fixture(workload, population),
        portFactory: () =>
          execution === 'inline'
            ? new InlineSimulationPort()
            : new WorkerSimulationPort(
                new Worker(new URL('../../src/workers/simulation.worker.ts', import.meta.url), {
                  type: 'module',
                }),
              ),
      });
      await session.ready;
      const outcomes: SessionEvent['event'][] = [];
      const subscription = session.events$.subscribe((event) => outcomes.push(event.event));
      // Setup is outside measurements; both controls use the production codec and runtime.
      for (const command of commands(workload)) session.enqueue(command);
      const times: number[] = [];
      for (let index = 0; index < steps; index++) {
        const begin = performance.now();
        session.advance(0.05);
        await session.settled();
        session.flushCompleted();
        times.push(performance.now() - begin);
      }
      const capture = await session.capture();
      const actual = JSON.stringify(capture);
      if (expected !== undefined && actual !== expected)
        throw new Error(`Inline/worker continuation mismatch: ${workload}`);
      expected = actual;
      if (capture.world.resources.tick !== steps || session.failed)
        throw new Error(`Incomplete workload: ${workload}`);
      if (
        outcomes.filter((event) => (event as { kind: string }).kind === 'command-result').length !==
        commands(workload).length
      )
        throw new Error(`Lost command outcomes: ${workload}`);
      if (
        outcomes.some(
          (event) =>
            event.kind === 'command-result' &&
            (event.acknowledgement.result === 'cancelled' ||
              !event.acknowledgement.result.accepted),
        )
      )
        throw new Error(`Invalid gameplay workload: ${workload}`);
      times.sort((a, b) => a - b);
      results.push({
        workload,
        execution,
        steps,
        population: session.populationSize,
        outcomes: outcomes.length,
        totalMs: times.reduce((a, b) => a + b, 0),
        p50Ms: times[Math.floor(times.length * 0.5)],
        p95Ms: times[Math.floor(times.length * 0.95)],
      });
      subscription.unsubscribe();
      session.dispose();
    }
  }
  return results;
}

Object.assign(globalThis, { runGameBench });
