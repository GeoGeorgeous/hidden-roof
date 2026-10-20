// Multiplayer: Paint and the stepladder reaching the other player, paint while hidden, a reload back into the session. Reads and adds to `w`, the players and what they share.
import assert from 'node:assert/strict';
import { gameReady } from '../test-browser.mjs';
import { status, paintHash, paintReaches, watchStatus } from './harness.mjs';

export async function paint(w) {
  const { a, b } = w;
  // A paints and places its stepladder: B gets the very same paint, and the ladder.
  await a.evaluate(() => {
    const g = window.game;
    const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
    for (let i = 0; i < 20; i++) g.paint.stamp(s, { rect: 0, u: 0.2 + i * 0.03, v: 0.5 }, 0.15, 0.6, [1, 0.2, 0.1]);
    g.level.setRuntime(g.session.player, { type: 'stepladder', pos: [0, 0, 0], rot: 1 });
  });
  let painted = await paintHash(a);
  await b.waitForFunction(() => window.game.paint.surfaces.some((s) => s.data) && window.game.level.runtimeOf('player1') !== undefined, null, { timeout: 15000 });
  await b.waitForTimeout(500);
  assert.equal(await paintHash(b), painted, 'B paints what A painted');

  // B's game is hidden: what A paints meanwhile is painted at once, not queued until B is shown again (all of a long
  // absence, landing in one frame).
  await b.evaluate(() => window.hide());
  const hidden = await paintHash(b);
  await a.evaluate(() => {
    const g = window.game;
    const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
    for (let i = 0; i < 10; i++) g.paint.stamp(s, { rect: 1, u: 0.2 + i * 0.05, v: 0.5 }, 0.1, 0.3, [0.1, 0.2, 1]);
  });
  // Polled from here: a hidden page runs no frames. Not its dirty rects: the frame it asked for before hide() still runs
  // and uploads them, so paint that lands before it leaves none.
  for (const until = Date.now() + 5000; Date.now() < until && (await paintHash(b)) === hidden; ) await b.waitForTimeout(100);
  assert.notEqual(await paintHash(b), hidden, 'B paints what A paints while B is hidden');
  assert.equal(await b.evaluate(() => [...window.game.net.remotes.players.values()][0].timeline.waiting), 0, 'nothing waits for B to be shown');
  await b.evaluate(() => window.show());
  await b.waitForTimeout(500);
  painted = await paintHash(a);
  assert.equal(await paintHash(b), painted, 'B, shown again, has the paint A has');

  // B paints, so the server has batches from it; after the reload its batches go on from there (a new page numbering
  // from 1 again had every stroke dropped by the server as one it already had).
  const stampB = (page, v) =>
    page.evaluate((v) => {
      const g = window.game;
      const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
      for (let i = 0; i < 5; i++) g.paint.stamp(s, { rect: 0, u: 0.3 + i * 0.05, v }, 0.1, 0.6, [0.1, 0.8, 0.2]);
    }, v);
  await stampB(b, 0.2);
  painted = await paintHash(b);
  await paintReaches(a, painted, 'A has what B painted');

  // B finds the marker and reloads: it comes back into the session as the same player, with the paint and the marker.
  await b.evaluate(() => window.game.inventory.give('marker'));
  // The game sends what it carries on its next frame: wait for that, not a fixed time (SwiftShader draws ~6 frames a second here).
  await b.waitForFunction(() => window.game.net.sender.carried === window.game.inventory.version, null, { timeout: 5000, polling: 50 });
  await b.reload();
  await gameReady(b);
  await watchStatus(b);
  await status(b, 'in');
  assert.equal(await b.evaluate(() => window.game.session.player), 'player2');
  assert.equal(await paintHash(b), painted, 'the paint comes back after a reload');
  assert.ok(await b.evaluate(() => window.game.inventory.has('marker')), 'what B carried comes back after a reload');
  await stampB(b, 0.8);
  painted = await paintHash(b);
  await paintReaches(a, painted, 'A has what B painted after its reload');
  // A saw B go and come back.
  await a.waitForFunction(() => /#2 "B" dropped[^]*#2 "B" here/.test(window.game.net.log.text()), null, { timeout: 5000 });
  Object.assign(w, { painted });
}
