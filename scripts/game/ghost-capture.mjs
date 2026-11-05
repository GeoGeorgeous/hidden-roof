// Game tests: the ghost from capture mode (src/dev/ghost-capture.ts): its keys and plate, your wall and stepladder kept, takes, the end of playing, paint runs at its speed, and a session.
import { page, check } from './harness.mjs';

await page.evaluate(() => {
  const g = window.game;
  const { steps, frames } = window;
  const hash = () => g.paint.surfaces.filter((s) => s.data).reduce((h, s) => s.data.reduce((h, v) => (h * 31 + v) >>> 0, h), 7);
  const press = async (code) => {
    g.input.key(code, true);
    await frames(1);
    g.input.key(code, false);
    await frames(1);
  };
  const plate = () => document.querySelector('.capture-plate').textContent;
  const root = document.documentElement.classList;
  const until = (done) => steps(done, 8000);
  window.ghostKit = {
    hash,
    press,
    plate,
    until,
    stamp(i, rgb) {
      g.paint.stamp(g.paint.surfaces[i], { rect: 0, u: 0.5, v: 0.5 }, 0.1, 1, rgb);
      return hash();
    },
    /** Capture mode's free view, no take, a bare wall and a network with no surprises. */
    async enter() {
      g.ghost.stop();
      await g.ghost.settled;
      g.paint.clear();
      g.ghost.rec = null;
      Object.assign(g.config.GHOST, { latency: 0, jitter: 0, hiccups: 0 });
      g.player.fly = true;
      g.input.setLocked(true);
      await this.into();
    },
    async into() {
      await press('KeyN');
      await until(() => root.contains('capture'));
      while (!root.contains('capture-free')) await press('KeyV');
    },
    /** From the free view: a walk that paints once, back in the free view. */
    async take(seconds = 1) {
      await press('KeyV');
      await until(() => /RECORD AVATAR/.test(plate()));
      await press('KeyT');
      await until(() => g.ghost.recording);
      const x = g.player.position.x;
      let coat = false;
      await steps((f) => {
        g.player.position.x = x + f / 60;
        if (!coat && f > 10) (coat = true), g.paint.stamp(g.paint.surfaces[0], { rect: 0, u: 0.2, v: 0.5 }, 0.1, 1, [1, 0, 0]);
        return f === seconds * 60;
      });
      await press('KeyT');
      await until(() => !g.ghost.recording && /FREE CAMERA/.test(plate()));
    },
    async play() {
      await press('Space');
      await until(() => g.ghost.position);
    },
    async leave() {
      if (root.contains('capture')) await press('KeyN');
      g.ghost.stop();
      await g.ghost.settled;
      g.level.setRuntime(g.session.player, null);
      g.input.setLocked(false);
      Object.assign(g.config.GHOST, { latency: 0.08, jitter: 0.04 });
      g.fixedStep.dt = 0;
      g.player.fly = false;
      g.paint.clear();
    },
  };
});

await check("ghost: capture mode's Record avatar view records it, its keys hold it still, speed it up and start it over; the clean wall has neither ghost nor its paint and goes on from where it was; your stepladder isn't doubled", async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { GHOST } = g.config;
    const { hash, press, plate: text } = window.ghostKit;
    const ladders = () => [...g.level.props.values()].filter((p) => p.type === 'stepladder').length;
    g.paint.clear();
    g.ghost.rec = null;
    // Paint from before the recording: what stays on the clean wall.
    g.paint.stamp(g.paint.surfaces[1], { rect: 0, u: 0.5, v: 0.5 }, 0.1, 1, [0, 0, 1]);
    const begun = hash();
    g.player.fly = true;
    const start = g.player.position.clone();
    const { x: x0 } = start;
    const before = ladders();
    g.level.setRuntime(g.session.player, { type: 'stepladder', pos: [start.x + 3, start.y, start.z + 3], rot: 0 });
    Object.assign(GHOST, { latency: 0, jitter: 0, hiccups: 0 });
    g.input.setLocked(true);
    await press('KeyN');
    await steps(() => document.documentElement.classList.contains('capture'));
    // It comes back in the view it left.
    while (!document.documentElement.classList.contains('capture-free')) await press('KeyV');
    const out = { none: /AVATAR none/.test(text()) && /V then T records/.test(text()) };
    // The free view records nothing, the Record avatar view does: a 3 s walk that paints near the start and near the end.
    await press('KeyT');
    out.freeRecords = g.ghost.recording;
    await press('KeyV');
    await steps(() => /RECORD AVATAR/.test(text()) && /T start/.test(text()));
    // First person has all it needs on the plate: Tab changes nothing.
    const view = text();
    g.input.key('Tab', true);
    await window.frames(1);
    out.noTab = text() === view && !/Tab/.test(view) && /next view/.test(view) && /frame/.test(view);
    g.input.key('Tab', false);
    await press('KeyT');
    out.recording = g.ghost.recording;
    let coats = 0;
    await steps((f) => {
      const t = f / 60;
      g.player.position.set(x0 + t, start.y, start.z);
      if (coats < 2 && t > 0.3 + coats * 2.2) g.paint.stamp(g.paint.surfaces[0], { rect: 0, u: 0.2 + 0.5 * coats++, v: 0.5 }, 0.1, 1, [1, 0, 0]);
      return f === 180;
    });
    await press('KeyT');
    out.stopped = !g.ghost.recording && g.ghost.recorded;
    // Done, it's the free view.
    await steps(() => /FREE CAMERA/.test(text()), 8000);
    const end = hash();
    // Then first person: the ghost's state and no keys of its own.
    await press('KeyV');
    await press('KeyV');
    await steps(() => /FIRST PERSON/.test(text()), 8000);
    out.first = /AVATAR ready/.test(text()) && !/plays/.test(text());
    await press('KeyV');
    await steps(() => /AVATAR ready/.test(text()));
    // Speed and smoothing always, the rest while Tab is held; one control a line.
    const rows = () => [...document.querySelector('.capture-plate').children].map((r) => r.textContent);
    const shown = rows();
    out.rows = shown.some((r) => /m\/s/.test(r)) && shown.some((r) => /smoothing/.test(r)) && shown.some((r) => /Tab keys/.test(r)) && !shown.some((r) => /FLIGHT/.test(r));
    g.input.key('Tab', true);
    await window.frames(1);
    const sheet = rows();
    out.sheet = ['CAMERA', 'FLIGHT', 'AVATAR', 'VIDEO'].every((h) => sheet.includes(h)) && sheet.some((r) => /clean wall/.test(r)) && sheet.some((r) => /records a video/.test(r)) && !sheet.some((r) => /·/.test(r));
    g.input.key('Tab', false);
    await window.frames(1);
    await press('Space');
    await steps(() => g.ghost.position && g.ghost.position.x > x0 + 0.5);
    out.ladders = ladders() - before;
    // Held still.
    await press('Space');
    const held = g.ghost.position.x;
    await window.frames(30);
    out.held = g.ghost.position.x - held;
    await press('Space');
    // A few frames' walk at 1x, then at 2x.
    const pace = async () => {
      const a = g.ghost.position.x;
      await window.frames(6);
      return g.ghost.position.x - a;
    };
    const one = await pace();
    await press('Digit2');
    out.twice = (await pace()) / one;
    out.status = /AVATAR ▶ 2×/.test(text());
    await press('Digit1');
    // The first coat is on, the second is yet to come: the clean wall, then on from there.
    await steps(() => hash() !== begun && g.ghost.position.x < x0 + 2);
    const mid = hash();
    await press('KeyC');
    await steps(() => hash() === begun);
    await window.frames(10);
    out.clean = { ghost: g.ghost.position, wall: hash() === begun, ladders: ladders() - before };
    const seen = g.ghost.remote.avatar.group.position.x;
    const middle = g.ghost.label;
    await press('KeyC');
    await steps(() => g.ghost.position);
    out.wentOn = { label: middle, moved: Math.abs(g.ghost.position.x - seen), wall: hash() === mid };
    await steps(() => hash() === end);
    out.finished = true;
    // A paint run under way goes on too.
    const s = g.paint.surfaces[0];
    g.paintOps.apply({ kind: 'drip', key: s.key, rect: 0, u: 0.5, v: 0.9, length: 1, speed: 0.01, rgb: [1, 0, 0] });
    out.runs = [g.drips.runs.length];
    await press('KeyC');
    await steps(() => !g.drips.runs.length);
    await press('KeyC');
    await steps(() => !g.ghost.cleaned);
    out.runs.push(g.drips.runs.length);
    // From the start, with the stroke on its way: nothing of this run is left.
    await press('KeyR');
    await steps(() => g.ghost.position && g.ghost.position.x < x0 + 0.2);
    await steps(() => g.ghost.position.x > x0 + 0.25);
    out.restarted = hash() === begun;
    await press('KeyN');
    await g.ghost.settled;
    out.mine = g.level.runtimeOf(g.session.player) !== undefined;
    await window.ghostKit.leave();
    g.player.position.copy(start);
    return out;
  });
  const ok = r.none && !r.freeRecords && r.recording && r.stopped && r.first && r.noTab && r.rows && r.sheet && r.status && r.ladders === 1 && r.held === 0 && Math.abs(r.twice - 2) < 0.35 && r.clean.ghost === null && r.clean.wall && r.clean.ladders === 0 && r.wentOn.moved < 0.2 && r.wentOn.wall && r.finished && r.runs.join() === '1,1' && r.restarted && r.mine;
  return ok ? null : JSON.stringify(r);
});

await check('ghost: your wall and stepladder come back whatever the keys did: after a view change, the clean wall then R, the clean wall with nothing playing, and leaving capture mode; two paints never mix; what you paint after is safe; a new take starts from your wall', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const k = window.ghostKit;
    const out = {};
    await k.enter();
    const start = g.player.position.clone();
    const begun = k.stamp(1, [0, 0, 1]);
    await k.take();
    let mine = k.stamp(2, [0, 1, 0]);
    g.level.setRuntime(g.session.player, { type: 'stepladder', pos: [start.x + 3, start.y, start.z + 3], rot: 0 });
    const own = () => g.level.runtimeOf(g.session.player) !== undefined;
    const back = async () => {
      await g.ghost.settled;
      return k.hash() === mine && own() && !g.ghost.playing && !g.ghost.cleaned;
    };
    await k.play();
    out.taken = !own();
    await k.press('KeyR');
    await k.until(() => g.ghost.position);
    await k.press('KeyV');
    out.view = await back();
    await k.press('KeyV');
    await k.press('KeyV');
    await k.play();
    await k.press('KeyC');
    await k.until(() => k.hash() === begun);
    await k.press('KeyR');
    await k.until(() => g.ghost.position);
    await k.press('KeyN');
    out.cleanThenR = await back();
    await k.into();
    await k.press('KeyC');
    await k.until(() => k.hash() === begun);
    out.cleaned = g.ghost.cleaned && !own();
    await k.press('KeyC');
    await k.until(() => !g.ghost.cleaned);
    out.idle = await back();
    // A paint on its way in, and another asked for.
    await k.play();
    await k.press('KeyC');
    await k.until(() => k.hash() === begun);
    g.ghost.clean();
    await new Promise((done) => setTimeout(done));
    g.ghost.play();
    await g.ghost.settled;
    out.mixed = k.hash() !== begun;
    await k.press('KeyN');
    out.left = await back();
    mine = k.stamp(3, [1, 1, 0]);
    await window.frames(150);
    out.after = k.hash() === mine;
    await k.into();
    await k.play();
    await k.press('KeyV');
    await k.press('KeyT');
    await k.until(() => g.ghost.recording);
    out.takeFrom = k.hash() === mine;
    await window.frames(40);
    await k.press('KeyT');
    await k.until(() => !g.ghost.recording);
    await k.press('KeyC');
    await k.until(() => g.ghost.cleaned && k.hash() === mine);
    out.cleanTake = k.hash() === mine;
    await k.leave();
    g.player.position.copy(start);
    return out;
  });
  const ok = r.taken && r.view && r.cleanThenR && r.cleaned && r.idle && !r.mixed && r.left && r.after && r.takeFrom && r.cleanTake;
  return ok ? null : JSON.stringify(r);
});

await check('ghost: a new take keeps the last one until it stops; a slip of the key keeps it for good, and the plate says what goes', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const k = window.ghostKit;
    const out = {};
    await k.enter();
    const start = g.player.position.clone();
    await k.take(1);
    const first = g.ghost.length;
    await k.press('KeyV');
    await k.until(() => /in place of 0:01/.test(k.plate()));
    await k.press('KeyT');
    await k.until(() => g.ghost.recording);
    out.during = g.ghost.length === first && g.ghost.recorded;
    await k.press('KeyT');
    await k.until(() => !g.ghost.recording);
    out.slip = g.ghost.length === first;
    await k.take(2);
    out.second = g.ghost.length > first + 0.5;
    await k.leave();
    g.player.position.copy(start);
    return out;
  });
  return r.during && r.slip && r.second ? null : JSON.stringify(r);
});

await check('ghost: from capture mode it holds its last frame and says so, R or Space plays again; from F3 it goes round', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const k = window.ghostKit;
    const out = {};
    await k.enter();
    const start = g.player.position.clone();
    await k.take(1);
    await k.play();
    await k.until(() => g.ghost.ended);
    out.plate = /AVATAR done 0:01/.test(k.plate()) && /R again/.test(k.plate());
    const at = g.ghost.position.x;
    await window.frames(240);
    out.held = g.ghost.position.x === at && g.ghost.ended;
    await k.press('KeyR');
    await k.until(() => g.ghost.position && !g.ghost.ended);
    out.again = g.ghost.playing;
    await k.until(() => g.ghost.ended);
    await k.press('Space');
    await k.until(() => g.ghost.position);
    out.space = !g.ghost.ended && !g.ghost.paused;
    await k.press('KeyN');
    await g.ghost.settled;
    g.hooks.ghostPlay();
    await window.frames(240);
    out.round = g.ghost.playing && !g.ghost.ended;
    await k.leave();
    g.player.position.copy(start);
    return out;
  });
  return r.plate && r.held && r.again && r.space && r.round ? null : JSON.stringify(r);
});

await check('ghost: paint runs go at its speed and hold still with it', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const k = window.ghostKit;
    const out = {};
    await k.enter();
    const start = g.player.position.clone();
    await k.take(3);
    await k.play();
    const s = g.paint.surfaces[0];
    g.paintOps.apply({ kind: 'drip', key: s.key, rect: 0, u: 0.5, v: 0.9, length: 1, speed: 0.01, rgb: [1, 0, 0] });
    const run = g.drips.runs.at(-1);
    const fall = async () => {
      const y = run.y;
      await window.frames(10);
      return y - run.y;
    };
    const one = await fall();
    await k.press('Digit2');
    out.twice = (await fall()) / one;
    await k.press('Digit1');
    await k.press('Space');
    const y = run.y;
    await window.frames(10);
    out.still = run.y === y;
    await k.press('Space');
    out.moving = (await fall()) > 0;
    await k.leave();
    g.player.position.copy(start);
    return out;
  });
  return Math.abs(r.twice - 2) < 0.2 && r.still && r.moving ? null : JSON.stringify(r);
});

await check("ghost: in a session its keys do nothing, the wall is left alone and the plate doesn't offer it", async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const k = window.ghostKit;
    const out = {};
    await k.enter();
    const start = g.player.position.clone();
    await k.take(1);
    const wall = k.stamp(1, [0, 0, 1]);
    g.session.multiplayer = true;
    await k.press('Space');
    await k.press('KeyR');
    await k.press('KeyC');
    await g.ghost.settled;
    out.wall = k.hash() === wall;
    out.idle = !g.ghost.playing && !g.ghost.cleaned;
    out.plate = !/AVATAR/.test(k.plate());
    await k.press('KeyV');
    await k.press('KeyT');
    await window.frames(2);
    out.records = g.ghost.recording;
    g.session.multiplayer = false;
    await k.leave();
    g.player.position.copy(start);
    return out;
  });
  return r.wall && r.idle && r.plate && !r.records ? null : JSON.stringify(r);
});
