// Game tests in the browser: behavior the golden paint test doesn't cover.
// The pause menu's SAVE / LOAD PAINT (one at a time, cancel, broken files,
// reload), level names, paint saves through level edits and changed props,
// spray in the air at LOAD, the sponge freeing memory, prop ids for good,
// per-player tool sizes, city overrides in the level save, dev tools only in
// single player, the world going on while paused in a session, stepladders by
// owner, the avatar's poses, the ghost's playback, the same city at every
// city detail, hotbar icons, and small-sign sizes with another font. Each check prints ok or what went wrong.
// Usage: node scripts/game.test.mjs [url]   (no url: starts its own server)
import fs from 'node:fs';
import os from 'node:os';
import { gameReady, openTestBrowser } from './test-browser.mjs';

// Pages here don't draw (no check needs a picture), so frames can run uncapped.
const test = await openTestBrowser(process.argv[2], { uncapped: true });
const tmp = fs.mkdtempSync(`${os.tmpdir()}/taggin-test-`);
let failed = 0;

/** A page with the game loaded, not drawing (SwiftShader draws on the CPU, seconds a frame); page errors fail the run. */
async function openPage(init) {
  const page = await test.browser.newPage({ viewport: { width: 320, height: 180 }, acceptDownloads: true });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  if (init) await page.addInitScript(init);
  await page.goto(test.url);
  await ready(page);
  return page;
}

async function ready(page) {
  await gameReady(page, 2);
  await page.evaluate(() => (window.game.renderer.render = () => {}));
}

async function check(name, fn) {
  try {
    const problem = await fn();
    if (problem) throw new Error(problem);
    console.log(`ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message.split('\n')[0]}`);
  }
}

const status = (page) => page.textContent('.overlay .status');
const waitStatus = (page, text) => page.waitForFunction((t) => document.querySelector('.overlay .status').textContent === t, text, { timeout: 10000 });
/** Paint one dot on surface `i` (the pause menu stays up). */
const dot = (page, i = 0) => page.evaluate((i) => window.game.paint.stamp(window.game.paint.surfaces[i], { rect: 0, u: 0.5, v: 0.5 }, 0.1, 1, [1, 0, 0]), i);
const paintedKeys = (page) => page.evaluate(() => window.game.paint.surfaces.filter((s) => s.data).map((s) => s.key).sort().join());

const page = await openPage();
// Started and paused: the menu shows SAVE PAINT.
await page.evaluate(() => (window.game.hud.setLocked(true), window.game.hud.setLocked(false)));

await check('menu: SAVE PAINT downloads one file, even clicked three times at once', async () => {
  await dot(page);
  let n = 0;
  const count = () => n++;
  page.on('download', count);
  const first = page.waitForEvent('download');
  await page.evaluate(() => { for (let i = 0; i < 3; i++) document.querySelector('.save-paint').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await (await first).saveAs(`${tmp}/menu.rhhpaint`);
  await waitStatus(page, 'PAINT SAVED');
  await page.waitForTimeout(300);
  page.off('download', count);
  return n === 1 ? null : `${n} downloads`;
});

await check('menu: with the file picker open, SAVE and LOAD do nothing; cancelling says NO FILE CHOSEN', async () => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.load-paint')]);
  let extra = 0;
  const count = () => extra++;
  page.on('download', count).on('filechooser', count);
  await page.dispatchEvent('.save-paint', 'mousedown');
  await page.click('.load-paint');
  await page.waitForTimeout(300);
  page.off('download', count).off('filechooser', count);
  await chooser.setFiles([]);
  await waitStatus(page, 'NO FILE CHOSEN');
  return extra ? `${extra} downloads or pickers while the picker was open` : null;
});

await check('menu: LOAD PAINT after a reload puts the paint back', async () => {
  const before = await paintedKeys(page);
  await page.reload();
  await ready(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.load-paint')]);
  await chooser.setFiles(`${tmp}/menu.rhhpaint`);
  await waitStatus(page, 'PAINT LOADED');
  const after = await paintedKeys(page);
  return after === before ? null : `painted ${after}, saved ${before}`;
});

await check('menu: a broken file says BROKEN PAINT FILE and keeps the paint', async () => {
  fs.writeFileSync(`${tmp}/broken.rhhpaint`, 'RHHPgarbage');
  const before = await paintedKeys(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.load-paint')]);
  await chooser.setFiles(`${tmp}/broken.rhhpaint`);
  await waitStatus(page, 'BROKEN PAINT FILE');
  return (await paintedKeys(page)) === before ? null : 'paint changed';
});

await check('saves: a sign whose text changed loses its paint (changed shape), the rest loads', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const sign = g.level.add({ type: 'sign_plate', pos: [0, 2, 30], rot: 0, text: 'STAFF ONLY' });
    const key = `p${sign.id}#0`;
    g.paint.stamp(g.paint.find(key), { rect: 0, u: 0.5, v: 0.5 }, 0.05, 1, [0, 0, 1]);
    const bytes = await g.paintFile.save();
    g.level.setText(sign.id, 'A MUCH LONGER NAME PLATE');
    const loaded = await g.paintFile.load(bytes);
    const signPainted = !!g.paint.find(key).data;
    g.level.remove(sign.id);
    return { loaded, signPainted };
  });
  return r.loaded.skipped > 0 && r.loaded.faces > 0 && !r.signPainted ? null : JSON.stringify(r);
});

await check('saves: spray in the air at LOAD lands without paint', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const frames = (n, each) => new Promise((done) => { let f = 0; g.fixedStep.script = () => { each(f); if (++f === n) { g.fixedStep.script = null; done(); } }; });
    g.input.locked = true;
    g.player.setSpawn(g.player.position.clone().set(2.4, 0, 2.95), -Math.PI / 2);
    g.player.respawn();
    g.player.pitch = -0.3;
    g.inventory.select(0);
    g.paint.clear();
    const empty = await g.paintFile.save();
    g.fixedStep.dt = 1 / 60;
    let inAir = 0;
    await frames(60, (f) => {
      g.input.lmb = f < 8;
      if (f === 8) (inAir = g.tools.spray.particles.count), g.paintFile.load(empty);
    });
    g.fixedStep.dt = 0;
    g.input.locked = false;
    return { inAir, painted: g.paint.surfaces.filter((s) => s.data).length };
  });
  return r.inAir > 0 && r.painted === 0 ? null : JSON.stringify(r);
});

await check('sponge: a surface cleaned completely gives its memory back', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { inventory: inv, input, config } = g;
    const frames = (n, each) => new Promise((done) => { let f = 0; g.fixedStep.script = () => { each(f); if (++f === n) { g.fixedStep.script = null; done(); } }; });
    input.locked = true;
    inv.give('sponge');
    for (const c of config.CAP_ORDER) inv.addCap(c);
    while (inv.cap !== 'skinny') inv.cycleCap(1);
    g.player.yaw = -Math.PI / 2 + 0.2;
    g.player.pitch = -0.2;
    g.fixedStep.dt = 1 / 60;
    inv.select(0);
    await frames(40, (f) => (input.lmb = f < 6));
    const sprayed = g.paint.gpu.textureCount;
    inv.select(4);
    inv.size.sponge = 0.6;
    await frames(160, (f) => (input.lmb = f < 150));
    g.fixedStep.dt = 0;
    input.locked = false;
    return { sprayed, after: g.paint.gpu.textureCount };
  });
  return r.sprayed > 0 && r.after === 0 ? null : JSON.stringify(r);
});

await check('levels: props keep their ids through edits, reloads and undo; version 2 files number them in order', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const ids = () => [...g.level.props.keys()];
    const out = { first: ids()[0], count: ids().length };
    g.level.remove(5);
    const saved = g.build.getLevelData();
    g.loadLevel(saved);
    out.kept = !g.level.props.has(5) && g.level.props.has(6) && saved.version === 3;
    out.next = g.level.add({ type: 'slab', pos: [0, 12, 0], rot: 0 }).id;
    const p = g.level.props.get(10);
    const data = { id: p.id, type: p.type, pos: p.pos, rot: p.rot };
    g.level.remove(10);
    out.undone = g.level.add(data).id;
    g.loadLevel({ ...saved, version: 2, props: saved.props.map(({ id, ...rest }) => rest) });
    out.v2 = [ids()[0], ids()[5]];
    return out;
  });
  return r.first === 1 && r.kept && r.next === r.count + 1 && r.undone === 10 && r.v2.join() === '1,6' ? null : JSON.stringify(r);
});

await check("levels: the level save keeps the level's city overrides", async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    g.loadLevel({ ...g.build.getLevelData(), skyline: { seed: 77, radius: 300 } });
    const saved = g.build.getLevelData();
    g.loadLevel({ ...saved, skyline: undefined });
    return { skyline: saved.skyline, without: 'skyline' in g.build.getLevelData() };
  });
  return r.skyline?.seed === 77 && !r.without ? null : JSON.stringify(r);
});

await check('levels: saves are named after the level opened in build mode, and say so when refused', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const header = (bytes) => JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + new DataView(bytes.buffer).getUint32(4, true))));
    g.paint.stamp(g.paint.surfaces[0], { rect: 0, u: 0.5, v: 0.5 }, 0.05, 1, [1, 0, 0]);
    const demo = await g.paintFile.save();
    const data = g.build.getLevelData();
    g.build.onLoad({ ...data, props: data.props.filter((p) => p.id !== Number(g.paint.surfaces[0].key.slice(1).split('#')[0])) }, 'my-roof');
    g.paint.stamp(g.paint.surfaces[1], { rect: 0, u: 0.5, v: 0.5 }, 0.05, 1, [1, 0, 0]);
    const roof = header(await g.paintFile.save()).level.name;
    const refused = await g.paintFile.load(demo).then(() => 'loaded', (e) => e.message);
    return { demo: header(demo).level.name, roof, refused };
  });
  return r.demo === 'demo' && r.roof === 'my-roof' && r.refused === 'SAVED FOR DEMO' ? null : JSON.stringify(r);
});

await check('tools: the wheel changes the player\'s nib, roller and patch width, not the config', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { inventory: inv, input, tools, config } = g;
    const notch = (dir) => new Promise((done) => { g.fixedStep.script = () => { input.wheelSteps = dir; g.fixedStep.script = null; requestAnimationFrame(done); }; });
    input.locked = true;
    inv.give('marker');
    inv.give('sponge');
    inv.give('roller');
    inv.size = { marker: config.MARKER.width, roller: config.ROLLER.width, sponge: config.SPONGE.width };
    inv.select(1);
    const crosshair = tools.crosshair('marker');
    for (let i = 0; i < 3; i++) await notch(-1);
    const out = { marker: inv.size.marker, grew: tools.crosshair('marker') > crosshair };
    for (let i = 0; i < 30; i++) await notch(1);
    out.min = inv.size.marker;
    inv.select(4);
    await notch(-1);
    out.sponge = inv.size.sponge;
    inv.select(3);
    await notch(-1);
    out.roller = inv.size.roller;
    out.config = [config.MARKER.width, config.SPONGE.width];
    input.locked = false;
    return out;
  });
  return r.marker === 0.048 && r.grew && r.min === 0 && r.sponge === 0.22 && r.roller === 0.5 && r.config.join() === '0.024,0.18' ? null : JSON.stringify(r);
});

await check('ladders: one per player, moved with one rebuild; each owner\'s stays until they take it away; never saved', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const level = g.level;
    let rebuilds = 0;
    const onChange = level.onChange;
    level.onChange = () => (rebuilds++, onChange());
    const ladder = (x) => ({ type: 'stepladder', pos: [x, 0, 30], rot: 0 });
    const ladders = () => [...level.props.values()].filter((p) => p.type === 'stepladder').map((p) => `${p.owner}@${p.pos[0]}`).sort().join();
    const props = level.props.size;
    level.setRuntime('a', ladder(0));
    level.setRuntime('a', ladder(2));
    const moved = rebuilds;
    level.setRuntime('b', ladder(4));
    const both = ladders();
    const saved = level.toJSON().props.length;
    level.setRuntime('a', null);
    const left = ladders();
    level.setRuntime('b', null);
    // The ladder tool places this player's.
    g.tools.ladder.put({ pos: [6, 0, 30], rot: 0 });
    g.tools.ladder.put({ pos: [8, 0, 30], rot: 0 });
    const yours = ladders();
    level.setRuntime(g.session.player, null);
    level.onChange = onChange;
    return { moved, both, saved: saved - props, left, yours, back: level.props.size - props };
  });
  return r.moved === 2 && r.both === 'a@2,b@4' && r.saved === 0 && r.left === 'b@4' && r.yours === 'local@8' && r.back === 0 ? null : JSON.stringify(r);
});

await check('session: B and F3 open build mode and the panel in single player; a session closes them and the keys do nothing', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const press = async (code) => (window.dispatchEvent(new KeyboardEvent('keydown', { code })), window.dispatchEvent(new KeyboardEvent('keyup', { code })), frame());
    const state = () => `${g.build.active ? 'build' : '-'} ${g.debug.visible ? 'panel' : '-'}`;
    g.input.locked = true;
    await press('KeyB');
    await press('F3');
    const solo = state();
    g.session.multiplayer = true;
    await frame();
    const entered = state();
    await press('KeyB');
    await press('F3');
    const inSession = state();
    g.session.multiplayer = false;
    g.input.locked = false;
    return { solo, entered, inSession };
  });
  return r.solo === 'build panel' && r.entered === '- -' && r.inSession === '- -' ? null : JSON.stringify(r);
});

await check('session: paused, the world goes on (you fall, paint runs run) and keys don\'t move you; paused in single player, it stops', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const frames = (n) => new Promise((done) => { const tick = () => (--n ? requestAnimationFrame(tick) : done()); requestAnimationFrame(tick); });
    const tpm = g.config.PAINT.texelsPerMeter;
    // A paint run down a tall face, slow enough to last.
    const s = g.paint.surfaces.find((x) => x.geo.rects.some((r) => r.h > 1.5 * tpm));
    const rect = s.geo.rects.findIndex((r) => r.h > 1.5 * tpm);
    g.paintOps.apply({ kind: 'drip', key: s.key, rect, u: 0.5, v: 0.95, length: 1, speed: 0.2, rgb: [1, 0, 0] });
    const ink = () => (s.data ?? []).reduce((n, v, i) => (i % 4 === 3 ? n + v : n), 0);
    const step = async () => {
      g.player.position.y += 2;
      g.player.velocity.set(0, 0, 0);
      const [x, y, z, a] = [g.player.position.x, g.player.position.y, g.player.position.z, ink()];
      // Keys pressed behind the menu don't move you.
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      await frames(6);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      const walked = g.player.position.x !== x || g.player.position.z !== z;
      return `${g.player.position.y < y ? 'fell' : 'still'} ${ink() > a ? 'ran' : 'stopped'}${walked ? ' walked' : ''}`;
    };
    // Frames here run uncapped: give each one a real step.
    g.fixedStep.dt = 0.05;
    g.input.locked = false;
    const solo = await step();
    g.session.multiplayer = true;
    const inSession = await step();
    g.session.multiplayer = false;
    g.fixedStep.dt = 0;
    g.drips.clear();
    g.paint.clear();
    return { solo, inSession };
  });
  return r.solo === 'still stopped' && r.inSession === 'fell ran' ? null : JSON.stringify(r);
});

await check('avatar: one draw call for the body, at most two for a tool; every test pose keeps it on its feet and in one piece', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const frames = (n) => new Promise((done) => { const tick = () => (--n ? requestAnimationFrame(tick) : done()); requestAnimationFrame(tick); });
    g.fixedStep.dt = 0.05;
    g.live.avatarToggle();
    let fig = null;
    g.level.root.parent.traverse((o) => (fig ??= o.isSkinnedMesh ? o : null));
    const out = { meshes: 0, problems: [] };
    const y = (name) => { const b = fig.skeleton.bones.find((x) => x.name === name); b.updateWorldMatrix(true, false); return b.matrixWorld.elements[13] - fig.parent.position.y; };
    const seen = new Set();
    for (;;) {
      g.live.avatarNext();
      // '7 / 18: jump' -> 'jump'
      const pose = g.live.avatarPose().split(': ')[1];
      if (seen.has(pose)) break;
      seen.add(pose);
      await frames(12);
      let meshes = 0;
      fig.parent.traverse((o) => (meshes += o.isMesh ? 1 : 0));
      out.meshes = Math.max(out.meshes, meshes);
      const bad = fig.skeleton.bones.some((b) => ![b.rotation.x, b.rotation.y, b.rotation.z, b.position.y].every(Number.isFinite));
      if (bad) out.problems.push(`${pose}: not a number`);
      const feet = Math.min(y('footL'), y('footR'));
      const grounded = !['jump', 'climb'].includes(pose);
      if (grounded && Math.abs(feet - g.config.AVATAR.ankle) > 0.03) out.problems.push(`${pose}: ankles at ${feet.toFixed(2)}`);
      if (pose === 'crouch' && y('head') > 1.25) out.problems.push(`crouch: head at ${y('head').toFixed(2)}`);
      if (pose === 'spray up' && y('handR') < y('upperArmR')) out.problems.push('spray up: hand below the shoulder');
    }
    g.live.avatarToggle();
    g.fixedStep.dt = 0;
    return { ...out, poses: seen.size };
  });
  return r.meshes <= 3 && !r.problems.length && r.poses > 10 ? null : JSON.stringify(r);
});

await check('ghost: a recorded walk plays back through a jittery network smoothly, on the recorded path, and repaints the strokes exactly', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { GHOST } = g.config;
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    const wait = async (s) => { const end = performance.now() + s * 1000; while (performance.now() < end) await frame(); };
    const hash = () => g.paint.surfaces.filter((s) => s.data).reduce((h, s) => s.data.reduce((h, v) => (h * 31 + v) >>> 0, h), 7);
    g.paint.clear();
    g.player.fly = true;
    const start = g.player.position.clone();
    const speed = 3;
    // Walk 1.5 s along x, painting twice on the way.
    g.ghost.record();
    const t0 = performance.now() / 1000;
    let painted = 0;
    g.fixedStep.script = () => {
      const t = performance.now() / 1000 - t0;
      g.player.position.set(start.x + speed * Math.min(t, 1.5), start.y, start.z);
      if (painted < 2 && t > 0.4 + painted * 0.6) g.paint.stamp(g.paint.surfaces[painted++], { rect: 0, u: 0.5, v: 0.5 }, 0.1, 1, [1, 0, 0]);
    };
    await wait(1.7);
    g.fixedStep.script = null;
    g.ghost.stop();
    const end = hash();
    Object.assign(GHOST, { latency: 0.1, jitter: 0.06, hiccups: 0 });
    g.ghost.play();
    const xs = [];
    let cleared = false;
    let repainted = false;
    let buffered = false;
    const until = performance.now() + 2600;
    while (performance.now() < until) {
      await frame();
      const p = g.ghost.position;
      if (p) xs.push([p.x - start.x, p.y - start.y, p.z - start.z, performance.now() / 1000]);
      if (g.ghost.net?.buffered) buffered = true;
      const h = hash();
      if (h === 7) cleared = true;
      if (cleared && h === end) repainted = true;
    }
    g.ghost.stop();
    Object.assign(GHOST, { latency: 0.08, jitter: 0.04 });
    g.player.fly = false;
    g.player.position.copy(start);
    g.paint.clear();
    // Going back, and the fastest it moved over any 50 ms (against the walk's speed: smooth is about 1).
    let back = 0;
    let fastest = 0;
    let off = 0;
    for (let i = 1, j = 0; i < xs.length; i++) {
      back = Math.max(back, xs[i - 1][0] - xs[i][0]);
      while (xs[i][3] - xs[j][3] > 0.05) j++;
      if (j > 0) fastest = Math.max(fastest, (xs[i][0] - xs[j - 1][0]) / (xs[i][3] - xs[j - 1][3]) / speed);
      off = Math.max(off, Math.abs(xs[i][1]), Math.abs(xs[i][2]), xs[i][0] - speed * 1.5 - 0.01, -xs[i][0]);
    }
    return { frames: xs.length, reached: xs.length ? xs[xs.length - 1][0] : 0, back, fastest, off, cleared, repainted, buffered };
  });
  const ok = r.frames > 30 && r.reached > 4.4 && r.back < 0.001 && r.fastest < 1.25 && r.off < 0.01 && r.cleared && r.repainted && r.buffered;
  return ok ? null : JSON.stringify(r);
});

await check('city: LOW city detail is the middle of HIGH, tower for tower, roof for roof', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { layoutCity, dressTower, wallSigns } = g.cityParts;
    const S = g.config.SKYLINE;
    const bounds = g.level.totalBounds();
    // LOW and HIGH as in settings.ts (CITY_DETAIL).
    const details = { low: { ...S, radius: 380, clutterRange: 110 }, high: { ...S } };
    const key = (t) => JSON.stringify([t.tiers.map((x) => [x.x0, x.z0, x.x1, x.z1, x.top].map((v) => v.toFixed(3))), t.facade, t.gray.toFixed(4)]);
    // What a tower's dressing builds: every box and cylinder, in order.
    const dress = (t, cfg) => {
      const calls = [];
      const stub = new Proxy({}, { get: (_, k) => (k === 'box' || k === 'cyl' ? (...a) => calls.push(`${k} ${a.map((v) => (typeof v === 'number' ? v.toFixed(3) : v)).join()}`) : () => stub) });
      dressTower(t, cfg.clutterRange, stub, stub, stub);
      wallSigns(t, cfg.clutterRange, stub, stub);
      return calls;
    };
    const built = {};
    for (const [name, cfg] of Object.entries(details)) built[name] = new Map(layoutCity(bounds, cfg).map((t) => [key(t), dress(t, cfg)]));
    let missing = 0;
    let differ = 0;
    let lowBoxes = 0;
    for (const [k, calls] of built.low) {
      const high = built.high.get(k);
      if (!high) missing++;
      else if (calls.some((c, i) => c !== high[i])) differ++;
      lowBoxes += calls.length;
    }
    return { low: built.low.size, high: built.high.size, missing, differ, lowBoxes };
  });
  return r.low > 500 && r.high > r.low && r.missing === 0 && r.differ === 0 && r.lowBoxes > 1000 ? null : JSON.stringify(r);
});

await check('ghost: on a bad link (resent packets) a walk that stops is never shown jumping: guesses past a late snapshot glide back', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { GHOST } = g.config;
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    const wait = async (s) => { const end = performance.now() + s * 1000; while (performance.now() < end) await frame(); };
    g.player.fly = true;
    const start = g.player.position.clone();
    // Walk and stop, three times: each stop is where a guess overshoots.
    g.ghost.record();
    const t0 = performance.now() / 1000;
    g.fixedStep.script = () => {
      const t = performance.now() / 1000 - t0;
      const walked = Math.min(t % 1, 0.6) + Math.floor(t) * 0.6;
      g.player.position.set(start.x + 5 * walked, start.y, start.z);
    };
    await wait(3);
    g.fixedStep.script = null;
    g.ghost.stop();
    // A packet in five is lost and resent 0.3 s later; everything behind it waits.
    Object.assign(GHOST, { latency: 0.05, jitter: 0.02, hiccups: 0.2, hiccupDelay: 0.3 });
    g.ghost.play();
    const xs = [];
    const until = performance.now() + 3600;
    while (performance.now() < until) {
      await frame();
      const p = g.ghost.position;
      if (p) xs.push([p.x - start.x, performance.now() / 1000]);
    }
    g.ghost.stop();
    Object.assign(GHOST, { latency: 0.08, jitter: 0.04, hiccups: 0 });
    g.player.fly = false;
    g.player.position.copy(start);
    let back = 0;
    let fastest = 0;
    for (let i = 1; i < xs.length; i++) {
      const dt = Math.max(xs[i][1] - xs[i - 1][1], 1 / 120);
      back = Math.max(back, (xs[i - 1][0] - xs[i][0]) / dt);
      fastest = Math.max(fastest, (xs[i][0] - xs[i - 1][0]) / dt);
    }
    return { frames: xs.length, reached: xs.length ? xs[xs.length - 1][0] : 0, back, fastest };
  });
  // Walking is 5 m/s; going back (a smoothed correction) and forward stay within a walk's speed (unsmoothed: 30 m/s and more).
  return r.frames > 30 && r.reached > 8.5 && r.back < 4 && r.fastest < 8 ? null : JSON.stringify(r);
});

await check('avatar test figure: the pose slider stops on a pose, moving poses go round the loop (on the spot if asked), slow motion slows them', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const T = g.config.AVATAR_TEST;
    const frames = (n) => new Promise((done) => { const tick = () => (--n ? requestAnimationFrame(tick) : done()); requestAnimationFrame(tick); });
    g.fixedStep.dt = 0.05;
    g.live.avatarToggle();
    let fig = null;
    g.level.root.parent.traverse((o) => (fig ??= o.isSkinnedMesh ? o.parent : null));
    // Standing still first (idle), to find where it stands.
    T.pose = 0;
    g.live.avatarPick();
    await frames(2);
    const center = fig.position.clone();
    T.pose = 1;
    g.live.avatarPick();
    const picked = g.live.avatarPose();
    // Walking round the loop: how far it went in 10 frames, and how far from the middle it stays.
    const walk = async () => {
      const a = fig.position.clone();
      await frames(10);
      return [fig.position.distanceTo(a), fig.position.distanceTo(center)];
    };
    const [moved, radius] = await walk();
    T.timeScale = 0.25;
    const [slow] = await walk();
    T.timeScale = 1;
    T.onTheSpot = true;
    await frames(2);
    const [spot] = await walk();
    T.onTheSpot = false;
    g.live.avatarToggle();
    g.fixedStep.dt = 0;
    return { picked, moved, radius, slow, spot };
  });
  const ok = r.picked.startsWith('2 / ') && r.picked.includes('walk') && !r.picked.includes('cycling') && r.moved > 1 && Math.abs(r.radius - 1.6) < 0.01 && r.slow < r.moved * 0.4 && r.spot < 0.001;
  return ok ? null : JSON.stringify(r);
});

await check('hotbar: icons arrive from the GPU (read back without stalling) and the slots are drawn again', async () => {
  await page.evaluate(() => { for (const t of ['marker', 'ladder', 'roller', 'sponge']) window.game.inventory.give(t); });
  const ready = () => page.evaluate(() => [...document.querySelectorAll('.hotbar img')].filter((i) => i.src.startsWith('data:image/png')).length);
  await page.waitForFunction(() => [...document.querySelectorAll('.hotbar img')].every((i) => i.src.startsWith('data:image/png')), null, { timeout: 10000 }).catch(() => {});
  const n = await ready();
  return n === 5 ? null : `${n} of 5 icons arrived`;
});

if (page.errors.length) {
  failed++;
  console.log(`FAIL  page errors: ${page.errors.join('; ')}`);
}
await page.close();

await check('signs: their size is the same with a 20% narrower font', async () => {
  const widths = async (narrow) => {
    const p = await openPage(narrow ? () => { const m = CanvasRenderingContext2D.prototype.measureText; CanvasRenderingContext2D.prototype.measureText = function (t) { return { width: m.call(this, t).width * 0.8 }; }; } : undefined);
    const w = await p.evaluate(() => {
      const g = window.game;
      return ['sign_exit', 'sign_plate', 'sign_voltage'].map((type) => {
        const inst = g.level.add({ type, pos: [0, 2, 30], rot: 0 });
        const b = g.level.builtProps.find((x) => x.paint.some((s) => s.key.startsWith(`p${inst.id}#`)));
        const box = b.colliders.reduce((u, c) => u.union(c), b.colliders[0].clone());
        g.level.remove(inst.id);
        return (box.max.x - box.min.x).toFixed(4);
      });
    });
    await p.close();
    return w.join();
  };
  const [normal, narrow] = await Promise.all([widths(false), widths(true)]);
  return normal === narrow ? null : `${normal} vs ${narrow}`;
});

await test.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `game tests: FAILED (${failed})` : 'game tests: all ok');
process.exitCode = failed ? 1 : 0;
