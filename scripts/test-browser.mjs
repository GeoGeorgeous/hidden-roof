// What the browser tests share: a game server and a headless Chromium, with
// nothing to start or set by hand. Without a URL, a Vite dev server of its own
// is started (and stopped by close()), so a test never meets a stale server.
// Chromium draws with SwiftShader. `uncapped`: frames aren't held to 60 per
// second, for tests that skip drawing (a page that draws would queue frames
// faster than SwiftShader draws them, and screenshots and closing then wait).
// On machines missing Chromium's system libraries, copies extracted to
// ~/.local/pwlibs are used (see docs/golden-paint.md).
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'vite';

export async function openTestBrowser(url, { uncapped = false } = {}) {
  let server = null;
  if (!url) {
    // Its own dependency cache, so it can run beside `npm run dev`.
    server = await createServer({ logLevel: 'error', cacheDir: 'node_modules/.vite-test', server: { port: 5180 } });
    await server.listen();
    url = server.resolvedUrls.local[0];
  }
  const libs = `${os.homedir()}/.local/pwlibs/usr/lib/x86_64-linux-gnu`;
  const env = fs.existsSync(libs) ? { ...process.env, LD_LIBRARY_PATH: [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } : undefined;
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(uncapped ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])];
  const browser = await chromium.launch({ env, args });
  if (uncapped) {
    // Uncapped or not, Chrome holds frames to about 60 a second while nothing
    // on screen changes (the paused game draws nothing): a blinking pixel in a
    // corner keeps them coming. The HUD's REC light did it until the pause
    // sheet hid the HUD.
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async (options) => {
      const page = await newPage(options);
      await page.addInitScript(keepFramesComing);
      return page;
    };
  }
  return {
    browser,
    url,
    async close() {
      await browser.close();
      await server?.close();
    },
  };
}

function keepFramesComing() {
  addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = '@keyframes keep-frames { 50% { opacity: 0.5 } } .keep-frames { position: fixed; left: 0; top: 0; width: 1px; height: 1px; background: #000; z-index: 2147483647; animation: keep-frames 1s steps(2) infinite }';
    document.head.append(style);
    document.body.append(Object.assign(document.createElement('i'), { className: 'keep-frames' }));
  });
}

/** Waits until the level is built, then `frames` frames (text atlases settle in the first ones). */
export async function gameReady(page, frames = 10) {
  await page.waitForFunction(() => window.game?.level?.solids?.length > 0);
  await page.evaluate(
    (frames) =>
      new Promise((done) => {
        let n = 0;
        const tick = () => (++n === frames ? done() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    frames,
  );
}
