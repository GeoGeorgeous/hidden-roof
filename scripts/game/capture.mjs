// Game tests: capture mode (src/capture): its key, the two views, what's shown over the game, the game's input, the free camera's points, the frame sizes, and everything back on leaving.
import { page, check } from './harness.mjs';

await check('capture: N films with the free camera (no HUD, the game without input, a point where the camera is), V in first person (the HUD but hints and hotbar, the game played), F the frame sizes at pixel ratio 1, N leaves as it was', async () => {
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
    for (let i = 0; i < 4; i++) (await press('KeyF'), sizes.push(buffer()));
    await press('KeyF');
    await press('KeyN');
    const after = { cls: document.documentElement.className.includes('capture'), plate: shown('.capture-ui'), buffer: buffer(), hand: g.viewScene.visible };
    g.player.position.copy(start);
    g.input.setLocked(false);
    g.fixedStep.dt = 0;
    return { free, first, sizes, windowSize, after };
  });
  const { free, first, sizes, windowSize, after } = r;
  const ok =
    !free.frame && free.plate && !free.hand && free.walked < 0.01 && free.flew > 0.5 && free.marks === 1 &&
    first.frame && !first.hotbar && !first.hint && first.plate && first.hand && first.marks === 0 && first.walked > 0.5 &&
    sizes.join() === `1920x1080,1080x1920,1080x1080,${windowSize}` &&
    !after.cls && !after.plate && after.buffer === windowSize && after.hand;
  return ok ? null : JSON.stringify(r);
});
