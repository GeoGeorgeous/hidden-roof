// Headless smoke test: loads the level the game opens with (LEVELS.start, the
// one players get), plays a few frames with the debug panel open, and fails on
// page errors and console errors (shader errors among them); warnings are
// printed. Pictures of the game: npm run shots.
// Usage: node scripts/smoke.mjs [url]   (no url: starts its own server)
import { gameReady, openTestBrowser, startPlaying } from './test-browser.mjs';

const test = await openTestBrowser(process.argv[2], { level: null });
// Small: SwiftShader draws every frame on the CPU.
const page = await test.browser.newPage({ viewport: { width: 320, height: 180 } });
const { errors, warnings } = await startPlaying(page, test.url);
await page.evaluate(() => window.game.debug.toggle());
await gameReady(page, 3);
console.log([...errors, ...warnings].join('\n') || 'smoke: ok, no console errors or warnings');
await test.close();
process.exitCode = errors.length ? 1 : 0;
