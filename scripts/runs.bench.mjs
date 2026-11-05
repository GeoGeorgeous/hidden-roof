// How often paint runs: strokes, fills and a can held still, with every cap, the marker and the roller, on fixed steps.
// A table to read paint runs by, before and after a change to the brush or to runs. Not a test: no limits to fail.
// Usage: npm run bench:runs
import { fixedFrames, gameReady, noBrowserLock, noDrawing, openTestBrowser } from './test-browser.mjs';

const test = await openTestBrowser(undefined, { uncapped: true });
const page = await test.browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.addInitScript(noDrawing);
await page.addInitScript(noBrowserLock);
await page.addInitScript(fixedFrames);
await page.goto(test.url);
await gameReady(page, 2);

const rows = await page.evaluate(async () => {
  const g = window.game;
  const { input, player, inventory: inv, config, paint } = g;
  const { BRUSH, CAPS } = config;
  input.setLocked(true);
  inv.unlockAll();
  const wall = 3.4;
  const was = BRUSH.opacity;
  let frame = 0;
  let runs = [];
  const record = paint.record.bind(paint);
  paint.record = (op) => {
    if (op.kind === 'drip') runs.push({ at: frame / 60, length: op.length });
    return record(op);
  };
  const stand = (d) => {
    player.setSpawn(player.position.clone().set(wall - d, 0, 2.95), -Math.PI / 2);
    player.respawn();
  };
  const sweep = (t, per, rows = 1) => {
    const p = Math.floor(t / per);
    const u = (t % per) / per;
    player.yaw = -Math.PI / 2 + 0.35 * ((p % 2 ? 1 - u : u) * 2 - 1);
    player.pitch = rows > 1 ? 0.25 - (p % rows) * 0.09 : 0;
  };
  const still = () => ((player.yaw = -Math.PI / 2), (player.pitch = 0));
  const out = [];
  const scene = async (name, seconds, aim, seeds = [1, 2, 3]) => {
    const got = [];
    for (const seed of seeds) {
      g.seedPaintRandom(seed);
      paint.clear();
      g.drips.clear();
      runs = [];
      await steps((f) => {
        frame = f;
        aim(f / 60);
        if (f === 0) input.button(0, true);
        if (f === seconds * 60) input.button(0, false);
        return f === seconds * 60 + 2;
      });
      got.push(runs);
    }
    const all = got.flat();
    const firsts = got.map((r) => r[0]?.at).filter((t) => t !== undefined);
    out.push({ name, runs: got.map((r) => r.length), first: firsts.length ? Math.min(...firsts) : null, lastFirst: firsts.length ? Math.max(...firsts) : null, length: all.length ? all.reduce((s, r) => s + r.length, 0) / all.length : null });
  };
  inv.select(0);
  for (const cap of Object.keys(CAPS)) {
    for (let n = 0; inv.cap !== cap && n < 20; n++) inv.cycleCap(1);
    const name = CAPS[cap].name;
    BRUSH.opacity = 0.65;
    stand(1);
    await scene(`${name}: one pass`, 1, (t) => sweep(t, 1));
    await scene(`${name}: 6 passes`, 6, (t) => sweep(t, 1));
    await scene(`${name}: 6 slow passes`, 12, (t) => sweep(t, 2));
    await scene(`${name}: fill`, 12, (t) => sweep(t, 1, 6));
    await scene(`${name}: 20 passes`, 20, (t) => sweep(t, 1));
    for (const [d, o] of [[0.4, 0.65], [1, 0.65], [1.5, 0.65], [1, 0.35]]) {
      BRUSH.opacity = o;
      stand(d);
      await scene(`${name}: held 10 s, ${d} m, ${o * 100}%`, 10, still);
    }
  }
  BRUSH.opacity = was;
  for (const [name, slot] of [['marker', 1], ['roller', 3]]) {
    inv.select(slot);
    stand(1);
    await scene(`${name}: 3 passes`, 3, (t) => sweep(t, 1));
    await scene(`${name}: 6 passes`, 6, (t) => sweep(t, 1));
    await scene(`${name}: fill`, 12, (t) => sweep(t, 1, 6));
    await scene(`${name}: held 10 s`, 10, still);
  }
  return out;
});

const cell = (v, w) => String(v).padEnd(w);
console.log(`${cell('', 34)}${cell('runs', 14)}${cell('first (s)', 12)}length (m)`);
for (const r of rows) console.log(`${cell(r.name, 34)}${cell(r.runs.join(', '), 14)}${cell(r.first === null ? '-' : `${r.first.toFixed(1)}-${r.lastFirst.toFixed(1)}`, 12)}${r.length === null ? '-' : r.length.toFixed(2)}`);
await test.close();
process.exit(0);
