// Local development-only visual evidence; Angular debug access never ships in game code.
import type { TurningSample } from '../../tools/browser-types.d.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { projectRoot } from '../../tools/scenes/inventory.ts';

const origin = process.argv[2] ?? 'http://localhost:4200';
const output = path.resolve(
  projectRoot,
  process.argv[3] ?? 'art/characters/Protag/v3/runtime/browser-smooth-turning',
);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: path.join(projectRoot, 'tmp/turning-browser-video'),
      size: { width: 1280, height: 800 },
    },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Play Game!', exact: true }).click();
  await page.waitForFunction(() =>
    ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService.isReady(),
  );
  await page.waitForLoadState('networkidle');
  await page.locator('canvas').focus();
  await page.evaluate(() => {
    const runtime = ng.getComponent(document.querySelector('app-game-page')).gameRuntimeService;
    runtime.client.currentScene.activeCamera.radius = 600;
    window.turningEvidence = { phase: 'initial', running: true, samples: [] };

    const sample = (time: number) => {
      const scene = runtime.client.currentScene;
      const player = runtime.world().player;
      const root = scene.getTransformNodeByName('player-visual');
      window.turningEvidence.samples.push({
        time,
        phase: window.turningEvidence.phase,
        player,
        visualHeading: root!.rotation.y,
        visualPosition: root!.position.asArray(),
        weights: Object.fromEntries(
          scene.animationGroups.map((clip) => [clip.name, clip.animatables[0]?.weight ?? 0]),
        ),
        clips: Object.fromEntries(
          scene.animationGroups.map((clip) => [
            clip.name,
            {
              isStarted: !!clip.isStarted,
              isPlaying: !!clip.isPlaying,
              animatableWeights: clip.animatables.map((animation) => animation.weight),
            },
          ]),
        ),
      });
      if (window.turningEvidence.running) requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  });

  const phase = (name: string) =>
    page.evaluate((value) => {
      window.turningEvidence.phase = value;
    }, name);

  await page.waitForTimeout(300);
  await phase('right-tap');
  await page.keyboard.down('d');
  await page.waitForTimeout(80);
  await page.keyboard.up('d');
  await phase('right-settle');
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, 'standing-right.png') });
  await page.waitForTimeout(1300);
  await phase('left-tap');
  await page.keyboard.down('a');
  await page.waitForTimeout(80);
  await page.keyboard.up('a');
  await phase('left-settle');
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, 'standing-left.png') });
  await page.waitForTimeout(2400);
  await phase('forward');
  await page.keyboard.down('w');
  await page.waitForTimeout(1100);
  await page.keyboard.up('w');
  await phase('reverse');
  await page.keyboard.down('s');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, 'moving-reversal.png') });
  await page.waitForTimeout(900);
  await page.keyboard.up('s');
  await phase('sprint');
  await page.keyboard.down('w');
  await page.keyboard.down('Shift');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(output, 'sprinting.png') });
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');
  await phase('final');
  await page.waitForTimeout(500);
  const samples = await page.evaluate(() => {
    window.turningEvidence.running = false;
    return window.turningEvidence.samples;
  });
  await fs.writeFile(path.join(output, 'samples.json'), JSON.stringify(samples, null, 2));

  const headingDifference = (sample: TurningSample) =>
    Math.atan2(
      Math.sin(sample.visualHeading - sample.player.facing),
      Math.cos(sample.visualHeading - sample.player.facing),
    );

  for (const sample of samples) {
    for (const name of ['TurnLeft', 'TurnRight']) {
      const clip = sample.clips[name];
      assert(clip, `${name} remains available in the unchanged asset`);
      assert.equal(clip.isStarted, false, `${name} is never started`);
      assert.equal(clip.isPlaying, false, `${name} is never playing`);
      assert(
        clip.animatableWeights.every((weight) => weight === 0),
        `${name} contributes no pose weight`,
      );
      assert.equal(sample.weights[name], 0);
    }
  }
  for (const name of ['right-settle', 'left-settle']) {
    const stationary = samples.filter((sample) => sample.phase === name && !sample.player.moving);
    const target = name === 'right-settle' ? Math.PI / 2 : -Math.PI / 2;
    // Worker publications can arrive after the input phase has already changed to "settle".
    const requested = samples.find(
      (sample) =>
        [name, name.replace('settle', 'tap')].includes(sample.phase) &&
        Math.abs(sample.player.facing - target) < 0.01,
    );
    assert(requested, 'The worker must receive the tapped direction');
    const settled = stationary.find(
      (sample) => sample.time >= requested.time && Math.abs(headingDifference(sample)) < 0.01,
    );
    assert(settled, 'A brief tap finishes turning after movement stops');
    assert(
      settled.time - requested.time < 300,
      'Even a reversal settles within 300 ms of published input',
    );
    assert(
      stationary.some((sample) => sample.weights.Idle > 0.95),
      'The character returns to Idle after the tap',
    );
    assert(
      Math.abs(headingDifference(stationary.at(-1)!)) < 0.01,
      'standing rotation reaches its target',
    );
    const first = stationary[0].player.position;
    assert(
      stationary.every(
        (sample) =>
          Math.hypot(sample.player.position.x - first.x, sample.player.position.z - first.z) <
          0.001,
      ),
      'stationary turning does not move simulation position',
    );
  }
  const reversal = samples.filter((sample) => sample.phase === 'reverse' && sample.player.moving);
  assert(
    reversal.some(
      (sample) => sample.weights.Walk > 0.5 && Math.abs(headingDifference(sample)) > Math.PI / 4,
    ),
    'Walk continues during the sharp heading reversal',
  );
  assert(
    reversal.some((sample) => sample.weights.Walk > 0.95),
    'reversal retains walking',
  );
  assert(
    samples.some(
      (sample) => sample.phase === 'sprint' && sample.player.sprinting && sample.weights.Run > 0.95,
    ),
    'sprinting plays Run',
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        method:
          'Actual local development keyboard input: quick right/left taps, forward movement, reversal and sprinting. Smooth heading changes retain Idle while stationary and Walk while moving; sprinting plays Run. TurnLeft/TurnRight remain stopped with zero contribution in every recorded sample. Camera radius set to 6 metres in this browser only for character inspection. Presentation and simulation read through Angular debug access. No physical controller used.',
        checks: {
          turnGroupsStopped: true,
          turnGroupsZeroContribution: true,
          briefTapSettlesWithin300ms: true,
          stationarySimulationPositionUnchanged: true,
          movingReversalKeepsWalk: true,
          sprintingPlaysRun: true,
        },
        screenshots: [
          'standing-right.png',
          'standing-left.png',
          'moving-reversal.png',
          'sprinting.png',
        ],
        video: 'turning.webm',
        errors,
        samples,
      },
      null,
      2,
    ) + '\n',
  );
  const video = page.video()!;
  await context.close();
  await video.saveAs(path.join(output, 'turning.webm'));
  console.log(JSON.stringify({ samples: samples.length, errors, status: 'passed', output }));
} finally {
  await browser.close();
}
