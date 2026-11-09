import { Simulation } from '../../src/simulation/ecs-runtime';
import { preparePlayerSave } from '../../src/simulation/player-save';
import { createSave, parseBackup } from '../../src/persistence/save-codec';
import { IndexedDbSaveRepository } from '../../src/persistence/indexeddb-save-repository';
import type { SaveSnapshot } from '../../src/contracts/save';

/** Browser-inline control timings, explicitly separate from the production worker/renderer. */
export async function profilePhases(input: SaveSnapshot, samples: number) {
  const sim = new Simulation(input.world.definition, { snapshot: preparePlayerSave(input.world) });
  const dbName = 'ScrapworksPortfolioDiagnostic-' + crypto.randomUUID(),
    repository = new IndexedDbSaveRepository(dbName);
  const timing: Record<string, number[]> = {
    step: [],
    publication: [],
    capture: [],
    validation: [],
    encoding: [],
    write: [],
    read: [],
    rebuild: [],
  };
  const timed = <T>(key: string, run: () => T): T => {
    const start = performance.now();
    const value = run();
    timing[key].push(performance.now() - start);
    return value;
  };
  let token: string | null = null;
  try {
    for (let i = 0; i < 1100; i++) {
      const start = performance.now();
      sim.step({ x: 0, z: 0, sprint: false });
      if (i >= 100) timing.step.push(performance.now() - start);
      timed('publication', () => sim.publish(new Set()));
    }
    timing.publication = timing.publication.slice(100);
    const snap = preparePlayerSave(sim.capture());
    const a = new Simulation(snap.definition, { snapshot: snap }),
      b = new Simulation(snap.definition, {
        snapshot: parseBackup(
          JSON.stringify(createSave(snap, 'compare', 'compare', new Date().toISOString())),
        ).world,
      });
    let exactContinuation = false;
    try {
      for (let i = 0; i < 1000; i++) {
        a.step({ x: 0, z: 0, sprint: false });
        b.step({ x: 0, z: 0, sprint: false });
      }
      exactContinuation = JSON.stringify(a.capture()) === JSON.stringify(b.capture());
    } finally {
      a.dispose();
      b.dispose();
    }
    if (!exactContinuation) throw new Error('Controlled branch continuation differs');
    for (let i = 0; i < samples + 3; i++) {
      const world = timed('capture', () => sim.capture());
      const valid = timed('validation', () => preparePlayerSave(structuredClone(world)));
      const next = createSave(valid, 'diagnostic', `diagnostic-${i}`, new Date().toISOString(), {
        kind: i % 3 ? 'auto' : 'manual',
        sequence: i + 1,
        previousToken: token,
      });
      timed('encoding', () => JSON.stringify(next));
      let start = performance.now();
      await repository.save(next, token);
      timing.write.push(performance.now() - start);
      token = next.token;
      start = performance.now();
      const saved = await repository.load(next.token);
      timing.read.push(performance.now() - start);
      const rebuilt = timed(
        'rebuild',
        () => new Simulation(valid.definition, { snapshot: preparePlayerSave(saved!.world) }),
      );
      rebuilt.dispose();
    }
    for (const key of ['capture', 'validation', 'encoding', 'write', 'read', 'rebuild'])
      timing[key] = timing[key].slice(3);
    // Explicitly fill both retained histories for storage measurement.
    for (let i = samples + 3; i < samples + 11; i++) {
      const next = createSave(
        preparePlayerSave(sim.capture()),
        'diagnostic',
        `retention-${i}`,
        new Date().toISOString(),
        { kind: i < samples + 8 ? 'auto' : 'manual', sequence: i + 1, previousToken: token },
      );
      await repository.save(next, token);
      token = next.token;
    }
    const history = await repository.list();
    let retainedJsonBytes = 0;
    for (const h of history)
      retainedJsonBytes += new TextEncoder().encode(
        JSON.stringify(await repository.load(h.token)),
      ).length;
    return {
      method:
        'Browser-inline Simulation control, isolated real IndexedDB. Not production worker CPU, renderer FPS or complete application load.',
      timing,
      exactContinuation,
      continuationSteps: 1000,
      retained: history.map((h) => h.kind),
      retainedJsonBytes,
    };
  } finally {
    sim.dispose();
    repository.close();
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase(dbName);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }
}
