// What the browser tests share: a game server and a headless Chromium, with
// nothing to start or set by hand. Without a URL, a Vite dev server of its own
// is started (and stopped by close()), so a test never meets a stale server.
// Chromium draws with SwiftShader. `uncapped`: frames aren't held to 60 per
// second, for tests that skip drawing (a page that draws would queue frames
// faster than SwiftShader draws them, and screenshots and closing then wait).
// `gpu`: a headed window drawn by the real GPU instead (npm run shots), through
// WSLg's D3D12 (GPU=Intel picks the weak one); without a display, SwiftShader.
// On machines missing Chromium's system libraries, copies extracted to
// ~/.local/pwlibs are used (see docs/testing.md). The tests play the demo
// level, whose layout they know (`level`: another, or null for LEVELS.start),
// in windows of any size (?force=1: no small-screen gate, src/boot.ts).
// `flags`: more Chromium switches (the boot test turns WebGL off).
// Several agents may test at once: servers take free ports (freePort).
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { chromium } from 'playwright';
import { createLogger, createServer } from 'vite';

const WSL_GPU = '/usr/lib/wsl/lib';

export async function openTestBrowser(url, { uncapped = false, level = 'demo', gpu = false, flags = [] } = {}) {
  let server = null;
  if (!url) {
    // Its own dependency cache, so it can run beside `npm run dev`; in the worktree, not node_modules: worktrees
    // link node_modules in, and servers sharing a cache swap its files under each other. The /ws proxy's errors
    // aren't printed: the multiplayer test stops its game server on purpose.
    const logger = createLogger('error');
    const error = logger.error;
    logger.error = (msg, options) => !msg.includes('proxy error') && error(msg, options);
    server = await createServer({ customLogger: logger, cacheDir: '.cache/vite-test', server: { port: 5180 } });
    await server.listen();
    url = server.resolvedUrls.local[0];
  }
  // force: the game loads in the tests' small windows too (src/boot.ts).
  url += `?force=1${level ? `&level=${level}` : ''}`;
  const real = gpu && Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  const libs = [`${os.homedir()}/.local/pwlibs/usr/lib/x86_64-linux-gnu`, ...(real ? [WSL_GPU] : [])].filter((d) => fs.existsSync(d));
  const path = [...libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  const env = { ...process.env, ...(path && { LD_LIBRARY_PATH: path }) };
  if (real && fs.existsSync(WSL_GPU)) Object.assign(env, { GALLIUM_DRIVER: 'd3d12', MESA_D3D12_DEFAULT_ADAPTER_NAME: process.env.GPU ?? 'NVIDIA' });
  const args = real
    ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu', '--window-position=-3000,0']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(uncapped ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])];
  const browser = await chromium.launch({ env, args: [...args, ...flags], headless: !real });
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
  // Pages get 2 min to load (a reload too): Playwright's own 30 s is short for SwiftShader on a slow CI runner.
  const open = browser.newPage.bind(browser);
  browser.newPage = async (options) => {
    const page = await open(options);
    page.setDefaultNavigationTimeout(120_000);
    return page;
  };
  const context = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const c = await context(options);
    c.setDefaultNavigationTimeout(120_000);
    return c;
  };
  return {
    browser,
    url,
    /** Drawn by the real GPU (`gpu` and a display), not SwiftShader. */
    realGpu: real,
    async close() {
      await browser.close();
      await server?.close();
    },
  };
}

/** An init script for a page that needs no picture: the game draws nothing from its first frame (SwiftShader draws on the CPU). */
export function noDrawing() {
  const t = setInterval(() => window.game?.renderer && (clearInterval(t), (window.game.renderer.render = () => {})), 20);
}

/**
 * An init script: the browser's pointer lock and fullscreen do nothing. Tests start play with Input.setLocked; a real
 * lock (a resume from a check's Enter or click runs as a user gesture) came and went late and unlocked later checks.
 */
export function noBrowserLock() {
  Element.prototype.requestPointerLock = () => Promise.resolve();
  Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('tests start play with Input.setLocked', 'NotAllowedError'));
}

function keepFramesComing() {
  addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = '@keyframes keep-frames { 50% { opacity: 0.5 } } .keep-frames { position: fixed; left: 0; top: 0; width: 1px; height: 1px; background: #000; z-index: 2147483647; animation: keep-frames 1s steps(2) infinite }';
    document.head.append(style);
    document.body.append(Object.assign(document.createElement('i'), { className: 'keep-frames' }));
  });
}

/** Loads the game in `page` and plays (pointer lock faked, the HUD up); returns the page's errors and warnings as they come. */
export async function startPlaying(page, url) {
  const errors = [];
  const warnings = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`error: ${m.text()}`);
    else if (m.type() === 'warning') warnings.push(`warning: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url);
  await gameReady(page, 3);
  await page.evaluate(() => {
    const g = window.game;
    g.input.setLocked(true);
  });
  return { errors, warnings };
}

/** A port nothing listens on, for a test's own game server. */
export function freePort() {
  return new Promise((done) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => done(port));
    });
  });
}

/** Waits until the game has loaded (slow while other tests share the CPU), then `frames` frames (text atlases settle in the first ones). */
export async function gameReady(page, frames = 10) {
  await page.waitForFunction(() => window.game?.loaded(), null, { timeout: 120000 });
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
