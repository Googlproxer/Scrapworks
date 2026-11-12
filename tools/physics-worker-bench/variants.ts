import fs from 'node:fs/promises';
import path from 'node:path';
import { replaceExact } from './instrument.ts';

/** Extract the synchronous phases only inside the isolated B1/C1 source copies. */
export async function extractVariant(
  project: string,
  tools: string,
  variant: 'B1' | 'C1',
): Promise<void> {
  const edit = async (file: string, transform: (source: string) => string) => {
    const target = path.join(project, 'src', file);
    await fs.writeFile(
      target,
      transform((await fs.readFile(target, 'utf8')).replaceAll('\r\n', '\n')),
    );
  };
  await edit('simulation/player-motor.ts', (source) => {
    source = "import type { WorldPosition } from '@contracts/world';\n" + source;
    source = replaceExact(
      source,
      '  public step(movement: MovementIntent, tick = 0): void {',
      `  public step(movement: MovementIntent, tick = 0): void {
    const phases = this.stepPhases(movement, tick);
    const begin = phases.next();
    if (begin.done) throw new Error('Missing player physics phase');
    const result = phases.next(this.physics.movePlayer(begin.value.x, begin.value.z, begin.value.tick));
    if (!result.done) throw new Error('Unexpected player physics phase');
  }

  public *stepPhases(movement: MovementIntent, tick = 0): Generator<{ x: number; z: number; tick: number }, void, WorldPosition> {`,
    );
    return replaceExact(
      source,
      '    this.player.position = this.physics.movePlayer(dx, dz, tick);',
      '    this.player.position = yield { x: dx, z: dz, tick };',
    );
  });
  await edit('simulation/ecs-runtime.ts', (source) => {
    source = "import type { WorldPosition } from '@contracts/world';\n" + source;
    source = replaceExact(
      source,
      '  public step(\n',
      `  public step(movement: MovementIntent, commands: readonly WorldCommand[] = []): SimulationStepResult {
    const phases = this.stepPhases(movement, commands);
    try {
      const begin = phases.next();
      if (begin.done) throw new Error('Missing physics phase');
      const result = phases.next(this.physics.movePlayer(begin.value.x, begin.value.z, begin.value.tick));
      if (!result.done) throw new Error('Unexpected second physics phase');
      return result.value;
    } finally { phases.return(undefined as never); }
  }

  public *stepPhases(\n`,
    );
    source = replaceExact(
      source,
      '  ): SimulationStepResult {\n    check(!this.disposed',
      '  ): Generator<{ x: number; z: number; tick: number }, SimulationStepResult, WorldPosition> {\n    check(!this.disposed',
    );
    source = replaceExact(
      source,
      '      this.playerMotor.step(movement, this.resources.tick);',
      '      yield* this.playerMotor.stepPhases(movement, this.resources.tick);',
    );
    if (variant === 'C1') {
      source = replaceExact(
        source,
        'export interface SimulationOptions {',
        'export interface SimulationOptions {\n  physicsGeneration?: number;',
      );
      source = replaceExact(
        source,
        '      options.snapshot?.physics,',
        '      options.snapshot?.physics,\n      options.physicsGeneration,\n      this.resources.tick,',
      );
      source = replaceExact(
        source,
        '  public capture(): SimulationSnapshot {',
        `  public async prepareAsync(): Promise<void> { await this.physics.prepare(); }
  public async captureAsync(): Promise<SimulationSnapshot> {
    await this.physics.prepareCapture();
    return this.capture();
  }
  public async stepAsync(movement: MovementIntent, commands: readonly WorldCommand[] = []): Promise<SimulationStepResult> {
    const phases = this.stepPhases(movement, commands);
    try {
      const begin = phases.next();
      if (begin.done) throw new Error('Missing physics phase');
      const position = await this.physics.moveAsync(begin.value);
      const result = phases.next(position);
      if (!result.done) throw new Error('Unexpected second physics phase');
      await this.physics.flush();
      return result.value;
    } finally { phases.return(undefined as never); }
  }

  public capture(): SimulationSnapshot {`,
      );
    }
    return source;
  });
  if (variant !== 'C1') return;
  const experiment = path.join(project, 'src/physics-experiment');
  await fs.mkdir(experiment, { recursive: true });
  for (const name of [
    'physics-protocol.ts',
    'remote-physics.ts',
    'physics-host.ts',
    'physics.worker.ts',
  ]) {
    let source = await fs.readFile(path.join(tools, name), 'utf8');
    source = source
      .replaceAll('../../src/contracts/', '../contracts/')
      .replaceAll(
        '../../src/simulation/physics/world-physics.ts',
        '../simulation/physics/world-physics.native',
      );
    source = source
      .replaceAll("'./physics-protocol.ts'", "'./physics-protocol'")
      .replaceAll("'./physics-host.ts'", "'./physics-host'");
    source = source.replace(/(from\s+['"][^'"]+)\.ts(['"])/g, '$1$2');
    if (name === 'physics.worker.ts') {
      source = "import { drainTrace } from '../physics-worker-probe';\n" + source;
      source = replaceExact(
        source,
        'port.postMessage(reply);',
        'port.postMessage({ ...reply, diagnostics: drainTrace() });',
      );
    }
    if (name === 'remote-physics.ts') {
      source = "import { trace } from '../physics-worker-probe';\n" + source;
      source = replaceExact(
        source,
        'pending.resolve(reply);',
        "trace('physics-received', { id: reply.id, tick: reply.tick, generation: reply.generation, colliderRevision: reply.colliderRevision, diagnostics: reply.diagnostics });\n        pending.resolve(reply);",
      );
      source = replaceExact(
        source,
        'this.port!.postMessage(request);',
        "trace('physics-dispatched', { id: request.id, generation: request.generation, tick: request.tick, colliderRevision: request.colliderRevision, operation: request.operation, deltas: request.deltas.length });\n        this.port!.postMessage(request);",
      );
    }
    // Native methods accept arrays; retained native state is private to physics-host.
    await fs.writeFile(path.join(experiment, name), source);
  }
  await fs.copyFile(
    path.join(project, 'src/simulation/physics/world-physics.ts'),
    path.join(project, 'src/simulation/physics/world-physics.native.ts'),
  );
  await fs.writeFile(
    path.join(project, 'src/simulation/physics/world-physics.ts'),
    `export { RemotePhysics as WorldPhysics } from '../../physics-experiment/remote-physics';
export type { NamedCollider } from './world-physics.native';
export const PHYSICS_SUBSTEPS = 3;
export const PLAYER_HEIGHT = 1.7;
export const COLLISION_SKIN = 0.002;
`,
  );
  await edit('session/runtime.ts', (source) => {
    source = replaceExact(
      source,
      '  public handle(value: unknown): RuntimeReply {',
      '  public async handle(value: unknown): Promise<RuntimeReply> {',
    );
    source = replaceExact(
      source,
      '          developerFixture: r.developerFixture,',
      '          developerFixture: r.developerFixture,\n          physicsGeneration: r.generation,',
    );
    source = replaceExact(
      source,
      '        this.world?.dispose();\n        this.world = next;',
      '        try { await next.prepareAsync(); } catch (error) { next.dispose(); throw error; }\n        this.world?.dispose();\n        this.world = next;',
    );
    source = replaceExact(
      source,
      '          world: this.world.capture(),',
      '          world: await this.world.captureAsync(),',
    );
    return replaceExact(
      source,
      '        const result = this.world.step(',
      '        const result = await this.world.stepAsync(',
    );
  });
  await edit('workers/simulation.worker.ts', (source) => {
    source = replaceExact(
      source,
      'let failed = false;',
      'let failed = false;\nlet queue = Promise.resolve();',
    );
    source = replaceExact(
      source,
      '  void ready\n    .then((runtime) => {',
      '  queue = queue.then(() => ready)\n    .then(async (runtime) => {',
    );
    return replaceExact(
      source,
      '      const reply: RuntimeReply = runtime.handle(event.data);',
      '      const reply: RuntimeReply = await runtime.handle(event.data);',
    );
  });
}
