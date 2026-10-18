// Multiplayer in two browser pages (two players, as a normal and an incognito
// window would be) against a local server (dist-server/server/main.js): HOST and
// JOIN through the pause menu's MULTIPLAYER page, both at the host's PAINT
// DETAIL, paint and the stepladder reaching the other player, a reload coming
// back into the session, paint while hidden, one that heard nothing for a while reconnecting, LEAVE
// SESSION, one already playing the session's level starting it over, a message it can't handle ending its session as
// broken, and a server restart ending the session.
// Usage: npm run test:mp (builds the server first)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { freePort, gameReady, noBrowserLock, noDrawing, openTestBrowser } from './test-browser.mjs';

const PORT = await freePort();
const startServer = () => spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
let server = startServer();
process.env.WS_TARGET = `ws://localhost:${PORT}`;
const test = await openTestBrowser();

/** A player in a browser context of its own (its own sessionStorage, like an incognito window). */
async function open(detail) {
  const ctx = await test.browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Nothing drawn: the test is about the network.
  await ctx.addInitScript(noDrawing);
  await ctx.addInitScript(noBrowserLock);
  // hide() and show(): as a hidden tab, no frames and document.hidden, while the socket still takes messages.
  await ctx.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    const held = [];
    let hidden = false;
    window.requestAnimationFrame = (cb) => (hidden ? (held.push(cb), 0) : raf(cb));
    window.hide = () => ((hidden = true), Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }));
    window.show = () => ((hidden = false), delete document.hidden, held.splice(0).forEach((cb) => raf(cb)));
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
/** Waits for the game's network status; timed out, says why with the page's network log. */
const status = (page, state) =>
  page.waitForFunction((s) => window.game.net.status.state === s, state, { timeout: 15000 }).catch(async (e) => {
    const seen = await page.evaluate(() => ({ status: window.game.net.status, log: window.game.net.log.text() })).catch(() => null);
    throw new Error(`no "${state}" in 15 s: ${JSON.stringify(seen?.status)}\n${seen?.log}\npage errors: ${page.errors ?? '(loading)'}`, { cause: e });
  });
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
  for (let i = 0; i < 2; i++) await a.click('.mp-page .choice button:text-is("‹") >> nth=0');
  // A was recording a ghost (F3, dev builds): the session stops it, and its frames go on (it used to put paint.log
  // back to null after the welcome, so every frame threw).
  await a.evaluate(() => window.game.ghost.record());
  await press(a, 'Host');
  await status(a, 'in');
  await a.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.deepEqual(a.errors, [], 'a ghost recording before HOST breaks no frame');
  const code = (await a.textContent('.overlay .status')).match(/Session · ([A-Z]+)/)[1];
  assert.equal(code, await a.evaluate(() => window.game.net.status.code));
  await press(b, 'MULTIPLAYER');
  await press(b, 'JOIN A SESSION');
  await b.fill('.mp-page input >> nth=0', 'B');
  await b.fill('.mp-page input >> nth=1', code.toLowerCase());
  await press(b, 'Join');
  await status(b, 'in');
  assert.ok(await b.isVisible('.overlay .start button:text-is("Leave session")'));
  assert.ok(!(await b.isVisible('.overlay .item:text-is("Upload")')));
  // Both play at the host's PAINT DETAIL, whatever their own; B's settings show it as the host's, its arrows doing nothing.
  assert.deepEqual(await Promise.all([a, b].map((p) => p.evaluate(() => window.game.config.PAINT.texelsPerMeter))), [48, 48]);
  const detail = await b.evaluate(() => {
    window.game.hud.menu.openSettings('Graphics');
    const row = [...document.querySelectorAll('.settings-page .setting-row')].find((r) => r.querySelector('.label').textContent.startsWith('Paint detail'));
    row.querySelector('.choice button').click();
    const shown = [row.querySelector('.choice .value').textContent, row.querySelector('.choice').classList.contains('locked')];
    window.game.hud.menu.openPage(null);
    return shown;
  });
  assert.deepEqual(detail, ['Medium  2.1 cm  (host)', true]);
  // SAVE in a session: the popup downloads the session's paint, packed by the server.
  const got = b.waitForEvent('download');
  await b.click('.overlay .item:text-is("Save")');
  assert.equal(await b.textContent('.popup-page:not([hidden]) .chip span'), 'from the session');
  await b.click('.popup-page:not([hidden]) .btn.primary');
  assert.match((await got).suggestedFilename(), /^demo-\d{8}-\d{6}\.rhhpaint$/);
  await b.waitForSelector('.popup-page:not([hidden]) .para.done');
  await b.evaluate(() => window.game.hud.menu.openPage(null));
  assert.deepEqual(await b.evaluate(() => [...window.game.net.names.values()]), ['A']);
  await a.waitForFunction(() => window.game.net.names.size === 1);
  // The HUD's network lines: a ping, and how far behind B is shown.
  await a.waitForFunction(() => window.game.net.stats?.ping !== null && window.game.net.stats.players[0]?.delay > 0, null, { timeout: 10000 });

  // A paints and places its stepladder: B gets the very same paint, and the ladder.
  await a.evaluate(() => {
    const g = window.game;
    const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
    for (let i = 0; i < 20; i++) g.paint.stamp(s, { rect: 0, u: 0.2 + i * 0.03, v: 0.5 }, 0.15, 0.6, [1, 0.2, 0.1]);
    g.level.setRuntime(g.session.player, { type: 'stepladder', pos: [0, 0, 0], rot: 1 });
  });
  let painted = await paintHash(a);
  await b.waitForFunction(() => window.game.paint.surfaces.some((s) => s.data) && window.game.level.runtimeOf('player1') !== undefined, null, { timeout: 15000 });
  await b.waitForTimeout(500);
  assert.equal(await paintHash(b), painted, 'B paints what A painted');

  // B's game is hidden: what A paints meanwhile is painted at once, not queued until B is shown again (all of a long
  // absence, landing in one frame).
  await b.evaluate(() => window.hide());
  const hidden = await paintHash(b);
  await a.evaluate(() => {
    const g = window.game;
    const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
    for (let i = 0; i < 10; i++) g.paint.stamp(s, { rect: 1, u: 0.2 + i * 0.05, v: 0.5 }, 0.1, 0.3, [0.1, 0.2, 1]);
  });
  // Polled on a timer: a hidden page runs no frames.
  await b.waitForFunction(() => window.game.paint.surfaces.some((s) => s.dirty.length), null, { timeout: 5000, polling: 100 });
  assert.notEqual(await paintHash(b), hidden, 'B paints what A paints while B is hidden');
  assert.equal(await b.evaluate(() => [...window.game.net.remotes.list.values()][0].events.length), 0, 'nothing waits for B to be shown');
  await b.evaluate(() => window.show());
  await b.waitForTimeout(500);
  painted = await paintHash(a);
  assert.equal(await paintHash(b), painted, 'B, shown again, has the paint A has');

  // B finds the marker and reloads: it comes back into the session as the same player, with the paint and the marker.
  await b.evaluate(() => window.game.inventory.give('marker'));
  // The game sends what it carries on its next frame: wait for that, not a fixed time (SwiftShader draws ~6 frames a second here).
  await b.waitForFunction(() => window.game.net.carried === window.game.inventory.version, null, { timeout: 5000, polling: 50 });
  await b.reload();
  await gameReady(b);
  await status(b, 'in');
  assert.equal(await b.evaluate(() => window.game.session.player), 'player2');
  assert.equal(await paintHash(b), painted, 'the paint comes back after a reload');
  assert.ok(await b.evaluate(() => window.game.inventory.has('marker')), 'what B carried comes back after a reload');
  // A saw B go and come back.
  await a.waitForFunction(() => /#2 "B" dropped[^]*#2 "B" here/.test(window.game.net.log.text()), null, { timeout: 5000 });

  // B hears nothing for a while (a big download ahead of everything else used to do that): it closes the link and
  // comes back in, though the last thing it heard is now long ago. Its link drops what comes in, or A's next snapshot
  // would count as heard before B's next frame looked.
  // One of B's frames throws first: the game goes on (it used to stop for good, its check for silence with it).
  await b.evaluate(() => {
    const hud = window.game.hud;
    const setPerf = hud.setPerf;
    hud.setPerf = () => ((hud.setPerf = setPerf), (window.threw = true), null.frame);
  });
  await b.waitForFunction(() => window.threw, null, { timeout: 5000, polling: 50 });
  assert.match(b.errors.pop() ?? '', /null/);
  await b.evaluate(() => ((window.game.net.link.socket.onmessage = null), (window.game.net.link.lastHeard = -1e9)));
  await status(b, 'reconnecting');
  await status(b, 'in');
  assert.equal(await paintHash(b), painted, 'the paint comes back after a reconnect');

  // LEAVE: A hears B has gone, B plays alone at its own detail again.
  await press(b, 'LEAVE SESSION');
  await a.waitForFunction(() => window.game.net.names.size === 0, null, { timeout: 5000 });
  assert.equal(await b.evaluate(() => window.game.session.multiplayer), false);

  // B joins again, and its welcome takes 5 s to load (a big save at ULTRA): A's snapshots wait behind it, and A is
  // still shown at once, with a black name tag over its head.
  await b.evaluate(() => {
    const n = window.game.net;
    const welcome = n.welcome.bind(n);
    n.welcome = async (...args) => (await new Promise((r) => setTimeout(r, 5000)), welcome(...args));
  });
  await b.evaluate((c) => window.game.net.join('B', c), code);
  await status(b, 'in');
  await b.waitForFunction(() => [...window.game.net.remotes.list.values()][0]?.avatar.group.visible, null, { timeout: 2000 });
  assert.equal(await b.textContent('.nameplate'), 'A');
  await b.evaluate(() => window.game.net.leave());

  // C plays the same level at the session's PAINT DETAIL: its welcome starts that level over rather than building it
  // again (seconds with its lights and shaders, BL-085). What it placed and found alone is gone, it stands at the
  // spawn, and it has the session's paint.
  const c = await open('medium');
  await c.evaluate(() => {
    const g = window.game;
    g.level.setRuntime(g.session.player, { type: 'stepladder', pos: [2, 0, 2], rot: 0 });
    g.inventory.give('marker');
    g.player.position.set(5, 3, 5);
    window.kept = g.level.builtProps[0];
  });
  await c.evaluate((code) => window.game.net.join('C', code), code);
  await status(c, 'in');
  const restarted = await c.evaluate(() => {
    const g = window.game;
    const [x, y, z] = g.levelData().spawn.pos;
    return { kept: g.level.builtProps[0] === window.kept, ladder: g.level.runtimeOf('local') ?? null, marker: g.inventory.has('marker'), fromSpawn: Math.round(Math.hypot(g.player.position.x - x, g.player.position.z - z)) };
  });
  assert.deepEqual(restarted, { kept: true, ladder: null, marker: false, fromSpawn: 0 });
  assert.equal(await paintHash(c), await paintHash(a), 'C has the session paint');

  // A message C's game can't handle ends its session as broken, with the error in the log; not "a new version is out".
  await c.evaluate(() => (window.game.net.remotes.get = () => null.state));
  await c.waitForFunction(() => window.game.net.status.state === 'failed', null, { timeout: 5000 });
  assert.equal(await c.evaluate(() => window.game.net.status.reason), 'broken');
  assert.match(await c.evaluate(() => window.game.hud.menu.message), /The game hit an error in the session/);
  assert.match(await c.evaluate(() => window.game.net.log.text()), /couldn't handle state: TypeError/);
  await a.waitForFunction(() => window.game.net.names.size === 0, null, { timeout: 5000 });

  // The server restarts (a deploy): A's game reconnects, finds its session gone, and says the session has ended.
  server.kill();
  server = startServer();
  await a.waitForFunction(() => window.game.net.status.state === 'failed' && window.game.net.status.reason === 'ended', null, { timeout: 15000 });
  assert.equal(await a.evaluate(() => window.game.session.multiplayer), false);
  // The MULTIPLAYER page keeps saying it (the menu's status line only for a few seconds).
  assert.match(await a.textContent('.mp-page .mp-status'), /The session has ended/);

  // No server: the game asks over HTTP why it can't connect, and says the server is down.
  server.kill();
  const failed = async () => {
    await a.waitForFunction(() => window.game.net.status.state === 'failed', null, { timeout: 15000 });
    return a.evaluate(() => window.game.net.status);
  };
  await a.evaluate(() => window.game.net.host('A', 48));
  const down = await failed();
  assert.equal(down.reason, 'server-down', JSON.stringify(down));
  assert.match(await a.textContent('.mp-page .mp-status'), /The game server is down \(HTTP 5\d\d · WS \d+\)/);
  // A server that takes the connection and never answers: the game gives up after NET.connectTimeout.
  const held = new Set();
  const silent = net.createServer((socket) => held.add(socket)).listen(PORT);
  await a.evaluate(() => ((window.game.config.NET.connectTimeout = 1), window.game.net.host('A', 48)));
  assert.equal((await failed()).reason, 'timeout');
  // Its connections too, or they'd keep this process running.
  for (const socket of held) socket.destroy();
  silent.close();
  // All of it is in the network log the menu copies.
  const log = await a.evaluate(() => window.game.net.log.text());
  for (const seen of ['connecting to ws://', 'in session', 'closed: ', 'asked the server over HTTP: server-down', 'nothing from the server in 1 s', 'status: failed timeout']) assert.ok(log.includes(seen), `the log has "${seen}"`);
  for (const p of [a, b, c]) assert.deepEqual(p.errors, []);
  console.log('multiplayer: ok');
} finally {
  await test.close();
  server.kill();
}
