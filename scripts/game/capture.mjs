// Game tests: capture mode (src/capture): its key, the two views, what's shown over the game, the game's input, the free camera's points, the frame sizes, and everything back on leaving.
import { page, check } from './harness.mjs';

await check('capture: N films with the free camera (no HUD, the game without input, a point where the camera is), V in first person (the HUD but hints and hotbar, the game played), F the frame sizes at pixel ratio 1, hatching that grows with a taller frame, N leaves as it was', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const shown = (sel) => getComputedStyle(document.querySelector(sel)).display !== 'none';
    const press = async (code, n = 1) => {
      g.input.key(code, true);
      await window.frames(n);
      g.input.key(code, false);
      await window.frames(1);
    };
    const buffer = () => {
      const b = g.renderer.getDrawingBufferSize(new (g.scene.position.constructor)());
      return `${b.x}x${b.y}`;
    };
    const camera = g.scene.children.find((o) => o.isCamera);
    const start = g.player.position.clone();
    const windowSize = buffer();
    g.input.setLocked(true);
    await press('KeyN');
    // Loaded on first use.
    await window.steps(() => document.documentElement.classList.contains('capture-free'));
    const free = { frame: shown('.layer-frame'), plate: shown('.capture-plate'), hand: g.viewScene.visible };
    await press('KeyW', 20);
    free.walked = g.player.position.distanceTo(start);
    free.flew = camera.position.distanceTo(g.player.position);
    await press('KeyK');
    free.marks = document.querySelectorAll('.capture-mark').length;
    await press('KeyV');
    const first = { frame: shown('.layer-frame'), hotbar: shown('.hotbar'), hint: shown('.layer-hint'), plate: shown('.capture-plate'), hand: g.viewScene.visible, marks: [...document.querySelectorAll('.capture-mark')].filter((m) => !m.hidden && getComputedStyle(m).display !== 'none').length };
    await press('KeyW', 20);
    first.walked = g.player.position.distanceTo(start);
    const sizes = [];
    const hatch = [];
    for (let i = 0; i < 4; i++) (await press('KeyF'), sizes.push(buffer()), hatch.push(Math.round(g.config.INK.hatchPx * 100)));
    await press('KeyF');
    // Past the dev tools' Record avatar view (the one above) to first person, where the next check starts.
    await press('KeyV');
    await press('KeyN');
    const after = { cls: document.documentElement.className.includes('capture'), plate: shown('.capture-ui'), buffer: buffer(), hand: g.viewScene.visible };
    g.player.position.copy(start);
    g.input.setLocked(false);
    g.fixedStep.dt = 0;
    return { free, first, sizes, hatch, windowSize, after };
  });
  const { free, first, sizes, hatch, windowSize, after } = r;
  const ok =
    !free.frame && free.plate && !free.hand && free.walked < 0.01 && free.flew > 0.5 && free.marks === 1 &&
    first.frame && !first.hotbar && !first.hint && first.plate && first.hand && first.marks === 0 && first.walked > 0.5 &&
    sizes.join() === `1920x1080,1080x1920,1080x1080,${windowSize}` && hatch.join() === '200,356,200,200' &&
    !after.cls && !after.plate && after.buffer === windowSize && after.hand;
  return ok ? null : JSON.stringify(r);
});

await check("capture: a recording the browser refuses says so on the plate, and M tries again", async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const press = async (code) => {
      g.input.key(code, true);
      await window.frames(1);
      g.input.key(code, false);
      await window.frames(1);
    };
    const real = window.MediaRecorder;
    const plate = () => document.querySelector('.capture-plate').textContent;
    let refuse = true;
    window.MediaRecorder = class {
      static isTypeSupported = () => true;
      start() {
        if (refuse) throw new DOMException('no', 'NotSupportedError');
      }
      stop() {
        this.onstop();
      }
    };
    g.input.setLocked(true);
    await press('KeyN');
    await press('KeyM');
    const refused = plate();
    refuse = false;
    await press('KeyM');
    const recording = plate();
    await press('KeyM');
    const stopped = plate();
    await press('KeyN');
    window.MediaRecorder = real;
    g.input.setLocked(false);
    g.fixedStep.dt = 0;
    return { refused, recording, stopped };
  });
  return r.refused.includes("can't record") && r.recording.includes('REC') && !r.stopped.includes("can't record") ? null : JSON.stringify(r);
});

await check("capture: M records the game's sound with the canvas, on a second take too, and the free camera hears the fan by it, not by the player", async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const press = async (code) => {
      g.input.key(code, true);
      await window.frames(1);
      g.input.key(code, false);
      await window.frames(1);
    };
    const takes = [];
    const real = window.MediaRecorder;
    window.MediaRecorder = class {
      static isTypeSupported = () => true;
      constructor(stream) {
        takes.push(stream);
      }
      start() {}
      stop() {
        this.onstop();
      }
    };
    const setFan = g.audio.setFan;
    let fan = 0;
    g.audio.setFan = (level) => (fan = level);
    const start = g.player.position.clone();
    g.audio.start();
    g.input.setLocked(true);
    await press('KeyN');
    // The check before left it in first person.
    await press('KeyV');
    const free = document.documentElement.classList.contains('capture-free');
    const seen = [];
    for (let i = 0; i < 2; i++) {
      await press('KeyM');
      const stream = takes[i];
      const sound = stream?.getAudioTracks()[0];
      await press('KeyM');
      seen.push({ video: stream?.getVideoTracks().length, sound: sound?.readyState });
    }
    const camera = g.scene.children.find((o) => o.isCamera);
    const emitter = { kind: 'fan', pos: camera.position.clone() };
    g.level.emitters.push(emitter);
    g.player.position.x += 50;
    await window.frames(2);
    const heard = fan;
    g.level.emitters.pop();
    g.player.position.copy(start);
    await press('KeyN');
    g.audio.setFan = setFan;
    window.MediaRecorder = real;
    g.input.setLocked(false);
    g.fixedStep.dt = 0;
    return { free, seen, heard };
  });
  const ok = r.free && r.seen.length === 2 && r.seen.every((s) => s.video === 1 && s.sound === 'live') && r.heard > 0.9;
  return ok ? null : JSON.stringify(r);
});
