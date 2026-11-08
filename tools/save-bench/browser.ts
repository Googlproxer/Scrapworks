import type { SaveSnapshot } from '../../src/contracts/save';
import type { SimulationSnapshot } from '../../src/contracts/simulation';
import { GameSession } from '../../src/session/game-session';
import { WorkerSimulationPort } from '../../src/session/worker-port';
import { IndexedDbSaveRepository } from '../../src/persistence/indexeddb-save-repository';
import { decodeMetadata, decodeSave, saveMetadata } from '../../src/persistence/save-codec';
import { formats, assertExact, type SaveFormat } from './codecs';
import { fixture, envelope } from './fixtures';
import { BenchmarkStore, storageUsage } from './storage';
import {
  shuffled,
  type BrowserOptions,
  type FixtureResult,
  type FormatResult,
  type PipelineSample,
  type StageSample,
} from './model';

export interface CaseSpec {
  readonly name: string;
  readonly population?: number;
  readonly bodies: number;
}
const continuedTicks = 4;

function session(save: SaveSnapshot): GameSession {
  return new GameSession(save.world.definition, {
    playerSave: true,
    capture: {
      world: save.world,
      pending: [],
      ledger: { accepted: 0, applied: 0, cancelled: 0, lastApplied: 0 },
    },
    portFactory: () =>
      new WorkerSimulationPort(
        new Worker(new URL('../../src/workers/simulation.worker.ts', import.meta.url), {
          type: 'module',
        }),
      ),
  });
}

async function continuation(game: GameSession): Promise<SimulationSnapshot> {
  game.advance(continuedTicks * 0.05);
  await game.settled();
  game.flushCompleted();
  const world = (await game.capture()).world;
  if (game.failed) throw new Error('Restored worker failed.');
  return world;
}

function gate(save: SaveSnapshot): { accepted: boolean; error?: string } {
  try {
    decodeSave(save);
    return { accepted: true };
  } catch (error) {
    return { accepted: false, error: error instanceof Error ? error.message : String(error) };
  }
}

interface State {
  readonly format: SaveFormat;
  readonly store: BenchmarkStore;
  readonly production?: IndexedDbSaveRepository;
  readonly result: Omit<FormatResult, 'stages' | 'pipeline'> & {
    stages: StageSample[];
    pipeline: PipelineSample[] | null;
  };
}

async function stages(state: State, save: SaveSnapshot): Promise<StageSample> {
  let start = performance.now();
  const payload = await state.format.encode(save);
  const encodeMs = performance.now() - start;
  start = performance.now();
  await state.store.write(saveMetadata(save), payload);
  const writeMs = performance.now() - start;
  start = performance.now();
  const row = await state.store.read();
  const readMs = performance.now() - start;
  start = performance.now();
  await state.format.decode(row.payload);
  return { encodeMs, writeMs, readMs, decodeMs: performance.now() - start };
}

async function pipeline(
  state: State,
  source: GameSession,
  expected: SimulationSnapshot,
  verify: boolean,
): Promise<PipelineSample> {
  const saveStart = performance.now();
  const save = envelope((await source.capture()).world);
  const capturedAt = performance.now();
  if (state.production) await state.production.save(save, save.token);
  else {
    const validated = decodeSave(save);
    await state.store.write(saveMetadata(validated), await state.format.encode(validated));
  }
  const savedAt = performance.now();
  const loadStart = performance.now();
  let loaded: SaveSnapshot;
  if (state.production) {
    const value = await state.production.load();
    if (!value) throw new Error('Production repository lost the benchmark save.');
    loaded = value;
  } else {
    const row = await state.store.read();
    loaded = decodeSave(await state.format.decode(row.payload));
    assertExact(saveMetadata(loaded), decodeMetadata(row.metadata));
  }
  const loadedAt = performance.now();
  const restored = session(loaded);
  try {
    await restored.ready;
    const readyAt = performance.now();
    if (restored.populationSize !== save.world.entities.length)
      throw new Error('Restored population mismatch.');
    if (verify) assertExact(await continuation(restored), expected);
    return {
      captureMs: capturedAt - saveStart,
      saveRepositoryMs: savedAt - capturedAt,
      saveTotalMs: savedAt - saveStart,
      loadRepositoryMs: loadedAt - loadStart,
      restoreWorkerMs: readyAt - loadedAt,
      loadTotalMs: readyAt - loadStart,
    };
  } finally {
    restored.dispose();
  }
}

export async function runSaveBenchCase(
  options: BrowserOptions,
  spec: CaseSpec,
): Promise<FixtureResult> {
  console.log(`[save-bench] Preparing ${spec.name}`);
  const initial = fixture(options.definition, spec.population, spec.bodies);
  const source = session(initial);
  const states: State[] = [];
  try {
    await source.ready;
    const save = envelope((await source.capture()).world);
    const hostGate = gate(save);
    const json = new TextEncoder().encode(JSON.stringify(save));
    const digest = await crypto.subtle.digest('SHA-256', json);
    const sha256 = Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('');
    const control = session(save);
    let expected: SimulationSnapshot;
    try {
      await control.ready;
      expected = await continuation(control);
    } finally {
      control.dispose();
    }
    const common = {
      captureMs: [] as number[],
      validateAndCloneMs: [] as number[],
      cloneOnlyMs: [] as number[],
    };
    for (let i = -options.warmups; i < options.samples; i++) {
      let start = performance.now();
      await source.capture();
      const captureMs = performance.now() - start;
      start = performance.now();
      const currentGate = gate(save);
      const validateMs = performance.now() - start;
      if (JSON.stringify(currentGate) !== JSON.stringify(hostGate))
        throw new Error('Inconsistent host gate.');
      start = performance.now();
      structuredClone(save);
      const cloneMs = performance.now() - start;
      if (i >= 0) {
        common.captureMs.push(captureMs);
        common.validateAndCloneMs.push(validateMs);
        common.cloneOnlyMs.push(cloneMs);
      }
    }
    for (const format of formats) {
      console.log(`[save-bench] Checking ${spec.name} / ${format.id}`);
      const name = `ScrapworksSaveBench-${crypto.randomUUID()}`;
      const store = new BenchmarkStore(name);
      // Register ownership before opening so failure cleanup also handles partial setup.
      const state: State = {
        format,
        store,
        ...(format.id === 'current-object'
          ? { production: new IndexedDbSaveRepository(name) }
          : {}),
        result: {
          format: format.id,
          label: format.label,
          wireBytes: null,
          storage: { beforeBytes: 0, afterBytes: 0, deltaBytes: 0, source: 'pending' },
          correctness: { exactRoundTrip: true, continuedTicks },
          stages: [],
          pipeline: hostGate.accepted ? [] : null,
        },
      };
      states.push(state);
      await store.open();
      await state.production?.list();
      const before = await storageUsage();
      const payload = await format.encode(save);
      await store.write(saveMetadata(save), payload);
      const after = await storageUsage();
      if (after.bytes < before.bytes)
        throw new Error('Storage estimate decreased during an isolated write.');
      const row = await store.read(),
        decoded = await format.decode(row.payload);
      assertExact(decoded, save);
      const restored = session(decoded);
      try {
        await restored.ready;
        assertExact(await continuation(restored), expected);
      } finally {
        restored.dispose();
      }
      Object.assign(state.result, {
        wireBytes: format.wireBytes(payload),
        storage: {
          beforeBytes: before.bytes,
          afterBytes: after.bytes,
          deltaBytes: after.bytes - before.bytes,
          source: before.source,
        },
      });
    }
    const order: string[][] = [];
    for (let i = -options.warmups; i < options.samples; i++) {
      const selected = shuffled(states, options.seed + i + options.warmups);
      order.push(selected.map((state) => state.format.id));
      console.log(
        `[save-bench] ${spec.name}: ${i < 0 ? 'warmup' : 'sample'} ${i < 0 ? i + options.warmups + 1 : i + 1}`,
      );
      for (const state of selected) {
        const staged = await stages(state, save);
        const full = hostGate.accepted ? await pipeline(state, source, expected, i === 0) : null;
        if (i >= 0) {
          state.result.stages.push(staged);
          if (full) state.result.pipeline!.push(full);
        }
      }
    }
    const kinds: Record<string, number> = {};
    for (const entity of save.world.entities) kinds[entity.kind] = (kinds[entity.kind] ?? 0) + 1;
    return {
      name: spec.name,
      synthetic: spec.population !== undefined || spec.bodies > 0,
      population: save.world.entities.length,
      kinds,
      physicsBytes: save.world.physics.bytes.length,
      jsonUtf8Bytes: json.byteLength,
      sha256,
      hostGate,
      common,
      order,
      formats: states.map((state) => state.result),
    };
  } finally {
    source.dispose();
    for (const state of states) {
      state.production?.close();
      await state.store.delete();
    }
  }
}

Object.assign(globalThis, { runSaveBenchCase });
const driver = globalThis as unknown as { saveBenchReady?: () => Promise<void> };
await driver.saveBenchReady?.();
