// Game tests: Loading, the can, paint pages and their draw calls, the sponge, the wheel's color pick, prop ids and decor faces.
import { page, check, openPage } from './harness.mjs';

await check('loading: a hidden tab, given no animation frames, still goes through the load steps', async () => {
  const r = await page.evaluate(async () => {
    const path = '/src/loading.ts'; // by name, so knip doesn't try to resolve a page URL
    const { loadStep } = await import(/* @vite-ignore */ path);
    // The stubs live only while loadStep is called (synchronously): the game's own loop keeps its frames.
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    const step = loadStep('a step').then(() => true);
    window.requestAnimationFrame = raf;
    const done = await Promise.race([step, new Promise((over) => setTimeout(() => over(false), 1000))]);
    delete document.hidden;
    return done;
  });
  return r ? null : 'a hidden tab never finished a load step';
});

await check('can: shaking and spraying exclude each other, the one pressed first wins', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { input } = g;
    const spray = g.tools.spray;
    input.setLocked(true);
    g.inventory.select(0);
    g.inventory.pressure = 0.5;
    const out = {};
    // RMB first, then LMB as well: it shakes, and nothing sprays.
    await steps((f) => (f === 0 && input.button(2, true), f === 5 && input.button(0, true), f === 20 && (input.button(0, false), input.button(2, false)), f === 15 && ((out.shookFirst = spray.shaking), (out.sprayedWhileShaking = spray.flow > 0)), f === 30));
    // LMB first, then RMB as well: it sprays, and no shake starts.
    await steps((f) => (f === 0 && input.button(0, true), f === 5 && input.button(2, true), f === 20 && (input.button(0, false), input.button(2, false)), f === 15 && ((out.sprayedFirst = spray.flow > 0), (out.shookWhileSpraying = spray.shaking)), f === 30));
    input.button(0, false), input.button(2, false);
    g.fixedStep.dt = 0;
    input.setLocked(false);
    return out;
  });
  return r.shookFirst && !r.sprayedWhileShaking && r.sprayedFirst && !r.shookWhileSpraying ? null : JSON.stringify(r);
});

await check('render: never more pixels than the screen has (a page zoomed out to 50%), as many at 100%', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const scale = g.config.RENDER.pixelScale;
    const real = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => 0.5 });
    window.dispatchEvent(new Event('resize'));
    const zoomedOut = g.renderer.getPixelRatio() * scale;
    Object.defineProperty(window, 'devicePixelRatio', real);
    window.dispatchEvent(new Event('resize'));
    return { zoomedOut, normal: g.renderer.getPixelRatio() * scale, dpr: devicePixelRatio };
  });
  return r.zoomedOut === 0.5 && r.normal === Math.min(1, r.dpr) ? null : JSON.stringify(r);
});

await check('paint pages: a frame uploads at most PAINT.uploadBudget; the rest goes up over the next frames (a join stalled up to 1.1 s)', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { PAINT } = g.config;
    const was = PAINT.uploadBudget;
    PAINT.uploadBudget = 0.001; // about one stamp's rect a frame
    g.paint.clear();
    const surfaces = g.paint.surfaces.filter((s) => s.geo.rects.length).slice(0, 12);
    for (const s of surfaces) g.paint.stamp(s, { rect: 0, u: 0.5, v: 0.5 }, 0.2, 0.8, [1, 0.2, 0.1]);
    const waiting = [];
    await steps((f) => (waiting.push(g.paint.gpu.dirty.size), f === 30));
    g.fixedStep.dt = 0;
    PAINT.uploadBudget = was;
    const left = g.paint.gpu.dirty.size;
    g.paint.clear();
    return { surfaces: surfaces.length, waiting: waiting.slice(0, 6), left };
  });
  return r.waiting[1] > 0 && r.left === 0 ? null : JSON.stringify(r);
});

await check('paint runs: paint dries; a coat over a dry coat starts no run, the same coats right after it do, and holding the can on one spot still does', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const faces = g.paint.surfaces.flatMap((s) => s.geo.rects.map((rect, i) => ({ s, rect: i, size: rect.upright ? rect.w * rect.h : 0 })));
    const { s, rect } = faces.reduce((a, b) => (b.size > a.size ? b : a));
    const at = { rect, u: 0.5, v: 0.5 };
    const was = g.paint.onDrip;
    let runs = 0;
    g.paint.onDrip = () => runs++;
    g.config.DRIPS.enabled = true;
    // A rate this high makes every texel that gets wet enough run: no dice.
    const coats = (n, amount) => {
      runs = 0;
      for (let i = 0; i < n; i++) g.paint.stamp(s, at, 0.1, amount, [0.9, 0.2, 0.1], 0, 1e9);
      return runs;
    };
    const out = {};
    // Synchronous: no frame moves the paint clock but the dry() below.
    const dry = () => g.drips.update(30);
    g.paint.clear();
    coats(1, 1); // opaque
    coats(3, 1); // 3 coats of wet paint, under DRIPS.excess
    dry();
    out.overDry = coats(4, 1);
    g.paint.clear();
    coats(1, 1);
    coats(3, 1);
    out.overWet = coats(4, 1);
    g.paint.clear();
    out.held = coats(40, 0.75);
    g.paint.clear();
    g.paint.onDrip = was;
    return out;
  });
  return r.overDry === 0 && r.overWet > 0 && r.held > 0 ? null : JSON.stringify(r);
});

await check('wet view (F3): wet paint on an upright face shows as points, dry paint as none', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const faces = g.paint.surfaces.flatMap((s) => s.geo.rects.map((rect, i) => ({ s, rect: i, size: rect.upright && rect.face ? rect.w * rect.h : 0 })));
    const { s, rect } = faces.reduce((a, b) => (b.size > a.size ? b : a));
    g.config.DRIPS.enabled = true;
    g.config.WET_VIEW.reach = 1e6;
    const was = g.paint.onDrip;
    g.paint.onDrip = () => {};
    g.paint.clear();
    for (let i = 0; i < 4; i++) g.paint.stamp(s, { rect, u: 0.5, v: 0.5 }, 0.1, 1, [0.9, 0.2, 0.1], 0, 1e9);
    g.wetView.refresh();
    const wet = g.wetView.count;
    g.drips.update(30);
    g.wetView.refresh();
    const dry = g.wetView.count;
    g.paint.clear();
    g.config.WET_VIEW.reach = 10;
    g.paint.onDrip = was;
    return { wet, dry };
  });
  return r.wet > 0 && r.dry === 0 ? null : JSON.stringify(r);
});

await check('ladders: placing one tests a shadow cone per lamp, not per piece of the ladder (each placement stalled ~150 ms)', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const p = g.player.position;
    const lamps = g.level.lights.filter((l) => !l.track).length;
    const cones = [];
    // No rest: the light around a ladder is queued at the next frame.
    const rest = g.config.LIGHTMAP.ladderRest;
    g.config.LIGHTMAP.ladderRest = 0;
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    for (let i = 0; i < 2; i++) {
      g.level.setRuntime('cones', { type: 'stepladder', pos: [p.x + 1.5 + i * 0.4, p.y, p.z], rot: 0 });
      await frame();
      cones.push(g.baker.stats.cones);
    }
    g.level.setRuntime('cones', null);
    await frame();
    g.config.LIGHTMAP.ladderRest = rest;
    return { lamps, cones };
  });
  // Moved, the old place and the new one: at most two cones per lamp (a big prop is cut in 4 m chunks; a ladder is one).
  return r.cones.every((c) => c <= 2 * r.lamps) ? null : JSON.stringify(r);
});

await check('sponge: a surface cleaned completely gives its memory back', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { inventory: inv, input, config } = g;
    input.setLocked(true);
    inv.give('sponge');
    for (const c of config.CAP_ORDER) inv.addCap(c);
    while (inv.cap !== 'skinny') inv.cycleCap(1);
    g.player.yaw = -Math.PI / 2 + 0.2;
    g.player.pitch = -0.2;
    inv.select(0);
    await steps((f) => (f === 0 && input.button(0, true), f === 6 && input.button(0, false), f === 39));
    const sprayed = g.paint.gpu.textureCount;
    inv.select(4);
    inv.size.sponge = 0.6;
    await steps((f) => (f === 0 && input.button(0, true), f === 150 && input.button(0, false), f === 159));
    g.fixedStep.dt = 0;
    input.setLocked(false);
    return { sprayed, after: g.paint.gpu.textureCount };
  });
  return r.sprayed > 0 && r.after === 0 ? null : JSON.stringify(r);
});

await check('tools: the wheel\'s click picks the color of the paint under the crosshair (the nearest owned); at the sky nothing changes', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { inventory: inv, input, config } = g;
    input.setLocked(true);
    for (const c of config.COLOR_ORDER) inv.addColor(c);
    for (const c of config.CAP_ORDER) inv.addCap(c);
    while (inv.cap !== 'fat') inv.cycleCap(1);
    // From the spawn, face the nearest wall (within the can's reach).
    g.player.respawn();
    g.player.pitch = 0;
    await steps((f) => f === 1);
    const cam = g.scene.children.find((o) => o.isPerspectiveCamera);
    const ray = new g.tools.marker.stroke.raycaster.constructor();
    const wallAt = (yaw) => {
      ray.set(cam.position, { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) });
      return ray.intersectObjects(g.level.solids, false)[0]?.distance ?? Infinity;
    };
    const yaws = [0, 1, 2, 3].map((k) => g.player.yaw + (k * Math.PI) / 2);
    g.player.yaw = yaws.reduce((a, b) => (wallAt(b) < wallAt(a) ? b : a));
    inv.select(0);
    inv.pressure = 1;
    inv.pickColor('red');
    await steps((f) => (f === 0 && input.button(0, true), f === 20 && input.button(0, false), f === 39));
    inv.pickColor('blue');
    const click = () => input.element.dispatchEvent(new MouseEvent('mousedown', { button: 1 }));
    await steps((f) => (f === 0 && click(), f === 2));
    const wall = inv.color;
    g.player.pitch = 1.4;
    inv.pickColor('blue');
    await steps((f) => (f === 0 && click(), f === 2));
    const sky = inv.color;
    window.dispatchEvent(new MouseEvent('mouseup', { button: 1 }));
    g.paint.clear();
    g.fixedStep.dt = 0;
    input.setLocked(false);
    return { wall, sky };
  });
  return r.wall === 'red' && r.sky === 'blue' ? null : JSON.stringify(r);
});

await check('props: a tank roof (a cone) holds a player dropped on it, near its tip, not on the flat top inside it', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { player: p } = g;
    g.input.setLocked(true);
    const saved = g.build.getLevelData();
    // Where each cone sits (kit/equipment.ts, kit/steel.ts): its tip's x, its base's height, its height.
    const roofs = [['watertower', 0, 7.4, 1.1], ['tank_pair', 1.1, 4.32, 0.4]];
    const out = [];
    for (const [type, x, base, h] of roofs) {
      g.loadLevel({ version: 4, spawn: saved.spawn, props: [{ id: 1, type, pos: [0, 0, 0], rot: 0 }] });
      p.position.set(x, base + h + 1, 0);
      p.velocity.set(0, 0, 0);
      await window.steps((f) => (f > 5 && p.onGround) || f > 300);
      if (!p.onGround || p.position.y < base + h * 0.7) out.push(`${type}: stood at ${p.position.y.toFixed(2)} (roof ${base}–${(base + h).toFixed(2)})`);
    }
    g.loadLevel(saved);
    return out;
  });
  return r.length ? r.join('; ') : null;
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

await check('paint pages: a lost and restored WebGL context (a GPU reset) gets all the paint back on the GPU', async () => {
  // A page of its own: the others keep their context.
  const p = await openPage();
  const r = await p.evaluate(async () => {
    const g = window.game;
    const r = g.renderer;
    const gl = r.getContext();
    /** Does every painted surface's block of its page (level 0) hold its paint, texel for texel? */
    const onGpu = () =>
      g.paint.surfaces
        .filter((s) => s.data)
        .every((s) => {
          const fb = gl.createFramebuffer();
          r.state.bindFramebuffer(gl.FRAMEBUFFER, fb);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.properties.get(s.slot.page.texture).__webglTexture, 0);
          const px = new Uint8Array(s.data.length);
          gl.readPixels(s.slot.x, s.slot.y, s.geo.atlasW, s.geo.atlasH, gl.RGBA, gl.UNSIGNED_BYTE, px);
          r.state.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.deleteFramebuffer(fb);
          return px.every((v, i) => v === s.data[i]);
        });
    for (const s of g.paint.surfaces.slice(0, 3)) g.paint.stamp(s, { rect: 0, u: 0.5, v: 0.5 }, 0.3, 1, [1, 0, 0]);
    await window.steps((f) => f === 2);
    const before = onGpu();
    const lose = gl.getExtension('WEBGL_lose_context');
    const restored = new Promise((done) => r.domElement.addEventListener('webglcontextrestored', done, { once: true }));
    lose.loseContext();
    await new Promise((done) => setTimeout(done, 50));
    lose.restoreContext();
    await restored;
    await window.steps((f) => f === 3);
    return { painted: g.paint.surfaces.filter((s) => s.data).length, before, after: onGpu() };
  });
  await p.close();
  return r.painted === 3 && r.before && r.after ? null : JSON.stringify(r);
});
