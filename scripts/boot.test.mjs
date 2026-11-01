// When the game can't start, the page about the game shows in its place and
// says why, instead of Loading forever (src/boot.ts): in a browser with WebGL
// turned off, and when a file of the game doesn't load. Fast: the game fails at
// its start, nothing is built.
import { openTestBrowser } from './test-browser.mjs';

/** What the page about the game says once it shows in place of the game (15 s at most). */
const said = (page) =>
  page
    .waitForFunction(() => !document.documentElement.classList.contains('game') && getComputedStyle(document.querySelector('.about')).display !== 'none' && !document.querySelector('.about .failed').hidden, null, { timeout: 15_000 })
    .then(() => page.textContent('.about .failed'), () => 'nothing, still loading after 15 s');
const failures = [];

const noWebgl = await openTestBrowser(undefined, { flags: ['--disable-3d-apis'] });
let page = await noWebgl.browser.newPage({ viewport: { width: 320, height: 180 } });
await page.goto(noWebgl.url);
const noGl = await said(page);
if (!/WebGL/.test(noGl)) failures.push(`no WebGL: the page says "${noGl}"`);
await noWebgl.close();

const blocked = await openTestBrowser();
page = await blocked.browser.newPage({ viewport: { width: 320, height: 180 } });
await page.route(/\/src\/main\.ts/, (route) => route.abort());
await page.goto(blocked.url);
const noFile = await said(page);
if (!/didn't load/.test(noFile)) failures.push(`a file that doesn't load: the page says "${noFile}"`);
await blocked.close();

console.log(failures.join('\n') || `boot: ok ("${noGl}"; "${noFile}")`);
process.exitCode = failures.length ? 1 : 0;
