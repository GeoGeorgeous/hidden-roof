// Game tests: every Settings control is remembered after a reload (the menu's own rows and buttons, then a real reload).
import { gameReady } from '../test-browser.mjs';
import { check, openPage } from './harness.mjs';

/** Every control on Gameplay, Graphics and Sound as the menu shows it (a choice's value, a slider's position), the Controls tab's modes and keys, and what the game applies from them. */
const snapshot = (p) =>
  p.evaluate(() => {
    const g = window.game;
    const { BINDINGS, PAINT, RENDER, SKYLINE, VOLUMETRICS } = g.config;
    const out = {};
    for (const tab of ['Gameplay', 'Graphics', 'Sound']) {
      g.hud.menu.openSettings(tab);
      for (const r of document.querySelectorAll('.settings-page .setting-row')) {
        const input = r.querySelector('input');
        const value = r.querySelector('.choice .value');
        if (input || value) out[`${tab}/${r.querySelector('.label span').textContent}`] = input ? input.value : value.textContent.replace(/\s*·\s*on resume$/, '');
      }
    }
    g.hud.menu.openSettings('Controls');
    for (const r of document.querySelectorAll('.settings-page .control-row')) out[`Controls/${r.querySelector('.label span').textContent}`] = [...r.querySelectorAll('.slot, .choice .value')].map((e) => e.textContent).join('|');
    g.hud.menu.openPage(null);
    return { shown: out, applied: { bindings: JSON.stringify(BINDINGS), tpm: PAINT.texelsPerMeter, sky: SKYLINE.radius, vol: VOLUMETRICS.steps + VOLUMETRICS.downscale, scale: RENDER.pixelScale, fps: RENDER.maxFps, fov: [RENDER.fov, RENDER.sprintFovBoost, RENDER.fullscreen, RENDER.propMotion].join() } };
  });

await check('settings: every control of Gameplay, Controls, Graphics and Sound is remembered after a reload', async () => {
  const p = await openPage();
  try {
    const before = await snapshot(p);
    // Each control changed as the menu does: a choice stepped once, a slider moved off its default, two keys bound, and Tap twice to run flipped (Crouch's mode is Controls').
    await p.evaluate(() => {
      const g = window.game;
      for (const tab of ['Gameplay', 'Graphics', 'Sound']) {
        g.hud.menu.openSettings(tab);
        for (const r of document.querySelectorAll('.settings-page .setting-row')) {
          const input = r.querySelector('input');
          if (input) {
            const [min, max, step] = [+input.min, +input.max, +input.step];
            const to = min + Math.round(((max - min) * 0.3) / step) * step;
            input.value = String(to === +input.value ? max : to);
            input.dispatchEvent(new Event('input'));
          } else r.querySelectorAll('.choice button')[1]?.click();
        }
      }
      g.hud.menu.openSettings('Controls');
      const row = (name) => [...document.querySelectorAll('.settings-page .control-row')].find((r) => r.querySelector('.label span').textContent === name);
      const press = (code) => ['keydown', 'keyup'].forEach((type) => document.body.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true })));
      row('Forward').querySelectorAll('.slot')[0].click();
      press('KeyI');
      row('Spray / use').querySelectorAll('.slot')[1].click();
      press('KeyU');
      row('Forward').querySelectorAll('.choice button')[1].click();
      g.hud.menu.openPage(null);
    });
    const changed = await snapshot(p);
    const same = Object.keys(before.shown).filter((k) => before.shown[k] === changed.shown[k] && (!k.startsWith('Controls/') || /Forward|Spray/.test(k)));
    if (same.length) return `not changed by the test: ${same.join()}`;
    await p.reload();
    await gameReady(p, 2);
    const after = await snapshot(p);
    const lost = Object.keys(changed.shown).filter((k) => changed.shown[k] !== after.shown[k]).map((k) => `${k}: ${changed.shown[k]} -> ${after.shown[k]}`);
    const applied = Object.keys(changed.applied).filter((k) => k !== 'tpm' && k !== 'sky' && changed.applied[k] !== after.applied[k]);
    // Paint and city detail are applied when the game resumes: after the reload they are in place at once.
    if (after.applied.tpm === before.applied.tpm) applied.push('tpm');
    if (after.applied.sky === before.applied.sky) applied.push('sky');
    return lost.length || applied.length ? JSON.stringify({ lost, applied }) : null;
  } finally {
    await p.close();
  }
});
