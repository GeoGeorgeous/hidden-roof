// Game tests: Hints painted in build mode, a level's own paint, and level saves (stairs, city overrides, names).
import fs from 'node:fs';
import { page, check, openPage, paintedKeys } from './harness.mjs';

/** Paint a hint on the wall the demo's spawn faces (build mode's Hint entry, build/paint-editor.ts); the game's camera aims. */
const paintHint = (page) =>
  page.evaluate(async () => {
    const g = window.game;
    g.player.yaw = -Math.PI / 2;
    g.player.pitch = 0.1;
    // A frame or two for the camera to turn.
    await window.steps((f) => f >= 2);
    const editor = g.build.paintEdit;
    // Its font, loaded (it loads the first time it's picked).
    await editor.pickFont(editor.font);
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
    await editor.pickFont(editor.font);
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

await check('hints: up to 6 m letters (a floor number a storey high) paint and preview; a line too long to draw says so', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const cam = g.scene.children.find((o) => o.isPerspectiveCamera);
    const editor = g.build.paintEdit;
    g.paint.clear();
    g.player.yaw = -Math.PI / 2;
    g.player.pitch = 0.1;
    await window.steps((f) => f >= 2);
    await editor.pickFont(editor.font);
    editor.size = g.config.HINT.maxSize;
    editor.text = '3';
    const said = () => g.build.status;
    editor.stamp('black', cam);
    const out = { big: lit(), saidBig: said() };
    editor.showPreview(editor.aim(cam), 'black');
    out.preview = Math.max(editor.preview.material.map.image.width, editor.preview.material.map.image.height);
    out.height = editor.image.height;
    editor.text = 'Shake your can to release pressure, then paint the whole roof';
    editor.stamp('black', cam);
    out.saidLong = said();
    undo();
    out.undone = lit();
    g.paint.clear();
    return out;
  });
  return r.big > 0 && r.height > 5 && r.undone === 0 && r.preview <= 2048 && /TOO BIG/.test(r.saidLong) ? null : JSON.stringify(r);
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

await check('hints: lines line up left, center or right, a key cap ending a line too', async () => {
  const r = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/build/stencil-text.ts'));
    const { hintImage } = await import(url);
    // The ink's left and right edge on the rows of each half (one line each), in pixels.
    const ink = (img, half) => {
      let x0 = Infinity;
      let x1 = -Infinity;
      for (let y = half ? img.h >> 1 : 0; y < (half ? img.h : img.h >> 1); y++) for (let x = 0; x < img.w; x++) if (img.alpha[y * img.w + x] > 128) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x));
      return [x0, x1];
    };
    const out = {};
    for (const align of ['left', 'center', 'right']) {
      const img = hintImage('Shake your can<br>go', 'mono', 0.4, 100, align);
      out[align] = { top: ink(img, 0), bottom: ink(img, 1), w: img.w };
    }
    const cap = hintImage('Shake your can<br><k>A</k>', 'mono', 0.4, 100, 'right');
    out.cap = { top: ink(cap, 0), bottom: ink(cap, 1) };
    return out;
  });
  const near = (a, b) => Math.abs(a - b) <= 3;
  const { left, center, right, cap } = r;
  const ok =
    near(left.bottom[0], left.top[0]) && near(right.bottom[1], right.top[1]) && near((center.bottom[0] + center.bottom[1]) / 2, (center.top[0] + center.top[1]) / 2) && left.bottom[1] < center.bottom[1] && center.bottom[1] < right.bottom[1] && near(cap.bottom[1], cap.top[1]);
  return ok ? null : JSON.stringify(r);
});

await check('hints: every font loads from its file and paints; softness 0 paints whole texels only, softness 1 a soft edge', async () => {
  const fonts = await page.evaluate(() => window.game.config.HINT_FONTS);
  const r = {};
  for (const [font, softness] of [...fonts.map((f) => [f, null]), ['marker', 0], ['marker', 1]]) {
    await page.evaluate(async ([font, softness]) => {
      const g = window.game;
      g.paint.clear();
      await g.build.paintEdit.pickFont(font);
      window.oldLook = { ...g.config.HINT.looks[font] };
      if (softness !== null) g.config.HINT.looks[font].softness = softness;
    }, [font, softness]);
    await paintHint(page);
    r[softness === null ? font : `${font} ${softness}`] = await page.evaluate((font) => {
      const g = window.game;
      Object.assign(g.config.HINT.looks[font], window.oldLook);
      let lit = 0;
      let soft = 0;
      for (const s of g.paint.surfaces.filter((s) => s.data)) for (let i = 3; i < s.data.length; i += 4) (lit += s.data[i] > 0 ? 1 : 0), (soft += s.data[i] > 0 && s.data[i] < 255 ? 1 : 0);
      return { lit, soft };
    }, font);
  }
  // The fonts from files (all but the system's mono) came from them, not a fallback.
  const missing = await page.evaluate((fonts) => {
    const loaded = new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')));
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/build/hint-fonts.ts'));
    return import(url).then(({ hintCss }) => fonts.filter((f) => f !== 'mono').filter((f) => !loaded.has(hintCss(f, 32).match(/'([^']+)'/)[1])));
  }, fonts);
  await page.evaluate(() => {
    window.game.paint.clear();
    return window.game.build.paintEdit.pickFont(window.game.config.HINT.font);
  });
  const ok = Object.values(r).every((v) => v.lit > 0) && r['marker 0'].soft === 0 && r['marker 1'].soft > r['marker 1'].lit / 10 && !missing.length;
  return ok ? null : JSON.stringify({ ...r, missing });
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
