// Multiplayer: an admin through CCTV's Join as admin (server/admins.ts, src/admin): the link read from the address and
// wiped from it, unseen by the players and in no player line, seen (H) as Admin with a red plate, a lock that keeps a
// player's paint off a face (their toast says so), and LEAVE ending admin mode. Reads `w`, the players and their session.
import assert from 'node:assert/strict';
import { ADMIN_KEY, ADMIN_PORT, open, paintHash, status } from './harness.mjs';

const locks = (page) => page.evaluate(() => window.game.paint.locks.list().length);
const toasted = (page, text) => page.waitForFunction((t) => window.game.notify.shown().some((n) => n.lines[0] === t), text, { timeout: 10000 });

export async function admin(w) {
  const { a, b, code } = w;
  const res = await fetch(`http://localhost:${ADMIN_PORT}/sessions/${code}/admin-pass`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  const { pass } = await res.json();
  const z = await open('low', `#join=${code}&admin=${pass}`);
  await status(z, 'in');
  await z.waitForFunction(() => window.game.net.admin && document.querySelector('.admin-panel'));
  assert.deepEqual(await z.evaluate(() => [location.hash, window.game.inventory.tool, window.game.player.fly, window.game.inventory.colors.length > 1]), ['', null, true, true], 'the pass gone from the address; unseen with no tool in hand, flying, every color');
  assert.deepEqual(await z.evaluate(() => window.game.net.players.map((p) => p.name).sort()), ['A', 'B'], 'the admin in no player line');
  await z.waitForTimeout(500);
  assert.deepEqual(await a.evaluate(() => [...window.game.net.names.values()]), ['B'], 'unseen by the players');

  // Seen: a player named Admin, its plate red; in no player line still.
  await z.evaluate(() => window.game.input.setLocked(true));
  await z.keyboard.press('h');
  await a.waitForFunction(() => [...window.game.net.names.values()].includes('Admin'));
  await a.waitForFunction(() => document.querySelector('.nameplate.admin .name')?.textContent === 'Admin', null, { timeout: 15000 });
  assert.deepEqual(await a.evaluate(() => window.game.net.players.map((p) => p.name).sort()), ['A', 'B']);
  assert.equal(await z.evaluate(() => window.game.inventory.tool), 'can', 'seen, the can in hand');

  // A lock: every game has it, and A's stamps on the face paint nothing, with the toast.
  await z.evaluate(() => {
    const g = window.game;
    const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
    g.net.admin.send({ type: 'lock', surface: g.net.admin.surfaces.indexOf(s.key), rect: 0, on: true });
  });
  await a.waitForFunction(() => window.game.paint.locks.list().length === 1);
  await b.waitForFunction(() => window.game.paint.locks.list().length === 1);
  const before = await paintHash(a);
  await a.evaluate(() => {
    const g = window.game;
    const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
    for (let i = 0; i < 8; i++) g.paint.stamp(s, { rect: 0, u: 0.2 + i * 0.05, v: 0.3 }, 0.1, 0.6, [0.1, 0.9, 0.2]);
  });
  assert.equal(await paintHash(a), before, 'a locked face takes no paint');
  await toasted(a, "I won't spoil this masterpiece");
  await z.evaluate(() => {
    const g = window.game;
    const s = g.paint.surfaces.find((s) => s.geo.rects.length > 1);
    g.net.admin.send({ type: 'lock', surface: g.net.admin.surfaces.indexOf(s.key), rect: 0, on: false });
  });
  await a.waitForFunction(() => window.game.paint.locks.list().length === 0);

  // LEAVE ends admin mode: the panel and the locks go, the players see Admin leave.
  await z.evaluate(() => window.game.net.leave());
  await status(z, 'off');
  await toasted(z, 'Admin mode ended: join again from CCTV');
  assert.deepEqual(await z.evaluate(() => [window.game.net.admin, !!document.querySelector('.admin-panel'), window.game.player.fly]), [null, false, false]);
  assert.equal(await locks(z), 0);
  await a.waitForFunction(() => ![...window.game.net.names.values()].includes('Admin'));
  assert.deepEqual(z.errors, []);
  await z.context().close();
}
