// Multiplayer: one game tab per browser (src/one-tab.ts). A second tab in the same browser runs no game and says the game is open in another tab; the first plays on.
import assert from 'node:assert/strict';
import { open, status, hostSession } from './harness.mjs';

export async function tab() {
  // P hosts a session; Q is a second tab of its browser.
  const p = await open('low');
  await hostSession(p, 'T');
  await status(p, 'in');
  const q = await p.context().newPage();
  const errors = [];
  q.on('pageerror', (e) => errors.push(e.message));
  await q.goto(p.url());
  await q.waitForSelector('.small.again', { timeout: 15000 });
  assert.equal(await q.evaluate(() => typeof window.game), 'undefined', 'the second tab loads no game');
  assert.equal(await p.evaluate(() => window.game.net.status.state), 'in', 'the first tab plays on');
  assert.deepEqual([...p.errors, ...errors], []);
  await q.close();
  await p.close();
}
