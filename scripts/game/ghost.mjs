// Game tests: The avatar, the ghost (a remote player over a pretend network), city detail, the test figure and the hotbar.
import { page, check } from './harness.mjs';

await check('avatar: one draw call for the body, at most two for a tool; every test pose keeps it on its feet and in one piece', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const frames = (n) => new Promise((done) => { const tick = () => (--n ? requestAnimationFrame(tick) : done()); requestAnimationFrame(tick); });
    g.fixedStep.dt = 0.05;
    g.hooks.avatarToggle();
    let fig = null;
    g.level.root.parent.traverse((o) => (fig ??= o.isSkinnedMesh ? o : null));
    const out = { meshes: 0, problems: [] };
    const y = (name) => { const b = fig.skeleton.bones.find((x) => x.name === name); b.updateWorldMatrix(true, false); return b.matrixWorld.elements[13] - fig.parent.position.y; };
    const seen = new Set();
    for (;;) {
      g.hooks.avatarNext();
      // '7 / 18: jump' -> 'jump'
      const pose = g.hooks.avatarPose().split(': ')[1];
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
    g.hooks.avatarToggle();
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

await check('ghost: on a bad link (resent packets) a walk that stops is never shown jumping: corrections glide over several frames, no faster than NET.glideSpeed', async () => {
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
    const out = { smoothed: [], unsmoothed: [], glide: NET.glideSpeed };
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
  // Walking is 5 m/s. Smoothed, a correction glides over several frames, never faster than NET.glideSpeed on top of the
  // walk (BL-012: up to 16 m/s before the cap); unsmoothed it's a jump (30 to 65 m/s).
  const top = (runs) => Math.max(...runs.map((x) => x.fastest));
  return top(r.smoothed) < 5 + r.glide + 0.5 && top(r.unsmoothed) > 25 && r.smoothed.every((x) => x.reached > 8.5) ? null : JSON.stringify(r);
});

await check('ghost: what another player did before this game was hidden lands before what they do while it is (a stepladder taken away stays away, the last coat stays on top)', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const s = g.paint.surfaces.find((s) => !s.data);
    const coat = (color) => ({ kind: 'stamp', key: s.key, rect: 0, u: 0.5, v: 0.5, radius: 0.2, amount: 1, color, softness: 0.5, square: false });
    g.net.remotes.add(9, 'X', 'here', 0);
    const x = g.net.remotes.get(9);
    // Shown: these wait for their figure to get to t = 5.
    x.receiveLadder(5, { type: 'stepladder', pos: [0, 0, 0], rot: 0 });
    x.receiveOp(5, coat([1, 0, 0]));
    // Hidden (no frames): these land at once.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    x.receiveLadder(6, null);
    x.receiveOp(6, coat([0, 0, 1]));
    delete document.hidden;
    // Shown again: their figure gets past t = 6.
    Object.assign(x, { lag: 0, target: 0 });
    x.update(10, 1 / 60);
    let red = 0;
    let blue = 0;
    for (let i = 0; i < s.data.length; i += 4) (red += s.data[i]), (blue += s.data[i + 2]);
    const out = { ladder: g.level.runtimeOf(x.owner) !== undefined, waiting: x.events.length, red, blue };
    g.net.remotes.remove(9);
    g.paint.clear();
    return out;
  });
  return !r.ladder && !r.waiting && r.blue > r.red ? null : JSON.stringify(r);
});

await check('avatar: a player who leaves takes their figure along, its bone texture too', async () => {
  const disposed = await page.evaluate(() => {
    const remotes = window.game.net.remotes;
    remotes.add(9, 'X', 'here', 0);
    let fig = null;
    remotes.get(9).avatar.group.traverse((o) => (fig ??= o.isSkinnedMesh ? o : null));
    // What the renderer makes the first time it draws the figure (pages here don't draw).
    fig.skeleton.computeBoneTexture();
    let gone = false;
    fig.skeleton.boneTexture.addEventListener('dispose', () => (gone = true));
    remotes.remove(9);
    return gone;
  });
  return disposed ? null : 'its bone texture stays on the GPU';
});

await check('avatar test figure: the pose slider stops on a pose, moving poses go round the loop (on the spot if asked), slow motion slows them', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const T = g.config.AVATAR_TEST;
    const frames = (n) => new Promise((done) => { const tick = () => (--n ? requestAnimationFrame(tick) : done()); requestAnimationFrame(tick); });
    g.fixedStep.dt = 0.05;
    g.hooks.avatarToggle();
    let fig = null;
    g.level.root.parent.traverse((o) => (fig ??= o.isSkinnedMesh ? o.parent : null));
    // Standing still first (idle), to find where it stands.
    T.pose = 0;
    g.hooks.avatarPick();
    await frames(2);
    const center = fig.position.clone();
    T.pose = 1;
    g.hooks.avatarPick();
    const picked = g.hooks.avatarPose();
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
    g.hooks.avatarToggle();
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
