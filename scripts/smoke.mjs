// Headless smoke test: loads the game, fakes pointer lock, sprays, screenshots.
// Usage: node scripts/smoke.mjs [url] [outDir]   (run `npm run dev` first)
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots';
await import('node:fs').then((fs) => fs.mkdirSync(out, { recursive: true }));
const steps = JSON.parse(process.env.STEPS ?? '[]');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/00-start.png` });
await page.evaluate(() => {
  const g = window.game;
  g.input.locked = true;
  g.hud.setLocked(true);
  g.hud.toggleDebug();
});
let i = 1;
for (const s of steps) {
  await page.evaluate((code) => eval(code), s.js ?? '');
  await page.waitForTimeout(s.wait ?? 500);
  if (s.shot) await page.screenshot({ path: `${out}/${String(i++).padStart(2, '0')}-${s.shot}.png` });
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
