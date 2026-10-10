// Game tests in the browser: behavior the golden paint test doesn't cover.
// Pickups placed before the game first runs, the pause menu's SAVE / LOAD PAINT (one at a time, cancel, broken files,
// reload), level names, paint saves through level edits and changed props,
// stairs from older level files, spray in the air at LOAD, the sponge
// freeing memory, prop ids for good,
// per-player tool sizes, city overrides in the level save, dev tools only in
// single player, the world going on while paused in a session, stepladders by
// owner, the avatar's poses, the ghost's playback, the same city at every
// city detail, hotbar icons, hints painted in build mode, a level's own paint, and small-sign sizes with another font. Each check prints ok or what went wrong.
// Usage: node scripts/game.test.mjs [url]   (no url: starts its own server)
import fs from 'node:fs';
import os from 'node:os';
import { gameReady, noDrawing, openTestBrowser } from './test-browser.mjs';

// Pages here don't draw (no check needs a picture), so frames can run uncapped.
const test = await openTestBrowser(process.argv[2], { uncapped: true });
const tmp = fs.mkdtempSync(`${os.tmpdir()}/taggin-test-`);
let failed = 0;

/** A page with the game loaded, not drawing (SwiftShader draws on the CPU, seconds a frame); page errors fail the run. `before(page)`: set up before it loads (routes). */
async function openPage(init, before) {
  const page = await test.browser.newPage({ viewport: { width: 320, height: 180 }, acceptDownloads: true });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(noDrawing);
  await page.addInitScript(pageSteps);
  if (init) await page.addInitScript(init);
  await before?.(page);
  await page.goto(test.url);
  await gameReady(page, 2);
  return page;
}

/**
 * In the page, `steps(each)`: frames of a fixed 1/60 s, `each(frame)` at the start of every one until it returns
 * true. Game time, not the wall clock, so a check gives the same result every run; after 30 s it stops anyway, so a
 * check that never gets there fails instead of hanging.
 */
function pageSteps() {
  window.steps = (each) =>
    new Promise((done) => {
      const g = window.game;
      const end = performance.now() + 30000;
      let f = 0;
      g.fixedStep.dt = 1 / 60;
      g.fixedStep.script = () => (each(f++) || performance.now() > end) && ((g.fixedStep.script = null), done());
    });
}

async function check(name, fn) {
  // Every check starts alike, whatever ran (or failed) before it: seeded paint randomness (spray, drips), frames on the clock.
  if (!page.isClosed())
    await page.evaluate(() => {
      const g = window.game;
      g.seedPaintRandom(1);
      Object.assign(g.fixedStep, { dt: 0, script: null });
    });
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

await check('pickups: on the start screen, before the game first runs, they already hover in their rings', async () => {
  const r = await page.evaluate(() => {
    const { pickups, config } = window.game;
    const { hover, bob } = config.PICKUP;
    const off = (y) => Math.abs(y - hover) > bob + 1e-6;
    const all = [...pickups.list.values()];
    return { count: all.length, sunk: all.filter((p) => off(p.item.position.y) || off(p.halo.position.y)).map((p) => p.kind) };
  });
  return r.count && !r.sunk.length ? null : JSON.stringify(r);
});

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
  await gameReady(page, 2);
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
    g.input.locked = true;
    g.player.setSpawn(g.player.position.clone().set(2.4, 0, 2.95), -Math.PI / 2);
    g.player.respawn();
    g.player.pitch = -0.3;
    g.inventory.select(0);
    g.paint.clear();
    const empty = await g.paintFile.save();
    let inAir = 0;
    await steps((f) => {
      g.input.lmb = f < 8;
      if (f === 8) (inAir = g.tools.spray.particles.count), g.paintFile.load(empty);
      return f === 59;
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
    input.locked = true;
    inv.give('sponge');
    for (const c of config.CAP_ORDER) inv.addCap(c);
    while (inv.cap !== 'skinny') inv.cycleCap(1);
    g.player.yaw = -Math.PI / 2 + 0.2;
    g.player.pitch = -0.2;
    inv.select(0);
    await steps((f) => ((input.lmb = f < 6), f === 39));
    const sprayed = g.paint.gpu.textureCount;
    inv.select(4);
    inv.size.sponge = 0.6;
    await steps((f) => ((input.lmb = f < 150), f === 159));
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
    out.kept = !g.level.props.has(5) && g.level.props.has(6) && saved.version === 4;
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

await check('levels: faces pressed against another prop are decor and come back when it goes; paint stays on the rest; colliders stay', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const saved = g.build.getLevelData();
    const a = { id: 1, type: 'building', pos: [0, 0, 0], rot: 0 };
    const b = { id: 2, type: 'building', pos: [2, 0, 0], rot: 0 };
    // Faces on the plane x = 1, where the two blocks touch; and a's west face (x = -1), painted.
    const faces = () => g.paint.surfaces.flatMap((s) => s.geo.rects.map((r, i) => ({ s, r, i }))).filter((f) => f.r.face);
    const at = (x, nx) => faces().filter((f) => Math.abs(f.r.face.origin.x - x) < 0.01 && f.r.face.normal.x === nx);
    const west = () => at(-1, -1)[0];
    const paintAt = (f) => f.s.data?.[((f.r.y + (f.r.h >> 1)) * f.s.geo.atlasW + f.r.x + (f.r.w >> 1)) * 4 + 3] ?? 0;
    g.loadLevel({ version: 4, spawn: saved.spawn, props: [a] });
    const out = { alone: at(1, 1).length, colliders: [g.level.colliders.length] };
    const w = west();
    g.paint.stamp(w.s, { rect: w.i, u: 0.5, v: 0.5 }, 0.3, 1, [1, 0, 0]);
    g.level.add(b);
    out.together = at(1, 1).length + at(1, -1).length;
    out.colliders.push(g.level.colliders.length);
    out.paintKept = paintAt(west());
    g.level.remove(2);
    out.back = at(1, 1).length;
    out.paintAfter = paintAt(west());
    g.loadLevel(saved);
    return out;
  });
  return r.alone > 0 && r.together === 0 && r.back === r.alone && r.colliders.join() === '3,6' && r.paintKept > 0 && r.paintAfter > 0 ? null : JSON.stringify(r);
});

await check('paint pages: each surface has its own block of a page, on whole 8-texel cells, and no cell holds two faces', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const cell = 2 ** (g.config.PAINT.mipLevels - 1);
    const out = { surfaces: g.paint.surfaces.length, misaligned: 0, outside: 0, overlaps: 0, sharedCells: 0 };
    const taken = new Map();
    for (const s of g.paint.surfaces) {
      const b = s.slot;
      if (b.x % cell || b.y % cell || b.w % cell || b.h % cell || b.w < s.geo.atlasW || b.h < s.geo.atlasH) out.misaligned++;
      if (b.x + b.w > b.page.size || b.y + b.h > b.page.size) out.outside++;
      for (const o of taken.get(b.page) ?? []) if (b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h) out.overlaps++;
      taken.set(b.page, [...(taken.get(b.page) ?? []), b]);
      // Each face with its 1-texel ring, in cells of the smallest level: no cell shared.
      const cells = new Set();
      for (const f of s.geo.rects) {
        const mine = new Set();
        for (let cy = Math.floor((f.y - 1) / cell); cy <= Math.floor((f.y + f.h) / cell); cy++)
          for (let cx = Math.floor((f.x - 1) / cell); cx <= Math.floor((f.x + f.w) / cell); cx++) mine.add(`${cx},${cy}`);
        for (const c of mine) cells.has(c) ? out.sharedCells++ : cells.add(c);
      }
    }
    return out;
  });
  return r.surfaces > 0 && !r.misaligned && !r.outside && !r.overlaps && !r.sharedCells ? null : JSON.stringify(r);
});

await check('paint pages: a painted level draws in as many calls as a clean one; cleaned off, its pages go', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const frames = (n) => new Promise((done) => { let f = 0; const step = () => (++f >= n ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); });
    const calls = async () => {
      g.debug.toggle();
      await frames(4);
      const n = g.live.stats.drawCalls;
      g.debug.toggle();
      return n;
    };
    g.paint.clear();
    await frames(2);
    const out = { clean: await calls(), meshes: g.level.merged.surfaces.children.length };
    for (const s of g.paint.surfaces) g.paint.stamp(s, { rect: 0, u: 0.5, v: 0.5 }, 0.3, 1, [1, 0, 0]);
    await frames(2);
    out.painted = await calls();
    out.meshesPainted = g.level.merged.surfaces.children.length;
    out.pages = g.paint.gpu.textureCount;
    g.paint.clear();
    await frames(2);
    out.pagesAfter = g.paint.gpu.textureCount;
    return out;
  });
  return r.clean > 0 && r.painted === r.clean && r.meshesPainted === r.meshes && r.pages > 0 && r.pagesAfter === 0 ? null : JSON.stringify(r);
});

/** Paint a hint on the wall the demo's spawn faces (build mode's Hint entry, build/paint-editor.ts); the game's camera aims. */
const paintHint = (page) =>
  page.evaluate(async () => {
    const g = window.game;
    g.player.yaw = -Math.PI / 2;
    g.player.pitch = 0.1;
    // A frame or two for the camera to turn.
    await window.steps((f) => f >= 2);
    const editor = g.build.paintEdit;
    editor.text = '<k>RMB</k> Shake your can to release pressure';
    editor.size = 0.3;
    editor.stamp('black', g.scene.children.find((o) => o.isPerspectiveCamera));
  });

await check('hints: painted as paint, across wall pieces; H boxes every painted face over the walls; X wipes a face; wiped clean, the memory comes back', async () => {
  await page.evaluate(() => window.game.paint.clear());
  await paintHint(page);
  const r = await page.evaluate(() => {
    const g = window.game;
    const editor = g.build.paintEdit;
    const painted = () => g.paint.surfaces.filter((s) => s.data);
    // Painted faces, and how much of the box around the paint is paint (letters, not a block).
    let faces = 0;
    let lit = 0;
    let all = 0;
    for (const s of painted()) {
      s.geo.rects.forEach((r) => {
        let n = 0;
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) n += s.data[(y * s.geo.atlasW + x) * 4 + 3] > 0 ? 1 : 0;
        if (n) (faces++, (lit += n), (all += r.w * r.h));
      });
    }
    const out = { surfaces: painted().length, faces, lit };
    editor.cycleView();
    editor.cycleView();
    out.boxes = editor.spots.count;
    out.overWalls = editor.spots.lines.material.depthTest === false && editor.spots.lines.visible;
    editor.wipe(editor.aim(g.scene.children.find((o) => o.isPerspectiveCamera)));
    out.wiped = painted().length;
    for (const s of painted()) s.geo.rects.forEach((_, i) => g.paint.wipe(s, i));
    out.pages = g.paint.gpu.textureCount;
    editor.visible = false;
    out.spotsAfter = editor.spots.lines.visible;
    return out;
  });
  const ok = r.surfaces > 1 && r.lit > 0 && r.boxes === r.faces && r.overWalls && r.wiped === r.surfaces - 1 && r.pages === 0 && !r.spotsAfter;
  return ok ? null : JSON.stringify(r);
});

await check('hints: Ctrl+Z takes a hint off (its memory too) and puts a wiped face back', async () => {
  await page.evaluate(() => window.game.paint.clear());
  await paintHint(page);
  const r = await page.evaluate(() => {
    const g = window.game;
    // Texels with paint, and Ctrl+Z (build mode's history).
    window.lit = () => g.paint.surfaces.reduce((n, s) => { if (s.data) for (let i = 3; i < s.data.length; i += 4) n += s.data[i] ? 1 : 0; return n; }, 0);
    window.undo = () => g.build.history.undo((e) => g.build.revert(e));
    const painted = lit();
    undo();
    return { painted, undone: lit(), pages: g.paint.gpu.textureCount };
  });
  await paintHint(page);
  const w = await page.evaluate(() => {
    const g = window.game;
    const editor = g.build.paintEdit;
    const before = lit();
    editor.wipe(editor.aim(g.scene.children.find((o) => o.isPerspectiveCamera)));
    const wiped = lit();
    undo();
    const back = lit();
    undo();
    g.paint.clear();
    return { before, wiped, back };
  });
  Object.assign(r, w);
  return r.painted > 0 && r.undone === 0 && r.pages === 0 && r.wiped < r.before && r.back === r.before ? null : JSON.stringify(r);
});

await check('hints: small hints up and down a wall, each next to faces it doesn\'t reach, paint and all undo', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const cam = g.scene.children.find((o) => o.isPerspectiveCamera);
    const editor = g.build.paintEdit;
    g.paint.clear();
    g.player.yaw = -Math.PI / 2 + 0.3;
    editor.text = '<k>RMB</k> Shake your can';
    editor.size = 0.2;
    const out = { stamped: 0, errors: [] };
    for (let i = 0; i < 7; i++) {
      g.player.pitch = Math.atan2(1 - i * 0.32, 6);
      await window.steps((f) => f >= 2);
      try {
        editor.stamp('white', cam);
        out.stamped++;
      } catch (e) {
        out.errors.push(e.message);
      }
    }
    out.lit = lit();
    for (let i = 0; i < out.stamped; i++) undo();
    out.undone = lit();
    g.paint.clear();
    return out;
  });
  return r.stamped === 7 && r.lit > 0 && r.undone === 0 && !r.errors.length ? null : JSON.stringify(r);
});

await check('hints: <br> starts a new line; a hint of only <br> is nothing', async () => {
  const r = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/build/stencil-text.ts'));
    const { hintImage } = await import(url);
    const one = hintImage('<k>A</k> one', 'mono', 0.4, 100);
    const two = hintImage('<k>A</k> one<br>two', 'mono', 0.4, 100);
    const three = hintImage('<k>A</k> one<BR><br/>two', 'mono', 0.4, 100);
    return { one: one.h, two: two.h, three: three.h, pitch: window.game.config.HINT.lineHeight * 40, wide: two.w === one.w, empty: hintImage('<br>', 'mono', 0.4, 100) };
  });
  const near = (a, b) => Math.abs(a - b) <= 2;
  return near(r.two - r.one, r.pitch) && near(r.three - r.one, 2 * r.pitch) && r.wide && r.empty === null ? null : JSON.stringify(r);
});

await check('hints: every font paints; softness 0 paints whole texels only, softness 1 a soft edge', async () => {
  const r = {};
  for (const [font, softness] of [['graffiti', 1], ['gothic', 0], ['gothic', 1], ['mono', 0.3]]) {
    await page.evaluate(([font, softness]) => {
      const g = window.game;
      g.paint.clear();
      g.build.paintEdit.font = font;
      window.oldLook = { ...g.config.HINT.looks[font] };
      g.config.HINT.looks[font].softness = softness;
    }, [font, softness]);
    await paintHint(page);
    r[`${font} ${softness}`] = await page.evaluate((font) => {
      const g = window.game;
      Object.assign(g.config.HINT.looks[font], window.oldLook);
      let lit = 0;
      let soft = 0;
      for (const s of g.paint.surfaces.filter((s) => s.data)) for (let i = 3; i < s.data.length; i += 4) (lit += s.data[i] > 0 ? 1 : 0), (soft += s.data[i] > 0 && s.data[i] < 255 ? 1 : 0);
      return { lit, soft };
    }, font);
  }
  await page.evaluate(() => {
    window.game.paint.clear();
    window.game.build.paintEdit.font = window.game.config.HINT.font;
  });
  const ok = Object.values(r).every((v) => v.lit > 0) && r['gothic 0'].soft === 0 && r['gothic 1'].soft > r['gothic 1'].lit / 10;
  return ok ? null : JSON.stringify(r);
});

await check("level paint: P saves the level marked as painted, and its paint; a fresh game of it puts that paint on the walls, and a session hosted FRESH LEVEL starts from it; a level without paint asks for none and starts clean", async () => {
  // Pages of their own: earlier checks edited this one's level.
  const asked = [];
  const first = await openPage(null, (p) => p.on('request', (q) => q.url().includes('.rhhpaint') && asked.push(q.url())));
  const files = {};
  first.on('download', async (d) => (files[d.suggestedFilename()] = fs.readFileSync(await d.path())));
  await paintHint(first);
  const keys = await paintedKeys(first);
  const clean = await first.evaluate(() => window.game.net.g.levelPaint());
  await first.evaluate(() => window.game.build.save());
  for (const end = Date.now() + 10000; Object.keys(files).length < 2 && Date.now() < end; ) await new Promise((done) => setTimeout(done, 50));
  await first.close();
  const level = files['demo.json'] && JSON.parse(files['demo.json']);
  // The saved pair, served as the demo level.
  const own = await openPage(null, async (p) => {
    await p.route('**/levels/demo.json', (route) => route.fulfill({ body: files['demo.json'], contentType: 'application/json' }));
    await p.route('**/levels/demo.rhhpaint', (route) => route.fulfill({ body: files['demo.rhhpaint'], contentType: 'application/octet-stream' }));
  });
  await own.waitForFunction(() => window.game.net.g.levelPaint(), null, { timeout: 10000 }).catch(() => {});
  const r = { marked: level?.paint, asked: asked.length, keys: await paintedKeys(own), fresh: await own.evaluate(() => window.game.net.g.levelPaint()?.length), errors: own.errors };
  await own.close();
  const ok = r.marked === true && r.asked === 0 && clean === null && keys && r.keys === keys && r.fresh === files['demo.rhhpaint']?.length && !r.errors.length;
  return ok ? null : JSON.stringify({ ...r, clean, want: keys, files: Object.keys(files) });
});

await check('levels: stairs in format 3 files stay compact (the old stairs); format 4 saves keep either kind', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const kinds = () => [...g.level.props.values()].filter((p) => p.type === 'stairs').map((p) => p.variant).join();
    const saved = g.build.getLevelData();
    g.loadLevel({ ...saved, version: 3, props: saved.props.map(({ variant, ...p }) => (p.type === 'stairs' ? p : { ...p, variant })) });
    const out = { v3: kinds() };
    g.loadLevel({ ...g.build.getLevelData(), props: [...g.build.getLevelData().props, { type: 'stairs', pos: [0, 40, 0], rot: 0 }] });
    out.added = kinds();
    g.loadLevel(g.build.getLevelData());
    out.reloaded = kinds();
    return out;
  });
  return r.v3 === 'compact,compact' && r.added === 'compact,compact,straight' && r.reloaded === r.added ? null : JSON.stringify(r);
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
  return r.marker === 0.056 && r.grew && r.min === 0 && r.sponge === 0.22 && r.roller === 0.5 && r.config.join() === '0.032,0.18' ? null : JSON.stringify(r);
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
    const hash = () => g.paint.surfaces.filter((s) => s.data).reduce((h, s) => s.data.reduce((h, v) => (h * 31 + v) >>> 0, h), 7);
    g.paint.clear();
    g.player.fly = true;
    const start = g.player.position.clone();
    const speed = 3;
    // Walk 1.5 s along x, painting twice on the way, for 1.7 s.
    g.ghost.record();
    let painted = 0;
    await steps((f) => {
      const t = f / 60;
      g.player.position.set(start.x + speed * Math.min(t, 1.5), start.y, start.z);
      if (painted < 2 && t > 0.4 + painted * 0.6) g.paint.stamp(g.paint.surfaces[painted++], { rect: 0, u: 0.5, v: 0.5 }, 0.1, 1, [1, 0, 0]);
      return f === 102;
    });
    g.ghost.stop();
    const end = hash();
    Object.assign(GHOST, { latency: 0.1, jitter: 0.06, hiccups: 0 });
    let seed = 1;
    g.ghost.link.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    g.ghost.play();
    const xs = [];
    let cleared = false;
    let repainted = false;
    let buffered = false;
    // For 2.4 s from when the ghost shows up (putting the paint back first takes real time, any number of frames).
    await steps(() => {
      const p = g.ghost.position;
      if (p) xs.push([p.x - start.x, p.y - start.y, p.z - start.z, xs.length / 60]);
      if (g.ghost.net?.buffered) buffered = true;
      const h = hash();
      if (h === 7) cleared = true;
      if (cleared && h === end) repainted = true;
      return xs.length === 144;
    });
    g.ghost.stop();
    g.ghost.link.random = Math.random;
    g.fixedStep.dt = 0;
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
  const ok = r.reached > 4.4 && r.back < 0.001 && r.fastest < 1.25 && r.off < 0.01 && r.cleared && r.repainted && r.buffered;
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

await check('ghost: on a bad link (resent packets) a walk that stops is never shown jumping: corrections glide over several frames', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { GHOST, NET } = g.config;
    g.player.fly = true;
    const start = g.player.position.clone();
    // Walk and stop, three times in 3 s: each stop is where a guess overshoots.
    g.ghost.record();
    await steps((f) => {
      const t = f / 60;
      g.player.position.set(start.x + 5 * (Math.min(t % 1, 0.6) + Math.floor(t) * 0.6), start.y, start.z);
      return f === 180;
    });
    g.ghost.stop();
    // A packet in five is lost and resent 0.3 s later; everything behind it waits.
    Object.assign(GHOST, { latency: 0.05, jitter: 0.02, hiccups: 0.2, hiccupDelay: 0.3 });
    // One network (seeded): the most the ghost moves in a frame, either way (m/s), for 3.5 s from when it shows up.
    const play = async (seed) => {
      g.ghost.link.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      g.ghost.play();
      const xs = [];
      await steps(() => {
        const p = g.ghost.position;
        if (p) xs.push(p.x - start.x);
        return xs.length === 210;
      });
      g.ghost.stop();
      let fastest = 0;
      for (let i = 1; i < xs.length; i++) fastest = Math.max(fastest, Math.abs(xs[i] - xs[i - 1]) * 60);
      return { fastest: +fastest.toFixed(2), reached: xs.length ? +xs[xs.length - 1].toFixed(3) : 0 };
    };
    // Four networks, smoothed as in play and not (NET.teleport 0: every correction is a jump).
    const out = { smoothed: [], unsmoothed: [] };
    const teleport = NET.teleport;
    for (const seed of [1, 2, 3, 4]) {
      out.smoothed.push(await play(seed));
      NET.teleport = 0;
      out.unsmoothed.push(await play(seed));
      NET.teleport = teleport;
    }
    g.ghost.link.random = Math.random;
    g.fixedStep.dt = 0;
    Object.assign(GHOST, { latency: 0.08, jitter: 0.04, hiccups: 0 });
    g.player.fly = false;
    g.player.position.copy(start);
    return out;
  });
  // Walking is 5 m/s. Smoothed, a correction glides over several frames (up to about 16 m/s here); unsmoothed it's a jump (30 to 65 m/s).
  const top = (runs) => Math.max(...runs.map((x) => x.fastest));
  return top(r.smoothed) < 25 && top(r.unsmoothed) > 25 && r.smoothed.every((x) => x.reached > 8.5) ? null : JSON.stringify(r);
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

await check('hotbar: each icon is read back without stalling and its slot drawn again (nothing is drawn here: not what the icons show)', async () => {
  await page.evaluate(() => { for (const t of ['marker', 'ladder', 'roller', 'sponge']) window.game.inventory.give(t); });
  const ready = () => page.evaluate(() => [...document.querySelectorAll('.hotbar img')].filter((i) => i.src.startsWith('data:image/png')).length);
  await page.waitForFunction(() => [...document.querySelectorAll('.hotbar img')].every((i) => i.src.startsWith('data:image/png')), null, { timeout: 10000 }).catch(() => {});
  const n = await ready();
  return n === 5 ? null : `${n} of 5 icons arrived`;
});

await check('debug panel: hooks run from the rows: a Models slider rebuilds the model, a pause menu row shows its sheet; a section RESET asks SURE? first', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const frame = () => new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(d)));
    const open = g.debug.visible;
    if (!open) g.debug.toggle();
    g.hud.setLocked(false, true);
    const tab = (name) => [...document.querySelectorAll('.debug-panel .tabs button')].find((b) => b.textContent.trim() === name).click();
    const row = (name) => [...document.querySelectorAll('.debug-panel .page:not([hidden]) label')].filter((l) => l.querySelector('span')?.firstChild?.textContent === name).pop().querySelector('input');
    const length = () => {
      let h = 0;
      // The barrel: the marker's widest cylinder (MODELS.marker.width).
      g.tools.marker.model.traverse((o) => {
        const p = o.geometry?.type === 'CylinderGeometry' ? o.geometry.parameters : null;
        if (p && p.radiusTop === g.config.MODELS.marker.width / 2) h = p.height;
      });
      return h;
    };
    tab('MODELS');
    const before = length();
    const input = row('length');
    input.value = '0.2';
    input.dispatchEvent(new Event('input'));
    await frame();
    const after = length();
    // RESET asks SURE? first, as RESET ALL: the second click resets.
    const reset = input.closest('section').querySelector('.head .reset');
    reset.click();
    await frame();
    const asked = reset.textContent === 'SURE?' && length() === 0.2;
    reset.click();
    await frame();
    const restored = length() === before;
    tab('UI');
    const pause = row('opacity');
    pause.value = '0.3';
    pause.dispatchEvent(new Event('input'));
    const compact = document.querySelector('.overlay').classList.contains('compact');
    const pauseReset = pause.closest('section').querySelector('.head .reset');
    pauseReset.click();
    pauseReset.click();
    if (!open) g.debug.toggle();
    return { before, after, asked, restored, previewed: !compact };
  });
  return r.before === 0.13 && r.after === 0.2 && r.asked && r.restored && r.previewed ? null : JSON.stringify(r);
});

await check('debug panel: every row on every tab has a tooltip', async () => {
  const missing = await page.evaluate(() => {
    const g = window.game;
    const open = g.debug.visible;
    if (!open) g.debug.toggle();
    const out = [];
    for (const tab of document.querySelectorAll('.debug-panel .tabs button')) {
      tab.click();
      const rows = document.querySelectorAll('.debug-panel .page:not([hidden]) label:not(.heading):not(.has-hint)');
      for (const row of rows) out.push(`${tab.textContent.trim()}: ${row.querySelector('span')?.textContent ?? row.textContent.trim()}`);
    }
    if (!open) g.debug.toggle();
    return out;
  });
  return missing.length ? `no tooltip: ${missing.join(', ')}` : null;
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
