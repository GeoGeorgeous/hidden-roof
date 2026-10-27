// Multiplayer: one game tab per browser (src/one-tab.ts). A second tab in the same browser runs no game and offers PLAY HERE; that takes the game over: the first tab leaves its session, reloads into the same screen, and the second plays.
import assert from 'node:assert/strict';
import { open, status, hostSession } from './harness.mjs';
import { gameReady } from '../test-browser.mjs';

export async function tab() {
  // P hosts a session; Q is a second tab of its browser.
  const p = await open('low');
  await hostSession(p, 'T');
  await status(p, 'in');
  const q = await p.context().newPage();
  const errors = [];
  q.on('pageerror', (e) => errors.push(e.message));
  await q.goto(p.url());
  await q.waitForSelector('.small.again button:not([disabled])', { timeout: 15000 });
  assert.equal(await q.evaluate(() => typeof window.game), 'undefined', 'the second tab loads no game');
  assert.equal(await p.evaluate(() => window.game.net.status.state), 'in', 'the first tab plays on');

  // PLAY HERE: P lets go (out of its session, its tab session forgotten) and shows the screen; Q plays.
  await q.click('.small.again button');
  await p.waitForSelector('.small.again button:not([disabled])', { timeout: 15000 });
  assert.equal(await p.evaluate(() => sessionStorage.getItem('roofhiddenhaus.session')), null, 'the first tab left its session for good');
  await gameReady(q);
  assert.equal(await q.evaluate(() => window.game.net.status.state), 'off', 'the second tab plays on its own, not in the first one\'s session');
  assert.deepEqual([...p.errors, ...errors], []);
  await q.close();
  await p.close();
}
