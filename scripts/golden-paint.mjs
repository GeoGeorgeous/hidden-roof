// Golden paint test: plays fixed strokes with every tool at every PAINT DETAIL,
// with seeded paint randomness and a fixed dt, and compares a hash of every
// paint atlas with scripts/golden-paint.json. Refactors of the paint path must
// keep the hashes; PNGs of the most painted faces land in shots/golden for eyeballing.
// Loopback: the paint ops recorded while playing (paint-ops.ts), replayed frame by
// frame into a fresh page, must give the same hash at the same detail, and about
// the same paint when ULTRA's ops are replayed at LOW: the remote-paint path.
// Saves (src/save): the paint saved while playing, loaded into the replay page,
// must give the same hash; ULTRA's save loaded at LOW must equal switching PAINT
// DETAIL to LOW in game; and a save must be refused once the level is edited.
// Usage: node scripts/golden-paint.mjs [--update] [url]   (run `npm run dev` first)
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const update = process.argv.includes('--update');
const url = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:5173/';
const baselinePath = new URL('./golden-paint.json', import.meta.url);
const out = 'shots/golden';
fs.mkdirSync(out, { recursive: true });
const DETAILS = ['low', 'medium', 'high', 'ultra'];

// Standing 1 m from a paintable wall on the demo roof (x = 3.4, z 1.9..4, up to 1.7 m),
// facing it. Unpaintable slats 2 cm in front of it, every ~12 cm from 0.3 to 0.95 m
// up (pitch below about -0.55), leave paint in stripes: the sprays cross them on purpose.
// Yaw and pitch below are offsets from facing the wall square on.
const STAND = [2.4, 0, 2.95];
const FACE_YAW = -Math.PI / 2;

// One run: tool settings, then `frames` frames of `aim(t)` (t = 0..1) with the button held.
// Runs overlap on purpose: layering, drips on wet paint and the sponge over paint.
const RUNS = [
  { name: 'can skinny', slot: 0, cap: 'skinny', color: 'black', frames: 60, aim: (t) => [0.6 - 1.2 * t, -0.15] },
  { name: 'can standard', slot: 0, cap: 'standard', color: 'red', frames: 90, aim: (t) => [0.5 - t, -0.35 + 0.15 * Math.sin(t * 12)] },
  { name: 'can fat, held for runs', slot: 0, cap: 'fat', color: 'yellow', frames: 150, aim: () => [0.25, -0.55] },
  { name: 'can spray', slot: 0, cap: 'spray', color: 'blue', frames: 90, aim: (t) => [-0.6 + 1.2 * t, -0.75] },
  { name: 'can sputtering', slot: 0, cap: 'standard', color: 'green', pressure: 0.15, frames: 90, aim: (t) => [-0.5 + t, -0.05] },
  { name: 'marker', slot: 1, color: 'black', nib: 0.012, frames: 90, aim: (t) => [0.6 - 1.2 * t, -0.3 + 0.15 * Math.sin(t * 9)] },
  { name: 'marker thinnest', slot: 1, color: 'white', nib: 0, frames: 60, aim: (t) => [-0.4 + 0.8 * t, -0.35] },
  { name: 'marker widest, held for runs', slot: 1, color: 'pink', nib: 0.05, frames: 90, aim: (t) => [-0.5 + 0.5 * Math.min(1, 2 * t), -0.2] },
  { name: 'roller on the wall', slot: 3, color: 'orange', frames: 60, aim: (t) => [-0.45, -0.9 + 0.8 * t] },
  { name: 'roller on the floor', slot: 3, color: 'purple', frames: 40, aim: (t) => [-0.3 + 0.6 * t, -1.2] },
  { name: 'sponge', slot: 4, sponge: 0.09, frames: 90, aim: (t) => [0.4 - 0.5 * t, -0.45 + 0.1 * Math.sin(t * 20)] },
  { name: 'sponge widest', slot: 4, sponge: 0.3, frames: 40, aim: (t) => [0.25, -0.55 + 0.2 * t] },
];
const GAP = 12; // frames with the button up between runs (particles land, tools swap)
const SETTLE = 240; // frames at the end for runs to finish dripping

// Frames aren't capped at 60 Hz: the game runs on fixed steps, so faster frames paint the same.
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const results = {};
let failed = 0;
let ultraAtLow = null;
// The details run side by side (a page each): fixed steps keep each one exact.
const t0 = Date.now();
const lines = await Promise.all(DETAILS.map(checkDetail));
for (const line of lines) console.log(line);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);
// ULTRA's ops replayed at LOW: the same strokes at another detail paint about the same area.
const low = ultraAtLow.replayed;
const ratio = low.paintedM2 / results.ultra.paintedM2;
if (Math.abs(ratio - 1) > 0.1) failed++;
console.log(`ULTRA ops at LOW: ${low.paintedM2} m² painted vs ${results.ultra.paintedM2} at ULTRA (${((ratio - 1) * 100).toFixed(1)}%)`);
const saveAtLow = hashOf(ultraAtLow.loaded) === ultraAtLow.reference;
const refused = ultraAtLow.refused === 'SAVED FOR ANOTHER VERSION OF DEMO' && hashOf(ultraAtLow.kept) === hashOf(ultraAtLow.loaded);
failed += (saveAtLow ? 0 : 1) + (refused ? 0 : 1);
console.log(`ULTRA save at LOW: ${saveAtLow ? 'identical to switching PAINT DETAIL in game' : 'DIFFERS from switching PAINT DETAIL in game'}`);
console.log(`save after a level edit: ${refused ? `refused (${ultraAtLow.refused}), paint kept` : `NOT REFUSED AS EXPECTED: ${ultraAtLow.refused}`}`);
await browser.close();

if (update || !fs.existsSync(baselinePath)) {
  fs.writeFileSync(baselinePath, JSON.stringify(results, null, 2) + '\n');
  console.log(`baseline written: ${baselinePath.pathname}`);
} else {
  const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const bad = DETAILS.filter((d) => base[d]?.hash !== results[d].hash);
  for (const d of bad) console.log(`MISMATCH ${d}\n  expected ${JSON.stringify(base[d])}\n  got      ${JSON.stringify(results[d])}`);
  console.log(bad.length ? `golden paint: ${bad.length} of ${DETAILS.length} details differ` : 'golden paint: all details match');
  failed += bad.length;
}
if (failed) console.log(`golden paint: FAILED (${failed})`);
process.exitCode = failed ? 1 : 0;

/** Plays the strokes at one detail, then replays its ops into a fresh page (loopback); returns its report line. */
async function checkDetail(detail) {
  const r = await inGame(detail, play, { runs: RUNS.map((x) => ({ ...x, aim: x.aim.toString() })), stand: STAND, faceYaw: FACE_YAW, gap: GAP, settle: SETTLE, lowReference: detail === 'ultra' });
  results[detail] = { hash: hashOf(r.paint), texelsPerMeter: r.paint.tpm, surfaces: r.paint.surfaces.length, paintedM2: r.paint.paintedM2, meanAlpha: r.paint.meanAlpha, drips: r.drips, perRun: r.perRun };
  for (const [i, png] of r.pngs.entries()) fs.writeFileSync(`${out}/${detail}-${i}.png`, Buffer.from(png, 'base64'));
  // ULTRA's ops also replay at LOW (below), alongside its own loopback.
  const [own, low] = await Promise.all([inGame(detail, replay, { ops: r.ops, save: r.save }), detail === 'ultra' ? inGame('low', replay, { ops: r.ops, save: r.save, editLevel: true }) : null]);
  if (low) ultraAtLow = { ...low, reference: hashOf(r.lowReference) };
  const back = hashOf(own.replayed);
  const loop = back === results[detail].hash;
  const loaded = hashOf(own.loaded) === results[detail].hash;
  failed += (loop ? 0 : 1) + (loaded ? 0 : 1);
  return `${detail.padEnd(6)} ${results[detail].hash}  ${JSON.stringify({ ...results[detail], hash: undefined, perRun: undefined })}  loopback (${r.ops.frames.length} frames, ${r.ops.log.length} ops) ${loop ? 'identical' : `DIFFERS: ${back}`}, save (${(r.saveBytes / 1024).toFixed(1)} KB) ${loaded ? 'loads identical' : 'LOADS DIFFERENT'}`;
}

/** Opens the game at a paint detail and runs `fn(arg)` in it; page errors fail the run. */
async function inGame(detail, fn, arg) {
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((d) => localStorage.setItem('roofhiddenhaus.settings', JSON.stringify({ paintDetail: d, cityDetail: 'low' })), detail);
  await page.addInitScript(pageHelpers);
  await page.goto(url);
  await page.waitForFunction(() => window.game?.level?.solids?.length > 0);
  await page.waitForTimeout(500);
  const r = await page.evaluate(fn, arg);
  await page.close();
  if (errors.length) throw new Error(`${detail}: ${errors.join('\n')}`);
  return r;
}

/** Hash of every painted surface, by key, so the order surfaces were registered in doesn't matter. */
function hashOf(paint) {
  const h = createHash('sha256');
  for (const s of paint.surfaces.sort((a, b) => (a.key < b.key ? -1 : 1))) h.update(`${s.key}:`).update(Buffer.from(s.data, 'base64'));
  return h.digest('hex').slice(0, 16);
}

/** Page helpers (init script): the game set up for fixed steps, and the paint read back. */
function pageHelpers() {
  const round = (v) => Math.round(v * 1e4) / 1e4;
  const toB64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  window.golden = {
    round,
    toB64,
    fromB64: (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    /** Input locked, no drawing (paint is CPU-side; skipping the draw makes SwiftShader 5x faster), 1/60 s steps. */
    setUp() {
      const g = window.game;
      g.renderer.render = () => {};
      g.input.locked = true;
      g.hud.setLocked(true);
      g.fixedStep.dt = 1 / 60;
    },
    /** Every painted surface's paint, and totals. */
    paint() {
      const g = window.game;
      const keys = g.paint.surfaces.map((s) => s.key);
      if (new Set(keys).size !== keys.length) throw new Error('duplicate paint surface keys');
      if (!g.paint.surfaces.every((s) => g.paint.find(s.key) === s)) throw new Error('paint.find misses a surface');
      const tpm = g.config.PAINT.texelsPerMeter;
      const surfaces = [];
      let painted = 0;
      let alpha = 0;
      for (const s of g.paint.surfaces) {
        if (!s.data) continue;
        for (let i = 3; i < s.data.length; i += 4) if (s.data[i]) (painted++, (alpha += s.data[i] / 255));
        surfaces.push({ key: s.key, data: toB64(s.data) });
      }
      return { tpm, surfaces, paintedM2: round(painted / tpm ** 2), meanAlpha: round(alpha / Math.max(1, painted)) };
    },
  };
}

/**
 * Runs in the page: applies recorded ops frame by frame, as they were made, and
 * returns the paint; then loads the save over it, and with `editLevel` tries it
 * again after removing a prop (must be refused, keeping the paint).
 */
async function replay({ ops, save, editLevel }) {
  const g = window.game;
  window.golden.setUp();
  await new Promise((done) => {
    let f = 0;
    g.fixedStep.script = () => {
      const end = f + 1 < ops.frames.length ? ops.frames[f + 1] : ops.log.length;
      for (let i = ops.frames[f]; i < end; i++) g.paintOps.apply(ops.log[i]);
      if (++f === ops.frames.length) {
        g.fixedStep.script = null;
        done();
      }
    };
  });
  const replayed = window.golden.paint();
  const bytes = window.golden.fromB64(save);
  await g.paintFile.load(bytes);
  const loaded = window.golden.paint();
  if (!editLevel) return { replayed, loaded };
  g.level.remove([...g.level.props.values()].find((p) => !p.runtime).id);
  let refused = null;
  await g.paintFile.load(bytes).catch((e) => (refused = e.message));
  return { replayed, loaded, refused, kept: window.golden.paint() };
}

/** Runs in the page: plays every run on fixed steps and returns the paint and the ops it recorded. */
async function play({ runs, stand, faceYaw, gap, settle, lowReference }) {
  const g = window.game;
  const { inventory: inv, player, input, config } = g;
  window.golden.setUp();
  config.DRIPS.enabled = true;
  for (const t of ['marker', 'roller', 'sponge']) inv.give(t);
  for (const c of config.COLOR_ORDER) inv.addColor(c);
  for (const c of config.CAP_ORDER) inv.addCap(c);
  player.setSpawn(player.position.clone().set(...stand), faceYaw);
  player.respawn();
  let drips = 0;
  const onDrip = g.paint.onDrip;
  g.paint.onDrip = (...a) => {
    drips++;
    onDrip(...a);
  };
  g.seedPaintRandom(1);
  // Ops as they're made, and where each frame's start in the log (for the loopback replay).
  g.paint.log = [];
  const frames = [];

  // Coverage in m² of full paint (alpha summed over every texel): how much each run added.
  const coverage = () => {
    let a = 0;
    for (const s of g.paint.surfaces) if (s.data) for (let i = 3; i < s.data.length; i += 4) a += s.data[i];
    return a / 255 / config.PAINT.texelsPerMeter ** 2;
  };
  const perRun = {};
  const { round } = window.golden;
  let before = 0;

  // The schedule: per frame, [run or null, t], or ['measure', name] after a run's gap.
  const steps = [];
  for (let i = 0; i < 30; i++) steps.push([null, 0]); // settle onto the roof
  for (const run of runs) {
    run.aim = eval(run.aim);
    for (let f = 0; f < run.frames; f++) steps.push([run, f / (run.frames - 1)]);
    for (let f = 0; f < gap; f++) steps.push([null, 0]);
    steps.push(['measure', run.name]);
  }
  for (let i = 0; i < settle; i++) steps.push([null, 0]);

  let last = null;
  await new Promise((done) => {
    let f = 0;
    g.fixedStep.script = () => {
      frames.push(g.paint.log.length);
      if (f === steps.length) {
        g.fixedStep.script = null;
        input.lmb = false;
        done();
        return;
      }
      const [run, t] = steps[f++];
      if (run === 'measure') {
        const now = coverage();
        perRun[t] = round(now - before);
        before = now;
        return;
      }
      input.lmb = !!run;
      if (!run) return;
      if (run !== last) {
        last = run;
        inv.select(run.slot);
        while (run.color && inv.color !== run.color) inv.cycleColor(1);
        while (run.cap && inv.cap !== run.cap) inv.cycleCap(1);
        inv.pressure = run.pressure ?? 1;
        if (run.nib !== undefined) inv.size.marker = run.nib;
        if (run.sponge !== undefined) inv.size.sponge = run.sponge;
      }
      const [yaw, pitch] = run.aim(t);
      player.yaw = faceYaw + yaw;
      player.pitch = pitch;
    };
  });

  const log = g.paint.log;
  g.paint.log = null;
  const paint = window.golden.paint();
  // PNGs of the most painted faces, over paper, at 96 texels/m (atlas row 0 is the face's bottom).
  const tpm = config.PAINT.texelsPerMeter;
  const faces = [];
  for (const s of g.paint.surfaces.filter((s) => s.data))
    for (const r of s.geo.rects) {
      let n = 0;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (s.data[(y * s.geo.atlasW + x) * 4 + 3]) n++;
      if (n) faces.push({ s, r, n });
    }
  const k = 96 / tpm;
  const pngs = faces
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map(({ s, r }) => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(r.w * k);
      c.height = Math.ceil(r.h * k);
      const cx = c.getContext('2d');
      cx.fillStyle = '#f1efe8';
      cx.fillRect(0, 0, c.width, c.height);
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = (y * s.geo.atlasW + x) * 4;
          if (!s.data[i + 3]) continue;
          cx.fillStyle = `rgba(${s.data[i]},${s.data[i + 1]},${s.data[i + 2]},${s.data[i + 3] / 255})`;
          cx.fillRect((x - r.x) * k, (r.y + r.h - 1 - y) * k, k, k);
        }
      return c.toDataURL('image/png').split(',')[1];
    });
  // The save, and with `lowReference` the paint switched to LOW in game (what the save must load as at LOW).
  const bytes = await g.paintFile.save();
  let reference = null;
  if (lowReference) {
    config.PAINT.texelsPerMeter = 24;
    g.level.rebuildAll();
    reference = window.golden.paint();
  }
  return { paint, drips, perRun, pngs, ops: { log, frames }, save: window.golden.toB64(bytes), saveBytes: bytes.length, lowReference: reference };
}
