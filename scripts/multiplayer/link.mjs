// Multiplayer: A link that goes quiet and reconnects, LEAVE, and a welcome that takes a while or finds the player gone. Reads and adds to `w`, the players and what they share.
import assert from 'node:assert/strict';
import { status, paintHash, press, stamp } from './harness.mjs';

export async function link(w) {
  const { a, b, code, painted } = w;
  // B hears nothing for a while (a big download ahead of everything else used to do that): it closes the link and
  // comes back in, though the last thing it heard is now long ago. Its link drops what comes in, or A's next snapshot
  // would count as heard before B's next frame looked.
  // One of B's frames throws first: the game goes on (it used to stop for good, its check for silence with it).
  await b.evaluate(() => {
    const hud = window.game.hud;
    const setPerf = hud.setPerf;
    hud.setPerf = () => {
      hud.setPerf = setPerf;
      window.threw = true;
      throw new Error('test: one frame throws on purpose');
    };
  });
  await b.waitForFunction(() => window.threw, null, { timeout: 5000, polling: 50 });
  assert.match(b.errors.pop() ?? '', /on purpose/);
  // SAVE as it starts to reconnect is refused at once: the request can't go, and a reconnect wouldn't answer it (it used
  // to wait forever). Asked by the page the moment it reports "reconnecting", which may last only a second.
  await b.evaluate(() => {
    const n = window.game.net;
    const onStatus = n.onStatus;
    n.onStatus = (s) => {
      onStatus(s);
      if (s.state !== 'reconnecting' || window.saving) return;
      window.reconnecting = [!!window.game.session.joining, document.querySelector('.overlay .start .play').disabled];
      window.saving = Promise.race([n.savePaint().then(() => 'saved', (e) => e.message), new Promise((r) => setTimeout(() => r('no answer'), 8000))]);
    };
    n.link.socket.onmessage = null;
    n.link.lastHeard = -1e9;
  });
  await status(b, 'reconnecting');
  await status(b, 'in');
  const saving = await b.evaluate(() => window.saving);
  assert.deepEqual(await b.evaluate(() => window.reconnecting), [false, false], 'a reconnect mid-play does not block PLAY');
  assert.match(saving, /^Reconnecting/, 'SAVE while reconnecting');
  assert.equal(await paintHash(b), painted, 'the paint comes back after a reconnect');

  // BL-088: B comes back on link 1, which drops while its welcome loads (4 s); the retry's link 2 hears nothing. Link 1's
  // late welcome must not mark link 2 live: link 2 still gives up after NET.connectTimeout (3 s here), not serverSilence.
  await b.evaluate(() => {
    const n = window.game.net;
    const welcome = n.welcome.bind(n);
    n.welcome = async (...args) => {
      n.welcome = welcome;
      n.link.close();
      window.mute = true;
      await new Promise((r) => setTimeout(r, 4000));
      return welcome(...args);
    };
    // A link opened while muted hears nothing from the server.
    const WS = window.WebSocket;
    window.WebSocket = class extends WS {
      set onmessage(f) {
        super.onmessage = window.mute ? null : f;
      }
      get onmessage() {
        return super.onmessage;
      }
    };
    window.game.config.NET.connectTimeout = 3;
    n.link.close();
  });
  await b.waitForFunction(() => window.game.net.log.text().includes('nothing from the server in 3 s'), null, { timeout: 9000 }).catch(async () => assert.fail(`link 2 never gave up:\n${await b.evaluate(() => window.game.net.log.text())}`));
  await b.evaluate(() => ((window.mute = false), (window.game.config.NET.connectTimeout = 15)));
  await status(b, 'in');

  // LEAVE: A hears B has gone, B plays alone at its own detail again.
  await press(b, 'LEAVE SESSION');
  await a.waitForFunction(() => window.game.net.names.size === 0, null, { timeout: 5000 });
  assert.equal(await b.evaluate(() => window.game.session.multiplayer), false);

  // B joins again, and its welcome takes 5 s to load (a big save at ULTRA): A's snapshots wait behind it, and A is
  // still shown at once, with a black name tag over its head.
  await b.evaluate(() => {
    const n = window.game.net;
    const welcome = n.welcome.bind(n);
    n.welcome = async (...args) => ((n.welcome = welcome), await new Promise((r) => setTimeout(r, 5000)), welcome(...args));
  });
  await b.evaluate((c) => window.game.net.join('B', c), code);
  await status(b, 'in');
  await b.waitForFunction(() => [...window.game.net.remotes.players.values()][0]?.avatar.group.visible, null, { timeout: 2000 });
  assert.equal(await b.textContent('.nameplate'), 'A');
  await b.evaluate(() => window.game.net.leave());

  // B joins and presses LEAVE while the welcome's paint loads (its own paint kept, the session's level open, the paint
  // coming in), then again before the welcome is handled (it waits behind other messages): B stays out of the session,
  // not "in" with no link, its PAINT DETAIL is its own again (the welcome locks it to the session's: not "(host)"
  // alone), and the paint it had alone is back once leave() answers, with the title view when the session had taken
  // it away.
  for (const when of ['loading', 'before']) {
    await stamp(b, 1, 0.3, [0.1, 0.2, 1]);
    const solo = await paintHash(b);
    await b.evaluate(() => (window.game.hud.menu.started = true));
    await b.evaluate(
      ([c, when]) => {
        const n = window.game.net;
        const welcome = n.welcome.bind(n);
        window.welcomed = false;
        n.welcome = (...args) => {
          n.welcome = welcome;
          if (when === 'before') window.left = n.leave();
          const handled = welcome(...args);
          // The welcome has opened the session's level and waits for its paint (a timer runs only once the welcome waits).
          if (when === 'loading') {
            const t = setInterval(() => n.solo && (clearInterval(t), (window.kept = !!n.solo), (window.left = n.leave())), 0);
          }
          return handled.then(() => (window.welcomed = true));
        };
        n.join('B', c);
      },
      [code, when],
    );
    await b.waitForFunction(() => window.welcomed, null, { timeout: 15000 });
    await b.evaluate(() => window.left);
    const out = await b.evaluate(() => [window.game.net.status.state, window.game.session.multiplayer, window.game.settings.locked, window.game.session.joining]);
    assert.deepEqual(out, ['off', false, null, false], `LEAVE ${when} the welcome: out of the session, PAINT DETAIL unlocked`);
    assert.equal(await paintHash(b), solo, `LEAVE ${when} the welcome: B's own paint is back`);
    const title = await b.evaluate(() => [window.game.hud.menu.started, window.game.hud.menu.cityView]);
    assert.deepEqual(title, when === 'loading' ? [false, true] : [true, false], `LEAVE ${when} the welcome: the title view only if the session took the game`);
    await a.waitForFunction(() => window.game.net.names.size === 0, null, { timeout: 5000 });
  }
  // B has no paint of its own again, for what follows.
  await b.evaluate(() => (window.game.paint.clear(), window.game.drips.clear()));
}
