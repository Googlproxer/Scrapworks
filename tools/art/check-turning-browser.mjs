// Local development-only visual evidence; Angular debug access never ships in game code.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { projectRoot } from '../scenes/inventory.mjs';

const origin = process.argv[2] ?? 'http://localhost:4200';
const output = path.resolve(
  projectRoot,
  process.argv[3] ?? 'art/characters/protagonist-runtime-v2/browser-smooth-turning',
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
  const errors = [];
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
    const sample = (time) => {
      const scene = runtime.client.currentScene;
      const player = runtime.world().player;
      const root = scene.getTransformNodeByName('player-visual');
      window.turningEvidence.samples.push({
        time,
        phase: window.turningEvidence.phase,
        player,
        visualHeading: root.rotation.y,
        visualPosition: root.position.asArray(),
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
  const phase = (name) =>
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
  await phase('final');
  await page.waitForTimeout(500);
  const samples = await page.evaluate(() => {
    window.turningEvidence.running = false;
    return window.turningEvidence.samples;
  });
  const headingDifference = (sample) =>
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
    assert(
      stationary.some(
        (sample) => sample.weights.Idle > 0.95 && Math.abs(headingDifference(sample)) > 0.15,
      ),
      'Idle plays while the stationary heading is still settling',
    );
    assert(
      stationary.some((sample) => Math.abs(headingDifference(sample)) > 0.15),
      'heading settles over time',
    );
    assert(
      Math.abs(headingDifference(stationary.at(-1))) < 0.01,
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
      (sample) => sample.weights.Walk > 0.95 && Math.abs(headingDifference(sample)) > Math.PI / 4,
    ),
    'Walk continues during the sharp heading reversal',
  );
  assert(
    reversal.some((sample) => sample.weights.Walk > 0.95),
    'reversal retains walking',
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        method:
          'Actual local development keyboard input: quick right/left taps, then forward movement and reversal. Smooth heading changes retain Idle while stationary and Walk while moving; TurnLeft/TurnRight remain stopped with zero contribution in every recorded sample. Camera radius set to 6 metres in this browser only for character inspection. Presentation and simulation read through Angular debug access. No physical controller used.',
        checks: {
          turnGroupsStopped: true,
          turnGroupsZeroContribution: true,
          stationaryIdleWhileHeadingSettles: true,
          stationarySimulationPositionUnchanged: true,
          movingReversalKeepsWalk: true,
        },
        screenshots: ['standing-right.png', 'standing-left.png', 'moving-reversal.png'],
        video: 'turning.webm',
        errors,
        samples,
      },
      null,
      2,
    ) + '\n',
  );
  const video = page.video();
  await context.close();
  await video.saveAs(path.join(output, 'turning.webm'));
  console.log(JSON.stringify({ samples: samples.length, errors, status: 'passed', output }));
} finally {
  await browser.close();
}
