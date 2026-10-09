// Headless smoke test: loads the game, fakes pointer lock, opens the debug
// panel, runs optional STEPS (JSON: [{ js, wait, shot }]) and screenshots.
// Fails on page errors and console errors; warnings are printed. It plays the
// level the game opens with (LEVELS.start), the one players get.
// Usage: node scripts/smoke.mjs [url] [outDir]   (no url: starts its own server)
import fs from 'node:fs';
import { gameReady, openTestBrowser } from './test-browser.mjs';

const out = process.argv[3] ?? 'shots';
fs.mkdirSync(out, { recursive: true });
const steps = JSON.parse(process.env.STEPS ?? '[]');

const test = await openTestBrowser(process.argv[2], { level: null });
// Small: SwiftShader draws every frame on the CPU, and a frame at 1280x720 takes it seconds.
const page = await test.browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
const warnings = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`error: ${m.text()}`);
  else if (m.type() === 'warning') warnings.push(`warning: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(test.url);
// A few frames: each one at this size takes SwiftShader a second or more.
await gameReady(page, 3);
await page.screenshot({ path: `${out}/00-start.png` });
await page.evaluate(() => {
  const g = window.game;
  g.input.locked = true;
  g.hud.setLocked(true);
  g.debug.toggle();
});
let i = 1;
for (const s of steps) {
  await page.evaluate((code) => eval(code), s.js ?? '');
  await page.waitForTimeout(s.wait ?? 500);
  if (s.shot) await page.screenshot({ path: `${out}/${String(i++).padStart(2, '0')}-${s.shot}.png` });
}
console.log([...errors, ...warnings].join('\n') || 'no console errors or warnings');
await test.close();
process.exitCode = errors.length ? 1 : 0;
