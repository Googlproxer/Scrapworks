import fs from 'node:fs/promises';
import path from 'node:path';

interface Patch {
  file: string;
  before: string;
  after: string;
  count?: number;
}
const patches: Patch[] = [
  { file: 'session/game-session.ts', before: '  public advance(seconds: number): void {', after: "  public advance(seconds: number): void {\n    trace('host-frame', { seconds, elapsed: this.elapsed, outstanding: this.outstanding, holds: this.holds, capturing: this.capturing, paused: this.paused, inputSequence: this.inputSerial, generation: this.generation });" },
  { file: 'session/game-session.ts', before: '    this.holds++;', after: "    this.holds++;\n    trace('hold-start', { holds: this.holds, generation: this.generation });" },
  { file: 'session/game-session.ts', before: '      this.holds--;', after: "      this.holds--;\n      trace('hold-end', { holds: this.holds, generation: this.generation });" },
  { file: 'simulation/physics/world-physics.ts', before: '    this.previousActive = active;', after: "    this.previousActive = active;\n    trace('native-population', { activeEntityBodies: active.size, changedPoses: changed.size, nativeBodies: this.world.bodies.len(), nativeColliders: this.world.colliders.len() });" },
  { file: 'simulation/physics/world-physics.ts', before: '  public syncStatic(colliders: readonly NamedCollider[]): void {', after: "  public syncStatic(colliders: readonly NamedCollider[]): void {\n    trace('collider-sync', { kind: 'static', count: colliders.length });" },
  {
    file: 'game/views/player-controller.ts',
    before: "    this.frame.sprint = this.frame.active && actionHeld(this.frame.input, 'sprint');",
    after:
      "    this.frame.sprint = this.frame.active && actionHeld(this.frame.input, 'sprint');\n    trace('action', { ...this.frame.movement, sprint: this.frame.sprint, active: this.frame.active });",
  },
  {
    file: 'game/views/player-view.ts',
    before: '    for (const [name, animation] of this.animations) {',
    after:
      "    trace('present', { tick: view.tick, generation: this.generation, x: this.root.position.x / 100, y: this.root.position.y / 100, z: this.root.position.z / 100, facing: this.root.rotation.y, clip: this.activeClip, interpolation: this.interpolation, endpoints: view.endpoints });\n    for (const [name, animation] of this.animations) {",
  },
  {
    file: 'game/views/camera-controller.ts',
    before: '    this.camera.getViewMatrix(true);',
    after:
      "    this.camera.getViewMatrix(true);\n    trace('camera', { position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z }, target: { x: this.camera.getTarget().x, y: this.camera.getTarget().y, z: this.camera.getTarget().z } });",
  },
  {
    file: 'game/babylon-game-client.ts',
    before: '        scene.render();',
    after:
      "        trace('frame-begin', { scene: scene.uniqueId });\n        scene.render();\n        trace('frame-submitted', { scene: scene.uniqueId });",
    count: 2,
  },
  {
    file: 'session/game-session.ts',
    before: '        this.cache.apply(reply.packet, this.generation);',
    after:
      "        this.cache.apply(reply.packet, this.generation);\n        trace('publication', { generation: this.generation, request: reply.id, inputSequence: reply.appliedInput, ticks: reply.completedTicks });",
  },
  {
    file: 'session/worker-port.ts',
    before: '        const reply = event.data;',
    after:
      "        const reply = event.data;\n        trace('worker-receipt', { request: reply.id, generation: reply.generation, inputSequence: reply.appliedInput, ticks: reply.completedTicks, diagnostics: (reply as RuntimeReply & { physicsProbe?: unknown }).physicsProbe });",
  },
  {
    file: 'session/worker-port.ts',
    before: '        this.worker!.postMessage(request);',
    after:
      "        trace('input-submitted', { request: request.id, generation: request.generation, operation: request.operation, inputSequence: request.inputSequence, input: request.input, steps: request.steps, queue: this.pending.size });\n        this.worker!.postMessage(request);",
  },
  {
    file: 'session/runtime.ts',
    before: '        const result = this.world.step(',
    after:
      "        trace('simulation-input', { generation: this.generation, inputSequence: this.inputSequence, tick: this.world.tick, input: this.input });\n        const result = this.world.step(",
  },
  {
    file: 'session/runtime.ts',
    before: '        this.appliedInput = this.inputSequence;',
    after:
      "        this.appliedInput = this.inputSequence;\n        trace('tick-committed', { generation: this.generation, inputSequence: this.inputSequence, tick: this.world.tick });",
  },
  {
    file: 'simulation/physics/world-physics.ts',
    before: "    check(!this.disposed, 'Disposed physics world');\n    for (let substep",
    after:
      "    check(!this.disposed, 'Disposed physics world');\n    trace('physics-start', { tick, substepTarget: (tick + 1) * PHYSICS_SUBSTEPS });\n    for (let substep",
  },
  {
    file: 'simulation/physics/world-physics.ts',
    before: '    const feet = position.y - PLAYER_HEIGHT / 2 - COLLISION_SKIN;',
    after:
      "    trace('physics-finish', { tick, substepTarget: (tick + 1) * PHYSICS_SUBSTEPS });\n    const feet = position.y - PLAYER_HEIGHT / 2 - COLLISION_SKIN;",
  },
];

/** Fail closed when the frozen source changes: never quietly instrument a different boundary. */
export function replaceExact(source: string, before: string, after: string, expected = 1): string {
  const count = source.split(before).length - 1;
  if (count !== expected)
    throw new Error(
      `Instrumentation anchor count ${count}; expected ${expected}: ${before.slice(0, 100)}`,
    );
  return source.replaceAll(before, after);
}

export async function instrument(project: string, toolRoot: string): Promise<void> {
  const files = new Set(patches.map((patch) => patch.file));
  for (const file of files) {
    const target = path.join(project, 'src', file);
    let source = (await fs.readFile(target, 'utf8')).replaceAll('\r\n', '\n');
    for (const patch of patches.filter((value) => value.file === file))
      source = replaceExact(source, patch.before, patch.after, patch.count);
    const importPath = path
      .relative(path.dirname(target), path.join(project, 'src/physics-worker-probe'))
      .replaceAll('\\', '/');
    source =
      `import { trace } from '${importPath.startsWith('.') ? importPath : './' + importPath}';\n` +
      source;
    await fs.writeFile(target, source);
  }
  const worker = path.join(project, 'src/workers/simulation.worker.ts');
  let source = (await fs.readFile(worker, 'utf8')).replaceAll('\r\n', '\n');
  source = replaceExact(
    source,
    '        reply,\n        reply.packet',
    '        { ...reply, physicsProbe: drainTrace() },\n        reply.packet',
  );
  source = source.replace(
    'import type { RuntimeReply }',
    "import { drainTrace, trace } from '../physics-worker-probe';\nimport type { RuntimeReply }",
  );
  source = replaceExact(source, '      const reply: RuntimeReply = runtime.handle(event.data);', "      const started = performance.now();\n      const reply: RuntimeReply = runtime.handle(event.data);\n      trace('runtime-finish', { request: reply.id, generation: reply.generation, operation: reply.operation, elapsedMs: performance.now() - started, packetBytes: reply.packet ? reply.packet.rows.byteLength + reply.packet.removed.byteLength + (reply.packet.rotations?.byteLength ?? 0) : 0 });");
  await fs.writeFile(worker, source);
  await fs.copyFile(
    path.join(toolRoot, 'browser-probe.ts'),
    path.join(project, 'src/physics-worker-probe.ts'),
  );
}
