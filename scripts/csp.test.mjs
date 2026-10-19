// The game under roof.hidden.haus's Content Security Policy (CSP in vite.config.ts,
// sent by vite preview as by Caddy): the start screen, the color tag, spraying,
// the hotbar icons, a download, SETTINGS, and HOST against a local server. The
// build with the dev tools runs the same game code and lets the test drive it.
// Usage: npm run test:csp (builds the game and the server first)
import { spawn } from 'node:child_process';
import { preview } from 'vite';
import { fixedFrames, freePort, gameReady, noDrawing, openTestBrowser } from './test-browser.mjs';

const PORT = await freePort();
const server = spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
process.env.WS_TARGET = `ws://localhost:${PORT}`;
const site = await preview({ build: { outDir: 'dist-dev' }, logLevel: 'error' });
const test = await openTestBrowser(site.resolvedUrls.local[0]);
const problems = [];
try {
  const page = await test.browser.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  await page.addInitScript(() => {
    window.violations = [];
    document.addEventListener('securitypolicyviolation', (e) => window.violations.push(`${e.violatedDirective}: ${e.blockedURI || e.sample}`));
  });
  // Nothing drawn: what's checked is what loads, not the picture.
  await page.addInitScript(noDrawing);
  await page.addInitScript(fixedFrames);
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  const res = await page.goto(test.url);
  if (!/script-src 'self' 'sha256-/.test(res.headers()['content-security-policy'] ?? '')) problems.push(`no inline script hash in the CSP: ${res.headers()['content-security-policy']}`);
  await gameReady(page, 2);
  // index.html's inline script ran (its hash allowed it) and started the game's files with the page.
  const preloads = await page.evaluate(() => document.querySelectorAll('link[rel="modulepreload"]').length);
  if (!preloads) problems.push('the inline script preloaded nothing');

  await page.evaluate(async () => {
    const g = window.game;
    g.inventory.addColor('red');
    g.hud.showColorTag('red', g.config.COLORS.red);
    g.input.setLocked(true);
    await frames(20, (f) => (f === 0 && g.input.button(0, true), f === 10 && g.input.button(0, false)));
    g.fixedStep.dt = 0;
    g.input.setLocked(false);
  });
  // A download the way files.ts makes one: a blob link.
  const download = page.waitForEvent('download');
  await page.evaluate(() => Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['x'])), download: 'x.txt' }).click());
  await download;

  const press = (text) => page.locator('.overlay button:visible', { hasText: text }).first().click();
  await press('Graphics');
  await press('Back');
  await press('MULTIPLAYER');
  await press('HOST A SESSION');
  await page.fill('.mp-page input >> nth=0', 'CSP');
  await press('Host');
  await page.waitForFunction(() => window.game.net.status.state === 'in', null, { timeout: 15000 });

  problems.push(...(await page.evaluate(() => window.violations)).map((v) => `CSP violation: ${v}`));
} catch (e) {
  problems.push(e.message);
} finally {
  await test.close();
  await site.close();
  server.kill();
}
console.log(problems.length ? `csp: FAILED\n${problems.join('\n')}` : 'csp: ok');
process.exit(problems.length ? 1 : 0);
