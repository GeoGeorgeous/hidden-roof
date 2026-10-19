// What the game tests share: one browser, the main page, openPage, check (with ONLY), the files popups' selectors and the summary.
import fs from 'node:fs';
import os from 'node:os';
import { fixedFrames, gameReady, noBrowserLock, noDrawing, openTestBrowser } from '../test-browser.mjs';

// Pages here don't draw (no check needs a picture), so frames can run uncapped.
const test = await openTestBrowser(process.argv[2], { uncapped: true });
export const tmp = fs.mkdtempSync(`${os.tmpdir()}/taggin-test-`);
let failed = 0;

/** A page with the game loaded, not drawing (SwiftShader draws on the CPU, seconds a frame); page errors fail the run. `before(page)`: set up before it loads (routes). */
export async function openPage(init, before, arg) {
  const page = await test.browser.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(noDrawing);
  await page.addInitScript(noBrowserLock);
  await page.addInitScript(fixedFrames);
  if (init) await page.addInitScript(init, arg);
  await before?.(page);
  await page.goto(test.url);
  await gameReady(page, 2);
  return page;
}

const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
let skipped = 0;

export async function check(name, fn) {
  if (only && !only.test(name)) return void skipped++;
  try {
    // Every check starts alike, whatever ran (or failed) before it: seeded paint randomness (spray, drips), frames on the clock.
    // Inside the try: a page a failed check left without a game fails this check too, not the whole run.
    if (!page.isClosed())
      await page.evaluate(() => {
        const g = window.game;
        g.seedPaintRandom(1);
        Object.assign(g.fixedStep, { dt: 0, script: null });
      });
    const problem = await fn();
    if (problem) throw new Error(problem);
    console.log(`ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message.split('\n')[0]}`);
  }
}

/** A failure that isn't a check's own (page errors). */
export const fail = (message) => {
  failed++;
  console.log(`FAIL  ${message}`);
};

/** The pause screen's SAVE and UPLOAD. */
export const SAVE = '.overlay .item:text-is("Save")';
export const UPLOAD = '.overlay .item:text-is("Upload")';
/** The popup that's open. */
export const POPUP = '.popup-page:not([hidden])';
/** Paint one dot on surface `i` (the pause menu stays up). */
export const dot = (page, i = 0) => page.evaluate((i) => window.game.paint.stamp(window.game.paint.surfaces[i], { rect: 0, u: 0.5, v: 0.5 }, 0.1, 1, [1, 0, 0]), i);
export const paintedKeys = (page) => page.evaluate(() => window.game.paint.surfaces.filter((s) => s.data).map((s) => s.key).sort().join());

/** The page most checks share. */
export const page = await openPage();
// Started and paused: the menu shows SAVE PAINT.
await page.evaluate(() => (window.game.input.setLocked(true), window.game.input.setLocked(false)));

/** Close the browser and print the summary; the exit code says whether any check failed. */
export async function finish() {
  await test.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${failed ? `game tests: FAILED (${failed})` : 'game tests: all ok'}${skipped ? ` (${skipped} skipped: ONLY=${process.env.ONLY})` : ''}`);
  process.exitCode = failed ? 1 : 0;
}
