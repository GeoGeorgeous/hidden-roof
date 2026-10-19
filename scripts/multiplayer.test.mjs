// Multiplayer in two browser pages (two players, as a normal and an incognito
// window would be) against a local server (dist-server/server/main.js): HOST and
// JOIN through the pause menu's MULTIPLAYER page, both at the host's PAINT
// DETAIL, paint and the stepladder reaching the other player, a reload coming
// back into the session, paint while hidden, one that heard nothing for a while reconnecting, LEAVE
// SESSION, one already playing the session's level starting it over, a message it can't handle ending its session as
// broken, and a server restart ending the session. One scenario, in scripts/multiplayer/, one phase per module.
// Usage: npm run test:mp (builds the server first)
import assert from 'node:assert/strict';
import { stop } from './multiplayer/harness.mjs';
import { join } from './multiplayer/join.mjs';
import { link } from './multiplayer/link.mjs';
import { paint } from './multiplayer/paint.mjs';
import { server } from './multiplayer/server.mjs';
import { welcome } from './multiplayer/welcome.mjs';

try {
  const w = {};
  for (const phase of [join, paint, link, welcome, server]) await phase(w);
  for (const p of [w.a, w.b, w.c]) assert.deepEqual(p.errors, []);
  console.log('multiplayer: ok');
} finally {
  await stop();
}
