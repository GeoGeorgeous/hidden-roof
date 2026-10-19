// Game tests: Settings > Controls, the credits' licenses and the updates notes.
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
