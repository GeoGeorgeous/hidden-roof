// Multiplayer: HOST and JOIN from the menu, the host's PAINT DETAIL, SAVE of the session's paint. Reads and adds to `w`, the players and what they share.
import assert from 'node:assert/strict';
import { open, status, press } from './harness.mjs';

export async function join(w) {
  const a = await open('ultra');
  const b = await open('low');
  // A hosts at MEDIUM (its own is ULTRA), B joins with the code shown in A's menu.
  await press(a, 'MULTIPLAYER');
  await press(a, 'HOST A SESSION');
  await a.fill('.mp-page input >> nth=0', 'A');
  for (let i = 0; i < 2; i++) await a.click('.mp-page .choice button:text-is("‹") >> nth=0');
  // A was recording a ghost (F3, dev builds): the session stops it, and its frames go on (it used to put paint.log
  // back to null after the welcome, so every frame threw).
  await a.evaluate(() => window.game.ghost.record());
  await press(a, 'Host');
  await status(a, 'in');
  await a.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.deepEqual(a.errors, [], 'a ghost recording before HOST breaks no frame');
  const code = (await a.textContent('.overlay .status')).match(/Session · ([A-Z]+)/)[1];
  assert.equal(code, await a.evaluate(() => window.game.net.status.code));
  await press(b, 'MULTIPLAYER');
  await press(b, 'JOIN A SESSION');
  await b.fill('.mp-page input >> nth=0', 'B');
  await b.fill('.mp-page input >> nth=1', code.toLowerCase());
  await press(b, 'Join');
  await status(b, 'in');
  assert.ok(await b.isVisible('.overlay .start button:text-is("Leave session")'));
  assert.ok(!(await b.isVisible('.overlay .item:text-is("Upload")')));
  // Both play at the host's PAINT DETAIL, whatever their own; B's settings show it as the host's, its arrows doing nothing.
  assert.deepEqual(await Promise.all([a, b].map((p) => p.evaluate(() => window.game.config.PAINT.texelsPerMeter))), [48, 48]);
  const detail = await b.evaluate(() => {
    window.game.hud.menu.openSettings('Graphics');
    const row = [...document.querySelectorAll('.settings-page .setting-row')].find((r) => r.querySelector('.label').textContent.startsWith('Paint detail'));
    row.querySelector('.choice button').click();
    const shown = [row.querySelector('.choice .value').textContent, row.querySelector('.choice').classList.contains('locked')];
    window.game.hud.menu.openPage(null);
    return shown;
  });
  assert.deepEqual(detail, ['Medium  2.1 cm  (host)', true]);
  // SAVE in a session: the popup downloads the session's paint, packed by the server.
  const got = b.waitForEvent('download');
  await b.click('.overlay .item:text-is("Save")');
  assert.equal(await b.textContent('.popup-page:not([hidden]) .chip span'), 'from the session');
  await b.click('.popup-page:not([hidden]) .btn.primary');
  assert.match((await got).suggestedFilename(), /^demo-\d{8}-\d{6}\.rhhpaint$/);
  await b.waitForSelector('.popup-page:not([hidden]) .para.done');
  await b.evaluate(() => window.game.hud.menu.openPage(null));
  assert.deepEqual(await b.evaluate(() => [...window.game.net.names.values()]), ['A']);
  await a.waitForFunction(() => window.game.net.names.size === 1);
  // The HUD's network lines: a ping, and how far behind B is shown.
  await a.waitForFunction(() => window.game.net.stats?.ping !== null && window.game.net.stats.players[0]?.delay > 0, null, { timeout: 10000 });
  Object.assign(w, { a, b, code });
}
