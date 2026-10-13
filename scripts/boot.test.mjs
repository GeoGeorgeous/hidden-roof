// The loading screen says why when the game can't start, instead of Loading
// forever (src/boot.ts): in a browser with WebGL turned off, and when a file of
// the game doesn't load. Fast: the game fails at its start, nothing is built.
import { openTestBrowser } from './test-browser.mjs';

/** What the loading screen says once it stops saying Loading (15 s at most). */
const said = (page) =>
  page
    .waitForFunction(() => document.querySelector('.loading span.on')?.textContent !== 'Loading', null, { timeout: 15_000 })
    .then(() => page.textContent('.loading span.on'), () => 'Loading, still after 15 s');
const failures = [];

const noWebgl = await openTestBrowser(undefined, { flags: ['--disable-3d-apis'] });
let page = await noWebgl.browser.newPage({ viewport: { width: 320, height: 180 } });
await page.goto(noWebgl.url);
const noGl = await said(page);
if (!/WebGL/.test(noGl)) failures.push(`no WebGL: the screen says "${noGl}"`);
await noWebgl.close();

const blocked = await openTestBrowser();
page = await blocked.browser.newPage({ viewport: { width: 320, height: 180 } });
await page.route(/\/src\/main\.ts/, (route) => route.abort());
await page.goto(blocked.url);
const noFile = await said(page);
if (!/didn't load/.test(noFile)) failures.push(`a file that doesn't load: the screen says "${noFile}"`);
await blocked.close();

console.log(failures.join('\n') || `boot: ok ("${noGl}"; "${noFile}")`);
process.exitCode = failures.length ? 1 : 0;
