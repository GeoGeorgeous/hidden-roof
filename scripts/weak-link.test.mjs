// The playtest's weak link, played back (docs/playtest-multiplayer.md): A paints
// nonstop while B's downlink is narrowed to a trickle (scripts/link-proxy.mjs), and
// B paints a stroke of its own meanwhile. It reports what happens, for BL-004 (the
// server's heartbeat kills a link that still sends), BL-009 (what A shows for B) and
// BL-003 (B's strokes made during the stall, after it rejoins). A report for now,
// not a pass or fail: each fix turns its part into a check.
// Usage: npm run test:weak-link (builds the server first)
import { spawn } from 'node:child_process';
import { linkProxy } from './link-proxy.mjs';
import { freePort, gameReady, noDrawing, openTestBrowser } from './test-browser.mjs';

const RATE = Number(process.env.RATE) || 8000; // B's downlink while narrowed (bytes a second)
const UP = Number(process.env.UP) || 4000; // and its uplink: its reports still go through, its strokes queue
const STALL = Number(process.env.STALL) || 40; // how long (s)

const PORT = await freePort();
const PROXY = await freePort();
const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(1);
const serverLog = [];
const server = spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
server.stdout.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => serverLog.push(`${at()} ${l}`)));
await new Promise((done) => setTimeout(done, 500));
const proxy = linkProxy(PROXY, PORT);
process.env.WS_TARGET = `ws://localhost:${PROXY}`;
const test = await openTestBrowser();

async function open(name) {
  const ctx = await test.browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(noDrawing);
  await ctx.addInitScript(() => localStorage.setItem('roofhiddenhaus.settings', JSON.stringify({ paintDetail: 'low', cityDetail: 'low' })));
  const page = await ctx.newPage();
  await page.goto(test.url);
  await gameReady(page);
  page.name = name;
  return page;
}
const press = (page, text) => page.locator('.overlay button:visible', { hasText: text }).first().click();
const status = (page, state, timeout = 15000) => page.waitForFunction((s) => window.game.net.status.state === s, state, { timeout });

const report = { rate: RATE, up: UP, stall: STALL, samples: [] };
try {
  const a = await open('A');
  const b = await open('B');
  await press(a, 'MULTIPLAYER');
  await press(a, 'HOST A SESSION');
  await a.fill('.mp-page input >> nth=0', 'A');
  await press(a, 'Host');
  await status(a, 'in');
  const code = await a.evaluate(() => window.game.net.status.code);
  await press(b, 'MULTIPLAYER');
  await press(b, 'JOIN A SESSION');
  await b.fill('.mp-page input >> nth=0', 'B');
  await b.fill('.mp-page input >> nth=1', code.toLowerCase());
  await press(b, 'Join');
  await status(b, 'in');
  await a.waitForFunction(() => window.game.net.remotes.list.size === 1);
  const link = proxy.links.at(-1); // B's: the last to open
  // B's own surface: nobody else paints it.
  const mine = await b.evaluate(() => window.game.paint.surfaces.findLastIndex((s) => s.geo.rects.length > 0));
  // And one more for a stroke made once the link is gone, before B is back in.
  const down = await b.evaluate((m) => window.game.paint.surfaces.findLastIndex((s, i) => i < m && s.geo.rects.length > 0), mine);
  // The moment B's game sees its link go, it paints that stroke (in the page, so nothing waits on the test).
  await b.evaluate((i) => {
    const g = window.game;
    const t = setInterval(() => {
      if (g.net.status.state !== 'reconnecting') return;
      clearInterval(t);
      for (let k = 0; k < 20; k++) g.paint.stamp(g.paint.surfaces[i], { rect: 0, u: 0.1 + k * 0.04, v: 0.5 }, 0.1, 1, [0, 0, 1]);
      window.strokeWhileDown = performance.now();
    }, 20);
  }, down);

  // A paints nonstop (its ops go to B), B's downlink narrows.
  await a.evaluate(() => {
    const g = window.game;
    const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
    let i = 0;
    window.painting = setInterval(() => { for (let k = 0; k < 8; k++, i++) g.paint.stamp(s, { rect: 0, u: (i * 0.013) % 1, v: (i * 0.007) % 1 }, 0.05, 0.5, [1, 0.2, 0.1]); }, 50);
  });
  link.down.rate = RATE;
  link.up.rate = UP;
  const start = Date.now();
  report.narrowedAt = at();
  let stroke = false;
  while (Date.now() - start < STALL * 1000) {
    const s = (Date.now() - start) / 1000;
    // B's stroke, made while its link is dying (BL-003).
    if (!stroke && s > 3) {
      stroke = true;
      report.strokeAt = at();
      await b.evaluate((i) => { const g = window.game; for (let k = 0; k < 20; k++) g.paint.stamp(g.paint.surfaces[i], { rect: 0, u: 0.1 + k * 0.04, v: 0.5 }, 0.1, 1, [0, 0, 1]); }, mine);
    }
    report.samples.push({
      t: at(),
      aSeesB: await a.evaluate(() => [...window.game.net.remotes.list.values()][0]?.look ?? 'gone'),
      bState: await b.evaluate(() => window.game.net.status.state),
      queued: link.down.queued + link.up.queued,
    });
    await new Promise((done) => setTimeout(done, 1000));
  }
  link.down.rate = link.up.rate = Infinity;
  await a.evaluate(() => clearInterval(window.painting));
  report.restoredAt = at();
  await status(b, 'in', 60000).catch(() => (report.bNotBack = true));
  await new Promise((done) => setTimeout(done, 3000));
  // Is B's stroke still there: on B, on A, and on the server's paint (what a joiner gets)?
  const has = (page) => page.evaluate((i) => !!window.game.paint.surfaces[i].data?.some((v, k) => k % 4 === 2 && v > 200), mine);
  report.strokeKept = { onB: await has(b), onA: await has(a) };
  const hasDown = (page) => page.evaluate((i) => !!window.game.paint.surfaces[i].data?.some((v, k) => k % 4 === 2 && v > 200), down);
  report.strokeWhileDown = { made: await b.evaluate(() => !!window.strokeWhileDown), onB: await hasDown(b), onA: await hasDown(a) };
  report.bLog = await b.evaluate(() => window.game.net.log.text().split('\n').slice(-12));
} catch (e) {
  report.error = e.message.split('\n')[0];
} finally {
  report.server = serverLog.filter((l) => /"B"|dropped|1006/.test(l)).slice(-20);
  // Runs of the same view, not every second.
  report.samples = report.samples.reduce((runs, s) => { const last = runs.at(-1); const key = `${s.aSeesB}/${s.bState}`; if (last?.key === key) last.until = s.t; else runs.push({ key, from: s.t, until: s.t, queued: s.queued }); return runs; }, []);
  console.log(JSON.stringify(report, null, 1));
  await test.close();
  proxy.close();
  server.kill();
}
