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
  await watchStatus(page);
  return page;
}
/**
 * The page records every network status it passes through (window.statuses, oldest first, starting with the one it has
 * now): a short one, like the 1 s of "reconnecting", is seen however late the test looks. Again after a reload.
 */
async function watchStatus(page) {
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
const status = async (page, state) => {
  try {
    const found = await page.waitForFunction(([s, from]) => window.statuses.findIndex((x, i) => i >= from && x === s) + 1, [state, page.heard], { timeout: 15000, polling: 50 });
    page.heard = await found.jsonValue();
  } catch (e) {
    const seen = await page.evaluate(() => ({ status: window.game.net.status, statuses: window.statuses, log: window.game.net.log.text() })).catch(() => null);
    throw new Error(`no "${state}" in 15 s: ${JSON.stringify(seen?.status)}, passed through ${seen?.statuses?.slice(page.heard)}\n${seen?.log}\npage errors: ${page.errors ?? '(loading)'}`, { cause: e });
  }
};
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
/** Waits until `page`'s paint hashes to `hash` (another player's strokes land when their figure gets there); fails after 10 s. */
async function paintReaches(page, hash, what) {
  for (const until = Date.now() + 10000; Date.now() < until; ) {
    if ((await paintHash(page)) === hash) return;
    await page.waitForTimeout(100);
  }
  assert.equal(await paintHash(page), hash, what);
}

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

  // B paints, so the server has batches from it; after the reload its batches go on from there (a new page numbering
  // from 1 again had every stroke dropped by the server as one it already had).
  const stampB = (page, v) =>
    page.evaluate((v) => {
      const g = window.game;
      const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
      for (let i = 0; i < 5; i++) g.paint.stamp(s, { rect: 0, u: 0.3 + i * 0.05, v }, 0.1, 0.6, [0.1, 0.8, 0.2]);
    }, v);
  await stampB(b, 0.2);
  painted = await paintHash(b);
  await paintReaches(a, painted, 'A has what B painted');

  // B finds the marker and reloads: it comes back into the session as the same player, with the paint and the marker.
  await b.evaluate(() => window.game.inventory.give('marker'));
  // The game sends what it carries on its next frame: wait for that, not a fixed time (SwiftShader draws ~6 frames a second here).
  await b.waitForFunction(() => window.game.net.sender.carried === window.game.inventory.version, null, { timeout: 5000, polling: 50 });
  await b.reload();
  await gameReady(b);
  await watchStatus(b);
  await status(b, 'in');
  assert.equal(await b.evaluate(() => window.game.session.player), 'player2');
  assert.equal(await paintHash(b), painted, 'the paint comes back after a reload');
  assert.ok(await b.evaluate(() => window.game.inventory.has('marker')), 'what B carried comes back after a reload');
  await stampB(b, 0.8);
  painted = await paintHash(b);
  await paintReaches(a, painted, 'A has what B painted after its reload');
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
  // SAVE as it starts to reconnect is refused at once: the request can't go, and a reconnect wouldn't answer it (it used
  // to wait forever). Asked by the page the moment it reports "reconnecting", which may last only a second.
  await b.evaluate(() => {
    const n = window.game.net;
    const onStatus = n.onStatus;
    n.onStatus = (s) => {
      onStatus(s);
      if (s.state !== 'reconnecting' || window.saving) return;
      window.reconnecting = [!!window.game.session.joining, document.querySelector('.overlay .start .play').disabled];
      window.saving = Promise.race([n.savePaint().then(() => 'saved', (e) => e.message), new Promise((r) => setTimeout(() => r('no answer'), 8000))]);
    };
    n.link.socket.onmessage = null;
    n.link.lastHeard = -1e9;
  });
  await status(b, 'reconnecting');
  await status(b, 'in');
  const saving = await b.evaluate(() => window.saving);
  assert.deepEqual(await b.evaluate(() => window.reconnecting), [false, false], 'a reconnect mid-play does not block PLAY');
  assert.match(saving, /^Reconnecting/, 'SAVE while reconnecting');
  assert.equal(await paintHash(b), painted, 'the paint comes back after a reconnect');

  // BL-088: B comes back on link 1, which drops while its welcome loads (4 s); the retry's link 2 hears nothing. Link 1's
  // late welcome must not mark link 2 live: link 2 still gives up after NET.connectTimeout (3 s here), not serverSilence.
  await b.evaluate(() => {
    const n = window.game.net;
    const welcome = n.welcome.bind(n);
    n.welcome = async (...args) => {
      n.welcome = welcome;
      n.link.close();
      window.mute = true;
      await new Promise((r) => setTimeout(r, 4000));
      return welcome(...args);
    };
    // A link opened while muted hears nothing from the server.
    const WS = window.WebSocket;
    window.WebSocket = class extends WS {
      set onmessage(f) {
        super.onmessage = window.mute ? null : f;
      }
      get onmessage() {
        return super.onmessage;
      }
    };
    window.game.config.NET.connectTimeout = 3;
    n.link.close();
  });
  await b.waitForFunction(() => window.game.net.log.text().includes('nothing from the server in 3 s'), null, { timeout: 9000 }).catch(async () => assert.fail(`link 2 never gave up:\n${await b.evaluate(() => window.game.net.log.text())}`));
  await b.evaluate(() => ((window.mute = false), (window.game.config.NET.connectTimeout = 15)));
  await status(b, 'in');

  // LEAVE: A hears B has gone, B plays alone at its own detail again.
  await press(b, 'LEAVE SESSION');
  await a.waitForFunction(() => window.game.net.names.size === 0, null, { timeout: 5000 });
  assert.equal(await b.evaluate(() => window.game.session.multiplayer), false);

  // B joins again, and its welcome takes 5 s to load (a big save at ULTRA): A's snapshots wait behind it, and A is
  // still shown at once, with a black name tag over its head.
  await b.evaluate(() => {
    const n = window.game.net;
    const welcome = n.welcome.bind(n);
    n.welcome = async (...args) => ((n.welcome = welcome), await new Promise((r) => setTimeout(r, 5000)), welcome(...args));
  });
  await b.evaluate((c) => window.game.net.join('B', c), code);
  await status(b, 'in');
  await b.waitForFunction(() => [...window.game.net.remotes.list.values()][0]?.avatar.group.visible, null, { timeout: 2000 });
  assert.equal(await b.textContent('.nameplate'), 'A');
  await b.evaluate(() => window.game.net.leave());

  // B joins and presses LEAVE while the welcome's paint loads, then again before the welcome is handled (it waits
  // behind other messages): B stays out of the session, not "in" with no link, and its PAINT DETAIL is its own again
  // (the welcome locks it to the session's: not "(host)" alone).
  for (const when of ['loading', 'before']) {
    await b.evaluate(
      ([c, when]) => {
        const n = window.game.net;
        const welcome = n.welcome.bind(n);
        window.welcomed = false;
        n.welcome = (...args) => {
          n.welcome = welcome;
          if (when === 'before') n.leave();
          const handled = welcome(...args);
          if (when === 'loading') n.leave();
          return handled.then(() => (window.welcomed = true));
        };
        n.join('B', c);
      },
      [code, when],
    );
    await b.waitForFunction(() => window.welcomed, null, { timeout: 15000 });
    const out = await b.evaluate(() => [window.game.net.status.state, window.game.session.multiplayer, window.game.settings.locked]);
    assert.deepEqual(out, ['off', false, null], `LEAVE ${when} the welcome: out of the session, PAINT DETAIL unlocked`);
    await a.waitForFunction(() => window.game.net.names.size === 0, null, { timeout: 5000 });
  }

  // BL-105: from JOIN (or HOST) until the session's paint has loaded the player can't resume: PLAY is a disabled note of
  // the progress, and neither it, Enter, Esc nor a click on the game starts play (the paint made meanwhile would be
  // lost to the welcome's). LEAVE, Back on the MULTIPLAYER page and a failed join give PLAY back. B joins four times
  // with its welcome held until the test lets it go: the welcome that takes a while to download and load.
  await b.evaluate(() => {
    window.resumes = 0;
    window.game.input.requestLock = () => window.resumes++;
  });
  const holdWelcome = () =>
    b.evaluate(() => {
      const n = window.game.net;
      const welcome = n.welcome.bind(n);
      const held = new Promise((r) => (window.releaseWelcome = r));
      window.welcomeHeld = false;
      n.welcome = async (...args) => ((n.welcome = welcome), (window.welcomeHeld = true), await held, welcome(...args));
    });
  const welcomeHeld = () => b.waitForFunction(() => window.welcomeHeld, null, { timeout: 15000 });
  /** What PLAY and the button beside it say, and how many times the page tried to resume play (PLAY, Enter, Esc, a click on the game). */
  const menuNow = () =>
    b.evaluate(() => {
      const play = document.querySelector('.overlay .start .play');
      const before = window.resumes;
      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
      play.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      for (const code of ['Enter', 'Escape']) (key('keydown', code), key('keyup', code));
      window.game.renderer.domElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      return { play: [play.disabled, play.firstChild.textContent], other: document.querySelector('.overlay .start button:not(.play)').textContent, resumed: window.resumes - before };
    });
  const aloneAgain = () => a.waitForFunction(() => window.game.net.names.size === 0, null, { timeout: 5000 });
  // 1. LEAVE cancels the join.
  await holdWelcome();
  await b.evaluate((c) => window.game.net.join('B', c), code);
  await welcomeHeld();
  // The network's progress, as it has it: the welcome's paint coming down.
  const joining = await menuNow();
  assert.match(joining.play[1], /^(Joining…|Loading \d+%)$/);
  assert.deepEqual({ ...joining, play: [joining.play[0]] }, { play: [true], other: 'Leave session', resumed: 0 }, 'joining: PLAY is disabled and nothing resumes');
  await press(b, 'LEAVE SESSION');
  await status(b, 'off');
  assert.deepEqual(await menuNow(), { play: [false, 'Play'], other: 'Multiplayer', resumed: 4 }, 'LEAVE cancels the join: PLAY is back');
  await b.evaluate(() => window.releaseWelcome());
  await aloneAgain();
  // 2. The welcome has loaded: in the session, PLAY is back as BACK TO SESSION.
  await holdWelcome();
  await b.evaluate((c) => window.game.net.join('B', c), code);
  await welcomeHeld();
  assert.deepEqual((await menuNow()).resumed, 0, 'joining: nothing resumes, again');
  await b.evaluate(() => window.releaseWelcome());
  await status(b, 'in');
  assert.deepEqual(await menuNow(), { play: [false, 'Back to session'], other: 'Leave session', resumed: 4 }, 'in the session, PLAY is back');
  assert.equal(await paintHash(b), await paintHash(a), 'B has the session paint before it can play');
  await b.evaluate(() => window.game.net.leave());
  await aloneAgain();
  // 3. A join that fails gives PLAY back.
  await b.evaluate(() => window.game.net.join('B', 'QQQQQ'));
  await status(b, 'failed');
  assert.deepEqual(await menuNow(), { play: [false, 'Play'], other: 'Multiplayer', resumed: 4 }, 'a failed join: PLAY is back');
  // 4. Back on the MULTIPLAYER page cancels the join.
  await holdWelcome();
  await press(b, 'MULTIPLAYER');
  await press(b, 'JOIN A SESSION');
  await b.fill('.mp-page input >> nth=0', 'B');
  await b.fill('.mp-page input >> nth=1', code.toLowerCase());
  await press(b, 'Join');
  await welcomeHeld();
  assert.equal(await b.evaluate(() => window.game.session.joining), true);
  await b.click('.overlay .back button');
  await status(b, 'off');
  // On to the pause screen.
  await b.click('.overlay .back button');
  assert.deepEqual(await menuNow(), { play: [false, 'Play'], other: 'Multiplayer', resumed: 4 }, 'Back cancels the join: PLAY is back');
  await b.evaluate(() => window.releaseWelcome());
  await aloneAgain();

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
