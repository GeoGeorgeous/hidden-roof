// Game tests: Loading, the can: shaking, its brush, opacity, crosshair, slant, caps and plume; the settings made for painting.
import { page, check } from './harness.mjs';

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

await check('brush: paint lands at once, a fast flick leaves no gaps, and particles paint nothing', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { input, player } = g;
    input.setLocked(true);
    g.inventory.select(0);
    g.paint.clear();
    player.setSpawn(player.position.clone().set(2.4, 0, 2.95), -Math.PI / 2);
    player.respawn();
    g.paint.log = [];
    const out = {};
    await steps((f) => {
      player.yaw = -Math.PI / 2 + 0.5 - f * 0.05;
      player.pitch = -0.1;
      if (f === 0) input.button(0, true);
      if (f === 1) out.firstFrame = g.paint.log.length;
      if (f === 20) (input.button(0, false), (out.inAir = g.tools.spray.particles.count), (out.atRelease = g.paint.log.length));
      return f === 60;
    });
    const stamps = g.paint.log.filter((o) => o.kind === 'stamp');
    out.afterRelease = stamps.length - out.atRelease;
    // The widest step between dabs on the wall (m).
    const { paint, config } = g;
    const onFace = (o) => {
      const rect = paint.find(o.key).geo.rects[o.rect];
      return [(o.u * rect.w) / config.PAINT.texelsPerMeter, (o.v * rect.h) / config.PAINT.texelsPerMeter, o.key + o.rect];
    };
    const faces = stamps.map(onFace);
    out.widest = Math.max(...faces.slice(1).map((p, i) => (p[2] === faces[i][2] ? Math.hypot(p[0] - faces[i][0], p[1] - faces[i][1]) : 0)));
    out.radius = Math.min(...stamps.map((o) => o.radius));
    g.paint.log = null;
    g.fixedStep.dt = 0;
    input.setLocked(false);
    return out;
  });
  return r.firstFrame > 0 && r.inAir > 0 && r.afterRelease === 0 && r.widest > 0 && r.widest < r.radius ? null : JSON.stringify(r);
});

await check('opacity: Run + the color keys set it with the can in hand, the color stays; the paint follows, it stays in this browser, and flow says how much comes out', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { input, inventory: inv, player, config } = g;
    const { BRUSH } = config;
    const shift = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'ShiftLeft' }));
    const scroll = (dir) => steps((f) => (f === 0 && input.wheel(dir), f === 2));
    const was = BRUSH.opacity;
    input.setLocked(true);
    inv.addColor('red');
    inv.select(0);
    const color = inv.color;
    const saved = () => JSON.parse(localStorage.getItem('roofhiddenhaus.settings') ?? '{}').values?.['BRUSH.opacity'];
    const cross = document.querySelector('.crosshair');
    const shown = () => [cross.classList.contains('arc'), cross.style.getPropertyValue('--opacity'), cross.querySelector('span').hidden, cross.querySelector('span').textContent];
    shift('keydown');
    await scroll(-1);
    const up = [BRUSH.opacity, inv.color === color, ...shown()];
    await scroll(1);
    await scroll(1);
    const down = [BRUSH.opacity, inv.color === color, saved()];
    shift('keyup');
    await scroll(1);
    const plain = [BRUSH.opacity, inv.color !== color];
    // A dab at two opacities, on the same spot.
    player.setSpawn(player.position.clone().set(2.4, 0, 2.95), -Math.PI / 2);
    player.respawn();
    const amount = async (opacity) => {
      BRUSH.opacity = opacity;
      g.paint.clear();
      g.paint.log = [];
      let flow = 0;
      await steps((f) => {
        player.yaw = -Math.PI / 2;
        player.pitch = -0.1;
        if (f === 0) input.button(0, true);
        if (f === 3) (flow = g.tools.spray.flow), input.button(0, false);
        return f === 5;
      });
      const stamp = g.paint.log.find((o) => o.kind === 'stamp');
      g.paint.log = null;
      return [stamp?.amount, flow];
    };
    const faint = await amount(0.15);
    const dense = await amount(0.65);
    BRUSH.opacity = was;
    g.paint.clear();
    g.fixedStep.dt = 0;
    input.setLocked(false);
    const left = JSON.parse(localStorage.getItem('roofhiddenhaus.settings'));
    delete left.values['BRUSH.opacity'];
    localStorage.setItem('roofhiddenhaus.settings', JSON.stringify(left));
    return { up, down, plain, faint, dense };
  });
  const ok = JSON.stringify([r.up, r.down, r.plain]) === JSON.stringify([[0.75, true, true, '0.75', false, '75%'], [0.55, true, 0.55], [0.55, true]]);
  return ok && r.faint[0] < r.dense[0] / 2 && r.faint[1] === 0.15 && r.dense[1] === 0.65 ? null : JSON.stringify(r);
});

await check('crosshair: follows the line it would leave: distance, cap, and with no wall the can\'s reach', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { input, inventory: inv, player, tools } = g;
    input.setLocked(true);
    inv.unlockAll();
    inv.select(0);
    const stand = async (d, cap) => {
      while (inv.cap !== cap) inv.cycleCap(1);
      player.setSpawn(player.position.clone().set(3.4 - d, 0, 2.95), -Math.PI / 2);
      player.respawn();
      await steps((f) => ((player.yaw = -Math.PI / 2), (player.pitch = 0), f === 3));
      return tools.crosshair('can');
    };
    const near = await stand(1, 'standard');
    const far = await stand(3, 'standard');
    const wide = await stand(3, 'spray');
    const sky = await (async () => {
      player.pitch = 1.5;
      await steps((f) => ((player.pitch = 1.5), f === 3));
      return tools.crosshair('can');
    })();
    await stand(1, 'standard');
    g.paint.clear();
    g.fixedStep.dt = 0;
    input.setLocked(false);
    return { near, far, wide, sky };
  });
  return r.near > 8 && r.far > 8 && r.wide > r.far && r.sky > 0 ? null : JSON.stringify(r);
});

await check('slant: the can at an angle to a wall lays dabs stretched along the aim, head on round ones', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { input, inventory: inv, player } = g;
    input.setLocked(true);
    inv.unlockAll();
    inv.select(0);
    const spray = async (turn) => {
      g.paint.clear();
      g.paint.log = [];
      player.setSpawn(player.position.clone().set(2.4, 0, 2.95), -Math.PI / 2);
      player.respawn();
      await steps((f) => ((player.yaw = -Math.PI / 2 + turn), (player.pitch = 0), f === 0 && input.button(0, true), f === 12 && input.button(0, false), f === 14));
      return g.paint.log.filter((o) => o.kind === 'stamp');
    };
    const head = await spray(0);
    const side = await spray(0.7);
    g.paint.log = null;
    g.paint.clear();
    await steps((f) => ((player.yaw = -Math.PI / 2), f === 1));
    input.setLocked(false);
    return { head: head.length, round: head.filter((o) => !o.slant).length, side: side.length, slants: side.map((o) => o.slant).filter(Boolean) };
  });
  const want = 1 / Math.cos(0.7);
  const off = r.slants.filter((s) => Math.abs(s.stretch - want) > 0.05 || !(s.tail > 0));
  return r.head > 0 && r.round === r.head && r.side > 0 && r.slants.length === r.side && !off.length ? null : JSON.stringify({ ...r, slants: r.slants.slice(0, 2), want });
});

await check('settings: General is in groups, and the mouse turns slower only while a tool paints', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { input, inventory: inv, player, config } = g;
    g.hud.menu.openSettings('General');
    const page = [...document.querySelectorAll('.settings-page .rows > *')].map((e) => (e.classList.contains('group') ? `# ${e.textContent}` : e.querySelector('.label span').textContent));
    g.hud.menu.openPage(null);
    input.setLocked(true);
    inv.select(0);
    const was = config.PLAYER.paintSensitivity;
    config.PLAYER.paintSensitivity = 0.5;
    /** How far a mouse move of 100 px turns the player, in sensitivities. */
    const turned = async (pressed) => {
      let from = 0;
      let got = 0;
      await steps((f) => {
        if (f === 0) input.button(0, pressed);
        if (f === 3) ((from = player.yaw), (input.mouseDX = 100));
        if (f === 4) got = (from - player.yaw) / (100 * config.PLAYER.mouseSensitivity);
        return f === 4;
      });
      input.button(0, false);
      return got;
    };
    const free = await turned(false);
    const painting = await turned(true);
    await steps((f) => f === 2);
    config.PLAYER.paintSensitivity = was;
    g.paint.clear();
    g.fixedStep.dt = 0;
    input.setLocked(false);
    return { page, free, painting };
  });
  const want = ['# painting', 'Sensitivity', 'Sensitivity while painting', 'Streamline', '# view', 'Field of view', 'Field of view: running', 'Field of view: painting', '# help', 'Hints', 'Show hints again', '# left hand', 'Show left hand'];
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  return JSON.stringify(r.page) === JSON.stringify(want) && close(r.free, 1) && close(r.painting, 0.5) ? null : JSON.stringify(r);
});

await check('field of view: painting: it narrows while a tool paints and comes back', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { input, inventory: inv, config } = g;
    const camera = g.scene.children.find((o) => o.isPerspectiveCamera);
    input.setLocked(true);
    inv.select(0);
    config.RENDER.paintFovCut = 10;
    const out = { full: camera.fov };
    await steps((f) => (f === 0 && input.button(0, true), f === 120));
    out.painting = camera.fov;
    input.button(0, false);
    await steps((f) => f === 120);
    out.after = camera.fov;
    config.RENDER.paintFovCut = 0;
    g.paint.clear();
    g.fixedStep.dt = 0;
    input.setLocked(false);
    return out;
  });
  return Math.abs(r.painting - (r.full - 10)) < 0.1 && Math.abs(r.after - r.full) < 0.1 ? null : JSON.stringify(r);
});

await check('caps: each sprays, NEEDLE from its tube\'s tip; the crosshair fades where paint wouldn\'t land', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { input, inventory: inv, player, tools, config } = g;
    input.setLocked(true);
    inv.unlockAll();
    inv.select(0);
    const out = { sprayed: {} };
    player.setSpawn(player.position.clone().set(2.4, 0, 2.95), -Math.PI / 2);
    player.respawn();
    for (const cap of config.CAP_ORDER) {
      while (inv.cap !== cap) inv.cycleCap(1);
      g.paint.clear();
      g.paint.log = [];
      await steps((f) => ((player.yaw = -Math.PI / 2), (player.pitch = 0), f === 0 && input.button(0, true), f === 8 && input.button(0, false), f === 10));
      out.sprayed[cap] = g.paint.log.filter((o) => o.kind === 'stamp').length;
      g.paint.log = null;
    }
    const tip = async (cap) => {
      while (inv.cap !== cap) inv.cycleCap(1);
      await steps((f) => f === 2);
      return tools.spray.model.nozzleWorld(player.position.clone()).distanceTo(g.scene.children.find((o) => o.isPerspectiveCamera).position);
    };
    out.needleTip = await tip('needle');
    out.skinnyTip = await tip('skinny');
    const far = () => document.querySelector('.crosshair').style.opacity === `${g.config.CROSSHAIR.far}`;
    await steps((f) => ((player.pitch = 0), f === 3));
    out.onWall = far();
    await steps((f) => ((player.pitch = 1.4), f === 3));
    out.sky = far();
    await steps((f) => ((player.pitch = 0), f === 3));
    g.paint.clear();
    g.fixedStep.dt = 0;
    input.setLocked(false);
    return out;
  });
  const every = Object.values(r.sprayed).every((n) => n > 0);
  return every && r.needleTip !== r.skinnyTip && !r.onWall && r.sky ? null : JSON.stringify(r);
});

await check('plume: specks leave the nozzle and never pass the wall, and are gone soon after the spray stops', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { input, inventory: inv, player, tools } = g;
    input.setLocked(true);
    inv.select(0);
    g.paint.clear();
    const out = { most: 0, past: 0 };
    // Up against the wall the can in hand reaches through it: no specks there either.
    player.setSpawn(player.position.clone().set(3.1, 0, 2.95), -Math.PI / 2);
    player.respawn();
    await steps((f) => {
      player.yaw = -Math.PI / 2;
      player.pitch = 0;
      if (f === 0) input.button(0, true);
      for (const p of tools.spray.particles.live) if (p.pos.x > 3.4) out.past++;
      if (f === 20) input.button(0, false);
      return f === 60;
    });
    player.setSpawn(player.position.clone().set(2.2, 0, 2.95), -Math.PI / 2);
    player.respawn();
    await steps((f) => {
      player.yaw = -Math.PI / 2;
      player.pitch = 0;
      if (f === 0) input.button(0, true);
      for (const p of tools.spray.particles.live) {
        out.most = Math.max(out.most, p.pos.x);
        if (p.pos.x > 3.4) out.past++;
      }
      if (f === 40) ((out.flying = tools.spray.particles.count), input.button(0, false));
      return f === 110;
    });
    out.after = tools.spray.particles.count;
    g.paint.clear();
    g.fixedStep.dt = 0;
    input.setLocked(false);
    return out;
  });
  return r.flying > 100 && r.past === 0 && r.most > 2.9 && r.after === 0 ? null : JSON.stringify(r);
});

await check('plume: follows the opacity set, specks fewer and fainter, and looks as tuned at par', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { input, inventory: inv, player, tools, config } = g;
    const was = config.BRUSH.opacity;
    const spray = tools.spray.particles;
    input.setLocked(true);
    inv.select(0);
    player.setSpawn(player.position.clone().set(2.2, 0, 2.95), -Math.PI / 2);
    player.respawn();
    const plume = async (opacity) => {
      config.BRUSH.opacity = opacity;
      let specks = 0;
      await steps((f) => {
        player.yaw = -Math.PI / 2;
        player.pitch = 0;
        if (f === 0) input.button(0, true);
        if (f >= 20) specks += spray.count;
        if (f === 40) input.button(0, false);
        return f === 80;
      });
      return specks;
    };
    const out = {};
    for (const o of [0.05, 0.65, 1]) out[o] = await plume(o);
    config.BRUSH.opacity = 0.05;
    await steps((f) => (f === 0 && input.button(0, true), f === 20 && ((out.strength = spray.strengths[0]), input.button(0, false)), f === 60));
    config.BRUSH.opacity = was;
    g.paint.clear();
    g.fixedStep.dt = 0;
    input.setLocked(false);
    return out;
  });
  const fine = r[0.05] < r[0.65] * 0.4 && r[0.65] < r[1] && Math.abs(r.strength - Math.sqrt(0.05 / 0.65)) < 1e-6;
  return fine ? null : JSON.stringify(r);
});

await check('plume: in a crowd every can keeps a plume, however few specks are left', async () => {
  const got = await page.evaluate(async () => {
    const g = window.game;
    const { input, player, tools, config } = g;
    const others = tools.spray.others;
    const at = (x, y, z) => player.position.clone().set(x, y, z);
    const spot = { eye: at(0, 2, 0), nozzle: at(0, 2, 0), forward: at(1, 0, 0), right: at(0, 0, 1), up: at(0, 1, 0), cap: config.CAPS.standard, flow: config.SPRAY.plume.opacityAtPar, display: { r: 1, g: 0, b: 0 }, dt: 1 / 60 };
    const memos = Array.from({ length: 8 }, () => ({ age: -Infinity, eye: spot.eye, forward: spot.forward, distance: 4 }));
    const got = memos.map(() => 0);
    input.setLocked(true);
    await steps((f) => {
      memos.forEach((memo, i) => {
        const was = others.count;
        others.show({ ...spot, count: 100, memo });
        if (f >= 30) got[i] += others.count - was;
      });
      return f === 50;
    });
    g.fixedStep.dt = 0;
    input.setLocked(false);
    return got;
  });
  return Math.min(...got) > Math.max(...got) * 0.5 ? null : JSON.stringify(got);
});
