// Game tests: The ESC menu and Settings: pickups on the start screen, Esc through the pages, the style switcher, slider reset, the GPU row, the performance test popup, settings remembered.
import { page, check, openPage } from './harness.mjs';

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

await check('menu: Esc goes back from a page to the pause screen and there resumes once released (a press on a page doesn\'t); Game, Graphics and Audio open their tab; the style switcher is the settings STYLE', async () => {
  const r = await page.evaluate(() => {
    const { input } = window.game;
    // A real Esc, down or up: whether it asked to resume (the pointer lock).
    let resumed = 0;
    const requestLock = input.requestLock;
    input.requestLock = () => resumed++;
    const esc = (type) => {
      const before = resumed;
      window.dispatchEvent(new KeyboardEvent(type, { code: 'Escape' }));
      return resumed > before;
    };
    const tap = () => [esc('keydown'), esc('keyup')];
    const item = (t) => [...document.querySelectorAll('.overlay button')].find((b) => b.textContent === t);
    const shown = () => [...document.querySelectorAll('.overlay > :not(.blur)')].filter((e) => !e.hidden).map((e) => e.className).join(' | ');
    const tab = () => document.querySelector('.settings-page .tabs .on')?.textContent;
    item('Audio').click();
    const audio = [shown(), tab()];
    const back = tap();
    const after = shown();
    item('Graphics').click();
    const graphics = tab();
    tap();
    document.querySelectorAll('.themes button')[1].click();
    item('Graphics').click();
    const style = [...document.querySelectorAll('.settings-page .setting-row')].find((row) => /style/i.test(row.querySelector('.label').textContent)).querySelector('.choice .value').textContent;
    tap();
    document.querySelectorAll('.themes button')[0].click();
    const on = document.querySelector('.themes .on').textContent;
    // Multiplayer: Esc goes from HOST back to its choice of HOST and JOIN, then to the pause screen.
    item('Multiplayer').click();
    document.querySelector('.big-row').click();
    const host = document.querySelector('.page-sub').textContent;
    tap();
    const mp = [document.querySelector('.page-sub').textContent, document.querySelectorAll('.big-row').length];
    tap();
    const mpBack = shown();
    const resumes = tap();
    input.requestLock = requestLock;
    return { audio, back, after, graphics, style, on, host, mp, mpBack, resumes };
  });
  const ok = r.audio[0] === 'seg back | page settings-page' && /sound/i.test(r.audio[1]) && r.back.join() === 'false,false' && /pause/.test(r.after) && /graphics/i.test(r.graphics) && /old manga/i.test(r.style) && r.on === 'New manga' && r.host === 'Host a session' && r.mp.join() === ',2' && /pause/.test(r.mpBack) && r.resumes.join() === 'false,true';
  return ok ? null : JSON.stringify(r);
});

await check('settings: Shift + click puts a slider back to its default; PAINT and CITY DETAIL say they apply on resume once changed', async () => {
  const r = await page.evaluate(() => {
    const { menu } = window.game.hud;
    const row = (name) => [...document.querySelectorAll('.settings-page .setting-row')].find((r) => r.querySelector('.label').textContent.startsWith(name));
    menu.openSettings('Sound');
    const input = row('Master').querySelector('input');
    input.value = '150';
    input.dispatchEvent(new Event('input'));
    const moved = row('Master').querySelector('.value').textContent;
    input.dispatchEvent(new PointerEvent('pointerdown', { shiftKey: true }));
    const reset = [row('Master').querySelector('.value').textContent, input.style.getPropertyValue('--fill')];
    menu.openSettings('Graphics');
    const value = (name) => row(name).querySelector('.choice .value').textContent;
    const step = (name, d) => row(name).querySelectorAll('.choice button')[d < 0 ? 0 : 1].click();
    const before = [value('Paint detail'), value('City detail')];
    step('Paint detail', -1);
    step('City detail', -1);
    const changed = [value('Paint detail'), value('City detail')];
    step('Paint detail', 1);
    step('City detail', 1);
    const back = [value('Paint detail'), value('City detail')];
    menu.openPage(null);
    return { moved, reset, before, changed, back };
  });
  const ok = r.moved === '150%' && r.reset.join() === '100%,50%' && r.before.join() === 'Ultra  1.0 cm,High' && r.changed.join() === 'High  1.4 cm  ·  on resume,Medium  ·  on resume' && r.back.join() === r.before.join();
  return ok ? null : JSON.stringify(r);
});

await check('settings: Graphics names the GPU under Resolution, short, in the perf lines too; hidden by the browser, it says so; Frame rate says it acts like Max above the refresh rate', async () => {
  const read = (p) =>
    p.evaluate(() => {
      const g = window.game;
      g.hud.menu.openSettings('Graphics');
      const rows = [...document.querySelectorAll('.settings-page .setting-row')];
      const at = rows.findIndex((r) => r.querySelector('.label').textContent === 'GPU');
      const desc = (name) => rows.find((r) => r.querySelector('.label').textContent.startsWith(name))?.querySelector('.desc')?.textContent;
      const shown = { gpu: rows[at]?.querySelector('.info-value').textContent, above: rows[at - 1]?.querySelector('.label').textContent, frameRate: desc('Frame rate') };
      g.hud.menu.openPage(null);
      // Shown for the read only: a changed HUD.perf would be saved by the next check's settings.
      const perf = g.config.HUD.perf;
      g.config.HUD.perf = true;
      g.hud.setPerf({ fps: 60, frameMs: 5, gpuName: g.gpu.name, calls: 1, triangles: 1, textureBytes: 0, net: null });
      g.config.HUD.perf = perf;
      return { ...shown, raw: g.gpu.raw, perf: document.querySelector('.perf').textContent.split('\n')[1] };
    });
  const r = await read(page);
  const hidden = await openPage(() => {
    const get = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function (name) {
      return name === 'WEBGL_debug_renderer_info' ? null : get.call(this, name);
    };
  });
  const h = await read(hidden);
  await hidden.close();
  const ok = /^SwiftShader/.test(r.gpu) && !/ANGLE|0x/.test(r.gpu) && r.above.startsWith('Resolution') && r.frameRate === "Above your display's refresh rate this acts like Max." && r.perf === `gpu · ${r.gpu}` && h.gpu === 'Hidden by the browser' && h.perf === 'gpu · hidden';
  return ok ? null : JSON.stringify({ r, h });
});

await check('performance test: first on Graphics, its Run button on the values below; Run opens its popup, 800 px in the middle, over the blurred flight with live numbers (frame time: less is better) and Stop; Esc stops it back on Graphics with no result; done, the fps, 1% low, tier (a stub however slow), CPU and GPU, settings, card and a tip; Enter runs it again; Dismiss; resuming stops it; the GPU timer goes back off', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { PERF_TEST } = g.config;
    const saved = { ...PERF_TEST };
    Object.assign(PERF_TEST, { warmup: 0.1, seconds: 1.5 });
    const frames = (n) => new Promise((done) => { const tick = () => (n-- ? requestAnimationFrame(tick) : done()); tick(); });
    const until = async (ok) => { const end = performance.now() + 15000; while (!ok() && performance.now() < end) await frames(1); return ok(); };
    const shown = () => [...document.querySelectorAll('.overlay > .page')].filter((e) => !e.hidden).map((e) => e.className).join();
    const key = (code) => ['keydown', 'keyup'].forEach((type) => window.dispatchEvent(new KeyboardEvent(type, { code })));
    const rows = () => [...document.querySelectorAll('.settings-page .setting-row')];
    const runButton = () => rows()[0].querySelector('.btn');
    const box = document.querySelector('.popup.perf-popup');
    const text = (sel) => box.querySelector(sel).textContent;
    const buttons = () => [...box.querySelectorAll('.popup-buttons .btn')].map((b) => b.textContent);
    const timerWas = g.gpuTimer.enabled;
    g.hud.menu.openSettings('Graphics');
    const run = runButton().getBoundingClientRect();
    const value = rows().find((row) => row.querySelector('.choice')).querySelector('.choice .value').getBoundingClientRect();
    const row = { first: rows()[0].querySelector('.label').textContent, desc: rows()[0].querySelector('.desc').textContent, button: [run.width, run.height, run.left - value.left, run.right - value.right].map(Math.round).join() };
    runButton().click();
    await frames(2);
    const at = box.getBoundingClientRect();
    const stub = () => getComputedStyle(box.querySelector('.perf-tier .bar'), '::before').width;
    const started = { stub: stub(), hint: text('.perf-times-head'), place: [at.width, at.left + at.width / 2 - innerWidth / 2, at.top + at.height / 2 - innerHeight / 2].map(Math.round).join(), page: shown(), sub: g.hud.menu.el.classList.contains('sub'), back: !g.hud.menu.el.querySelector('.back').hidden, running: g.perfTest.running, hands: g.viewScene.visible, status: text('.perf-status'), fps: text('.perf-fps b'), low: text('.perf-low'), headline: text('.perf-headline'), tip: text('.perf-advice'), buttons: buttons(), facts: [...box.querySelectorAll('.perf-facts .fact')].map((f) => f.textContent) };
    const live = await until(() => /^\d+$/.test(text('.perf-fps b')));
    const during = { running: g.perfTest.running, fps: text('.perf-fps b'), cpu: text('.perf-bars .ms'), calls: box.querySelectorAll('.perf-facts .v')[4].textContent };
    key('Escape');
    await frames(2);
    const stopped = { running: g.perfTest.running, page: shown(), tab: document.querySelector('.settings-page .tabs .on').textContent, timer: g.gpuTimer.enabled };
    Object.assign(PERF_TEST, { seconds: 0.3 });
    runButton().click();
    const done = await until(() => !g.perfTest.running && text('.perf-status').startsWith('Tested'));
    const result = { stub: stub(), done, page: shown(), status: text('.perf-status'), fps: text('.perf-fps b'), low: text('.perf-low'), headline: text('.perf-headline'), on: [...box.querySelectorAll('.perf-tier.on')].map((t) => t.textContent), ms: [...box.querySelectorAll('.perf-bars .ms')].map((m) => m.textContent), limits: box.querySelectorAll('.perf-bars .limit').length, lead: text('.perf-advice b'), more: text('.perf-advice span'), buttons: buttons(), timer: g.gpuTimer.enabled };
    key('Enter');
    await frames(1);
    const again = g.perfTest.running && text('.perf-headline') === 'Measuring…';
    const twice = await until(() => !g.perfTest.running && text('.perf-status').startsWith('Tested'));
    [...box.querySelectorAll('.popup-buttons .btn')].find((b) => b.textContent.startsWith('Dismiss')).click();
    const dismissed = [shown(), document.querySelector('.settings-page .tabs .on').textContent];
    runButton().click();
    await frames(2);
    g.input.setLocked(true);
    const resumed = g.perfTest.running;
    g.input.setLocked(false);
    Object.assign(PERF_TEST, saved);
    g.hud.menu.openPage(null);
    return { row, started, live, during, stopped, result, again, twice, dismissed, resumed, timerWas, card: g.gpu.name ?? 'Unknown' };
  });
  const s = r.started;
  const res = r.result;
  const ok =
    r.row.first === 'Performance test' && r.row.desc === 'Flies over the roof for a few seconds at your current settings and shows how it ran.' && r.row.button === '186,26,0,0' &&
    s.stub === 'auto' && res.stub === '4px' && s.hint === 'frame timeLess is better' && s.place === '800,0,0' && s.page === 'page popup-page' && s.sub && !s.back && s.running && !s.hands && /^Testing · \d+ s left$/.test(s.status) && s.fps === '—' && s.low === '1% low after the run' && s.headline === 'Measuring…' && s.tip === 'Watching where each frame’s time goes.' && s.buttons.join() === 'StopESC' &&
    s.facts.join('|') === `Resolution1280×720|Volumetrics${s.facts[1].slice(11)}|Paint detailUltra|City detailHigh|Draw calls—|Video card${r.card}` && /^(Off|Low|Medium|High)$/.test(s.facts[1].slice(11)) &&
    r.live && r.during.running && /^\d+\.\d ms$/.test(r.during.cpu) && /^[\d,]+$/.test(r.during.calls) &&
    !r.stopped.running && r.stopped.page === 'page settings-page' && r.stopped.tab === 'Graphics' && r.stopped.timer === r.timerWas &&
    res.done && res.page === 'page popup-page' && res.status === 'Tested at your current settings' && /^\d+$/.test(res.fps) && /^1% low \d+ FPS$/.test(res.low) &&
    /^(Stutters|Playable|Smooth|Very smooth) at your settings$/.test(res.headline) && res.on.length === 1 && res.headline.startsWith(res.on[0]) &&
    /^\d+\.\d ms$/.test(res.ms[0]) && /^(\d+\.\d ms|—)$/.test(res.ms[1]) && res.limits === (res.ms[1] === '—' ? 0 : 1) && res.lead.endsWith('.') && res.more.length > 5 &&
    res.buttons.join() === 'DismissESC,Run againENTER' && res.timer === r.timerWas &&
    r.again && r.twice && r.dismissed.join() === 'page settings-page,Graphics' && !r.resumed;
  return ok ? null : JSON.stringify(r);
});

await check('settings: no description runs under its control: 16px clear of it on Gameplay, Graphics and Sound (the widest control), and of the first key slot on Controls', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const bad = [];
    for (const tab of ['Gameplay', 'Graphics', 'Sound', 'Controls']) {
      g.hud.menu.openSettings(tab);
      for (const row of document.querySelectorAll('.settings-page .setting-row, .settings-page .control-row')) {
        for (const desc of row.querySelectorAll('.desc')) {
          // Its text as laid out, each line's end.
          const range = document.createRange();
          range.selectNodeContents(desc);
          const right = Math.max(...[...range.getClientRects()].map((c) => c.right));
          // Controls: the key slots (or the line's chooser) beside it; the other tabs: the widest control, a slider and its value.
          const left = row.classList.contains('control-row') ? desc.closest('.line, .sub').lastElementChild.getBoundingClientRect().left : row.getBoundingClientRect().right - 252;
          if (right > left - 16 + 0.5) bad.push(`${tab}: ${desc.textContent.slice(0, 30)}… ends at ${Math.round(right)}, over ${Math.round(left - 16)}`);
        }
      }
    }
    g.hud.menu.openPage(null);
    return bad;
  });
  return r.length ? r.join('; ') : null;
});

await check('performance test: hiding the window stops it (the gap would be one slow frame), back on Graphics at its row; the settings line is the paint detail drawn, not one waiting for resume', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const frames = (n) => new Promise((done) => { const tick = () => (n-- ? requestAnimationFrame(tick) : done()); tick(); });
    const rowEl = (name) => [...document.querySelectorAll('.settings-page .setting-row')].find((row) => row.querySelector('.label').textContent.startsWith(name));
    g.hud.menu.openSettings('Graphics');
    const before = g.settings.summary();
    rowEl('Paint detail').querySelectorAll('.choice button')[0].click();
    const pending = g.settings.summary();
    rowEl('Paint detail').querySelectorAll('.choice button')[1].click();
    rowEl('Performance test').querySelector('.btn').click();
    await frames(2);
    const running = g.perfTest.running;
    const real = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
    const after = { running: g.perfTest.running, page: [...document.querySelectorAll('.overlay > .page')].filter((e) => !e.hidden).map((e) => e.className).join(), hiddenRestored: document.hidden === real.get.call(document) };
    const rows = document.querySelector('.settings-page .rows').getBoundingClientRect();
    const run = rowEl('Performance test').getBoundingClientRect();
    g.hud.menu.openPage(null);
    return { before, pending, running, after, rowShown: rows.height > 0 && run.top >= rows.top - 1 && run.bottom <= rows.bottom + 1 };
  });
  const ok = r.before === r.pending && /Paint Ultra/.test(r.before) && r.running && !r.after.running && r.after.page === 'page settings-page' && r.after.hiddenRestored && r.rowShown;
  return ok ? null : JSON.stringify(r);
});

await check('settings: gameplay, sound and on/off settings are remembered after a reload, saved only where they differ from the default', async () => {
  const r = await page.evaluate(() => {
    const { menu } = window.game.hud;
    const row = (name) => [...document.querySelectorAll('.settings-page .setting-row')].find((r) => r.querySelector('.label').textContent.startsWith(name));
    const slide = (name, v) => {
      const input = row(name).querySelector('input');
      input.value = String(v);
      input.dispatchEvent(new Event('input'));
    };
    menu.openSettings('Gameplay');
    row('Show left hand').querySelectorAll('.choice button')[1].click();
    menu.openSettings('Sound');
    slide('Master', 150);
    const saved = localStorage.getItem('roofhiddenhaus.settings');
    // Back to the defaults: nothing left to save.
    slide('Master', 100);
    menu.openSettings('Gameplay');
    row('Show left hand').querySelectorAll('.choice button')[1].click();
    menu.openPage(null);
    return { saved: JSON.parse(saved).values, after: JSON.parse(localStorage.getItem('roofhiddenhaus.settings')).values };
  });
  const p = await openPage((saved) => localStorage.setItem('roofhiddenhaus.settings', saved), undefined, JSON.stringify({ values: r.saved }));
  const loaded = await p.evaluate(() => {
    const { AUDIO, WALL_HAND } = window.game.config;
    return { master: AUDIO.masterGain, hand: WALL_HAND.enabled };
  });
  const defaults = await page.evaluate(() => window.game.config.AUDIO.masterGain);
  await p.close();
  const ok = Object.keys(r.saved).sort().join() === 'AUDIO.masterGain,WALL_HAND.enabled' && r.saved['WALL_HAND.enabled'] === false && JSON.stringify(r.after) === '{}' && loaded.hand === false && Math.abs(loaded.master - defaults * 1.5) < 1e-9;
  return ok ? null : JSON.stringify({ ...r, loaded, defaults });
});

await check("settings: the player build remembers the performance lines turned on, though its default is off (main.ts turns them off before Settings starts)", async () => {
  const r = await page.evaluate(async () => {
    // The game's own module, from the dev server (a URL, not a file path).
    const url = '/src/settings.ts';
    const { Settings } = await import(url);
    const { HUD, PAINT, RENDER, SKYLINE, VOLUMETRICS } = window.game.config;
    const KEY = 'roofhiddenhaus.settings';
    const kept = { saved: localStorage.getItem(KEY), perf: HUD.perf, tpm: PAINT.texelsPerMeter, scale: RENDER.pixelScale, fps: RENDER.maxFps, sky: { ...SKYLINE }, vol: { ...VOLUMETRICS } };
    // As a player build starts: the lines off, then Settings.
    HUD.perf = false;
    const s = new Settings(() => {}, () => {}, () => {});
    HUD.perf = true;
    s.save();
    const saved = JSON.parse(localStorage.getItem(KEY)).values['HUD.perf'];
    if (kept.saved === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, kept.saved);
    Object.assign(HUD, { perf: kept.perf });
    Object.assign(PAINT, { texelsPerMeter: kept.tpm });
    Object.assign(RENDER, { pixelScale: kept.scale, maxFps: kept.fps });
    Object.assign(SKYLINE, kept.sky);
    Object.assign(VOLUMETRICS, kept.vol);
    return saved;
  });
  return r === true ? null : `HUD.perf saved: ${r}`;
});
