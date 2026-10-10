// Headless smoke test: loads the level the game opens with (LEVELS.start, the
// one players get), plays a few frames with the debug panel open, and fails on
// page errors and console errors (shader errors among them), and when turning
// on volumetrics or rain compiles a shader; warnings are printed. Pictures of the game: npm run shots.
// Usage: node scripts/smoke.mjs [url]   (no url: starts its own server)
import { gameReady, openTestBrowser, startPlaying } from './test-browser.mjs';

const test = await openTestBrowser(process.argv[2], { level: null });
// Small: SwiftShader draws every frame on the CPU.
const page = await test.browser.newPage({ viewport: { width: 320, height: 180 } });
const { errors, warnings } = await startPlaying(page, test.url);
await page.evaluate(() => window.game.debug.toggle());
await gameReady(page, 3);
// What settings turn on (volumetrics, rain) was compiled at load (render/post.ts warm): turned on
// while playing, it compiles nothing (a stall of up to seconds on Windows).
const compiled = await page.evaluate(async () => {
  const g = window.game;
  const before = g.renderer.info.programs.length;
  g.config.VOLUMETRICS.enabled = g.config.ATMOS.rain = true;
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  return g.renderer.info.programs.length - before;
});
if (compiled) errors.push(`error: turning on volumetrics and rain compiled ${compiled} shaders while playing`);
console.log([...errors, ...warnings].join('\n') || 'smoke: ok, no console errors or warnings');
await test.close();
process.exitCode = errors.length ? 1 : 0;
