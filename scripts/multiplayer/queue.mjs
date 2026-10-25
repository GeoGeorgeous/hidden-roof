// Multiplayer: a full session's next player waits in line (screen 20), keeps the place through a dropped link, and gets in when a place frees; leaving the line. Reads `w`, the players and what they share.
import assert from 'node:assert/strict';
import { open, status, joinFromList } from './harness.mjs';

export async function queue(w) {
  const { b } = w;
  // B hosts a session for two; D fills it, E finds it full.
  const d = await open('low');
  const e = await open('low');
  await b.evaluate(() => window.game.net.host('B', window.game.config.PAINT.texelsPerMeter, { name: 'Line', limit: 2, tools: ['can', 'marker'] }));
  await status(b, 'in');
  const code = await b.evaluate(() => window.game.net.status.code);
  await joinFromList(d, 'D', code, 'private', 'Line');
  await status(d, 'in');
  await e.evaluate(() => {
    const n = window.game.net;
    const onStatus = n.onStatus;
    window.lost = [];
    n.onStatus = (s) => (s.lost && window.lost.push(s.lost.tries), onStatus(s));
  });
  await joinFromList(e, 'E', code, 'private', 'Line');
  await status(e, 'queued');

  // Screen 20: the place, who waits for what, and no way to play meanwhile.
  await e.waitForSelector('.queue-page:not([hidden])');
  const screen = () => e.evaluate(() => [document.querySelector('.queue-page .loading-title').textContent, document.querySelector('.queue-page .step').textContent, [...document.querySelectorAll('.queue-page .shell button:not([hidden])')].map((b) => b.textContent)]);
  assert.deepEqual(await screen(), ["you're #1 in line", "You're next", ['Leave queueESC']]);
  assert.match(await e.textContent('.queue-page .loading-lead'), /The roof is full/);
  assert.equal(await e.evaluate(() => window.game.session.joining), true);

  // Its link drops: the place is kept through the retry (the token), and the screen says so meanwhile.
  await e.evaluate(() => window.game.net.link.close());
  await e.waitForFunction(() => window.lost.length > 0, null, { timeout: 5000, polling: 20 });
  await e.waitForFunction(() => window.game.net.status.state === 'queued' && !window.game.net.status.lost, null, { timeout: 15000 });
  assert.equal((await screen())[0], "you're #1 in line", 'the place is the same after the link came back');
  assert.match(await e.evaluate(() => window.game.net.log.text()), /JOIN \w+ \(coming back\)/);

  // A place frees: E is welcomed, and the loading screen takes over until the game is in.
  await d.evaluate(() => window.game.net.leave());
  await status(d, 'off');
  await status(e, 'in');
  assert.deepEqual(await e.evaluate(() => [window.game.session.joining, window.game.net.players.length]), [false, 2]);
  assert.deepEqual(await e.evaluate(() => window.game.net.status), { state: 'in', code });

  // Leaving the line: D joins the full session again, queued, and leaves it; the session lets it go.
  await joinFromList(d, 'D', code, 'private', 'Line');
  await status(d, 'queued');
  await d.keyboard.press('Escape');
  await status(d, 'off');
  assert.equal(await d.evaluate(() => window.game.session.joining), false);
  assert.ok(await d.isVisible('.mp-page'), 'back on the list');
  // Nobody waits any more: a place freed now stays free.
  await e.evaluate(() => window.game.net.leave());
  await b.evaluate(() => window.game.net.leave());
  for (const p of [d, e]) assert.deepEqual(p.errors, []);
}
