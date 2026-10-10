// Headless smoke test: loads the level the game opens with (LEVELS.start, the
// one players get), plays a few frames with the debug panel open, and fails on
// page errors and console errors (shader errors among them); warnings are
// printed. Pictures of the game: npm run shots.
// Usage: node scripts/smoke.mjs [url]   (no url: starts its own server)
import { gameReady, openTestBrowser } from './test-browser.mjs';

const test = await openTestBrowser(process.argv[2], { level: null });
// Small: SwiftShader draws every frame on the CPU.
const page = await test.browser.newPage({ viewport: { width: 320, height: 180 } });
const errors = [];
const warnings = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`error: ${m.text()}`);
  else if (m.type() === 'warning') warnings.push(`warning: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(test.url);
await gameReady(page, 3);
await page.evaluate(() => {
  const g = window.game;
  g.input.locked = true;
  g.hud.setLocked(true);
  g.debug.toggle();
});
await gameReady(page, 3);
console.log([...errors, ...warnings].join('\n') || 'smoke: ok, no console errors or warnings');
await test.close();
process.exitCode = errors.length ? 1 : 0;
