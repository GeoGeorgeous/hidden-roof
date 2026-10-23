// Game tests: Input: text fields, screenshots, bindings, Enter on resume, the wheel, browser guards, fullscreen keys, Cmd, sprint and running.
import { page, check } from './harness.mjs';

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
    let shots = 0;
    HTMLCanvasElement.prototype.toBlob = () => shots++;
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
    delete HTMLCanvasElement.prototype.toBlob;
    return out;
  });
  return r.paused === 0 && r.playing === 1 ? null : JSON.stringify(r);
});

await check('input: a screenshot has the other players\' name tags in it, box and name', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    // As net/nameplates.ts builds one: the name on its box, the distance under it.
    const tag = Object.assign(document.createElement('div'), { className: 'nameplate' });
    tag.innerHTML = '<div class="tag"><span class="name">WWWWWWWW</span></div><span class="far">5m</span>';
    tag.style.transform = `translate(${innerWidth / 2}px, ${innerHeight / 2}px)`;
    document.querySelector('.layer-world').append(tag);
    const proto = HTMLCanvasElement.prototype;
    const was = proto.toBlob;
    let shot = null;
    proto.toBlob = function () {
      shot = this;
    };
    g.input.setLocked(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyK' }));
    await steps((f) => f === 1);
    const box = tag.querySelector('.tag').getBoundingClientRect();
    g.input.setLocked(false);
    proto.toBlob = was;
    tag.remove();
    if (!shot) return { shot: false };
    const view = g.renderer.domElement.getBoundingClientRect();
    const scale = shot.width / view.width;
    const px = shot.getContext('2d').getImageData(Math.floor((box.left - view.left) * scale), Math.floor((box.top - view.top) * scale), Math.ceil(box.width * scale), Math.ceil(box.height * scale)).data;
    const at = (i) => px.slice(i * 4, i * 4 + 4);
    let light = 0;
    for (let i = 0; i < px.length / 4; i++) if (px[i * 4] > 150) light++;
    // The corner is the box's padding (dark, nearly opaque); the name's letters are light.
    return { corner: [...at(0)], light };
  });
  return r.corner && r.corner[0] < 80 && r.corner[3] > 150 && r.light > 0 ? null : JSON.stringify(r);
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
