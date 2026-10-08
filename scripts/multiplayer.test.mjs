// Multiplayer in two browser pages (two players, as a normal and an incognito
// window would be) against a local server (dist-server/server/main.js): HOST and
// JOIN through the pause menu's MULTIPLAYER page, both at the host's PAINT
// DETAIL, paint and the stepladder reaching the other player, a reload coming
// back into the session, LEAVE SESSION.
// Usage: npm run test:mp (builds the server first)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { gameReady, openTestBrowser } from './test-browser.mjs';

const PORT = 3997;
const server = spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
process.env.WS_TARGET = `ws://localhost:${PORT}`;
const test = await openTestBrowser();

/** A player in a browser context of its own (its own sessionStorage, like an incognito window). */
async function open(detail) {
  const ctx = await test.browser.newContext({ viewport: { width: 320, height: 180 } });
  // Nothing drawn (the test is about the network; SwiftShader drawing two pages is slow).
  await ctx.addInitScript(() => {
    const t = setInterval(() => window.game?.renderer && (clearInterval(t), (window.game.renderer.render = () => {})), 20);
  });
  await ctx.addInitScript((d) => localStorage.setItem('roofhiddenhaus.settings', JSON.stringify({ paintDetail: d, cityDetail: 'low' })), detail);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(test.url);
  await gameReady(page);
  page.errors = errors;
  return page;
}
const status = (page, state) => page.waitForFunction((s) => window.game.net.status.state === s, state, { timeout: 15000 });
/** Every painted surface's paint, hashed (FNV-1a), by key. */
const paintHash = (page) =>
  page.evaluate(() => {
    let h = 2166136261;
    const mix = (b) => (h = Math.imul(h ^ b, 16777619));
    for (const s of [...window.game.paint.surfaces].filter((s) => s.data).sort((a, b) => (a.key < b.key ? -1 : 1))) {
      for (const c of s.key) mix(c.charCodeAt(0));
      for (const b of s.data) mix(b);
    }
    return (h >>> 0).toString(16);
  });

try {
  const a = await open('ultra');
  const b = await open('low');
  // A hosts at MEDIUM (its own is ULTRA), B joins with the code shown in A's menu.
  const press = (page, text) => page.locator('.overlay button:visible', { hasText: text }).first().click();
  await press(a, 'MULTIPLAYER');
  await press(a, 'HOST A SESSION');
  await a.fill('.mp-page input >> nth=0', 'A');
  for (let i = 0; i < 2; i++) await press(a, '<');
  await press(a, '> HOST');
  await status(a, 'in');
  const code = (await a.textContent('.overlay .status')).match(/SESSION · ([A-Z]+)/)[1];
  assert.equal(code, await a.evaluate(() => window.game.net.status.code));
  await press(b, 'MULTIPLAYER');
  await press(b, 'JOIN A SESSION');
  await b.fill('.mp-page input >> nth=0', 'B');
  await b.fill('.mp-page input >> nth=1', code.toLowerCase());
  await press(b, '> JOIN');
  await status(b, 'in');
  assert.ok(await b.isVisible('.overlay button:has-text("LEAVE SESSION")'));
  assert.ok(!(await b.isVisible('.overlay button:has-text("LOAD PAINT")')));
  // Both play at the host's PAINT DETAIL, whatever their own.
  assert.deepEqual(await Promise.all([a, b].map((p) => p.evaluate(() => window.game.config.PAINT.texelsPerMeter))), [48, 48]);
  assert.deepEqual(await b.evaluate(() => [...window.game.net.names.values()]), ['A']);
  await a.waitForFunction(() => window.game.net.names.size === 1);

  // A paints and places its stepladder: B gets the very same paint, and the ladder.
  await a.evaluate(() => {
    const g = window.game;
    const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
    for (let i = 0; i < 20; i++) g.paint.stamp(s, { rect: 0, u: 0.2 + i * 0.03, v: 0.5 }, 0.15, 0.6, [1, 0.2, 0.1]);
    g.level.setRuntime(g.session.player, { type: 'stepladder', pos: [0, 0, 0], rot: 1 });
  });
  const painted = await paintHash(a);
  await b.waitForFunction(() => window.game.paint.surfaces.some((s) => s.data) && window.game.level.runtimeOf('player1') !== undefined, null, { timeout: 15000 });
  await b.waitForTimeout(500);
  assert.equal(await paintHash(b), painted, 'B paints what A painted');

  // B reloads: it comes back into the session as the same player, with the paint.
  await b.reload();
  await gameReady(b);
  await status(b, 'in');
  assert.equal(await b.evaluate(() => window.game.session.player), 'player2');
  assert.equal(await paintHash(b), painted, 'the paint comes back after a reload');

  // LEAVE: A hears B has gone, B plays alone at its own detail again.
  await press(b, 'LEAVE SESSION');
  await a.waitForFunction(() => window.game.net.names.size === 0, null, { timeout: 5000 });
  assert.equal(await b.evaluate(() => window.game.session.multiplayer), false);
  for (const p of [a, b]) assert.deepEqual(p.errors, []);
  console.log('multiplayer: ok');
} finally {
  await test.close();
  server.kill();
}
