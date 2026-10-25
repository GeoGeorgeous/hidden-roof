// Join time and memory (BL-085, BL-083): A hosts a level with a share of its
// faces painted (random dots of random colors: the worst case to pack), at a
// PAINT DETAIL, from that paint; B joins and is timed from JOIN: the welcome
// (the server made the paint file), the paint file down, loaded, then shown
// (all of it uploaded to the GPU), with B's JS heap before, at its highest
// and after a GC. B draws with the real GPU when there's a display (GPU=Intel
// for the weak one), else SwiftShader. No network delay: what's left is the
// game's own time. `RATE` (bytes a second) puts B on a slow link instead.
// Usage: npm run bench:join
//        LEVEL=roof DETAIL=high SHARES=0.25,1 RATE=70000 npm run bench:join
import { spawn } from 'node:child_process';
import net from 'node:net';
import { linkProxy } from './link-proxy.mjs';
import { freePort, gameReady, noDrawing, openTestBrowser } from './test-browser.mjs';

const LEVEL = process.env.LEVEL ?? 'roof';
const DETAIL = process.env.DETAIL ?? 'high';
const SHARES = (process.env.SHARES ?? '0.1,0.5,1').split(',').map(Number);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const port = await freePort();
const server = spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(port), PLAYER_HOST: '1' }, stdio: ['ignore', 'ignore', 'inherit'] });
while (!(await new Promise((done) => net.connect(port).on('connect', function () { this.destroy(); done(true); }).on('error', () => done(false))))) await sleep(100);
const proxyPort = await freePort();
const proxy = linkProxy(proxyPort, port);
if (process.env.RATE) proxy.down.rate = Number(process.env.RATE);

const settings = (d) => localStorage.setItem('roofhiddenhaus.settings', JSON.stringify({ paintDetail: d, cityDetail: 'low' }));
// A without drawing (SwiftShader), B with: each its own page server, B's /ws through the proxy.
process.env.WS_TARGET = `ws://localhost:${port}`;
const a = await openTestBrowser(undefined, { level: LEVEL, flags: ['--js-flags=--max-old-space-size=8192'] });
process.env.WS_TARGET = `ws://localhost:${proxyPort}`;
const b = await openTestBrowser(undefined, { level: LEVEL, gpu: true, flags: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
console.log(`${LEVEL} at ${DETAIL.toUpperCase()}, B on ${b.realGpu ? `the real GPU (${process.env.GPU ?? 'NVIDIA'})` : 'SwiftShader'}${process.env.RATE ? `, B's link ${process.env.RATE} B/s` : ''}`);
console.log('| Painted | Paint | File | Welcome | Down | Loaded | Shown | Heap before | Heap top | Heap after GC |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const share of SHARES) {
  const pa = await a.browser.newPage({ viewport: { width: 320, height: 180 } });
  await pa.addInitScript(noDrawing);
  await pa.addInitScript(settings, DETAIL);
  await pa.goto(a.url);
  await gameReady(pa, 2);
  const painted = await pa.evaluate(fill, share);
  await pa.waitForFunction(() => window.game.net.status.state === 'in', null, { timeout: 300000 });
  const code = await pa.evaluate(() => window.game.net.status.code);
  const pb = await b.browser.newPage({ viewport: { width: 1280, height: 720 } });
  await pb.addInitScript(settings, DETAIL);
  await pb.goto(b.url);
  await gameReady(pb, 10);
  pb.on('console', (m) => m.text().includes('TIMING') && console.log(m.text()));
  const r = await pb.evaluate(join, code);
  const mb = (n) => `${(n / 2 ** 20).toFixed(0)} MB`;
  const s = (t) => (t === undefined ? '–' : `${t.toFixed(2)} s`);
  console.log(`| ${Math.round(share * 100)}% | ${painted.mb.toFixed(0)} MB | ${r.file} | ${s(r.welcome)} | ${s(r.down)} | ${s(r.loaded)} (${r.load}) | ${s(r.shown)} | ${mb(r.heap0)} | ${mb(r.heapTop)} | ${mb(r.heapAfter)} |`);
  await pb.close();
  await pa.close();
}
await a.close();
await b.close();
proxy.close();
server.kill();

/** In A's page: paints `share` of every surface's faces with random dots, then hosts from that paint. */
async function fill(share) {
  const g = window.game;
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const [Tw, Th] = [256, 256];
  const texels = new Uint8Array(Tw * Th * 4);
  for (let n = 0; n < 900; n++) {
    const [cx, cy, r] = [rnd() * Tw, rnd() * Th, 2 + rnd() * 10];
    const col = [rnd(), rnd(), rnd(), 1].map((c) => Math.round(c * 255));
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x - cx, y - cy) <= r) texels.set(col, (((y + Th) % Th) * Tw + ((x + Tw) % Tw)) * 4);
  }
  g.paint.clear();
  let bytes = 0;
  for (const s of g.paint.surfaces)
    s.geo.rects.forEach((r, i) => {
      if (((i * 2654435761 + s.key.length * 97) >>> 0) / 4294967296 >= share) return;
      const crop = new Uint8Array((r.w + 2) * (r.h + 2) * 4);
      for (let y = 0; y < r.h + 2; y++) for (let x = 0; x < r.w + 2; x++) crop.set(texels.subarray(((y % Th) * Tw + (x % Tw)) * 4, ((y % Th) * Tw + (x % Tw)) * 4 + 4), (y * (r.w + 2) + x) * 4);
      g.paint.putFace(s, i, crop, r.w, r.h);
      bytes += crop.length;
    });
  g.net.host('A', g.config.PAINT.texelsPerMeter, { name: 'Bench', limit: 4, tools: ['can', 'marker', 'ladder', 'roller', 'sponge'] }, await g.paintFile.save());
  return { mb: bytes / 2 ** 20 };
}

/** In B's page: JOIN, timed (s from JOIN) and the heap watched every frame, until all the paint is on the GPU. */
async function join(code) {
  const g = window.game;
  const heap = () => performance.memory.usedJSHeapSize;
  gc();
  const r = { heap0: heap(), heapTop: heap() };
  const t0 = performance.now();
  const at = () => (performance.now() - t0) / 1000;
  const progress = g.net.onProgress;
  g.net.onProgress = (text) => {
    if (text?.startsWith('Downloading') || text === 'Loading paint…') r.welcome ??= at();
    if (text === 'Loading paint…') r.down = at();
    progress(text);
  };
  g.net.join('B', code);
  await new Promise((done) => {
    const frame = () => {
      r.heapTop = Math.max(r.heapTop, heap());
      if (g.net.status.state === 'in') {
        r.loaded ??= at();
        if (!g.paint.gpu.dirty.size) return done((r.shown = at()));
      }
      if (g.net.status.state === 'failed') return done();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  const log = g.net.log.text();
  r.file = log.match(/, (\d+ KB) of paint/)?.[1];
  r.load = log.match(/paint loaded in (\d+ ms)/)?.[1];
  gc();
  await new Promise((done) => setTimeout(done, 500));
  gc();
  r.heapAfter = heap();
  return r;
}
