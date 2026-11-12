import { GameSession } from '../../src/session/game-session.ts';
import { WorkerSimulationPort } from '../../src/session/worker-port.ts';
import { Simulation } from '../../src/simulation/ecs-runtime.ts';
import type { SimulationCapture, SimulationSnapshot, RuntimeRequestBody } from '../../src/contracts/simulation.ts';
import type { WorldDefinition, WorldCommand } from '../../src/contracts/world.ts';
import { FixtureBuilder, fixtureCounts, matrixSpecs, workloadKey, type WorkloadSpec } from './fixtures.ts';
import { distribution } from './statistics.ts';
import { OPENING_CONTENT, OPENING_TECHNOLOGIES } from '../../src/content/opening.ts';
import { courseFixture, courseMotion, type Course } from './courses.ts';
import { isolation } from './isolation.ts';
import { canonicalJson, type AcceptedReplayPlan } from './replay-plan.ts';
import type { ProbeBuffer } from './browser-probe.ts';

interface Configuration { workers: Record<string, string>; authored: WorldDefinition; task: 'steady-parity' | 'corner-parity' | 'selected-correctness' | 'correctness' | 'contact-parity' | 'courses' | 'ordering' | 'matrix' | 'faults' | 'lifecycle' | 'soak' | 'isolation' | 'edits' | 'accepted' | 'research'; soakSeconds: number; matrixTicks: number; variant?: string; spec?: WorkloadSpec; replayBrowser?: string }
const config = await (await fetch('/config')).json() as Configuration;
const builder = new FixtureBuilder(config.authored);
const still = { x: 0, z: 0, sprint: false };
const active = new Map<Worker, Set<number>>();
interface NativeActivity { samples: number; minimumActive: number | null; maximumActive: number | null; lastActive: number | null; lastChangedPoses: number | null; nativeBodies: number | null }
const nativeActivity = new Map<Worker, NativeActivity>();
const emptyActivity = (): NativeActivity => ({ samples: 0, minimumActive: null, maximumActive: null, lastActive: null, lastChangedPoses: null, nativeBodies: null });
function observeActivity(buffer: ProbeBuffer | undefined, activity: NativeActivity): void {
  for (const event of buffer?.events ?? []) {
    if (event.stage === 'native-population' && typeof event.data['activeEntityBodies'] === 'number') {
      const count = event.data['activeEntityBodies'];
      ++activity.samples; activity.lastActive = count;
      activity.minimumActive = Math.min(activity.minimumActive ?? count, count);
      activity.maximumActive = Math.max(activity.maximumActive ?? count, count);
      activity.lastChangedPoses = Number(event.data['changedPoses']); activity.nativeBodies = Number(event.data['nativeBodies']);
    }
    observeActivity(event.data['diagnostics'] as ProbeBuffer | undefined, activity);
  }
}
const activitySnapshot = () => [...nativeActivity.values()].map(value => ({ ...value }));
let peakParents = 0, peakChildren = 0;
const status = document.getElementById('status')!;
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function emit(kind: string, data: unknown) { status.textContent = `${kind}: ${JSON.stringify(data).slice(0, 400)}`; await fetch('/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, data, at: new Date().toISOString() }) }); }
async function hash(value: unknown) { const bytes = new TextEncoder().encode(JSON.stringify(value)); return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join(''); }
async function save(name: string, value: unknown) { await fetch('/capture/' + encodeURIComponent(name), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); }
function worker(variant: string, fault = 'track', ms = 0): Worker {
  const target = config.workers[variant];
  check(target, `Unknown variant ${variant}`);
  const value = new Worker(`/fault-worker.js?target=${encodeURIComponent(target)}&kind=${fault}&ms=${ms}&variant=${variant}`, { type: 'module' });
  active.set(value, new Set());
  if (config.task === 'soak') nativeActivity.set(value, emptyActivity());
  value.addEventListener('message', event => {
    const message = event.data as { __child?: string; childId?: number; physicsProbe?: ProbeBuffer };
    const activity = nativeActivity.get(value); if (activity) observeActivity(message.physicsProbe, activity);
    if (message.__child === 'created' && message.childId !== undefined) active.get(value)?.add(message.childId);
    if (message.__child === 'disposed' && message.childId !== undefined) active.get(value)?.delete(message.childId);
    peakChildren = Math.max(peakChildren, [...active.values()].reduce((sum, children) => sum + children.size, 0));
  });
  const terminate = value.terminate.bind(value);
  value.terminate = () => { active.delete(value); nativeActivity.delete(value); terminate(); };
  peakParents = Math.max(peakParents, active.size);
  return value;
}
function capture(world: SimulationSnapshot): SimulationCapture { return { world: structuredClone(world), pending: [], ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 } }; }
function session(variant: string, initial: SimulationCapture, fault = 'track', ms = 0): GameSession {
  return new GameSession(initial.world.definition, { capture: structuredClone(initial), developerFixture: true, portFactory: () => { const port = new WorkerSimulationPort(worker(variant, fault, ms)); if (fault !== 'track' && variant !== 'C1') port.timeoutMs = 1800; return port; } });
}
async function tick(value: GameSession, motion = still, credits = 1, commands: WorldCommand[] = []) { value.setMovement(motion, motion.sprint); for (const command of commands) value.enqueue(command); value.advance(credits * .05); await value.settled(); value.flushCompleted(); check(!value.failed, 'Session failed'); }
const motionAt = (tick: number) => { const phase = tick % 160; return { x: phase < 40 ? .7 : phase < 80 ? -.7 : 0, z: phase >= 80 && phase < 120 ? .7 : phase >= 120 ? -.7 : 0, sprint: tick % 23 === 0 }; };

async function correctness(contactsOnly = false, specsOverride?: WorkloadSpec[]) {
  for (const spec of (specsOverride ?? [ { level: 0, profile: 'P0', count: 0 }, { level: 1, profile: 'P0', count: 0 }, { level: 1, profile: 'contacts', count: 100 } ] as WorkloadSpec[]).filter(spec => !contactsOnly || spec.profile === 'contacts')) {
    const initial = builder.build(spec), key = workloadKey(spec);
    const expected = new Map<number, string>();
    const reference = new Simulation(initial.definition, { snapshot: initial, developerFixture: true });
    try { for (let n = 1; n <= 11000; ++n) { reference.step(motionAt(n)); if (n % 1000 === 0) expected.set(n, await hash(reference.capture())); } } finally { reference.dispose(); }
    for (const variant of ['B0', 'B1', 'C1']) {
      let value = session(variant, capture(initial));
      try {
        await value.ready;
        for (let n = 1; n <= 11000; ++n) {
          await tick(value, motionAt(n));
          if (n % 1000 === 0) {
            const saved = await value.capture();
            const actual = await hash(saved.world);
            if (actual !== expected.get(n)) { await save(`${key}-${variant}-${n}-mismatch`, saved); throw new Error(`Logical/native continuation differs at tick ${n}`); }
            await emit('correctness-boundary', { key, variant, logicalTicks: n, worldTick: saved.world.resources.tick, sha256: actual });
            if (n === 10000) {
              await save(`${key}-${variant}-10000`, saved);
              const restored = session(variant, saved);
              await restored.ready;
              value.dispose(); value = restored;
            }
          }
        }
        await emit('correctness-pass', { key, variant, ticks: 10000, restoredContinuation: 1000 });
      } catch (error) { await emit('correctness-fail', { key, variant, error: String(error) }); }
      finally { value.dispose(); }
    }
  }
  if (!contactsOnly && !specsOverride) await courses();
}

async function courses(cornerOnly = false) {
  for (const name of (cornerOnly ? ['corner-contact'] : ['wall-corner', 'crate-contact', 'platform-support', 'platform-side']) as Course[]) {
    const initial = courseFixture(config.authored, name), expected = new Map<number, string>();
    const reference = new Simulation(initial.definition, { snapshot: initial });
    try {
      for (let n = 1; n <= 11000; ++n) {
        reference.step(courseMotion(name, n));
        if (name === 'crate-contact' && n === 55) check(reference.view.bodies!.find(body => body.id === 'crate')!.position.z > 4, 'Course did not push the crate');
        if (name === 'corner-contact' && n === 75) check(reference.view.player.position.x > 2 && reference.view.player.position.z > 6 && reference.view.player.position.z < 6.3, 'Course did not encounter both wall and corner');
        if (name === 'platform-support' && n === 75) check(reference.view.player.position.x > 3.6 && Math.abs(reference.view.player.position.y - .6) < .02, 'Course did not ride the platform');
        if (name === 'platform-support' && n === 230) check(reference.view.player.position.y === 0, 'Course did not walk off the platform');
        if (n % 1000 === 0 || [6, 55, 75, 160, 230].includes(n)) expected.set(n, await hash(reference.capture()));
      }
    } finally { reference.dispose(); }
    for (const variant of ['B0', 'B1', 'C1']) {
      let value = session(variant, capture(initial));
      try {
        await value.ready;
        for (let n = 1; n <= 11000; ++n) {
          await tick(value, courseMotion(name, n));
          if (!expected.has(n)) continue;
          const saved = await value.capture(); check(await hash(saved.world) === expected.get(n), `${name} native/gameplay divergence at ${n}`);
          if (n % 1000 === 0) await emit('course-boundary', { name, variant, tick: n, sha256: await hash(saved.world) });
          if (n === 10000) { await save(`course-${name}-${variant}-10000`, saved); const restored = session(variant, saved); await restored.ready; value.dispose(); value = restored; }
        }
        await emit('course-pass', { name, variant, ticks: 10000, restoredContinuation: 1000 });
      } catch (error) { await emit('course-fail', { name, variant, error: String(error) }); } finally { value.dispose(); }
    }
  }
}

async function ordering() {
  for (const scenario of ['factory-edits', 'depletion']) {
    const definition: WorldDefinition = { ...config.authored, id: 'ordering-' + scenario, terrain: config.authored.terrain.map(() => 'soil'), blockers: [], bodies: [], deposits: scenario === 'depletion' ? [{ id: 'bench-deposit', kind: 'scrap', quantity: 1, position: { x: 3, y: 0, z: 1 }, footprint: { width: 1, depth: 1 }, rotation: 0 }] : [] };
    const setup = new Simulation(definition), initial = setup.capture(); setup.dispose();
    if (scenario === 'factory-edits') {
      for (const technology of OPENING_TECHNOLOGIES) initial.resources.research[technology.id] = { consumed: Object.fromEntries(technology.costs.map(cost => [cost.item, cost.quantity])), work: technology.seconds, unlocked: true };
      const bag = initial.entities.find(entity => entity.kind === 'player')!.inventory!;
      ['recycler', 'recycler', 'solar-panel', 'power-connection'].forEach((item, index) => bag.slots[index] = { item, quantity: 1 }); bag.slots[4] = { item: 'scrap', quantity: 10 };
    }
    const commands = (n: number): WorldCommand[] => scenario === 'depletion' ? n === 1 ? [{ type: 'salvage', target: 'bench-deposit' }] : [] : n === 1 ? [
      { type: 'factory-place', equipment: 'recycler', cell: { column: 6, row: 5 }, rotation: 1 },
      { type: 'factory-place', equipment: 'solar-panel', cell: { column: 5, row: 6 }, rotation: 0 },
      { type: 'factory-connect', from: 'building-1', to: 'building-2' },
      { type: 'factory-transfer', target: 'building-1', buffer: 'input', direction: 'load', item: 'scrap', quantity: 5 },
    ] : n === 2 ? [{ type: 'factory-dismantle', target: 'building-1' }, { type: 'factory-place', equipment: 'recycler', cell: { column: 6, row: 5 }, rotation: 3 }] : n === 3 ? [{ type: 'factory-place', equipment: 'recycler', cell: { column: 999, row: 999 }, rotation: 0 }] : [];
    const reference = new Simulation(definition, { snapshot: initial, developerFixture: true });
    const expected = new Map<number, string>();
    try { for (let n = 1; n <= 1000; ++n) { const result = reference.step(still, commands(n)); if (n <= 2) check(result.commandResults.every(value => value.accepted), `${scenario} prepared commands rejected: ${JSON.stringify(result.commandResults)}`); if ([1, 2, 3, 1000].includes(n)) expected.set(n, await hash(reference.capture())); } } finally { reference.dispose(); }
    for (const variant of ['B0', 'B1', 'C1']) {
      const value = session(variant, capture(initial));
      try {
        await value.ready;
        for (let n = 1; n <= 1000; ++n) {
          if (n === 100) { for (const command of commands(n)) value.enqueue(command); value.advance(.25); const inFlight = value.capture(); const result = await inFlight; check(result.world.resources.tick === 104, 'Capture exposed a half-completed catch-up batch'); value.flushCompleted(); n = 104; }
          else await tick(value, still, 1, commands(n));
          if (expected.has(n)) { const saved = await value.capture(); check(await hash(saved.world) === expected.get(n), `${scenario}: ordered/native mismatch at ${n}`); }
        }
        await emit('ordering-pass', { variant, scenario, ticks: 1000, captureDuringFiveTickBatch: true });
      } catch (error) { await emit('ordering-fail', { variant, scenario, error: String(error) }); } finally { value.dispose(); }
    }
  }
}

async function matrix() {
  const referenceHashes = new Map<string, string>();
  const specs = matrixSpecs();
  for (const variant of ['B0', 'B1', 'C1']) for (const spec of specs) {
    const key = workloadKey(spec);
    try {
      const initial = builder.build(spec), counts = fixtureCounts(initial), fixtureSha256 = await hash(initial);
      const repetitions = [];
      for (let repeat = 0; repeat < 3; ++repeat) {
        const value = session(variant, capture(initial));
        try {
          await value.ready;
          for (let n = 0; n < 40; ++n) await tick(value);
          const times: number[] = [];
          for (let n = 0; n < config.matrixTicks; ++n) { const start = performance.now(); await tick(value, motionAt(n)); times.push(performance.now() - start); }
          const final = await value.capture();
          const finalSha256 = await hash(final.world), identity = `${key}-${repeat}`;
          if (variant === 'B0') referenceHashes.set(identity, finalSha256);
          else { check(referenceHashes.has(identity), `Baseline comparator unavailable: ${identity}`); check(referenceHashes.get(identity) === finalSha256, `Matrix continuation differs: ${identity}`); }
          repetitions.push({ endToEndTickMs: distribution(times), rawTickMs: times, deadlineMisses: times.filter(time => time > 50).length, countsAfter: fixtureCounts(final.world), finalSha256, tick: final.world.resources.tick, droppedSeconds: value.droppedSeconds });
        } finally { value.dispose(); }
      }
      await emit('matrix-case', { variant, key, spec, fixtureSha256, counts, repetitions });
      if (variant === 'B0' && spec.level === 3 && spec.profile === 'contacts' && [1000, 2500, 5000].includes(spec.count) && repetitions.every(repeat => repeat.droppedSeconds === 0 && repeat.endToEndTickMs.p95 !== null && repeat.endToEndTickMs.p95 <= 35 && repeat.endToEndTickMs.p99 !== null && repeat.endToEndTickMs.p99 <= 50)) {
        const next = spec.count === 1000 ? 2500 : spec.count === 2500 ? 5000 : 10000;
        specs.push({ level: 3, profile: 'contacts', count: next });
        await emit('matrix-extension', { from: key, nextCount: next, rule: 'B0-only adaptive contact pressure, stopping after the first screen-budget failure or 10,000 bodies. A next doubling beyond 10,000 would exceed the fixture body-height bound.' });
      }
    } catch (error) { await emit('matrix-fail', { variant, key, spec, error: String(error) }); }
  }
}

async function edits() {
  const expected = new Map<string, string>();
  for (const variant of ['B0', 'B1', 'C1']) for (const count of [100, 1000, 10000]) {
    const initial = builder.build({ level: 1, profile: 'static-far', count });
    // Dismantling refunds scrap, not the placeable. Supply each of the 100 insertions
    // legally and retain sufficient bag space for all refunds without extra commands.
    const equipment = 'basic-fabricator', stock = 100, bag = initial.entities.find(entity => entity.kind === 'player')!.inventory!;
    const limit = OPENING_CONTENT.items[equipment].stackLimit;
    bag.slots = bag.slots.map((_, index) => index * limit < stock ? { item: equipment, quantity: Math.min(limit, stock - index * limit) } : null);
    check(stock * OPENING_CONTENT.items[equipment].solidValue <= bag.slots.length * OPENING_CONTENT.items['scrap'].stackLimit, 'Edit fixture cannot hold all dismantling refunds');
    const existing = new Set(initial.entities.filter(entity => entity.building).map(entity => entity.id));
    const value = session(variant, capture(initial));
    try {
      await value.ready; const times: number[] = [];
      for (let cycle = 0; cycle < 100; ++cycle) {
        let start = performance.now();
        await tick(value, still, 1, [{ type: 'factory-place', equipment, cell: { column: 6, row: 5 }, rotation: (cycle % 4) as 0 | 1 | 2 | 3 }]);
        times.push(performance.now() - start);
        const placed = value.current.buildings.find(building => !existing.has(building.id));
        check(placed, `Prepared collider insertion not observed: ${JSON.stringify({ tick: value.current.tick, acknowledgements: value.acknowledgements, newIds: value.current.buildings.filter(building => !existing.has(building.id)).map(building => building.id), expectedId: 'building-' + initial.resources.nextEntityId })}`);
        start = performance.now(); await tick(value, still, 1, [{ type: 'factory-dismantle', target: placed.id }]); times.push(performance.now() - start);
        check(!value.current.buildings.some(building => building.id === placed.id), 'Collider removal was rejected');
      }
      const final = await value.capture(), finalSha256 = await hash(final.world), key = String(count);
      if (variant === 'B0') expected.set(key, finalSha256); else check(expected.get(key) === finalSha256, 'Collider edit stream diverged');
      await emit('edits-pass', { variant, extraStatics: count, equipment, startingStock: stock, orderedPlaceRemoveCycles: 100, endToEndEditTickMs: distribution(times), rawEditTickMs: times, counts: fixtureCounts(initial), finalSha256 });
    } catch (error) { await emit('edits-fail', { variant, extraStatics: count, error: String(error) }); } finally { value.dispose(); }
  }
}

async function accepted() {
  const plans = await (await fetch('/replay-index')).json() as { index: { job: string; browser: string }[] };
  for (const entry of plans.index.filter(entry => entry.browser === (config.replayBrowser ?? 'bundled'))) {
    const plan = await (await fetch('/replay/' + encodeURIComponent(entry.job) + '.json')).json() as AcceptedReplayPlan;
    const value = session('B0', capture(plan.initial ?? builder.base(0)));
    try {
      await value.ready;
      for (const row of plan.inputs) { check(value.current.tick === row.tick, 'Accepted replay tick gap'); await tick(value, row.input); }
      const actual = (await value.capture()).world;
      const text = canonicalJson(actual), digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('');
      if (digest !== plan.expectedSha256) { await save('replay-mismatch-' + plan.job, actual); throw new Error('Actual scheduled autosave differs from its accepted logical input stream'); }
      await emit('accepted-replay-pass', { job: plan.job, browser: plan.browser, ticks: plan.inputs.length, saveTick: actual.resources.tick, sha256: digest, traceSha256: plan.traceSha256 });
    } catch (error) { await emit('accepted-replay-fail', { job: plan.job, browser: plan.browser, error: String(error) }); } finally { value.dispose(); }
  }
}

async function research() {
  for (const level of [0, 1, 2, 3] as const) {
    const initial = builder.base(level), player = initial.entities.find(entity => entity.kind === 'player')!;
    for (const technology of OPENING_TECHNOLOGIES) initial.resources.research[technology.id] = { consumed: Object.fromEntries(technology.costs.map(cost => [cost.item, cost.quantity])), work: technology.seconds, unlocked: true };
    for (const id of ['coal-power', 'pollution-mitigation']) initial.resources.research[id] = { consumed: {}, work: 0, unlocked: false };
    player.opening!.researchQueue = ['coal-power', 'pollution-mitigation']; player.opening!.fieldEnabled = true; player.inventory!.slots[2] = { item: 'research-kit', quantity: 50 };
    initial.resources.productionTotals['research-kit'] = 50;
    const reference = new Simulation(initial.definition, { snapshot: initial, developerFixture: true }); let expected: string;
    try { for (let n = 0; n < 10; ++n) reference.step(still); const final = reference.capture(); check(final.resources.research['coal-power'].work + final.resources.research['pollution-mitigation'].work > 0, 'Prepared research sources did no work'); check(final.entities.find(entity => entity.kind === 'player')!.opening!.researchQueue.length > 0, 'Research burst exhausted before the sample window ended'); expected = await hash(final); } finally { reference.dispose(); }
    for (const variant of ['B0', 'B1', 'C1']) {
      const rawTickMs: number[] = [], boundaries: string[] = [];
      try {
        for (let repeat = 0; repeat < 30; ++repeat) {
          const value = session(variant, capture(initial));
          try { await value.ready; for (let n = 0; n < 10; ++n) { const start = performance.now(); await tick(value); rawTickMs.push(performance.now() - start); } const final = await value.capture(); const actual = await hash(final.world); check(actual === expected, 'Active-research/native boundary diverged'); boundaries.push(actual); }
          finally { value.dispose(); }
        }
        await emit('research-pass', { level, variant, repetitions: 30, activeTicksPerRepeat: 10, rawTickMs, endToEndTickMs: distribution(rawTickMs), counts: fixtureCounts(initial), boundaries, limitation: 'Valid short active-research burst, with independent fixture resets and warmed browser/WASM cache. It does not fabricate continuously active research in the finite global queue or qualify sustained input p99.' });
      } catch (error) { await emit('research-fail', { level, variant, error: String(error) }); }
    }
  }
}

async function faults() {
  const initial = capture(builder.base(1));
  for (const variant of ['B0', 'B1', 'C1']) {
    const port = new WorkerSimulationPort(worker(variant)); let serial = 0;
    const send = (body: RuntimeRequestBody, generation = 1) => port.send({ protocol: 2, id: ++serial, generation, revision: 0, ...body });
    try {
      check((await send({ operation: 'initialize', definition: initial.world.definition, capture: initial, developerFixture: true })).ok, 'Initial pair preparation failed');
      check((await send({ operation: 'activity', active: true })).ok, 'Initial pair activation failed');
      const firstTick = await send({ operation: 'advance', steps: 1, input: still, inputSequence: 1 }); check(firstTick.ok, 'Initial tick failed: ' + JSON.stringify(firstTick));
      const before = await send({ operation: 'capture' }); check(before.ok && before.operation === 'capture', 'Missing before capture');
      const invalid = structuredClone(before.capture); invalid.world.entities.find(entity => entity.kind === 'player')!.transform!.position.x += 1;
      const rejected = await send({ operation: 'initialize', definition: invalid.world.definition, capture: invalid, developerFixture: true }, 2); check(!rejected.ok, 'Invalid native candidate unexpectedly replaced authority');
      const after = await send({ operation: 'capture' }); check(after.ok && after.operation === 'capture', 'Old pair failed after candidate rejection');
      check(await hash(after.capture) === await hash(before.capture), 'Failed candidate changed previous authority');
      check((await send({ operation: 'advance', steps: 1, input: still, inputSequence: 2 })).ok, 'Old pair could not continue');
      await emit('fault-pass', { variant, kind: 'same-runtime-candidate-native-preparation-failure', unchangedCapture: true, oldPairContinued: true });
    } catch (error) { await emit('fault-fail', { variant, kind: 'same-runtime-candidate-native-preparation-failure', error: String(error) }); } finally { port.dispose(); }
    for (const delay of [1, 4, 8, 16.7, 50, 100, 250]) {
      const value = session(variant, initial, 'delay', delay);
      try { await value.ready; const begin = performance.now(); await tick(value); const saved = await value.capture(); check(saved.world.resources.tick === initial.world.resources.tick + 1, 'Delay duplicated/lost a tick'); await emit('fault-pass', { variant, kind: 'delay', delay, elapsedMs: performance.now() - begin }); }
      catch (error) { await emit('fault-fail', { variant, kind: 'delay', delay, error: String(error) }); } finally { value.dispose(); }
    }
    for (const kind of ['duplicate', 'reuse', ...(variant === 'C1' ? [] : ['detached']), 'drop', 'stale', 'corrupt', 'reorder', 'terminate', 'init-fail']) {
      const previous = session(variant, initial);
      await previous.ready;
      const value = session(variant, initial, kind);
      try {
        let rejected = false;
        try { await value.ready; await tick(value); } catch { rejected = true; }
        const accepted = kind === 'duplicate' || kind === 'reuse';
        check(accepted ? !rejected : rejected, `Unexpected ${kind} failure boundary`);
        if (!accepted && kind !== 'init-fail') check(value.current.tick === 0 || value.current.tick === initial.world.resources.tick, 'Fault exposed a partially committed tick');
        if (accepted) { const reference = new Simulation(initial.world.definition, { snapshot: initial.world, developerFixture: true }); try { reference.step(still); check(await hash((await value.capture()).world) === await hash(reference.capture()), 'Reply buffer reuse mutated committed authority'); } finally { reference.dispose(); } }
        await tick(previous);
        check(previous.current.tick === initial.world.resources.tick + 1, 'Old pair was damaged by failed candidate');
        await emit('fault-pass', { variant, kind, rejected, previousTick: previous.current.tick });
      } catch (error) { await emit('fault-fail', { variant, kind, error: String(error) }); }
      finally { value.dispose(); previous.dispose(); }
    }
    const value = session(variant, initial, 'delay', 250);
    try { await value.ready; value.advance(.05); const pending = value.capture(); value.dispose(); let rejected = false; try { await pending; } catch { rejected = true; } check(rejected, 'Disposal mid-request did not reject capture'); await emit('fault-pass', { variant, kind: 'dispose-mid-request' }); }
    catch (error) { await emit('fault-fail', { variant, kind: 'dispose-mid-request', error: String(error) }); } finally { value.dispose(); }
    const overloaded = session(variant, initial, 'delay', 250);
    try {
      await overloaded.ready; overloaded.setMovement({ x: 1, z: 0 }); overloaded.advance(60); for (let n = 0; n < 20; ++n) overloaded.advance(1);
      check(overloaded.maxPendingSteps <= 5.000001, 'Catch-up exceeded five shared credits'); await overloaded.settled(); overloaded.flushCompleted();
      overloaded.pause(); await overloaded.settled(); const pausedTick = overloaded.current.tick; overloaded.advance(1); await overloaded.settled(); check(overloaded.current.tick === pausedTick, 'Paused clocks advanced');
      overloaded.pause(false); await overloaded.settled(); const before = overloaded.current.player.position; overloaded.advance(.05); await overloaded.settled(); overloaded.flushCompleted(); const after = overloaded.current.player.position;
      check(Math.hypot(after.x - before.x, after.z - before.z) < .0001, 'Stale held movement replayed after pause');
      await emit('fault-pass', { variant, kind: 'overload-pause-fresh-input', maximumCredits: overloaded.maxPendingSteps, droppedSeconds: overloaded.droppedSeconds });
    } catch (error) { await emit('fault-fail', { variant, kind: 'overload-pause-fresh-input', error: String(error) }); } finally { overloaded.dispose(); }
  }
}

function heap() { const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory; return memory ? { used: memory.usedJSHeapSize, total: memory.totalJSHeapSize } : null; }
async function lifecycle() {
  const initial = capture(builder.base(1));
  for (const variant of ['B0', 'B1', 'C1']) {
    peakParents = 0; peakChildren = 0;
    const samples: unknown[] = [];
    for (let cycle = 0; cycle < 100; ++cycle) {
      const value = session(variant, initial); let restored: GameSession | undefined;
      try { await value.ready; await tick(value, motionAt(cycle), 5); const pending = value.capture(); const saved = await pending; restored = session(variant, saved); await restored.ready; value.dispose(); await tick(restored); }
      finally { value.dispose(); restored?.dispose(); }
      if (cycle % 10 === 9) { await wait(100); samples.push({ cycle: cycle + 1, parents: active.size, children: [...active.values()].reduce((n, children) => n + children.size, 0), heap: heap() }); await emit('lifecycle-progress', { variant, cycle: cycle + 1 }); }
    }
    check(active.size === 0, 'Owned worker tracker did not settle');
    await emit('lifecycle-pass', { variant, cycles: 100, peakParents, peakChildren, samples, memoryLimit: 'Whole-page JS heap only; native/WASM and per-process physical memory are not qualified by this tracker.' });
  }
}

async function soak() {
  const spec = config.spec ?? { level: 3, profile: 'contacts', count: 1000 };
  const initial = capture(builder.build(spec));
  for (const variant of config.variant ? [config.variant] : ['B0', 'B1', 'C1']) {
    const value = session(variant, initial);
    try {
      await value.ready;
      const warmStart = performance.now(); let warmPrevious = warmStart;
      while (performance.now() - warmStart < 15000) { const now = performance.now(); value.advance((now - warmPrevious) / 1000); warmPrevious = now; await value.settled(); value.flushCompleted(); check(!value.failed, 'Soak warm-up failed'); await wait(16); }
      const warmCapture = await value.capture(), countsAfterWarmup = fixtureCounts(warmCapture.world), startTick = value.current.tick, droppedAtStart = value.droppedSeconds;
      for (const activity of nativeActivity.values()) Object.assign(activity, emptyActivity());
      await emit('soak-start', { variant, spec, warmupSeconds: 15, startTick, countsAfterWarmup, droppedAtStart, heap: heap() });
      const start = performance.now(); let last = start, reported = start;
      const blocks: unknown[] = [], rawAdvanceMs: number[] = [], rawElapsedSeconds: number[] = []; let missed = 0, maximum = 0, advances = 0;
      while (performance.now() - start < config.soakSeconds * 1000) {
        const now = performance.now(); const seconds = (now - last) / 1000; last = now;
        value.setMovement(motionAt(Math.floor((now - start) / 50)));
        const before = performance.now(); value.advance(seconds); await value.settled(); value.flushCompleted();
        const elapsed = performance.now() - before; maximum = Math.max(maximum, elapsed); if (elapsed > 50) ++missed; ++advances; rawAdvanceMs.push(elapsed); rawElapsedSeconds.push(seconds);
        check(!value.failed, 'Soak worker failed');
        if (now - reported >= 60000) { const row = { variant, elapsedSeconds: (now - start) / 1000, startTick, tick: value.current.tick, maximumAdvanceMs: maximum, maximumPendingCredits: value.maxPendingSteps, deadlineMisses: missed, advances, droppedSeconds: value.droppedSeconds - droppedAtStart, nativeActivity: activitySnapshot(), heap: heap() }; blocks.push(row); await emit('soak-progress', row); reported = now; }
        await wait(Math.max(0, 16 - (performance.now() - before)));
      }
      const saved = await value.capture();
      const rawReceipt = `soak-${variant}-${Date.now()}`; await save(rawReceipt, { variant, spec, rawAdvanceMs, rawElapsedSeconds, blocks, final: saved });
      await emit('soak-pass', { variant, seconds: (performance.now() - start) / 1000, key: workloadKey(spec), startTick, tick: value.current.tick, blocks, rawReceipt, maximumPendingCredits: value.maxPendingSteps, countsAfterWarmup, countsAfter: fixtureCounts(saved.world), nativeActivity: activitySnapshot(), droppedSeconds: value.droppedSeconds - droppedAtStart });
    } catch (error) { await emit('soak-fail', { variant, error: String(error) }); }
    finally { value.dispose(); }
  }
}

document.getElementById('start')!.addEventListener('click', () => {
  (document.getElementById('start') as HTMLButtonElement).disabled = true;
  void (async () => {
    await emit('suite-start', { task: config.task, userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight }, hidden: document.hidden });
    if (config.task === 'correctness') await correctness();
    else if (config.task === 'steady-parity') {
      const selection = await (await fetch('/selection?steady=1')).json() as { selected: { spec: WorkloadSpec } };
      await correctness(false, [selection.selected.spec]);
    }
    else if (config.task === 'selected-correctness') {
      const selection = await (await fetch('/selection?browser=' + config.replayBrowser)).json() as { selected: { spec: WorkloadSpec }; soakSelected: { spec: WorkloadSpec } };
      const specs = [selection.selected.spec, selection.soakSelected.spec].filter((spec, index, rows) => rows.findIndex(row => workloadKey(row) === workloadKey(spec)) === index);
      await correctness(false, specs);
    }
    else if (config.task === 'contact-parity') await correctness(true);
    else if (config.task === 'courses') await courses();
    else if (config.task === 'corner-parity') await courses(true);
    else if (config.task === 'ordering') await ordering();
    else if (config.task === 'matrix') await matrix();
    else if (config.task === 'faults') await faults();
    else if (config.task === 'lifecycle') await lifecycle();
    else if (config.task === 'isolation') await isolation(builder, emit);
    else if (config.task === 'edits') await edits();
    else if (config.task === 'accepted') await accepted();
    else if (config.task === 'research') await research();
    else await soak();
    await emit('suite-complete', { task: config.task, ownedWorkersRemaining: active.size });
  })().catch(error => { void emit('suite-fatal', { task: config.task, error: String(error), stack: error instanceof Error ? error.stack : null }); });
});
status.textContent = `Ready: ${config.task}. This device only.`;
