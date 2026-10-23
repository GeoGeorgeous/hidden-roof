// What the multiplayer test shares: a game server on a port of its own, players in browser contexts of their own,
// and the helpers that wait for a network status or for a player's paint.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { freePort, gameReady, noBrowserLock, noDrawing, openTestBrowser } from '../test-browser.mjs';

export const PORT = await freePort();
const startServer = () => spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
let server = startServer();
process.env.WS_TARGET = `ws://localhost:${PORT}`;
const test = await openTestBrowser();

/** The server goes down, and comes back (a deploy). */
export const stopServer = () => server.kill();
export const restartServer = () => {
  server.kill();
  server = startServer();
};
/** Close the browser and stop the server. */
export async function stop() {
  await test.close();
  server.kill();
}

/** A player in a browser context of its own (its own sessionStorage, like an incognito window). */
export async function open(detail) {
  const ctx = await test.browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Nothing drawn: the test is about the network.
  await ctx.addInitScript(noDrawing);
  await ctx.addInitScript(noBrowserLock);
  // hide() and show(): as a hidden tab, no frames and document.hidden, while the socket still takes messages; the page hears it (visibilitychange).
  await ctx.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    const held = [];
    let hidden = false;
    window.requestAnimationFrame = (cb) => (hidden ? (held.push(cb), 0) : raf(cb));
    const told = () => document.dispatchEvent(new Event('visibilitychange'));
    window.hide = () => ((hidden = true), Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }), told());
    window.show = () => ((hidden = false), delete document.hidden, told(), held.splice(0).forEach((cb) => raf(cb)));
  });
  await ctx.addInitScript((d) => localStorage.setItem('roofhiddenhaus.settings', JSON.stringify({ paintDetail: d, cityDetail: 'low' })), detail);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(test.url);
  await gameReady(page);
  page.errors = errors;
  await watchStatus(page);
  return page;
}
/**
 * The page records every network status it passes through (window.statuses, oldest first, starting with the one it has
 * now): a short one, like the 1 s of "reconnecting", is seen however late the test looks. Again after a reload.
 */
export async function watchStatus(page) {
  page.heard = 0;
  await page.evaluate(() => {
    const n = window.game.net;
    const onStatus = n.onStatus;
    window.statuses = [n.status.state];
    n.onStatus = (s) => (window.statuses.push(s.state), onStatus(s));
  });
}
/**
 * Waits for the game's network status to be `state`, as it was passed through since the last wait on this page
 * (each wait takes the status it found, so the next one looks after it); timed out, says why with the page's network log.
 */
export const status = async (page, state) => {
  try {
    const found = await page.waitForFunction(([s, from]) => window.statuses.findIndex((x, i) => i >= from && x === s) + 1, [state, page.heard], { timeout: 15000, polling: 50 });
    page.heard = await found.jsonValue();
  } catch (e) {
    const seen = await page.evaluate(() => ({ status: window.game.net.status, statuses: window.statuses, log: window.game.net.log.text() })).catch(() => null);
    throw new Error(`no "${state}" in 15 s: ${JSON.stringify(seen?.status)}, passed through ${seen?.statuses?.slice(page.heard)}\n${seen?.log}\npage errors: ${page.errors ?? '(loading)'}`, { cause: e });
  }
};
/** Every painted surface's paint, hashed (FNV-1a), by key. */
export const paintHash = (page) =>
  page.evaluate(() => {
    let h = 2166136261;
    const mix = (b) => (h = Math.imul(h ^ b, 16777619));
    for (const s of [...window.game.paint.surfaces].filter((s) => s.data).sort((a, b) => (a.key < b.key ? -1 : 1))) {
      for (const c of s.key) mix(c.charCodeAt(0));
      for (const b of s.data) mix(b);
    }
    return (h >>> 0).toString(16);
  });
/** Waits until `page`'s paint hashes to `hash` (another player's strokes land when their figure gets there); fails after 10 s. */
export async function paintReaches(page, hash, what) {
  for (const until = Date.now() + 10000; Date.now() < until; ) {
    if ((await paintHash(page)) === hash) return;
    await page.waitForTimeout(100);
  }
  assert.equal(await paintHash(page), hash, what);
}

/** Click the visible button with this text. */
export const press = (page, text) => page.locator('.overlay button:visible', { hasText: text }).first().click();

/** Eight stamps of `color` on the level's first surface with several faces, on face `rect` at height `v`. */
export const stamp = (page, rect, v, color) =>
  page.evaluate(
    ([rect, v, color]) => {
      const g = window.game;
      const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
      for (let i = 0; i < 8; i++) g.paint.stamp(s, { rect, u: 0.2 + i * 0.05, v }, 0.1, 0.6, color);
    },
    [rect, v, color],
  );
