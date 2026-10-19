// Game tests: Tool sizes and the wheel, and ladders: one per player, climbed, stood on and jumped from.
import { page, check } from './harness.mjs';

await check('tools: Q/E change the player\'s nib, roller and patch width, not the config', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { inventory: inv, input, tools, config } = g;
    // E grows, Q shrinks: one press a frame.
    const notch = (dir) => new Promise((done) => { g.fixedStep.script = () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: dir < 0 ? 'KeyE' : 'KeyQ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: dir < 0 ? 'KeyE' : 'KeyQ' })); g.fixedStep.script = null; requestAnimationFrame(done); }; });
    input.setLocked(true);
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
    input.setLocked(false);
    return out;
  });
  return r.marker === 0.056 && r.grew && r.min === 0 && r.sponge === 0.22 && r.roller === 0.5 && r.config.join() === '0.032,0.18' ? null : JSON.stringify(r);
});

await check('tools: holding Q or E keeps changing the width (and the can\'s cap), as in build mode: the key\'s auto-repeat steps too', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { inventory: inv, input, config } = g;
    // A press, then the keyboard's auto-repeat, one a frame.
    const hold = (code, repeats) => steps((f) => (f <= repeats && window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: f > 0 })), f === repeats + 1 && (window.dispatchEvent(new KeyboardEvent('keyup', { code })), true)));
    input.setLocked(true);
    for (const c of config.CAP_ORDER) inv.addCap(c);
    inv.give('marker');
    inv.size = { ...inv.size, marker: config.MARKER.width };
    inv.select(1);
    await hold('KeyE', 4);
    const out = { marker: inv.size.marker };
    inv.select(0);
    const at = () => config.CAP_ORDER.indexOf(inv.cap);
    const cap = at();
    await hold('KeyE', 1);
    out.capSteps = (at() - cap + config.CAP_ORDER.length) % config.CAP_ORDER.length;
    input.setLocked(false);
    return out;
  });
  // 0.032 m and five steps of 0.008 m; two caps on.
  return r.marker === 0.072 && r.capSteps === 2 ? null : JSON.stringify(r);
});

await check('tools: the wheel changes the color (can, marker, roller) and Q/E the can\'s cap; the sponge\'s wheel and the stepladder\'s Q/E change nothing', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { inventory: inv, input, config } = g;
    const frame = (act) => new Promise((done) => { g.fixedStep.script = () => { act(); g.fixedStep.script = null; requestAnimationFrame(done); }; });
    const wheel = () => frame(() => input.wheel(1));
    const key = (code) => frame(() => (window.dispatchEvent(new KeyboardEvent('keydown', { code })), window.dispatchEvent(new KeyboardEvent('keyup', { code }))));
    input.setLocked(true);
    for (const c of config.COLOR_ORDER) inv.addColor(c);
    for (const c of config.CAP_ORDER) inv.addCap(c);
    inv.give('marker');
    inv.give('sponge');
    inv.give('roller');
    const out = {};
    const step = async (slot, act) => {
      inv.select(slot);
      const before = { color: inv.color, cap: inv.cap, size: { ...inv.size } };
      await act();
      return { color: inv.color !== before.color, cap: inv.cap !== before.cap, size: JSON.stringify(inv.size) !== JSON.stringify(before.size) };
    };
    out.canWheel = await step(0, wheel);
    out.canE = await step(0, () => key('KeyE'));
    out.markerWheel = await step(1, wheel);
    out.rollerWheel = await step(3, wheel);
    out.spongeWheel = await step(4, wheel);
    out.ladderE = await step(2, () => key('KeyE'));
    input.setLocked(false);
    return out;
  });
  const is = (o, color, cap, size) => o.color === color && o.cap === cap && o.size === size;
  const ok = is(r.canWheel, true, false, false) && is(r.canE, false, true, false) && is(r.markerWheel, true, false, false) && is(r.rollerWheel, true, false, false) && is(r.spongeWheel, false, false, false) && is(r.ladderE, false, false, false);
  return ok ? null : JSON.stringify(r);
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

await check('ladders: climbed to the top (each in the level, a scaffolding bay, a stepladder) you land close by, stand there off it and jump as from any floor; into the bay\'s hatch or off the stepladder\'s front you slide down', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { player: p, input, level, PLAYER } = g;
    input.setLocked(true);
    /** At its foot (or its bottom, in the air), facing it, W held to the top; then idle, then a jump: what went wrong, or null. */
    const climb = async ({ volume: v, normal: n }) => {
      const along = Math.abs(n.x) > 0.5 ? 'x' : 'z';
      const across = along === 'x' ? 'z' : 'x';
      const outer = n[along] < 0 ? v.min[along] : v.max[along];
      p.position.set(0, v.min.y + 0.02, 0);
      p.position[along] = outer + n[along] * (PLAYER.radius + 0.05);
      p.position[across] = (v.min[across] + v.max[across]) / 2;
      p.velocity.set(0, 0, 0);
      p.yaw = Math.atan2(n.x, n.z);
      p.pitch = 0;
      input.key('KeyW', true);
      let climbed = false;
      let top = 0;
      const left = p.position.clone();
      await steps((f) => {
        climbed ||= p.onLadder;
        if (p.onLadder) left.copy(p.position);
        if (!(p.onGround && p.position.y > v.max.y - 1e-3) && f < 600) return false;
        input.key('KeyW', false);
        top = p.position.y;
        return true;
      });
      if (!climbed || top < v.max.y - 1e-3) return `climbed ${climbed}, stopped at ${top.toFixed(2)} (top ${v.max.y.toFixed(2)})`;
      // Off the top it lets you go without its lift: you land close by, not gliding on over the roof.
      const glide = Math.hypot(p.position.x - left.x, p.position.z - left.z);
      if (glide > 0.9) return `glided ${glide.toFixed(2)} m off the top`;
      // Idle there (sliding to a stop may step onto something low by the edge, never back down).
      let held = 0;
      await steps((f) => ((held += p.onLadder || p.velocity.y < 0), f === 30));
      if (held || p.position.y < top - 0.002) return `idle on top: ${held} frames on the ladder, moved ${(p.position.y - top).toFixed(3)}`;
      top = p.position.y;
      let peak = top;
      await steps((f) => {
        if (f === 0) input.key('Space', true);
        if (f === 1) input.key('Space', false);
        peak = Math.max(peak, p.position.y);
        return (f > 5 && p.onGround) || f > 180;
      });
      return peak - top > 0.95 * PLAYER.jumpHeight && Math.abs(p.position.y - top) < 0.002 ? null : `jumped ${(peak - top).toFixed(2)} m, landed at ${p.position.y.toFixed(2)}`;
    };
    const out = [];
    for (const [i, l] of level.ladders.entries()) {
      const why = await climb(l);
      if (why) out.push(`ladder ${i}: ${why}`);
    }
    // A scaffolding bay railed at both ends: its ladder goes up through the deck's hatch, past the toe board.
    const added = () => level.ladders.find((l) => !before.has(l));
    let before = new Set(level.ladders);
    level.setRuntime('test', { type: 'scaffolding', variant: 'single', pos: [6, 0, 30], rot: 0 });
    const bay = await climb(added());
    if (bay) out.push(`scaffolding: ${bay}`);
    // Down it: walk across the deck into the hatch (W, let go once on the ladder) and slide to the floor.
    p.position.set(5.7, 2.001, 30.47);
    p.velocity.set(0, 0, 0);
    p.yaw = -Math.PI / 2;
    let into = false;
    input.key('KeyW', true);
    await steps((f) => {
      if (p.onLadder && !into) (into = true), input.key('KeyW', false);
      return (into && p.onGround) || f > 300;
    });
    input.key('KeyW', false);
    if (!into || p.position.y > 0.01) out.push(`down the scaffolding: on its ladder ${into}, at ${p.position.y.toFixed(2)}`);
    level.setRuntime('test', null);
    before = new Set(level.ladders);
    g.tools.ladder.put({ pos: [0, 0, 30], rot: 0 });
    const step = added();
    const why = await climb(step);
    if (why) out.push(`stepladder: ${why}`);
    // Back off its front (S, facing it): onto the ladder, let go, slide down it to its foot.
    let on = false;
    let fastest = 0;
    input.key('KeyS', true);
    await steps((f) => {
      if (p.onLadder && !on) (on = true), input.key('KeyS', false);
      fastest = Math.max(fastest, -p.velocity.y);
      return (on && p.onGround) || f > 300;
    });
    input.key('KeyS', false);
    if (!on || !p.onGround || p.position.y > 0.4 || fastest > PLAYER.climbSpeed + 1e-6) out.push(`down the stepladder: on it ${on}, at ${p.position.y.toFixed(2)}, falling up to ${fastest.toFixed(2)} m/s`);
    level.setRuntime(g.session.player, null);
    input.setLocked(false);
    p.respawn();
    return { ladders: level.ladders.length, out };
  });
  return r.ladders && !r.out.length ? null : JSON.stringify(r);
});
