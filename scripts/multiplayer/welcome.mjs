// Multiplayer: PLAY held until the welcome has loaded, a third player starting the level over, a message the game can't handle. Reads and adds to `w`, the players and what they share.
import assert from 'node:assert/strict';
import { open, status, paintHash, press } from './harness.mjs';

export async function welcome(w) {
  const { a, b, code } = w;
  // BL-105: from JOIN (or HOST) until the session's paint has loaded the player can't resume: PLAY is a disabled note of
  // the progress, and neither it, Enter, Esc nor a click on the game starts play (the paint made meanwhile would be
  // lost to the welcome's). LEAVE, Back on the MULTIPLAYER page and a failed join give PLAY back. B joins four times
  // with its welcome held until the test lets it go: the welcome that takes a while to download and load.
  await b.evaluate(() => {
    window.resumes = 0;
    window.game.input.requestLock = () => window.resumes++;
  });
  const holdWelcome = () =>
    b.evaluate(() => {
      const n = window.game.net;
      const welcome = n.welcome.bind(n);
      const held = new Promise((r) => (window.releaseWelcome = r));
      window.welcomeHeld = false;
      n.welcome = async (...args) => ((n.welcome = welcome), (window.welcomeHeld = true), await held, welcome(...args));
    });
  const welcomeHeld = () => b.waitForFunction(() => window.welcomeHeld, null, { timeout: 15000 });
  /** What PLAY and the button beside it say, and how many times the page tried to resume play (PLAY, Enter, Esc, a click on the game). */
  const menuNow = () =>
    b.evaluate(() => {
      const play = document.querySelector('.overlay .start .play');
      const before = window.resumes;
      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
      play.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      for (const code of ['Enter', 'Escape']) (key('keydown', code), key('keyup', code));
      window.game.renderer.domElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      return { play: [play.disabled, play.firstChild.textContent], other: document.querySelector('.overlay .start button:not(.play)').textContent, resumed: window.resumes - before };
    });
  const aloneAgain = () => a.waitForFunction(() => window.game.net.names.size === 0, null, { timeout: 5000 });
  // 1. LEAVE cancels the join.
  await holdWelcome();
  await b.evaluate((c) => window.game.net.join('B', c), code);
  await welcomeHeld();
  // The network's progress, as it has it: the welcome's paint coming down.
  const joining = await menuNow();
  assert.match(joining.play[1], /^(Joining…|Loading \d+%)$/);
  assert.deepEqual({ ...joining, play: [joining.play[0]] }, { play: [true], other: 'Leave session', resumed: 0 }, 'joining: PLAY is disabled and nothing resumes');
  await press(b, 'LEAVE SESSION');
  await status(b, 'off');
  assert.deepEqual(await menuNow(), { play: [false, 'Play'], other: 'Multiplayer', resumed: 4 }, 'LEAVE cancels the join: PLAY is back');
  await b.evaluate(() => window.releaseWelcome());
  await aloneAgain();
  // 2. The welcome has loaded: in the session, PLAY is back as BACK TO SESSION.
  await holdWelcome();
  await b.evaluate((c) => window.game.net.join('B', c), code);
  await welcomeHeld();
  assert.deepEqual((await menuNow()).resumed, 0, 'joining: nothing resumes, again');
  await b.evaluate(() => window.releaseWelcome());
  await status(b, 'in');
  assert.deepEqual(await menuNow(), { play: [false, 'Back to session'], other: 'Leave session', resumed: 4 }, 'in the session, PLAY is back');
  assert.equal(await paintHash(b), await paintHash(a), 'B has the session paint before it can play');
  await b.evaluate(() => window.game.net.leave());
  await aloneAgain();
  // 3. A join that fails gives PLAY back.
  await b.evaluate(() => window.game.net.join('B', 'QQQQQ'));
  await status(b, 'failed');
  assert.deepEqual(await menuNow(), { play: [false, 'Play'], other: 'Multiplayer', resumed: 4 }, 'a failed join: PLAY is back');
  // 4. Back on the MULTIPLAYER page cancels the join.
  await holdWelcome();
  await press(b, 'MULTIPLAYER');
  await press(b, 'JOIN A SESSION');
  await b.fill('.mp-page input >> nth=0', 'B');
  await b.fill('.mp-page input >> nth=1', code.toLowerCase());
  await press(b, 'Join');
  await welcomeHeld();
  assert.equal(await b.evaluate(() => window.game.session.joining), true);
  await b.click('.overlay .back button');
  await status(b, 'off');
  // On to the pause screen.
  await b.click('.overlay .back button');
  assert.deepEqual(await menuNow(), { play: [false, 'Play'], other: 'Multiplayer', resumed: 4 }, 'Back cancels the join: PLAY is back');
  await b.evaluate(() => window.releaseWelcome());
  await aloneAgain();

  // C plays the same level at the session's PAINT DETAIL: its welcome starts that level over rather than building it
  // again (seconds with its lights and shaders, BL-085). What it placed and found alone is gone, it stands at the
  // spawn, and it has the session's paint.
  const c = await open('medium');
  await c.evaluate(() => {
    const g = window.game;
    g.level.setRuntime(g.session.player, { type: 'stepladder', pos: [2, 0, 2], rot: 0 });
    g.inventory.give('marker');
    g.player.position.set(5, 3, 5);
    window.kept = g.level.builtProps[0];
  });
  await c.evaluate((code) => window.game.net.join('C', code), code);
  await status(c, 'in');
  const restarted = await c.evaluate(() => {
    const g = window.game;
    const [x, y, z] = g.levelData().spawn.pos;
    return { kept: g.level.builtProps[0] === window.kept, ladder: g.level.runtimeOf('local') ?? null, marker: g.inventory.has('marker'), fromSpawn: Math.round(Math.hypot(g.player.position.x - x, g.player.position.z - z)) };
  });
  assert.deepEqual(restarted, { kept: true, ladder: null, marker: false, fromSpawn: 0 });
  assert.equal(await paintHash(c), await paintHash(a), 'C has the session paint');

  // A message C's game can't handle ends its session as broken, with the error in the log; not "a new version is out".
  await c.evaluate(() => (window.game.net.remotes.get = () => null.state));
  await c.waitForFunction(() => window.game.net.status.state === 'failed', null, { timeout: 5000 });
  assert.equal(await c.evaluate(() => window.game.net.status.reason), 'broken');
  assert.match(await c.evaluate(() => window.game.hud.menu.message), /The game hit an error in the session/);
  assert.match(await c.evaluate(() => window.game.net.log.text()), /couldn't handle state: TypeError/);
  await a.waitForFunction(() => window.game.net.names.size === 0, null, { timeout: 5000 });
  Object.assign(w, { c });
}
