// Game tests: Session rules: build mode and F3 in single player, the title view, a paused session.
import { page, check, openPage } from './harness.mjs';

await check('session: B and F3 open build mode and the panel in single player; a session closes them and the keys do nothing', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const press = async (code) => (window.dispatchEvent(new KeyboardEvent('keydown', { code })), window.dispatchEvent(new KeyboardEvent('keyup', { code })), frame());
    const state = () => `${g.build.active ? 'build' : '-'} ${g.debug.visible ? 'panel' : '-'}`;
    g.input.setLocked(true);
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
    g.input.setLocked(false);
    return { solo, entered, inSession };
  });
  return r.solo === 'build panel' && r.entered === '- -' && r.inSession === '- -' ? null : JSON.stringify(r);
});

await check('title view: before START the title screen shows the city, without hands; once started, ESC shows where you are, in build mode too', async () => {
  const fresh = await openPage();
  const r = await fresh.evaluate(async () => {
    const g = window.game;
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const press = async (code) => (window.dispatchEvent(new KeyboardEvent('keydown', { code })), window.dispatchEvent(new KeyboardEvent('keyup', { code })), frame());
    const lock = async (on) => (g.input.setLocked(on), frame());
    const state = () => `${g.hud.cityView ? 'city' : 'you'} ${g.viewScene.visible ? 'hands' : '-'}`;
    await frame();
    const title = state();
    await lock(true);
    const playing = state();
    await lock(false);
    const paused = state();
    await lock(true);
    await press('KeyB');
    await lock(false);
    const buildPaused = state();
    return { title, playing, paused, buildPaused };
  });
  await fresh.close();
  return r.title === 'city -' && r.playing === 'you hands' && r.paused === 'you hands' && r.buildPaused === 'you hands' ? null : JSON.stringify(r);
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
    g.input.setLocked(false);
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
