import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { SaveSnapshot } from '../../src/contracts/save.ts';

/** Built-production UI/IndexedDB acceptance. Fixture injection is owned by save-browser.ts. */
export async function checkResearchRoute(
  page: Page,
  readSlot: () => Promise<SaveSnapshot | undefined>,
  output: string,
  root: string,
  contentVersion: string,
): Promise<void> {
  const openResearch = async () => {
    await page.getByRole('button', { name: /^Open field kit/ }).click();
    await page.getByRole('tab', { name: 'Research', exact: true }).click();
  };
  const save = async () => {
    const previous = (await readSlot())?.token;
    await page.getByRole('button', { name: 'Save progress', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Game saved.' }).waitFor();
    for (let n = 0; n < 100; n++) {
      const slot = await readSlot();
      if (slot && slot.token !== previous) return slot;
      await page.waitForTimeout(50);
    }
    throw new Error('Research save did not commit a new token');
  };
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await openResearch();
  const current = page.locator('.research-queue [role="status"]');
  await current.filter({ hasText: 'Current: Improvised tools' }).waitFor();
  const costs = page.locator(
    '[aria-labelledby="technology-improvised-tools"] .research-requirements',
  );
  assert(await costs.isVisible());
  assert.match(await costs.innerText(), /4 Mixed scrap.*6 s fully supplied/s);
  assert.match(
    await page.locator('.research-queue .research-requirements').first().innerText(),
    /4 Mixed scrap.*6 s field work/s,
  );
  await page.getByRole('button', { name: 'Queue Material recovery', exact: true }).click();
  const move = page.getByRole('button', { name: 'Move down: Improvised tools', exact: true });
  await page.bringToFront();
  // Queue acknowledgement is asynchronous. Focusing a still-disabled button is ignored
  // in Firefox; wait for native actionability while keeping activation keyboard-only.
  await move.click({ trial: true });
  await move.focus();
  assert(await page.evaluate(() => document.hasFocus()), 'Research page must own keyboard focus');
  assert(
    await move.evaluate((element) => element === document.activeElement),
    'Move control must own focus',
  );
  await page.keyboard.press('Enter');
  await current.filter({ hasText: 'Waiting for prerequisite technologies' }).waitFor();
  assert.equal(
    await page.locator('#queue-title').evaluate((heading) => heading === document.activeElement),
    true,
  );
  await page
    .getByRole('button', { name: 'Remove Improvised tools from queue', exact: true })
    .click();
  await page
    .locator('[aria-labelledby="technology-improvised-tools"]')
    .getByText('Progress retained; queue to resume', { exact: true })
    .waitFor();
  const removed = await save(),
    owner = removed.world.entities.find((entity) => entity.kind === 'player')!;
  assert.equal(removed.contentVersion, contentVersion);
  assert.equal(removed.runId, 'fixture-run');
  assert.deepEqual(owner.opening!.researchQueue, ['material-recovery']);
  assert.deepEqual(removed.world.resources.research['improvised-tools'], {
    consumed: { scrap: 2 },
    work: 3.5,
    unlocked: false,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await openResearch();
  await current.filter({ hasText: 'Current: Material recovery' }).waitFor();
  await page.getByRole('button', { name: 'Queue Improvised tools', exact: true }).click();
  await page.getByRole('button', { name: 'Move up: Improvised tools', exact: true }).click();
  await current.filter({ hasText: 'Current: Improvised tools' }).waitFor();
  const resumed = await save();
  assert.equal(resumed.world.resources.research['improvised-tools'].work, 3.5);
  await page.getByRole('button', { name: 'Enable field research', exact: true }).click();
  await page
    .locator('[aria-labelledby="technology-improvised-tools"]')
    .getByText('Complete', { exact: true })
    .waitFor({ timeout: 15000 });
  const finished = await save();
  assert.equal(
    await page
      .locator('.research-queue ol > li')
      .first()
      .evaluate((entry) => (entry as HTMLLIElement).value),
    1,
  );
  assert.equal(finished.world.resources.research['improvised-tools'].work, 6);
  assert.equal(finished.world.resources.research['improvised-tools'].consumed['scrap'], 4);
  assert.deepEqual(
    finished.world.entities.find((entity) => entity.kind === 'player')!.opening!.researchQueue,
    ['material-recovery'],
  );
  const bag = finished.world.entities.find((entity) => entity.kind === 'player')!.inventory!.slots;
  const stock = bag.reduce((sum, item) => sum + (item?.item === 'scrap' ? item.quantity : 0), 0);
  assert.equal(
    stock + (finished.world.resources.research['material-recovery']?.consumed['scrap'] ?? 0),
    98,
  );
  await page.getByRole('button', { name: 'Pause field research', exact: true }).click();
  await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await page.screenshot({ path: path.join(output, 'research-queue.png'), fullPage: true });
  for (const viewport of [
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
  ]) {
    await page.setViewportSize(viewport);
    const box = (await page.locator('#field-kit').boundingBox())!;
    assert(Math.abs(box.width - viewport.width / 2) < 1);
    assert(Math.abs(box.height - viewport.height / 2) < 1);
  }
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--field-kit-max-width', '60vw');
    document.documentElement.style.setProperty('--field-kit-max-height', '60dvh');
  });
  const overridden = (await page.locator('#field-kit').boundingBox())!;
  assert(Math.abs(overridden.width - 3840 * 0.6) < 1);
  assert(Math.abs(overridden.height - 2160 * 0.6) < 1);
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--field-kit-max-width');
    document.documentElement.style.removeProperty('--field-kit-max-height');
  });
  await page.setViewportSize({ width: 2560, height: 1440 });
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await page.screenshot({ path: path.join(output, 'research-large.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('Requirements and unlocks for Material recovery', { exact: true }).click();
  assert.deepEqual(await page.evaluate(async () => (await axe.run()).violations), []);
  await page.screenshot({ path: path.join(output, 'research-mobile.png'), fullPage: true });
  assert.equal(page.workers().length, 1);
  await fs.writeFile(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        passed: true,
        legacyContent: 'opening-1',
        loadedContent: removed.contentVersion,
        retainedWork: 3.5,
        completedWork: 6,
        queue: owner.opening!.researchQueue,
        runId: removed.runId,
        workers: page.workers().length,
      },
      null,
      2,
    ),
  );
  console.log(
    'Production shared research queue, M4 compatibility, retained progress, IndexedDB reload and desktop/mobile AXE passed.',
  );
}
