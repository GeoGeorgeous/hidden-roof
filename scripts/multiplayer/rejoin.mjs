// Multiplayer: what a game says of itself as it comes in. One hidden as it joins is shown from its first state; what it did with its link down reaches the others: its stepladder placed or taken, and more paint than a message holds; a seat lost takes its stepladder along.
import assert from 'node:assert/strict';
import { hostSession, open, paintHash, paintReaches, status } from './harness.mjs';

/** `page`'s link closes, and none opens until `mend`. */
const cut = (page) =>
  page.evaluate(() => {
    const WS = window.WebSocket;
    window.realSocket = WS;
    window.WebSocket = function () {
      return new WS('ws://127.0.0.1:9/');
    };
    window.game.net.link.socket.close();
  });
const mend = async (page) => {
  await page.evaluate(() => ((window.WebSocket = window.realSocket), window.game.net.retryNow()));
  await status(page, 'reconnecting');
  await status(page, 'in');
};
const place = (page, x) => page.evaluate((x) => window.game.level.setRuntime(window.game.session.player, x === null ? null : { type: 'stepladder', pos: [x, 0, 0], rot: 0 }) && undefined, x);

export async function rejoin() {
  const p = await open('low');
  await hostSession(p, 'P');
  await status(p, 'in');
  const code = await p.evaluate(() => window.game.net.status.code);
  const q = await open('low');

  // Q is hidden before it is in, so it draws no frame: P sees it where it stands all the same, away.
  await q.evaluate(() => window.hide());
  await q.evaluate((c) => window.game.net.join('Q', c), code);
  await status(q, 'in');
  await p.waitForFunction(() => [...window.game.net.remotes.players.values()][0]?.avatar.group.visible, null, { timeout: 5000 });
  await p.waitForFunction(() => document.querySelector('.nameplate .note')?.dataset.note === 'away', null, { timeout: 5000 });
  await q.evaluate(() => window.show());

  // Placed with its link down: the others get it once it's back.
  const owner = await q.evaluate(() => window.game.session.player);
  const seen = (x) => p.waitForFunction(([o, x]) => { const g = window.game; const id = g.level.runtimeOf(o); return x === null ? id === undefined : g.level.props.get(id)?.pos[0] === x; }, [owner, x], { timeout: 5000 });
  await cut(q);
  await place(q, 3);
  await mend(q);
  await seen(3);
  // Moved, and taken away: it doesn't come back from the server's word for it.
  await cut(q);
  await place(q, 5);
  await mend(q);
  await seen(5);
  // Moved, and hidden by the time it's back: no frame tells them, the welcome does.
  await cut(q);
  await place(q, 6);
  await q.evaluate(() => window.hide());
  await mend(q);
  await seen(6);
  await q.evaluate(() => window.show());
  await cut(q);
  await place(q, null);
  await mend(q);
  await seen(null);
  assert.equal(await q.evaluate((o) => window.game.level.runtimeOf(o), owner), undefined, 'taken away, it stays away');

  // More paint made with the link down than one message may hold: back once, and it all arrives.
  await cut(q);
  await q.evaluate(() => {
    const g = window.game;
    const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
    for (let i = 0; i < 60000; i++) g.paint.stamp(s, { rect: 0, u: 0.2 + (i % 50) * 0.01, v: 0.5 }, 0.05, 0.6, [1, 0, 0]);
  });
  await mend(q);
  await paintReaches(p, await paintHash(q), 'P has what Q painted with its link down', 30000);
  // Each time back is one welcome, however many tries failed with the link cut: more would be the server closing the link on what it was sent.
  assert.equal((await q.evaluate(() => window.game.net.log.text())).match(/welcome:/g).length, 6, 'in, and back once each time');

  // Back as another player (as after a restart): the seat's stepladder went with it.
  await q.evaluate(() => {
    const g = window.game;
    g.net.joined.you = 99;
    g.session.player = 'player99';
    g.level.setRuntime('player99', { type: 'stepladder', pos: [7, 0, 0], rot: 0 });
  });
  await cut(q);
  await mend(q);
  assert.equal(await q.evaluate(() => window.game.level.runtimeOf('player99')), undefined, 'no stepladder of a seat gone');

  assert.deepEqual([...p.errors, ...q.errors], []);
  await q.close();
  await p.close();
}
