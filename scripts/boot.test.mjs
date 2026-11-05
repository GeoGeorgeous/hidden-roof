// When the game can't start, the page about the game shows in its place and
// says why, instead of Loading forever (src/boot.ts): in a browser with WebGL
// turned off, and when a file of the game doesn't load. Fast: the game fails at
// its start, nothing is built. Each load also says what it came to, once a file
// of the game failed too; ?force doesn't count (the marks of the site's traffic).
import { openTestBrowser } from './test-browser.mjs';

/** What the page about the game says once it shows in place of the game (15 s at most). */
const said = (page) =>
  page
    .waitForFunction(() => !document.documentElement.classList.contains('game') && getComputedStyle(document.querySelector('.about')).display !== 'none' && !document.querySelector('.about .failed').hidden, null, { timeout: 15_000 })
    .then(() => page.textContent('.about .failed'), () => 'nothing, still loading after 15 s');
const failures = [];

/** `url` opened in `page` and the marks it sent, `n` of them expected. */
async function marks(page, url, n) {
  const seen = [];
  page.on('request', (q) => q.url().includes('/mark.txt') && seen.push(new URL(q.url()).search));
  await page.goto(url);
  for (let i = 0; i < 200 && seen.length < n; i++) await page.waitForTimeout(50);
  await page.waitForTimeout(200);
  return seen.join(' ');
}
const expect = (what, got, wanted) => got === wanted || failures.push(`${what}: marks "${got}", not "${wanted}"`);

const noWebgl = await openTestBrowser(undefined, { flags: ['--disable-3d-apis'] });
let page = await noWebgl.browser.newPage({ viewport: { width: 320, height: 180 } });
await page.goto(noWebgl.url);
const noGl = await said(page);
if (!/WebGL/.test(noGl)) failures.push(`no WebGL: the page says "${noGl}"`);
page = await noWebgl.browser.newPage({ viewport: { width: 1280, height: 720 } });
expect('no WebGL', await marks(page, new URL(noWebgl.url).origin, 2), '?m=game ?m=noWebgl');
await noWebgl.close();

const blocked = await openTestBrowser();
page = await blocked.browser.newPage({ viewport: { width: 320, height: 180 } });
await page.route(/\/src\/main\.ts/, (route) => route.abort());
await page.goto(blocked.url);
const noFile = await said(page);
if (!/didn't load/.test(noFile)) failures.push(`a file that doesn't load: the page says "${noFile}"`);
const site = new URL(blocked.url).origin;
page = await blocked.browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route(/\/src\/main\.ts/, (route) => route.abort());
expect('a file that does not load', await marks(page, site, 2), '?m=game ?m=loadFailed');
expect('?force', await marks(await blocked.browser.newPage({ viewport: { width: 320, height: 180 } }), blocked.url, 0), '');
expect('a small window', await marks(await blocked.browser.newPage({ viewport: { width: 320, height: 180 } }), site, 1), '?m=smallWindow');
const phone = await blocked.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
expect('a phone', await marks(await phone.newPage(), site, 1), '?m=noMouse');
await blocked.close();

console.log(failures.join('\n') || `boot: ok ("${noGl}"; "${noFile}")`);
process.exitCode = failures.length ? 1 : 0;
