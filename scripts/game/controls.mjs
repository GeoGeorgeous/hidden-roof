// Game tests: Settings > Controls, the credits' licenses and the updates notes.
import fs from 'node:fs';
import { page, check, openPage } from './harness.mjs';

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
    // Crouch's mode and Tap twice to run are remembered.
    row('Crouch').querySelectorAll('.choice button')[1].click();
    row('Forward').querySelectorAll('.choice button')[0].click();
    const modes = [PLAYER.crouchToggle, PLAYER.tapToRun, row('Crouch').querySelector('.choice .value').textContent, row('Forward').querySelector('.choice .value').textContent, saved().values];
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
    return { groups, defaults, listening, swallowed, heard, forward, moved, undone, mods, refused, cancelled, shake, shakes, wheel, heldWheel, cleared, restored, kept: Object.keys(kept).sort().join(), modes, asking, reset, back, values: saved().values };
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
  // The page links every file in public/licenses, once.
  const files = fs.readdirSync(new URL('../../public/licenses', import.meta.url)).length;
  return r.count === files && !r.bad.length ? null : JSON.stringify({ ...r, files });
});

await check('updates: the releases newest first, the newest marked Latest; each has its picture (a patch may have none) and its date; lists under a heading keep their terms', async () => {
  const r = await page.evaluate(async () => {
    const { menu } = window.game.hud;
    menu.openPage('updates');
    const vers = [...document.querySelectorAll('.rail .ver')].map((b) => b.textContent);
    const missing = [];
    for (const b of document.querySelectorAll('.rail .ver')) {
      b.click();
      const img = document.querySelector('.pane .shot img');
      const res = img && (await fetch(img.src));
      if (img ? !res.ok || res.headers.get('content-type') !== 'image/webp' : b.querySelector('b').textContent.endsWith('.0')) missing.push(b.textContent);
      if (!/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(document.querySelector('.pane .release span')?.textContent)) missing.push(`${b.textContent} date`);
    }
    const tools = [...document.querySelectorAll('.pane .item-note')].find((n) => n.querySelector('.item-title').textContent === 'tools');
    const terms = [...(tools?.querySelectorAll('.term-line b') ?? [])].map((t) => t.textContent);
    menu.openPage(null);
    return { vers, missing, terms };
  });
  return r.vers[0].endsWith('Latest') && r.vers.at(-1) === '1.0.0' && r.vers.filter((v) => v.endsWith('Latest')).length === 1 && !r.missing.length && r.terms.join() === 'spray can,marker,roller,sponge,stepladder' ? null : JSON.stringify(r);
});

await check('sound: the city recording arrives after the first gesture, the rains and thunder with the first rain and in a room, and all load', async () => {
  const r = await page.evaluate(async () => {
    const { audio, config } = window.game;
    const rain = config.ATMOS.rain;
    config.ATMOS.rain = true;
    audio.start();
    audio.setIndoors(true);
    audio.update(false);
    audio.setIndoors(false);
    config.ATMOS.rain = rain;
    return Promise.all(audio.recordings.values());
  });
  return r.length === 7 && r.every(Boolean) ? null : `recordings: ${r}`;
});

await check('rooms: both tools start off; a mark reaches up to what starts over a head, and U takes off only the mark you are on', async () => {
  const setup = await page.evaluate(() => {
    const g = window.game;
    const { x, y, z } = g.player.position;
    const floor = Math.round(y);
    const box = (bottom, top) => {
      const b = g.level.colliders[0].clone();
      b.min.set(Math.floor(x), floor + bottom, Math.floor(z));
      b.max.set(Math.floor(x) + 1, floor + top, Math.floor(z) + 1);
      return b;
    };
    window.rooms = { was: g.interiors.list(), count: g.level.colliders.length, floor };
    g.interiors.load([]);
    g.level.colliders.push(box(1.79, 1.795), box(2.5, 2.6));
    g.input.setLocked(true);
    return { mark: g.config.INDOOR_VIEW.mark, show: g.config.INDOOR_VIEW.show };
  });
  const hold = async (key) => {
    await page.keyboard.down(key);
    await page.evaluate(() => window.steps((f) => f >= 3));
    await page.keyboard.up(key);
  };
  await hold('KeyI');
  const off = await page.evaluate(() => window.game.interiors.list().length);
  await page.evaluate(() => (window.game.config.INDOOR_VIEW.mark = true));
  await hold('KeyI');
  const marked = await page.evaluate(() => {
    const g = window.game;
    const { x, z } = g.player.position;
    const { floor } = window.rooms;
    const list = g.interiors.list();
    const out = { list, under: g.interiors.has(x, floor + 2.4, z), over: g.interiors.has(x, floor + 2.6, z), below: g.interiors.has(x, floor - 1, z) };
    g.interiors.set(x, floor + 2.6, z, true);
    return out;
  });
  await hold('KeyU');
  const r = await page.evaluate(() => {
    const g = window.game;
    const { x, z } = g.player.position;
    const { was, count, floor } = window.rooms;
    const left = g.interiors.has(x, floor + 2.6, z) && !g.interiors.has(x, floor, z);
    g.level.colliders.length = count;
    g.interiors.load(was);
    g.config.INDOOR_VIEW.mark = false;
    g.input.setLocked(false);
    return { left, floor };
  });
  const ok = !setup.mark && !setup.show && off === 0 && marked.list.length === 1 && marked.list[0][1] === r.floor && marked.list[0][3] === 2.5 && marked.under && !marked.over && !marked.below && r.left;
  return ok ? null : JSON.stringify({ setup, off, marked, r });
});

await check('sound: a recording whose request drops is asked for again', async () => {
  const fresh = await openPage();
  let tries = 0;
  await fresh.route('**/city-night*', (route) => (++tries === 1 ? route.abort() : route.continue()));
  const r = await fresh.evaluate(async () => {
    const g = window.game;
    g.config.AUDIO.recordingRetry = 0.01;
    g.config.ATMOS.rain = false;
    g.audio.start();
    return Promise.all(g.audio.recordings.values());
  });
  await fresh.close();
  return tries === 2 && r.length === 1 && r[0] ? null : `tries ${tries}, ${r}`;
});

await check('sound: the hiss is louder with more opacity, closer to a wall and with the hand moving; a still hand is 1', async () => {
  const r = await page.evaluate(async () => {
    const file = '/src/spray/hiss.ts';
    const { hissFollows: h } = await import(file);
    const { HISS, SPRAY, BRUSH } = window.game.config;
    return {
      opacity: h(1, 1, 0) > h(0.2, 1, 0),
      wall: h(0.6, 0.3, 0) > h(0.6, 3, 0),
      hand: h(0.6, 1, BRUSH.speedRef) > h(0.6, 1, 0),
      far: h(0, SPRAY.reach * 2, 0) === HISS.opacityLow * HISS.far,
      fast: h(1, 0, BRUSH.speedRef * 3) === HISS.opacityHigh * HISS.near * HISS.moving,
    };
  });
  return Object.values(r).every(Boolean) ? null : JSON.stringify(r);
});

await check('sound: lightning with the Thunder slider at 0 is silent, not an error (a ramp to 0 throws)', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const { AUDIO } = g.config;
    const gain = AUDIO.thunderGain;
    AUDIO.thunderGain = 0;
    g.audio.start();
    try {
      g.audio.thunder(0);
      g.audio.thunder(1);
      return null;
    } catch (e) {
      return e.message;
    } finally {
      AUDIO.thunderGain = gain;
    }
  });
  return r;
});
