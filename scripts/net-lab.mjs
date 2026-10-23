// What the multiplayer scenarios share (scripts/weak-link.test.mjs): a game
// server of their own, and players, each in a browser behind a page server and
// a link proxy of its own (scripts/link-proxy.mjs), so a player's weak network
// stays theirs through reconnects. It watches every player and the server, and
// prints what happened: drops, joins, what each player showed for the others.
import { spawn } from 'node:child_process';
import net from 'node:net';
import { linkProxy } from './link-proxy.mjs';
import { freePort, gameReady, noDrawing, openTestBrowser } from './test-browser.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const press = (page, text) => page.locator('.overlay button:visible', { hasText: text }).first().click();

/** A server (`env`: its settings, as REJOIN_WINDOW) and `names` playing, the first hosting, the others joining. */
export async function openLab(names, env = {}) {
  const t0 = Date.now();
  const lab = { at: () => +((Date.now() - t0) / 1000).toFixed(1), players: {}, server: [], timeline: [] };
  const port = await freePort();
  lab.process = spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  lab.process.stdout.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => lab.server.push({ t: lab.at(), line: l.replace(/^\S+Z /, '') })));
  while (!(await new Promise((done) => net.connect(port).on('connect', function () { this.destroy(); done(true); }).on('error', () => done(false))))) await sleep(100);
  for (const name of names) {
    const at = await freePort();
    lab.players[name] = { name, proxy: linkProxy(at, port), proxyPort: at };
  }
  // One page server each (they start one after another: they share Vite's dependency cache), its /ws to the player's proxy.
  for (const p of Object.values(lab.players)) {
    process.env.WS_TARGET = `ws://localhost:${p.proxyPort}`;
    p.browser = await openTestBrowser();
    const ctx = await p.browser.browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(noDrawing);
    await ctx.addInitScript(() => localStorage.setItem('roofhiddenhaus.settings', JSON.stringify({ paintDetail: 'low', cityDetail: 'low' })));
    p.page = await ctx.newPage();
    await p.page.goto(p.browser.url);
  }
  await Promise.all(Object.values(lab.players).map((p) => gameReady(p.page)));
  const [host, ...others] = Object.values(lab.players);
  await press(host.page, 'MULTIPLAYER');
  await press(host.page, 'HOST A SESSION');
  await host.page.fill('.mp-page input >> nth=0', host.name);
  await press(host.page, 'Host');
  await state(host, 'in');
  const code = await host.page.evaluate(() => window.game.net.status.code);
  for (const p of others) {
    await press(p.page, 'MULTIPLAYER');
    await press(p.page, 'JOIN A SESSION');
    await p.page.fill('.mp-page input >> nth=0', p.name);
    await p.page.fill('.mp-page input >> nth=1', code.toLowerCase());
    await press(p.page, 'Join');
    await state(p, 'in');
  }
  for (const p of Object.values(lab.players)) await p.page.waitForFunction((n) => window.game.net.names.size === n, names.length - 1, { timeout: 15000 });
  lab.t0 = lab.at();
  return lab;
}

/** Waits for the player's link state ('in', 'reconnecting', ...). */
export const state = (p, s, timeout = 15000) => p.page.waitForFunction((s) => window.game.net.status.state === s, s, { timeout });

/** Every second until `stop()`: each player's link state, and how they show each other (here, away, dropped, silent). */
export function watch(lab) {
  let on = true;
  (async () => {
    while (on) {
      const t = lab.at();
      for (const p of Object.values(lab.players)) {
        const v = await p.page.evaluate(() => {
          const g = window.game;
          const others = {};
          for (const [id, r] of g.net.remotes.players) others[g.net.names.get(id) ?? `#${id}`] = r.look;
          return { state: g.net.status.state, others };
        }).catch(() => null);
        if (v) lab.timeline.push({ t, who: p.name, ...v });
      }
      await sleep(1000);
    }
  })();
  return () => (on = false);
}

/** Paints nonstop from `p` (its ops go to everyone) until the returned stop(); `count()` is how many stamps it made. */
export async function paintNonstop(p) {
  await p.page.evaluate(() => {
    const g = window.game;
    const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
    window.stamps = 0;
    window.painting = setInterval(() => {
      for (let k = 0; k < 8; k++, window.stamps++) g.paint.stamp(s, { rect: 0, u: (window.stamps * 0.013) % 1, v: (window.stamps * 0.007) % 1 }, 0.05, 0.5, [1, 0.2, 0.1]);
    }, 50);
  });
  return { stop: () => p.page.evaluate(() => (clearInterval(window.painting), window.stamps)) };
}

/** A surface for `p` alone (the n-th from the end that has faces): a stroke on it is easy to find. */
export const ownSurface = (p, n) => p.page.evaluate((n) => window.game.paint.surfaces.map((s, i) => [s, i]).filter(([s]) => s.geo.rects.length > 0).at(-1 - n)[1], n);

/** A blue stroke on surface `i`, now; or `when: 'down'`, the moment the player's game sees its link go. */
export const stroke = (p, i, when = 'now') =>
  p.page.evaluate(
    ([i, when]) => {
      const g = window.game;
      const paint = () => { for (let k = 0; k < 20; k++) g.paint.stamp(g.paint.surfaces[i], { rect: 0, u: 0.1 + k * 0.04, v: 0.5 }, 0.1, 1, [0, 0, 1]); };
      if (when === 'now') return paint();
      const t = setInterval(() => g.net.status.state === 'reconnecting' && (clearInterval(t), paint()), 20);
    },
    [i, when],
  );

/** Is the blue stroke on surface `i` there, for player `p`? */
export const hasStroke = (p, i) => p.page.evaluate((i) => !!window.game.paint.surfaces[i].data?.some((v, k) => k % 4 === 2 && v > 200), i);

/** What happened, in lines: the server's drops and joins, each player's states and what they showed for the others, as runs. */
export function story(lab) {
  const out = [];
  for (const { t, line } of lab.server) {
    const m = line.match(/"(\w+)" #\d+ (dropped \(\d+\)|in from \S+ \((new|back|takeover)|left|didn't come back[^:]*)/);
    if (m) out.push(`  ${(t - lab.t0).toFixed(1).padStart(6)} s  server: ${m[1]} ${m[2].replace(/in from \S+ \(/, 'in, ')}`);
  }
  const runs = new Map();
  for (const s of lab.timeline) {
    const key = (k, v) => {
      const list = runs.get(k) ?? runs.set(k, []).get(k);
      const last = list.at(-1);
      if (last?.v === v) last.to = s.t;
      else list.push({ v, from: s.t, to: s.t });
    };
    key(`${s.who}: own link`, s.state);
    for (const [o, look] of Object.entries(s.others)) key(`${s.who} shows ${o}`, look);
  }
  // The lab's players never take the mouse: in the menu is their normal.
  for (const [k, list] of runs) if (list.length > 1 || !['in', 'here', 'menu'].includes(list[0].v)) out.push(`  ${k}: ${list.map((r) => `${r.v} ${(r.from - lab.t0).toFixed(0)}–${(r.to - lab.t0).toFixed(0)} s`).join(', ')}`);
  return out;
}

export async function closeLab(lab) {
  for (const p of Object.values(lab.players)) {
    await p.browser?.close();
    p.proxy.close();
  }
  lab.process.kill();
}
