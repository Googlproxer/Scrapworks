/** Assemble the Blender GLB previews with the existing Playwright runtime. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { projectRoot } from '../scenes/inventory.ts';

interface Shot {
  file: string;
  clip: string;
  frame: number;
  camera_degrees: number;
}

function isShot(value: unknown): value is Shot {
  if (!value || typeof value !== 'object') return false;
  return (
    'file' in value &&
    typeof value.file === 'string' &&
    'clip' in value &&
    typeof value.clip === 'string' &&
    'frame' in value &&
    typeof value.frame === 'number' &&
    'camera_degrees' in value &&
    typeof value.camera_degrees === 'number'
  );
}

const directory = path.resolve(projectRoot, process.argv[2] ?? 'art/characters/Protag/v3/runtime');
const parsed: unknown = JSON.parse(
  await fs.readFile(path.join(directory, 'previews/index.json'), 'utf8'),
);
if (!Array.isArray(parsed)) throw new Error('Preview index must be an array');
const entries: unknown[] = parsed;
if (!entries.every(isShot)) throw new Error('Invalid preview index entry');
const frames = await Promise.all(
  entries.map(async (shot) => ({
    ...shot,
    image: (await fs.readFile(path.join(directory, 'previews', shot.file))).toString('base64'),
  })),
);
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8">
    <style>
      *{box-sizing:border-box}body{margin:0;width:1440px;background:#17202b;color:#f2f4f7;font-family:'Segoe UI',sans-serif}
      header{height:102px;padding:14px 24px}h1{font-size:30px;margin:0 0 10px}p{font-size:20px;color:#b5c4d5;margin:0}
      main{display:grid;grid-template-columns:repeat(4,360px)}figure{margin:0;height:518px}
      img{display:block;width:360px;height:480px}figcaption{font-size:19px;padding:6px 12px}
    </style><header><h1>SCRAPWORKS / protagonist runtime v3</h1>
    <p>Actual GLB reimport: full mesh, idle views, walk and run phases.</p></header>
    <main>${frames
      .map(
        (
          shot,
        ) => `<figure><img alt="${escape(shot.clip)}" src="data:image/png;base64,${shot.image}">
      <figcaption>${escape(shot.clip)} / frame ${shot.frame} / view ${shot.camera_degrees}°</figcaption></figure>`,
      )
      .join('')}</main></html>`);
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete && image.naturalWidth > 0),
  );
  await page.evaluate(() => document.fonts.ready);
  const output = path.join(directory, 'animation-contact-sheet.png');
  await page.screenshot({ path: output, fullPage: true });
  console.log(output);
} finally {
  await browser.close();
}
