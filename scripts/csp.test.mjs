// The game under roof.hidden.haus's Content Security Policy (CSP in vite.config.ts,
// sent by vite preview as by Caddy): the start screen, the color tag, spraying,
// the hotbar icons, a download, SETTINGS, the Multiplayer page's server list, and HOST against a local server (through
// the page: players can't HOST from the menu). The build with the dev tools runs the same game code and lets the test
// drive it. Also the site's own files as the build writes them: the sitemap, dateModified, the IndexNow key.
// Usage: npm run test:csp (builds the game and the server first)
import { execSync, spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { SITE, UPDATES } from '../src/links.ts';
import { preview } from 'vite';
import { hostSession } from './lobby-ui.mjs';
import { fixedFrames, freePort, gameReady, noDrawing, openTestBrowser } from './test-browser.mjs';

const PORT = await freePort();
const server = spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(PORT), PLAYER_HOST: '1' }, stdio: ['ignore', 'ignore', 'inherit'] });
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
  // The sitemap: each page's lastmod the day its source last changed in git, and index.html's dateModified its
  // lastmod (vite.config.ts); the IndexNow key served where scripts/indexnow.mjs says it is.
  const get = (path) => fetch(new URL(path, test.url)).then((r) => r.text());
  const changed = (path) => execSync(`git log -1 --format=%cs -- '${path}'`).toString().trim();
  const sitemap = [...(await get('/sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((m) => `${m[1]} ${m[2]}`);
  const expected = [`${SITE}/ ${changed('index.html')}`, `${SITE}${UPDATES} ${changed('docs/releases/v*.md')}`];
  if (sitemap.join() !== expected.join()) problems.push(`sitemap: ${sitemap.join(', ')}, not ${expected.join(', ')}`);
  const modified = (await get('/')).match(/"dateModified": "([^"]+)"/)?.[1];
  if (modified !== changed('index.html')) problems.push(`index.html's dateModified ${modified}, not ${changed('index.html')}`);
  const key = readdirSync('public').find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (!key || (await get(`/${key}`)) !== readFileSync(`public/${key}`, 'utf8')) problems.push(`the IndexNow key isn't served: ${key}`);

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
  // The server list is fetched from the page's own address (connect-src 'self'); no session yet.
  await press('MULTIPLAYER');
  await page.waitForSelector('.mp-page .lobby-note');
  await press('Back');
  await hostSession(page, 'CSP');
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
