// Game tests in the browser: behavior the golden paint test doesn't cover.
// The pause menu's SAVE / LOAD PAINT (one at a time, cancel, broken files,
// reload), level names, paint saves through level edits and changed props,
// spray in the air at LOAD, the sponge freeing memory, prop ids for good,
// per-player tool sizes, city overrides in the level save, dev tools only in
// single player, hotbar icons, and small-sign sizes with another font. Each
// check prints ok or what went wrong.
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
    inv.size.sponge = 0.3;
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

await check('tools: the wheel changes the player\'s nib and patch size, not the config', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { inventory: inv, input, tools, config } = g;
    const notch = (dir) => new Promise((done) => { g.fixedStep.script = () => { input.wheelSteps = dir; g.fixedStep.script = null; requestAnimationFrame(done); }; });
    input.locked = true;
    inv.give('marker');
    inv.give('sponge');
    inv.size = { marker: config.MARKER.radius, sponge: config.SPONGE.radius };
    inv.select(1);
    const crosshair = tools.crosshair('marker');
    for (let i = 0; i < 3; i++) await notch(-1);
    const out = { marker: inv.size.marker, grew: tools.crosshair('marker') > crosshair };
    for (let i = 0; i < 30; i++) await notch(1);
    out.min = inv.size.marker;
    inv.select(4);
    await notch(-1);
    out.sponge = inv.size.sponge;
    out.config = [config.MARKER.radius, config.SPONGE.radius];
    input.locked = false;
    return out;
  });
  return r.marker === 0.024 && r.grew && r.min === 0 && r.sponge === 0.11 && r.config.join() === '0.012,0.09' ? null : JSON.stringify(r);
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
