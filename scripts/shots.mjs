// The real game, for visual changes: the level players get (LEVEL=name: another)
// at 1280x720 in a Chromium window drawn by the real GPU (WSLg's D3D12; GPU=Intel:
// the weak iGPU), playing at the spawn with the HUD once the lamp light is baked:
// shots/00-spawn.png, then one per STEPS step (JSON [{ js, wait, shot }]: `js`
// runs in the page, where window.game is the game, then `wait` ms). Prints the
// GPU and the HUD's performance lines. Without a display it falls back to
// SwiftShader at 640x360; on a software renderer it says so: not what players see.
// Usage: npm run shots [-- url]   (no url: starts its own server)
import fs from 'node:fs';
import { openTestBrowser, startPlaying } from './test-browser.mjs';

const out = 'shots';
fs.mkdirSync(out, { recursive: true });
const steps = JSON.parse(process.env.STEPS ?? '[]');
const test = await openTestBrowser(process.argv[2], { level: process.env.LEVEL ?? null, gpu: true });
const page = await test.browser.newPage({ viewport: test.realGpu ? { width: 1280, height: 720 } : { width: 640, height: 360 } });
const { errors } = await startPlaying(page, test.url);
await page.waitForFunction(() => window.game.baker.stats.pending === 0, null, { timeout: 120000 });
// The HUD's numbers settle (written every 250 ms).
await page.waitForTimeout(1000);
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
};
await shot('00-spawn');
let i = 1;
for (const s of steps) {
  await page.evaluate((code) => eval(code), s.js ?? '');
  await page.waitForTimeout(s.wait ?? 500);
  if (s.shot) await shot(`${String(i++).padStart(2, '0')}-${s.shot}`);
}
const gpu = await page.evaluate(() => {
  const gl = window.game.renderer.getContext();
  return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
});
// Named by what drew it: a display alone doesn't mean a GPU driver.
console.log(/swiftshader|llvmpipe|software/i.test(gpu) ? `NOT a real GPU (software): ${gpu}` : `real GPU: ${gpu}`);
console.log(await page.textContent('.perf'));
if (errors.length) console.log(errors.join('\n'));
await test.close();
process.exitCode = errors.length ? 1 : 0;
