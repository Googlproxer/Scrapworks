import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  assertNoPhysicsBodies,
  attachedScripts,
  exportProject,
  publishOutput,
  SupersededExport,
} from './export-project.ts';
import { projectRoot } from './inventory.ts';
import { exportQueue, watchAuthoring } from './watch.ts';
import { fixtureMarkers } from '../world/test-fixture.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fixture(run: (root: string) => Promise<unknown>) {
  const parent = await fs.realpath(path.join(projectRoot, 'tmp'));
  const root = await fs.mkdtemp(path.join(parent, 'workflow-test-'));
  try {
    for (const name of ['assets/game.scene/nodes', 'src', 'public/scene', 'tools/scenes'])
      await fs.mkdir(path.join(root, name), { recursive: true });
    for (const marker of fixtureMarkers())
      await fs.writeFile(
        path.join(root, 'assets/game.scene/nodes', marker.id + '.json'),
        JSON.stringify(marker),
      );
    await fs.writeFile(path.join(root, 'scrapworks.bjseditor'), '{}');
    await fs.writeFile(
      path.join(root, 'assets/game.scene/config.json'),
      '{"physics":{"gravity":[0,-981,0]}}',
    );
    await fs.writeFile(path.join(root, 'src/scripts.ts'), '// previous registry');
    await fs.writeFile(path.join(root, 'public/scene/game.babylon'), '{"old":true}');
    await fs.writeFile(path.join(root, 'public/scene/obsolete.bin'), 'previous geometry');
    await fs.writeFile(
      path.join(root, 'tools/scenes/export-policy.json'),
      '{"version":1,"additionalSceneAssets":[]}',
    );
    await run(root);
  } finally {
    const resolved = await fs.realpath(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('workflow-test-'));
    await fs.rm(resolved, { recursive: true });
  }
}

async function fakePack(stage: string) {
  await fs.mkdir(path.join(stage, 'public/scene/assets'), { recursive: true });
  await fs.writeFile(
    path.join(stage, 'public/scene/game.babylon'),
    '{"physicsEnabled":true,"meshes":[]}',
  );
  await fs.writeFile(path.join(stage, 'public/scene/new.bin'), 'new geometry');
  await fs.writeFile(
    path.join(stage, 'public/scene/scenes-used-files.json'),
    '{"game.scene":["game.babylon","new.bin"]}',
  );
  await fs.writeFile(path.join(stage, 'src/scripts.ts'), '// next registry');
}

async function previousStillWorks(root: string) {
  assert.equal(
    await fs.readFile(path.join(root, 'public/scene/game.babylon'), 'utf8'),
    '{"old":true}',
  );
  assert.equal(
    await fs.readFile(path.join(root, 'public/scene/obsolete.bin'), 'utf8'),
    'previous geometry',
  );
  assert.equal(
    await fs.readFile(path.join(root, 'src/scripts.ts'), 'utf8'),
    '// previous registry',
  );
}

test('unsupported authored features preserve scenes and both generated registries', async () =>
  fixture(async (root) => {
    await fs.writeFile(path.join(root, 'src/scene-registrations.ts'), '// old features');
    await assert.rejects(
      exportProject(root, {
        packProject: async (stage) => {
          await fakePack(stage);
          await fs.writeFile(
            path.join(stage, 'public/scene/game.babylon'),
            '{"cameras":[{"type":"UnsupportedCamera"}]}',
          );
        },
      }),
      /UnsupportedCamera.*game.babylon.cameras\[0\]/,
    );
    await previousStillWorks(root);
    assert.equal(
      await fs.readFile(path.join(root, 'src/scene-registrations.ts'), 'utf8'),
      '// old features',
    );
  }));

test('successful staging replaces obsolete output and publishes a matching registry without modifying authoring inputs', async () =>
  fixture(async (root: string) => {
    const original = await fs.readFile(path.join(root, 'assets/game.scene/config.json'));
    await exportProject(root, { packProject: fakePack });
    assert.deepEqual(await fs.readFile(path.join(root, 'assets/game.scene/config.json')), original);
    assert.equal(
      JSON.parse(await fs.readFile(path.join(root, 'public/scene/game.babylon'), 'utf8'))
        .physicsEnabled,
      false,
    );
    assert.equal(
      JSON.parse(await fs.readFile(path.join(root, 'public/scene/worlds/game.json'), 'utf8'))
        .version,
      1,
    );
    assert.equal(await fs.readFile(path.join(root, 'src/scripts.ts'), 'utf8'), '// next registry');
    await assert.rejects(fs.access(path.join(root, 'public/scene/obsolete.bin')));
    await assert.rejects(fs.access(path.join(root, 'tmp/scene-export.lock')));
  }));

test('packer errors, missing dependencies and superseded saves preserve the full last working export and registry', async () =>
  fixture(async (root: string) => {
    await assert.rejects(
      exportProject(root, {
        packProject: async (stage) => {
          await fakePack(stage);
          throw new Error('Broken authoring');
        },
      }),
      /Broken authoring/,
    );
    await previousStillWorks(root);
    await fs.writeFile(
      path.join(root, 'tools/scenes/export-policy.json'),
      '{"version":1,"additionalSceneAssets":["assets/missing.png"]}',
    );
    await assert.rejects(exportProject(root, { packProject: fakePack }), /absent/);
    await previousStillWorks(root);
    await fs.writeFile(
      path.join(root, 'tools/scenes/export-policy.json'),
      '{"version":1,"additionalSceneAssets":[]}',
    );
    await assert.rejects(
      exportProject(root, { packProject: fakePack, isCurrent: () => false }),
      SupersededExport,
    );
    await previousStillWorks(root);
  }));

test('publication rolls back all files if installing the new generation fails', async () =>
  fixture(async (root: string) => {
    const stage = path.join(root, 'tmp/scene-export/run-publication');
    await fs.mkdir(path.join(stage, 'src'), { recursive: true });
    await fakePack(stage);
    let moves = 0;
    await assert.rejects(
      publishOutput(root, stage, async (...args) => {
        if (++moves === 2) throw new Error('Simulated rename failure');
        await fs.rename(...args);
      }),
      /rename failure/,
    );
    await previousStillWorks(root);
  }));

test('malformed world markers preserve the previously published scenes and world together', async () =>
  fixture(async (root: string) => {
    await exportProject(root, { packProject: fakePack });
    const previous = await fs.readFile(path.join(root, 'public/scene/worlds/game.json'));
    await fs.writeFile(path.join(root, 'assets/game.scene/nodes/spawn.json'), '{}');
    await assert.rejects(
      exportProject(root, { packProject: () => assert.fail('Reject before packing') }),
      /exactly one/,
    );
    assert.deepEqual(await fs.readFile(path.join(root, 'public/scene/worlds/game.json')), previous);
    assert.equal(
      JSON.parse(await fs.readFile(path.join(root, 'public/scene/game.babylon'), 'utf8'))
        .physicsEnabled,
      false,
    );
  }));

test('concurrent exporters cannot overlap or remove the active export lock', async () =>
  fixture(async (root: string) => {
    let release!: () => void, entered!: () => void;
    const active = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = exportProject(root, {
      packProject: async (stage) => {
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await fakePack(stage);
      },
    });
    await active;
    await assert.rejects(exportProject(root, { packProject: fakePack }), /Another export owns/);
    await fs.access(path.join(root, 'tmp/scene-export.lock'));
    release();
    await first;
  }));

test('no-body workaround rejects Editor aggregates and legacy impostors while accepting gravity-only config', async () =>
  fixture(async (root: string) => {
    assert.doesNotThrow(() =>
      assertNoPhysicsBodies({
        physicsEnabled: true,
        physics: { gravity: [0, -981, 0] },
        physicsImpostor: 0,
      }),
    );
    for (const body of [
      { metadata: { physicsAggregate: { type: 3, mass: 1 } } },
      { physicsImpostor: 2 },
    ]) {
      assert.throws(() => assertNoPhysicsBodies(body), /Physics body found/);
      await fs.writeFile(path.join(root, 'assets/game.scene/config.json'), JSON.stringify(body));
      await assert.rejects(
        exportProject(root, { packProject: () => assert.fail('Must reject before packing') }),
        /Physics body found/,
      );
      await previousStillWorks(root);
    }
  }));

test('attached script discovery follows enabled Editor metadata and rejects missing or escaping script paths', async () =>
  fixture(async (root: string) => {
    const config = path.join(root, 'assets/game.scene/config.json');

    const write = (key: string) =>
      fs.writeFile(config, JSON.stringify({ metadata: { scripts: [{ key, enabled: true }] } }));

    await write('presentation.ts');
    await assert.rejects(attachedScripts(root), /missing/);
    await fs.writeFile(path.join(root, 'src/presentation.ts'), '// presentation');
    assert.deepEqual([...(await attachedScripts(root))], ['src/presentation.ts']);
    await write('../outside.ts');
    await assert.rejects(attachedScripts(root), /relative file path/);
  }));

test('save bursts coalesce, saves during export supersede it, and a later save recovers from failure', async () => {
  let attempts = 0;
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const messages: string[] = [];
  const queue = exportQueue(
    async (isCurrent) => {
      attempts++;
      if (attempts === 1) {
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        assert.equal(isCurrent(), false);
        throw new SupersededExport('Superseded');
      }
      if (attempts === 3) throw new Error('Invalid saved JSON');
    },
    { delay: 5, status: (text) => messages.push(text) },
  );
  try {
    queue.request();
    queue.request();
    queue.request();
    const first = queue.flush();
    await started;
    queue.request();
    queue.request();
    release();
    assert.equal(await first, true);
    assert.equal(attempts, 2);
    queue.request();
    assert.equal(await queue.flush(), false);
    queue.request();
    assert.equal(await queue.flush(), true);
    assert.equal(attempts, 4);
    assert.ok(messages.some((text) => text.includes('last working scenes retained')));
  } finally {
    await queue.close();
  }
});

test(
  'native watcher includes authored assets and attached scripts but excludes caches and generated outputs',
  { timeout: 5000 },
  async () =>
    fixture(async (root: string) => {
      let events = 0;
      let nextEvent: (() => void) | undefined;
      const errors: Error[] = [];
      await fs.writeFile(path.join(root, 'src/presentation.ts'), '// original');
      await fs.mkdir(path.join(root, '.bjseditor'));
      const stop = watchAuthoring(root, {
        changed: () => {
          events++;
          nextEvent?.();
        },
        failed: (error) => errors.push(error),
        scripts: () => new Set(['src/presentation.ts']),
      });
      try {
        await fs.writeFile(path.join(root, 'src/scripts.ts'), '// generated');
        await fs.writeFile(path.join(root, 'assets/.export-cache.json'), '{}');
        await fs.writeFile(path.join(root, 'public/scene/game.babylon'), '{}');
        const first = new Promise<void>((resolve) => {
          nextEvent = resolve;
        });
        await fs.writeFile(path.join(root, 'assets/game.scene/config.json'), '{}');
        await first;
        assert.equal(events, 1);
        const previous = events;
        const second = new Promise<void>((resolve) => {
          nextEvent = resolve;
        });
        await fs.writeFile(path.join(root, 'src/presentation.ts'), '// changed');
        await second;
        assert.ok(events > previous);
        assert.deepEqual(errors, []);
      } finally {
        stop();
      }
    }),
);
