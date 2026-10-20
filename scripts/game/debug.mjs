// Game tests: The debug panel, perf lines, Rain, and the checks that open pages of their own (signs, a throwing frame, the probe).
import { page, check, openPage, fail } from './harness.mjs';

await check('debug panel: hooks run from the rows: a Models slider rebuilds the model, a pause menu row shows its sheet; a section RESET asks SURE? first', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const frame = () => new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(d)));
    const open = g.debug.visible;
    if (!open) g.debug.toggle();
    g.play.setPanel(true);
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
    if (!open) (g.debug.toggle(), g.play.setPanel(false));
    return { before, after, asked, restored, previewed: !compact };
  });
  return r.before === 0.13 && r.after === 0.2 && r.asked && r.restored && r.previewed ? null : JSON.stringify(r);
});

await check('debug panel: Items → UNLOCK ALL gives every tool, color and cap, and their pickups go', async () => {
  const r = await page.evaluate(() => {
    const { debug, inventory: inv, pickups, config } = window.game;
    const open = debug.visible;
    if (!open) debug.toggle();
    [...document.querySelectorAll('.debug-panel .tabs button')].find((b) => b.textContent.trim() === 'ITEMS').click();
    [...document.querySelectorAll('.debug-panel .page:not([hidden]) button')].find((b) => b.textContent === 'UNLOCK ALL').click();
    const all = [...pickups.list.values()];
    const out = {
      tools: ['marker', 'ladder', 'roller', 'sponge'].every((t) => inv.has(t)),
      colors: inv.colors.join() === config.COLOR_ORDER.join(),
      caps: inv.caps.join() === config.CAP_ORDER.join(),
      pickups: all.length,
      left: all.filter((p) => !p.collected || p.group.visible).map((p) => p.kind),
    };
    inv.reset();
    pickups.load(pickups.toJSON());
    if (!open) debug.toggle();
    return out;
  });
  return r.tools && r.colors && r.caps && r.pickups && !r.left.length ? null : JSON.stringify(r);
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

await check('perf lines: the GPU line keeps the GPU timer on with F3 closed, and off once hidden', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { HUD } = g.config;
    const was = [HUD.perf, HUD.perfGpu];
    HUD.perf = HUD.perfGpu = true;
    await window.steps((f) => f >= 3);
    const on = g.gpuTimer.enabled;
    [HUD.perf, HUD.perfGpu] = was;
    await window.steps((f) => f >= 3);
    return { on, off: g.gpuTimer.enabled, panel: g.debug.visible };
  });
  return r.on && !r.off && !r.panel ? null : JSON.stringify(r);
});

await check('settings: Rain set in build mode (daylight) is what the night has on leaving it, and what is saved', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const { ATMOS } = g.config;
    const { menu } = g.hud;
    const row = (name) => [...document.querySelectorAll('.settings-page .setting-row')].find((r) => r.querySelector('.label').textContent.startsWith(name));
    const flip = () => {
      menu.openSettings('Graphics');
      const shown = row('Rain').querySelector('.choice .value').textContent;
      row('Rain').querySelectorAll('.choice button')[1].click();
      menu.openPage(null);
      return shown;
    };
    const was = ATMOS.rain;
    g.environment.atmosphere.setDaylight(true);
    const shown = flip();
    const day = ATMOS.rain;
    g.environment.atmosphere.setDaylight(false);
    const night = ATMOS.rain;
    const saved = JSON.parse(localStorage.getItem('roofhiddenhaus.settings')).values['ATMOS.rain'];
    flip();
    return { was, shown, day, night, saved, back: ATMOS.rain };
  });
  const ok = r.shown === (r.was ? 'On' : 'Off') && r.day === false && r.night === !r.was && r.saved === !r.was && r.back === r.was;
  return ok ? null : JSON.stringify(r);
});

if (page.errors.length) fail(`page errors: ${page.errors.join('; ')}`);
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

await check('frame: a frame that throws is reported once and asks for a reload; the frames go on', async () => {
  const p = await openPage();
  const frames = await p.evaluate(
    () =>
      new Promise((done) => {
        const g = window.game;
        let n = 0;
        g.fixedStep.dt = 1 / 60;
        g.fixedStep.script = () => {
          if (++n === 30) (g.fixedStep.script = null), setTimeout(() => done(n), 100);
          throw new Error('test: a broken frame');
        };
      }),
  );
  const notice = await p.evaluate(() => { const n = document.querySelector('.frame-failed'); return n?.checkVisibility() ? n.textContent : null; });
  await p.close();
  const ok = frames === 30 && p.errors.join() === 'test: a broken frame' && /reload/i.test(notice ?? '');
  return ok ? null : JSON.stringify({ frames, errors: p.errors.length, notice });
});

await check('probe: the half resolution step puts back the pixel ratio Settings gives, also on a page zoomed out', async () => {
  const p = await openPage(() => Object.defineProperty(window, 'devicePixelRatio', { get: () => 0.5 }));
  const r = await p.evaluate(async () => {
    const g = window.game;
    // The game's own module, from the dev server (a URL, not a file path).
    const url = '/src/dev/probe.ts';
    const { Probe } = await import(url);
    const probe = new Probe(g);
    // Straight to the step (its settle and measure times aside): next() applies step i + 1.
    for (probe.i = 0; !probe.label.startsWith('half resolution'); probe.i++);
    probe.i--;
    probe.next(performance.now());
    const half = g.renderer.getPixelRatio();
    probe.cancel();
    return { half, after: g.renderer.getPixelRatio(), want: 0.5 / g.config.RENDER.pixelScale };
  });
  await p.close();
  return r.after === r.want && r.half === r.want / 2 ? null : JSON.stringify(r);
});

await check('probe: a frame that compiles a shader is not measured, and the settling starts over', async () => {
  const p = await openPage();
  const r = await p.evaluate(async () => {
    // The game's own module, from the dev server (a URL, not a file path).
    const url = '/src/dev/probe.ts';
    const { Probe } = await import(url);
    // A world of stand-ins: the baseline step touches nothing, and the renderer lists its programs.
    const programs = [{ id: 1 }];
    const probe = new Probe({ renderer: { info: { programs } } });
    probe.start();
    let t = performance.now();
    const frame = () => probe.frame((t += 100), 100, 5, null, 1);
    for (let i = 0; i < 28; i++) frame();
    const measured = probe.sum.intervals.length;
    programs.push({ id: 2 });
    frame();
    const compiled = probe.sum.intervals.length;
    for (let i = 0; i < 5; i++) frame();
    const settling = probe.sum.intervals.length;
    for (let i = 0; i < 25; i++) frame();
    probe.cancel();
    return { measured, compiled, settling, again: probe.sum.intervals.length };
  });
  await p.close();
  return r.measured > 0 && r.compiled === 0 && r.settling === 0 && r.again > 0 ? null : JSON.stringify(r);
});
