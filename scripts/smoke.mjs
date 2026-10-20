// Headless smoke test: loads the level the game opens with (LEVELS.start, the
// one players get), plays a few frames with the debug panel open, and fails on
// page errors and console errors (shader errors among them), when a shader compiles
// once the game has drawn (the loading screen's warm-up missed it), and when turning
// on volumetrics or rain compiles a shader; warnings are printed. Pictures of the game: npm run shots.
// Usage: node scripts/smoke.mjs [url]   (no url: starts its own server)
import { gameReady, openTestBrowser, startPlaying } from './test-browser.mjs';

const test = await openTestBrowser(process.argv[2], { level: null });
// Small: SwiftShader draws every frame on the CPU.
const page = await test.browser.newPage({ viewport: { width: 320, height: 180 } });
// Every shader should be compiled before the first draw call (render/post.ts warm): one linked later stalls a frame.
await page.addInitScript(() => {
  const gl = WebGL2RenderingContext.prototype;
  let drawn = false;
  window.lateLinks = 0;
  for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const draw = gl[k];
    gl[k] = function (...a) {
      drawn = true;
      return draw.apply(this, a);
    };
  }
  const link = gl.linkProgram;
  gl.linkProgram = function (p) {
    if (drawn) window.lateLinks++;
    return link.call(this, p);
  };
});
const { errors, warnings } = await startPlaying(page, test.url);
await page.evaluate(() => window.game.debug.toggle());
await gameReady(page, 3);
const late = await page.evaluate(() => window.lateLinks);
if (late) errors.push(`error: ${late} shaders compiled after the first draw call (the load should compile them)`);
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
