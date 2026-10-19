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
//        ONLY=ladder npm run test:game   (only the checks whose name matches: while working; the full run before a merge)
import fs from 'node:fs';
import os from 'node:os';
import { fixedFrames, gameReady, noBrowserLock, noDrawing, openTestBrowser } from './test-browser.mjs';

// Pages here don't draw (no check needs a picture), so frames can run uncapped.
const test = await openTestBrowser(process.argv[2], { uncapped: true });
const tmp = fs.mkdtempSync(`${os.tmpdir()}/taggin-test-`);
let failed = 0;

/** A page with the game loaded, not drawing (SwiftShader draws on the CPU, seconds a frame); page errors fail the run. `before(page)`: set up before it loads (routes). */
async function openPage(init, before, arg) {
  const page = await test.browser.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(noDrawing);
  await page.addInitScript(noBrowserLock);
  await page.addInitScript(fixedFrames);
  if (init) await page.addInitScript(init, arg);
  await before?.(page);
  await page.goto(test.url);
  await gameReady(page, 2);
  return page;
}

const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
let skipped = 0;

async function check(name, fn) {
  if (only && !only.test(name)) return void skipped++;
  try {
    // Every check starts alike, whatever ran (or failed) before it: seeded paint randomness (spray, drips), frames on the clock.
    // Inside the try: a page a failed check left without a game fails this check too, not the whole run.
    if (!page.isClosed())
      await page.evaluate(() => {
        const g = window.game;
        g.seedPaintRandom(1);
        Object.assign(g.fixedStep, { dt: 0, script: null });
      });
    const problem = await fn();
    if (problem) throw new Error(problem);
    console.log(`ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message.split('\n')[0]}`);
  }
}

/** The pause screen's SAVE and UPLOAD. */
const SAVE = '.overlay .item:text-is("Save")';
const UPLOAD = '.overlay .item:text-is("Upload")';
/** The popup that's open. */
const POPUP = '.popup-page:not([hidden])';
/** Paint one dot on surface `i` (the pause menu stays up). */
const dot = (page, i = 0) => page.evaluate((i) => window.game.paint.stamp(window.game.paint.surfaces[i], { rect: 0, u: 0.5, v: 0.5 }, 0.1, 1, [1, 0, 0]), i);
const paintedKeys = (page) => page.evaluate(() => window.game.paint.surfaces.filter((s) => s.data).map((s) => s.key).sort().join());

const page = await openPage();
// Started and paused: the menu shows SAVE PAINT.
await page.evaluate(() => (window.game.input.setLocked(true), window.game.input.setLocked(false)));

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
    row('Crouch').querySelectorAll('.choice button')[1].click();
    menu.openSettings('Sound');
    slide('Master', 150);
    const saved = localStorage.getItem('roofhiddenhaus.settings');
    // Back to the defaults: nothing left to save.
    slide('Master', 100);
    menu.openSettings('Gameplay');
    row('Crouch').querySelectorAll('.choice button')[1].click();
    menu.openPage(null);
    return { saved: JSON.parse(saved).values, after: JSON.parse(localStorage.getItem('roofhiddenhaus.settings')).values };
  });
  const p = await openPage((saved) => localStorage.setItem('roofhiddenhaus.settings', saved), undefined, JSON.stringify({ values: r.saved }));
  const loaded = await p.evaluate(() => {
    const { AUDIO, PLAYER } = window.game.config;
    return { master: AUDIO.masterGain, crouchToggle: PLAYER.crouchToggle };
  });
  const defaults = await page.evaluate(() => window.game.config.AUDIO.masterGain);
  await p.close();
  const ok = Object.keys(r.saved).sort().join() === 'AUDIO.masterGain,PLAYER.crouchToggle' && r.saved['PLAYER.crouchToggle'] === true && JSON.stringify(r.after) === '{}' && loaded.crouchToggle === true && Math.abs(loaded.master - defaults * 1.5) < 1e-9;
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

await check('settings: Controls binds a key, button or wheel step to two slots each; a taken key moves (Undo), a reserved one is refused; Reset all asks and undoes; modes; remembered', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const { BINDINGS, PLAYER } = g.config;
    const { menu } = g.hud;
    const row = (name) => [...document.querySelectorAll('.settings-page .control-row')].find((r) => r.querySelector('.label span').textContent === name);
    const slot = (name, i) => row(name).querySelectorAll('.slot')[i];
    const foot = () => document.querySelector('.controls-foot .status').textContent;
    const undo = () => document.querySelector('.controls-foot .undo');
    const corner = (t) => [...document.querySelectorAll('.reset-all button')].find((b) => b.textContent === t);
    const saved = () => JSON.parse(localStorage.getItem('roofhiddenhaus.settings') ?? '{}');
    // Sent to the page, as a real key or click is: the window hears them last.
    const key = (type, code) => !document.body.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
    const press = (code) => [key('keydown', code), key('keyup', code)][0];
    menu.openSettings('Controls');
    const groups = [...document.querySelectorAll('.controls .group')].map((e) => e.textContent).join();
    const defaults = [slot('Forward', 0).textContent, slot('Forward', 1).textContent, slot('Crouch', 1).textContent, slot('Next color', 0).textContent, corner('Reset all').classList.contains('dim')];
    slot('Forward', 0).click();
    const listening = [slot('Forward', 0).textContent, foot()];
    const swallowed = press('KeyI');
    const heard = g.input.wasPressed('KeyI');
    const forward = [...BINDINGS.forward];
    // Back's S moves here: back keeps only its arrow.
    slot('Forward', 0).click();
    press('KeyS');
    const moved = { forward: [...BINDINGS.forward], back: [...BINDINGS.back], foot: foot(), undo: !undo().hidden };
    undo().click();
    const undone = { forward: [...BINDINGS.forward], back: [...BINDINGS.back], undo: undo().hidden };
    // Crouch's alternate (C) takes Shift, both sides: Run has no key now.
    slot('Crouch', 1).click();
    press('ShiftLeft');
    const mods = { crouch: [...BINDINGS.crouch], sprint: [...BINDINGS.sprint], foot: foot(), noKey: !row('Run').querySelector('.no-key').hidden };
    slot('Jump / climb', 0).click();
    press('F3');
    const refused = [slot('Jump / climb', 0).className, foot(), [...BINDINGS.jump]];
    press('Escape');
    const cancelled = [[...BINDINGS.jump], !document.querySelector('.settings-page').hidden, slot('Jump / climb', 0).textContent];
    // The middle button is the eyedropper's: Pick a color has no key now. The click that ends it doesn't listen again.
    slot('Shake the can', 1).click();
    const target = slot('Shake the can', 1);
    target.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { button: 1, bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
    const shake = [[...BINDINGS.shake], [...BINDINGS.pick], target.classList.contains('listening')];
    g.input.setLocked(true);
    g.input.element.dispatchEvent(new MouseEvent('mousedown', { button: 1 }));
    const shakes = g.input.held('shake');
    window.dispatchEvent(new MouseEvent('mouseup', { button: 1 }));
    g.input.setLocked(false);
    g.input.endFrame();
    // Playing closed the menu.
    menu.openSettings('Controls');
    slot('Next color', 0).click();
    document.body.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    const wheel = [[...BINDINGS.next], [...BINDINGS.prev]];
    // A wheel step can't be held: Forward refuses it, as every action played by holding does.
    slot('Forward', 0).click();
    document.body.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    const heldWheel = [slot('Forward', 0).className, foot(), [...BINDINGS.forward]];
    press('Escape');
    // Right-click clears a slot, Shift + click puts its default back.
    slot('Tool 1', 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const cleared = [...BINDINGS.slot1];
    slot('Tool 1', 0).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    const restored = [...BINDINGS.slot1];
    const kept = saved().controls;
    // Crouch's mode is Gameplay's Crouch; Tap twice to run is remembered.
    row('Crouch').querySelectorAll('.choice button')[1].click();
    row('Forward').querySelectorAll('.choice button')[0].click();
    const modes = [PLAYER.crouchToggle, PLAYER.tapToRun, row('Crouch').querySelector('.choice .value').textContent, row('Forward').querySelector('.choice .value').textContent, saved().values];
    menu.openSettings('Gameplay');
    const gameplay = [...document.querySelectorAll('.settings-page .setting-row')].find((r) => r.querySelector('.label').textContent === 'Crouch').querySelector('.choice .value').textContent;
    menu.openSettings('Controls');
    row('Crouch').querySelectorAll('.choice button')[0].click();
    row('Forward').querySelectorAll('.choice button')[1].click();
    // Reset all asks first, then can be undone.
    corner('Reset all').click();
    const asking = document.querySelector('.reset-all .ask')?.textContent;
    corner('Reset').click();
    const reset = { forward: BINDINGS.forward.join(), crouch: BINDINGS.crouch.join(), next: BINDINGS.next.join(), foot: foot(), dim: corner('Reset all').classList.contains('dim'), saved: saved().controls };
    undo().click();
    const back = BINDINGS.next.join();
    corner('Reset all').click();
    corner('Reset').click();
    menu.openPage(null);
    return { groups, defaults, listening, swallowed, heard, forward, moved, undone, mods, refused, cancelled, shake, shakes, wheel, heldWheel, cleared, restored, kept: Object.keys(kept).sort().join(), modes, gameplay, asking, reset, back, values: saved().values };
  });
  // Saves from before the two slots (keys) are dropped; reserved keys aren't loaded.
  const p = await openPage((saved) => localStorage.setItem('roofhiddenhaus.settings', saved), undefined, JSON.stringify({ controls: { forward: ['KeyI', null], use: ['F5', null] }, keys: { back: ['KeyX'] } }));
  const loaded = await p.evaluate(() => ['forward', 'use', 'back'].map((a) => window.game.config.BINDINGS[a].join()));
  await p.close();
  const hint = 'Press a key, click a mouse button or scroll to bind Forward. Esc cancels.';
  const want = {
    groups: 'move,paint,tools,other',
    defaults: ['W', '↑', 'C', 'Wheel ↓', true],
    listening: ['Press a key', hint],
    swallowed: true,
    heard: false,
    forward: ['KeyI', 'ArrowUp'],
    moved: { forward: ['KeyS', 'ArrowUp'], back: ['ArrowDown'], foot: 'S moved here from Back.', undo: true },
    undone: { forward: ['KeyI', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], undo: true },
    mods: { crouch: ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight'], sprint: [], foot: 'Shift moved here from Run, which has no key now.', noKey: true },
    refused: ['slot listening refused', 'F3 opens the debug panel. Try another key.', ['Space']],
    cancelled: [['Space'], true, 'Space'],
    shake: [['Mouse2', 'Mouse1'], [], false],
    shakes: true,
    wheel: [['WheelUp'], []],
    heldWheel: ['slot listening refused', "Forward is held down, and a wheel step can't be. Try another key.", ['KeyI', 'ArrowUp']],
    cleared: [],
    restored: ['Digit1'],
    kept: 'crouch,forward,next,pick,prev,shake,sprint',
    modes: [true, false, 'Toggle', 'No', { 'PLAYER.crouchToggle': true, 'PLAYER.tapToRun': false }],
    gameplay: 'Toggle',
    asking: 'Reset all controls?',
    reset: { forward: 'KeyW,ArrowUp', crouch: 'ControlLeft,ControlRight,KeyC', next: 'WheelDown', foot: 'Controls are back to defaults.', dim: true, saved: {} },
    back: 'WheelUp',
    values: {},
  };
  const ok = JSON.stringify(r) === JSON.stringify(want) && loaded.join('|') === 'KeyI|Mouse0|KeyS,ArrowDown';
  return ok ? null : JSON.stringify({ r, loaded });
});

await check('credits: every license the page links to ships with the game', async () => {
  const r = await page.evaluate(async () => {
    const links = [...document.querySelectorAll('.credits-page a')].map((a) => a.href).filter((h) => h.includes('/licenses/'));
    const bad = [];
    // A missing file would come back as the page (the dev server's fallback): a license is plain text.
    for (const h of links) {
      const res = await fetch(h);
      if (!res.ok || !res.headers.get('content-type').startsWith('text/plain')) bad.push(h);
    }
    return { count: links.length, bad };
  });
  return r.count === 8 && !r.bad.length ? null : JSON.stringify(r);
});

await check('updates: the releases newest first, the newest marked Latest; each has its picture and its date; lists under a heading keep their terms', async () => {
  const r = await page.evaluate(async () => {
    const { menu } = window.game.hud;
    menu.openPage('updates');
    const vers = [...document.querySelectorAll('.rail .ver')].map((b) => b.textContent);
    const missing = [];
    for (const b of document.querySelectorAll('.rail .ver')) {
      b.click();
      const res = await fetch(document.querySelector('.pane .shot img').src);
      if (!res.ok || res.headers.get('content-type') !== 'image/webp') missing.push(b.textContent);
      if (!/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(document.querySelector('.pane .release span')?.textContent)) missing.push(`${b.textContent} date`);
    }
    const tools = [...document.querySelectorAll('.pane .item-note')].find((n) => n.querySelector('.item-title').textContent === 'tools');
    const terms = [...(tools?.querySelectorAll('.term-line b') ?? [])].map((t) => t.textContent);
    menu.openPage(null);
    return { vers, missing, terms };
  });
  return r.vers[0].endsWith('Latest') && r.vers.at(-1) === '1.0.0' && r.vers.filter((v) => v.endsWith('Latest')).length === 1 && !r.missing.length && r.terms.join() === 'spray can,marker,roller,sponge,stepladder' ? null : JSON.stringify(r);
});

await check('save popup: SAVE shows the file and its size; DOWNLOAD downloads that one file, even clicked three times at once, then says where it went', async () => {
  await dot(page);
  await page.click(SAVE);
  await page.waitForFunction(() => /KB|MB/.test(document.querySelector('.popup-page:not([hidden]) .chip span').textContent));
  const chip = await page.textContent(`${POPUP} .chip b`);
  let n = 0;
  const count = () => n++;
  page.on('download', count);
  const first = page.waitForEvent('download');
  await page.evaluate((popup) => { const go = document.querySelector(`${popup} .btn.primary`); for (let i = 0; i < 3; i++) go.click(); }, POPUP);
  const saved = await first;
  await saved.saveAs(`${tmp}/menu.rhhpaint`);
  await page.waitForFunction((popup) => document.querySelector(`${popup} .para.done`)?.textContent === 'Download started.', POPUP);
  await page.waitForTimeout(300);
  page.off('download', count);
  const back = await page.evaluate(() => (window.game.hud.menu.goBack(), document.querySelector('.overlay .pause').hidden));
  return n === 1 && /^demo-\d{8}-\d{6}\.rhhpaint$/.test(chip) && saved.suggestedFilename() === chip && !back ? null : JSON.stringify({ n, chip, file: saved.suggestedFilename(), back });
});

await check('upload popup: with the file picker open, CHOOSE FILE does nothing; closing the picker leaves the popup as it was', async () => {
  await page.click(UPLOAD);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${POPUP} .btn.primary`)]);
  let extra = 0;
  const count = () => extra++;
  page.on('filechooser', count);
  await page.evaluate((popup) => document.querySelector(`${popup} .btn.primary`).click(), POPUP);
  await page.waitForTimeout(300);
  page.off('filechooser', count);
  await chooser.setFiles([]);
  await page.waitForTimeout(300);
  const still = await page.textContent(`${POPUP} .btn.primary`);
  await page.evaluate(() => window.game.hud.menu.goBack());
  return !extra && still === 'Choose file…ENTER' ? null : JSON.stringify({ extra, still });
});

await check('upload popup: after a reload, a saved file shows by name, and REPLACE PAINT puts its paint back', async () => {
  const before = await paintedKeys(page);
  await page.reload();
  await gameReady(page, 2);
  await page.click(UPLOAD);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${POPUP} .btn.primary`)]);
  await chooser.setFiles(`${tmp}/menu.rhhpaint`);
  await page.waitForFunction((popup) => document.querySelector(`${popup} .btn.primary`).textContent.startsWith('Replace paint'), POPUP);
  const chip = await page.textContent(`${POPUP} .chip b`);
  await page.click(`${POPUP} .btn.primary`);
  await page.waitForFunction((popup) => document.querySelector(`${popup} .para.done`)?.textContent === 'Paint loaded.', POPUP);
  const after = await paintedKeys(page);
  await page.evaluate(() => window.game.hud.menu.goBack());
  return after === before && chip === 'menu.rhhpaint' ? null : JSON.stringify({ painted: after, saved: before, chip });
});

await check('upload popup: a broken file says so in red, and the paint stays', async () => {
  fs.writeFileSync(`${tmp}/broken.rhhpaint`, 'RHHPgarbage');
  const before = await paintedKeys(page);
  await page.click(UPLOAD);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${POPUP} .btn.primary`)]);
  await chooser.setFiles(`${tmp}/broken.rhhpaint`);
  await page.waitForFunction((popup) => document.querySelector(`${popup} .para.error`)?.textContent === 'Broken paint file.', POPUP);
  const kept = (await paintedKeys(page)) === before;
  await page.evaluate(() => window.game.hud.menu.goBack());
  return kept ? null : 'paint changed';
});

await check('menu: after a failed link the multiplayer page says so in red and offers COPY NETWORK LOG, which saves a file where the page has no clipboard (plain http, as on a LAN)', async () => {
  const p = await openPage(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await p.evaluate(() => (window.game.input.setLocked(true), window.game.input.setLocked(false)));
  const press = (text) => p.locator('.overlay button:visible', { hasText: text }).first().click();
  await press('Multiplayer');
  const before = await p.isVisible('.net-log');
  await p.evaluate(() => window.game.net.onStatus({ state: 'failed', reason: 'timeout' }));
  const said = await p.evaluate(() => { const s = document.querySelector('.mp-status'); return [s.textContent, s.classList.contains('error')]; });
  const saved = p.waitForEvent('download', { timeout: 5000 });
  await press('Copy network log');
  const name = (await saved.catch(() => null))?.suggestedFilename();
  await p.close();
  return !before && said.join() === "The server didn't answer,true" && /^roof-network-.+\.txt$/.test(name) && !p.errors.length ? null : JSON.stringify({ before, said, name, errors: p.errors });
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
    g.input.setLocked(true);
    g.player.setSpawn(g.player.position.clone().set(2.4, 0, 2.95), -Math.PI / 2);
    g.player.respawn();
    g.player.pitch = -0.3;
    g.inventory.select(0);
    g.paint.clear();
    const empty = await g.paintFile.save();
    let inAir = 0;
    await steps((f) => {
      if (f === 0) g.input.button(0, true);
      if (f === 8) g.input.button(0, false);
      if (f === 8) (inAir = g.tools.spray.particles.count), g.paintFile.load(empty);
      return f === 59;
    });
    g.fixedStep.dt = 0;
    g.input.setLocked(false);
    return { inAir, painted: g.paint.surfaces.filter((s) => s.data).length };
  });
  return r.inAir > 0 && r.painted === 0 ? null : JSON.stringify(r);
});

await check('input: keys typed into a text field are not game keys (a K in the session code took a screenshot)', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const field = Object.assign(document.createElement('input'), { type: 'text' });
    document.body.append(field);
    field.focus();
    const key = (target, code) => target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    key(field, 'KeyK');
    const typed = g.input.wasPressed('KeyK');
    field.remove();
    key(document.body, 'KeyK');
    return { typed, played: g.input.wasPressed('KeyK') };
  });
  return !r.typed && r.played ? null : JSON.stringify(r);
});

await check('input: K takes a screenshot only while playing, not on the title or pause screen', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const canvas = g.renderer.domElement;
    let shots = 0;
    canvas.toBlob = () => shots++;
    const k = async (locked) => {
      g.input.setLocked(locked);
      const before = shots;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyK' }));
      await steps((f) => f === 1);
      return shots - before;
    };
    const out = { paused: await k(false), playing: await k(true) };
    g.input.setLocked(false);
    delete canvas.toBlob;
    return out;
  });
  return r.paused === 0 && r.playing === 1 ? null : JSON.stringify(r);
});

await check('input: play actions answer for every key, button and wheel step bound to them (config.ts BINDINGS)', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const input = g.input;
    const key = (type, code, repeat = false) => window.dispatchEvent(new KeyboardEvent(type, { code, repeat }));
    input.setLocked(true);
    key('keydown', 'ControlRight');
    key('keydown', 'KeyE');
    key('keydown', 'KeyE', true);
    input.element.dispatchEvent(new MouseEvent('mousedown', { button: 2 }));
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    const out = {
      crouch: [input.held('crouch'), input.justPressed('crouch')],
      size: [input.justPressed('sizeUp'), input.repeated('sizeUp'), input.step('sizeDown', 'sizeUp')],
      shake: [input.held('shake'), input.justPressed('shake'), input.held('use')],
      wheel: [input.step('prev', 'next'), input.justPressed('prev')],
    };
    input.endFrame();
    key('keydown', 'KeyE', true);
    out.repeat = [input.justPressed('sizeUp'), input.step('sizeDown', 'sizeUp')];
    for (const code of ['ControlRight', 'KeyE']) key('keyup', code);
    window.dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
    out.released = [input.held('crouch'), input.held('shake')];
    input.setLocked(false);
    input.endFrame();
    // Labels come from the bindings.
    out.alert = document.querySelector('.psi-alert').textContent;
    return out;
  });
  const want = { crouch: [true, true], size: [true, true, 1], shake: [true, true, false], wheel: [1, false], repeat: [false, 1], released: [false, false], alert: 'LOW PRESSURE — HOLD [RMB] TO SHAKE' };
  return JSON.stringify(r) === JSON.stringify(want) ? null : JSON.stringify(r);
});

await check('input: Enter that resumes from the pause screen doesn\'t reach build mode (its sign text prompt), even when the lock is back before the next frame', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const canvas = g.renderer.domElement;
    const press = (code) => (window.dispatchEvent(new KeyboardEvent('keydown', { code })), window.dispatchEvent(new KeyboardEvent('keyup', { code })));
    // The browser's pointer lock, as it reports it.
    const lock = (on) => (Object.defineProperty(document, 'pointerLockElement', { get: () => (on ? canvas : null), configurable: true }), document.dispatchEvent(new Event('pointerlockchange')));
    let prompts = 0;
    window.prompt = () => (prompts++, null);
    lock(true);
    press('KeyB');
    await steps((f) => f === 1);
    const building = g.build.active;
    lock(false);
    await steps((f) => f === 1);
    g.build.status = '';
    press('Enter');
    lock(true);
    await steps((f) => f === 1);
    const out = { building, prompts, status: g.build.status };
    press('KeyB');
    await steps((f) => f === 1);
    lock(false);
    delete document.pointerLockElement;
    delete window.prompt;
    return out;
  });
  return r.building && r.prompts === 0 && r.status === '' ? null : JSON.stringify(r);
});

await check('input: a trackpad swipe\'s many small wheel events step the color once a notch, like a wheel\'s notch; its sideways events keep the part of a step, leaving the window drops it', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { inventory: inv, input, config } = g;
    for (const c of config.COLOR_ORDER) inv.addColor(c);
    inv.select(0);
    // Wheel events, one a frame: how many times the color changed.
    const roll = async (events) => {
      let changes = 0;
      let color = inv.color;
      await steps((f) => {
        if (inv.color !== color) (changes++, (color = inv.color));
        if (f < events.length) window.dispatchEvent(new WheelEvent('wheel', events[f]));
        return f === events.length + 1;
      });
      return changes;
    };
    input.setLocked(true);
    const out = {
      swipe: await roll(Array(20).fill({ deltaY: 5 })),
      notch: await roll([{ deltaY: 100 }]),
      lines: await roll([{ deltaY: 3, deltaMode: 1 }]),
      twoNotches: await roll([{ deltaY: -100 }, { deltaY: -100 }]),
      // A swipe's sideways event (no vertical scroll) keeps the part of a step so far: 60 + 60 is a notch (20 left).
      sideways: await roll([{ deltaY: 60 }, { deltaX: 20, deltaY: 0 }, { deltaY: 60 }]),
    };
    // Leaving the window drops the part of a step: 20 + 60, then away, then 60 is no notch.
    await roll([{ deltaY: 60 }]);
    window.dispatchEvent(new Event('blur'));
    out.afterBlur = await roll([{ deltaY: 60 }]);
    input.setLocked(false);
    return out;
  });
  return r.swipe === 1 && r.notch === 1 && r.lines === 1 && r.twoNotches === 2 && r.sideways === 1 && r.afterBlur === 0 ? null : JSON.stringify(r);
});

await check('input: the browser defaults in BROWSER_GUARDS are cancelled, playing or in the menu: playing every key but BROWSER_KEYS, zoom always (config.ts)', async () => {
  // Chromium goes back or forward on the mouse button's release unless the page cancels it.
  const r = await page.evaluate(() => {
    const g = window.game;
    // beforeunload goes to the window; the rest to the canvas, as the browser sends them while playing.
    const cancelled = (e) => !(e.type === 'beforeunload' ? window : g.renderer.domElement).dispatchEvent(e);
    const key = (code, ctrlKey = false) => new KeyboardEvent('keydown', { code, ctrlKey, bubbles: true, cancelable: true });
    const mouse = (type, button) => new MouseEvent(type, { button, bubbles: true, cancelable: true });
    const events = {
      space: () => key('Space'),
      sizeUp: () => key('KeyE'),
      tab: () => key('Tab'),
      ctrlW: () => key('KeyW', true),
      reload: () => key('KeyR', true),
      f3: () => key('F3'),
      f5: () => key('F5'),
      f11: () => key('F11'),
      f12: () => key('F12'),
      esc: () => key('Escape'),
      // Firefox's quick find, and its menu bar on Alt's release.
      quickFind: () => key('Slash'),
      altUp: () => new KeyboardEvent('keyup', { code: 'AltLeft', bubbles: true, cancelable: true }),
      leftDown: () => mouse('mousedown', 0),
      backUp: () => mouse('mouseup', 3),
      forwardClick: () => mouse('auxclick', 4),
      menu: () => mouse('contextmenu', 2),
      wheel: () => new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }),
      zoomIn: () => key('Equal', true),
      zoomReset: () => key('Digit0', true),
      ctrlWheel: () => new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true }),
      pinch: () => new Event('gesturestart', { bubbles: true, cancelable: true }),
      leave: () => new Event('beforeunload', { cancelable: true }),
    };
    const run = (locked) => {
      g.input.setLocked(locked);
      const out = Object.fromEntries(Object.entries(events).map(([name, make]) => [name, cancelled(make())]));
      g.input.endFrame();
      return out;
    };
    return { playing: run(true), menu: run(false) };
  });
  const playing = { space: true, sizeUp: true, tab: true, ctrlW: true, reload: false, f3: true, f5: false, f11: false, f12: false, esc: false, quickFind: true, altUp: true, leftDown: true, backUp: true, forwardClick: true, menu: true, wheel: false, zoomIn: true, zoomReset: true, ctrlWheel: true, pinch: true, leave: true };
  const menu = { space: false, sizeUp: false, tab: false, ctrlW: false, reload: false, f3: true, f5: false, f11: false, f12: false, esc: false, quickFind: false, altUp: false, leftDown: false, backUp: true, forwardClick: true, menu: true, wheel: false, zoomIn: true, zoomReset: true, ctrlWheel: true, pinch: true, leave: false };
  return JSON.stringify(r) === JSON.stringify({ playing, menu }) ? null : JSON.stringify(r);
});

await check('input: game fullscreen locks only the keys play binds and Esc (F11, F5, Ctrl+R stay the browser\'s), and the hold-Esc line says so', async () => {
  // Headless has no real fullscreen or keyboard lock: stand-ins that report what the browser would.
  const r = await page.evaluate(async () => {
    let element = null;
    let locked = null;
    const own = (o, name, value) => Object.defineProperty(o, name, { value, configurable: true });
    own(navigator, 'keyboard', { lock: async (keys) => (locked = keys), unlock() {} });
    Object.defineProperty(document, 'fullscreenElement', { get: () => element, configurable: true });
    own(document.documentElement, 'requestFullscreen', async () => (element = document.documentElement));
    const control = document.querySelector('.overlay .fs button');
    const pointer = (type) => control.dispatchEvent(new PointerEvent(type, { button: 0, bubbles: true }));
    pointer('pointerdown');
    await new Promise((done) => setTimeout(done, 50));
    // Holding the control: the status line's hint.
    pointer('pointerdown');
    const hint = [...document.querySelectorAll('.overlay .status kbd')].map((k) => k.textContent);
    pointer('pointerup');
    const out = { locked: ['Escape', 'KeyW', 'ControlLeft', 'KeyC', 'F11', 'F5', 'KeyR'].filter((k) => locked?.includes(k)), hint };
    delete navigator.keyboard;
    delete document.fullscreenElement;
    delete document.documentElement.requestFullscreen;
    return out;
  });
  return r.locked.join() === 'Escape,KeyW,ControlLeft,KeyC' && r.hint.join() === 'ESC,F11' ? null : JSON.stringify(r);
});

await check('menu: PLAY shows its ESC key windowed only where Esc resumes there (no keyboard lock: Firefox, Safari), not in Chromium', async () => {
  const r = await page.evaluate(async () => {
    const shown = async () => {
      await new Promise((done) => setTimeout(done, 100));
      return getComputedStyle(document.querySelector('.overlay .start .play kbd')).visibility === 'visible';
    };
    const chromium = await shown();
    // Firefox and Safari: no navigator.keyboard.
    Object.defineProperty(navigator, 'keyboard', { value: undefined, configurable: true });
    const other = await shown();
    delete navigator.keyboard;
    return { chromium, other, after: await shown() };
  });
  return !r.chromium && r.other && !r.after ? null : JSON.stringify(r);
});

await check('input: a key released while Cmd is held doesn\'t stay down (macOS sends no keyup for it)', async () => {
  const r = await page.evaluate(() => {
    const input = window.game.input;
    const key = (type, code, key = code) => window.dispatchEvent(new KeyboardEvent(type, { code, key }));
    input.setLocked(true);
    key('keydown', 'KeyW');
    key('keydown', 'MetaLeft', 'Meta');
    // W comes up while Cmd is held: macOS sends nothing for it.
    key('keyup', 'MetaLeft', 'Meta');
    const out = input.held('forward');
    input.setLocked(false);
    return out;
  });
  return r === false ? null : JSON.stringify(r);
});

await check('input: either Shift sprints, and flies fast in build mode', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
    const speed = () => Math.hypot(g.player.velocity.x, g.player.velocity.z);
    // W with a Shift for half a second, from the spawn facing away from its wall: the speed reached.
    const run = async (shift, fly) => {
      g.player.respawn();
      g.player.yaw += Math.PI;
      g.player.fly = fly;
      key('keydown', shift);
      key('keydown', 'KeyW');
      await steps((f) => f === 30);
      const v = speed();
      key('keyup', 'KeyW');
      key('keyup', shift);
      g.player.fly = false;
      return +v.toFixed(1);
    };
    g.input.setLocked(true);
    const out = {};
    for (const shift of ['ShiftLeft', 'ShiftRight']) out[shift] = [await run(shift, false), await run(shift, true)];
    g.input.setLocked(false);
    g.player.respawn();
    return { ...out, sprint: g.PLAYER.sprintSpeed, fly: g.config.BUILD.flySprintSpeed };
  });
  const ok = [r.ShiftLeft, r.ShiftRight].every(([walk, fly]) => walk > r.sprint * 0.9 && fly === r.fly);
  return ok ? null : JSON.stringify(r);
});

await check('input: tapping forward twice runs, on its arrow too; with Tap twice to run off it walks', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
    const speed = () => Math.hypot(g.player.velocity.x, g.player.velocity.z);
    // Two taps of ↑, the second held half a second, from the spawn facing away from its wall: the speed reached.
    const run = async (on) => {
      g.PLAYER.tapToRun = on;
      g.player.respawn();
      g.player.yaw += Math.PI;
      key('keydown', 'ArrowUp');
      await steps((f) => f === 3);
      key('keyup', 'ArrowUp');
      await steps((f) => f === 3);
      key('keydown', 'ArrowUp');
      await steps((f) => f === 30);
      const v = speed();
      key('keyup', 'ArrowUp');
      return +v.toFixed(1);
    };
    g.input.setLocked(true);
    const out = { on: await run(true), off: await run(false) };
    g.PLAYER.tapToRun = true;
    g.input.setLocked(false);
    g.player.respawn();
    return { ...out, walk: g.PLAYER.walkSpeed, sprint: g.PLAYER.sprintSpeed };
  });
  const ok = r.on > r.sprint * 0.9 && r.off > r.walk * 0.9 && r.off < r.walk * 1.05;
  return ok ? null : JSON.stringify(r);
});

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

await check('ladders: placing one tests a shadow cone per lamp, not per piece of the ladder (each placement stalled ~150 ms)', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player.position;
    const lamps = g.level.lights.filter((l) => !l.track).length;
    const cones = [];
    for (let i = 0; i < 2; i++) {
      g.level.setRuntime('cones', { type: 'stepladder', pos: [p.x + 1.5 + i * 0.4, p.y, p.z], rot: 0 });
      cones.push(g.baker.stats.cones);
    }
    g.level.setRuntime('cones', null);
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
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.properties.get(s.texture).__webglTexture, 0);
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

await test.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${failed ? `game tests: FAILED (${failed})` : 'game tests: all ok'}${skipped ? ` (${skipped} skipped: ONLY=${process.env.ONLY})` : ''}`);
process.exitCode = failed ? 1 : 0;
