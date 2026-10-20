// Multiplayer: LEAVE SESSION clears the session's paint and brings back the paint the player had before it, then shows the title view. Reads `w`, the players and what they share.
import assert from 'node:assert/strict';
import { status, paintHash, paintReaches } from './harness.mjs';

/** Paint pages a player has: surfaces with paint, however little. */
const pages = (page) => page.evaluate(() => [...window.game.paint.surfaces].filter((s) => s.data).length);
const stamp = (page, rect, v, color) =>
  page.evaluate(
    ([rect, v, color]) => {
      const g = window.game;
      const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
      for (let i = 0; i < 8; i++) g.paint.stamp(s, { rect, u: 0.2 + i * 0.05, v }, 0.1, 0.6, color);
    },
    [rect, v, color],
  );
/** The player pressed START once, so the title view is something LEAVE has to bring back. */
const started = (page) => page.evaluate(() => (window.game.hud.menu.started = true));
/** Out of the session with the own paint back (leave() answers once it is), and the menu on the title view. */
async function leaves(page) {
  await started(page);
  await page.evaluate(() => window.game.net.leave());
  assert.deepEqual(await page.evaluate(() => [window.game.hud.menu.started, window.game.hud.menu.cityView, window.game.session.multiplayer, window.game.session.joining]), [false, true, false, false], 'the title view with the city, out of the session');
}

export async function leave(w) {
  const { a, b, code } = w;
  const own = await b.evaluate(() => window.game.config.PAINT.texelsPerMeter);

  // 1. No paint of their own: B joins A's painted session and leaves with every surface clean, at its own PAINT DETAIL.
  await b.evaluate((c) => window.game.net.join('B', c), code);
  await status(b, 'in');
  assert.ok((await pages(b)) > 0, 'B has the session paint');
  assert.notEqual(await b.evaluate(() => window.game.config.PAINT.texelsPerMeter), own, 'the session is at another PAINT DETAIL');
  const session = await paintHash(a);
  await leaves(b);
  await status(b, 'off');
  assert.equal(await pages(b), 0, 'no paint pages after LEAVE, without paint of their own');
  assert.deepEqual(await b.evaluate(() => [window.game.config.PAINT.texelsPerMeter, window.game.paint.texelsPerMeter, window.game.settings.locked]), [own, own, null], 'back at B\'s own PAINT DETAIL, level built at it');
  assert.equal(await paintHash(a), session, 'the session keeps its paint when B leaves');

  // 2. Paint of their own: B paints alone, joins, paints in the session, leaves: the session's paint is gone, B's own is back.
  await stamp(b, 1, 0.3, [0.1, 0.2, 1]);
  const solo = await paintHash(b);
  assert.notEqual(solo, await paintHash(a));
  await b.evaluate((c) => window.game.net.join('B', c), code);
  await status(b, 'in');
  assert.equal(await paintHash(b), session, 'the session paint replaces B\'s own');
  await stamp(b, 0, 0.9, [0.1, 0.8, 0.2]);
  await paintReaches(a, await paintHash(b), 'A has what B painted in the session');
  await leaves(b);
  await status(b, 'off');
  assert.equal(await paintHash(b), solo, 'B\'s own paint is back, nothing of the session\'s on it');
  // Joined again, left again: the paint comes back each time.
  await b.evaluate((c) => window.game.net.join('B', c), code);
  await status(b, 'in');
  await leaves(b);
  await status(b, 'off');
  assert.equal(await paintHash(b), solo, 'B\'s own paint is back after a second session');
  await a.waitForFunction(() => window.game.net.names.size === 0, null, { timeout: 5000 });
}
