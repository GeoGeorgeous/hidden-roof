// Multiplayer: The server restarting, the server down or silent, and the network log. Reads and adds to `w`, the players and what they share.
import assert from 'node:assert/strict';
import net from 'node:net';
import { status, PORT, stopServer, restartServer, hostSession } from './harness.mjs';

export async function server(w) {
  const { a } = w;
  // The server restarts (a deploy): A's game reconnects, finds its session gone, and says the session has ended (restarted: the dialog says the server restarted).
  await a.evaluate(() => (window.game.hud.menu.started = true));
  restartServer();
  await a.waitForFunction(() => window.game.net.status.state === 'failed' && window.game.net.status.reason === 'restarted', null, { timeout: 15000 });
  assert.equal(await a.evaluate(() => window.game.session.multiplayer), false);
  // Lost mid-play, the session is a dialog: A stays in the game with the session's paint until it answers.
  assert.equal(await a.evaluate(() => window.game.notify.blocked), true);
  assert.equal(await a.evaluate(() => window.game.hud.menu.started), true);
  assert.equal(await a.evaluate(() => [...window.game.paint.surfaces].some((s) => s.data)), true);
  // Esc (leave without saving) brings back the player's own game: A had no paint of its own, so every surface is clean again, at its own PAINT DETAIL (ULTRA, not the session's); the menu stays where it was.
  await a.evaluate(() => window.game.notify.confirm(false));
  await a.waitForFunction(() => !window.game.session.joining && ![...window.game.paint.surfaces].some((s) => s.data), null, { timeout: 15000 });
  assert.equal(await a.evaluate(() => window.game.hud.menu.started), true);
  assert.equal(await a.evaluate(() => window.game.config.PAINT.texelsPerMeter), 96);
  // The MULTIPLAYER page keeps saying it (the menu's status line only for a few seconds).
  assert.match(await a.textContent('.mp-page .mp-status'), /The session has ended/);

  // No server: the game asks over HTTP why it can't connect, and says the server is down.
  stopServer();
  const failed = async () => {
    await a.waitForFunction(() => window.game.net.status.state === 'failed', null, { timeout: 15000 });
    return a.evaluate(() => window.game.net.status);
  };
  await hostSession(a, 'A', 48);
  const down = await failed();
  assert.equal(down.reason, 'server-down', JSON.stringify(down));
  assert.match(await a.textContent('.mp-page .mp-status'), /The game server is down \(HTTP 5\d\d · WS \d+\)/);
  // A server that takes the connection and never answers: the game gives up after NET.connectTimeout.
  const held = new Set();
  const silent = net.createServer((socket) => held.add(socket)).listen(PORT);
  await a.evaluate(() => (window.game.config.NET.connectTimeout = 1));
  await hostSession(a, 'A', 48);
  assert.equal((await failed()).reason, 'timeout');
  // Its connections too, or they'd keep this process running.
  for (const socket of held) socket.destroy();
  silent.close();
  // All of it is in the network log the menu copies.
  const log = await a.evaluate(() => window.game.net.log.text());
  for (const seen of ['connecting to ws://', 'in session', 'closed: ', 'asked the server over HTTP: server-down', 'nothing from the server in 1 s', 'status: failed timeout']) assert.ok(log.includes(seen), `the log has "${seen}"`);
}
