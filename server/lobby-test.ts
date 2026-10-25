import './headless';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { SERVER } from '../src/config';
import { SLOTS } from '../src/inventory/tool';
import { levelPaintFaces } from '../src/level/prop-pieces';
import { closeCode, HELLO, LOBBY_CODE, LOBBY_LIST, PROTOCOL, type Lobby, type ToServer } from '../src/net/protocol';
import { surfaceTable } from '../src/save/shape';
import { Game, join, start } from './test-kit';

// The server list and the limits per session (lobby-http.ts, lobby.ts), against the built server: the list over plain
// HTTP (public and private sessions, their order, codes only for public ones), a lookup by code and its limit per
// address, a hosted session turning the player over its limit away, the admin's private limit, a HOST with
// fields it can't take, and HOST refused unless PLAYER_HOST. npm run test:server runs it.

const level = JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8'));
const table = surfaceTable(levelPaintFaces(level, 48));
const host = { type: 'host' as const, protocol: PROTOCOL, table, name: 'A', levelName: 'demo', level, detail: 48, session: { name: 'Duo', limit: 2, tools: ['can', 'sponge'] as typeof SLOTS[number][] } };

const main = await start({ PLAYER_HOST: '1', ADMIN_KEY: 'test-key', REGION: 'FR' });
const refusing = await start({});
try {
  const get = async (port: number, at: string, ip = '10.3.0.1') => {
    const res = await fetch(`http://localhost:${port}${at}`, { headers: { 'x-forwarded-for': ip } });
    return { status: res.status, type: res.headers.get('content-type'), cache: res.headers.get('cache-control'), text: await res.text() };
  };
  const list = async () => JSON.parse((await get(main.port, LOBBY_LIST)).text) as Lobby;
  const admin = async (body: unknown) => {
    const res = await fetch(`http://localhost:${main.adminPort}/sessions`, { method: 'POST', headers: { authorization: 'Bearer test-key' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  // The list: empty at first, as JSON that is never cached; a plain GET at /ws still says hello.
  const first = await get(main.port, LOBBY_LIST);
  assert.deepEqual([first.status, first.type, first.cache, JSON.parse(first.text)], [200, 'application/json', 'no-store', { region: 'FR', sessions: [] }]);
  assert.equal((await get(main.port, '/ws')).text, HELLO);
  assert.equal(JSON.parse((await get(refusing.port, LOBBY_LIST)).text).region, 'DE', 'the region in config.ts unless REGION says');

  // The admin's sessions: a public one (always the public limit) and private ones (default limit, or its own, 2 to 4).
  const wall = await admin({ kind: 'public', name: ' Wall ', level: 'demo', detail: 'low', tools: ['sponge', 'can'] });
  const friends = await admin({ kind: 'private', name: 'Friends', level: 'demo', detail: 'low' });
  assert.deepEqual([wall.status, wall.body.limit, wall.body.name, friends.status, friends.body.limit], [200, SERVER.players.public, 'Wall', 200, SERVER.players.private]);
  for (const limit of [SERVER.privateMin - 1, SERVER.players.private + 1, 2.5, '3', null]) assert.equal((await admin({ kind: 'private', name: 'x', level: 'demo', limit })).status, 400, String(limit));
  assert.equal((await admin({ kind: 'public', name: 'x', level: 'demo', limit: 3 })).status, 400, 'a public session has the public limit');
  const crew = await new Promise<string>((done, fail) => execFile(process.execPath, ['server/admin.mjs', 'create', 'private', 'Crew', '--level', 'demo', '--detail', 'low', '--players', '3'], { env: { ...main.env, ADMIN_KEY: 'test-key' } }, (e, out) => (e ? fail(e) : done(out))));
  assert.match(crew, /^[A-Z]{5} {2}private {2}0\/3 /);

  // A player's own session (PLAYER_HOST), for two: the third waits in line (queue-test.ts) and leaves it, and the welcomes say what the session is.
  const a = await new Game(main.port).send(host);
  const wa = await a.next('welcome');
  assert.deepEqual(wa.session, { kind: 'private', name: 'Duo', limit: 2, tools: ['can', 'sponge'] });
  const b = await join(main.port, 'B', wa.code);
  assert.equal((await b.next('welcome')).session.limit, 2);
  const c = await join(main.port, 'C', wa.code);
  assert.equal((await c.next('queued')).position, 1);
  c.send({ type: 'leave' });
  assert.equal(await c.closed, 1000);
  const friend = await join(main.port, 'F', friends.body.code);
  assert.deepEqual((await friend.next('welcome')).session, { kind: 'private', name: 'Friends', limit: SERVER.players.private, tools: [...SLOTS] });
  const w = await (await join(main.port, 'W', wall.body.code)).next('welcome');
  assert.deepEqual(w.session, { kind: 'public', name: 'Wall', limit: SERVER.players.public, tools: ['can', 'sponge'] });

  // Everything live, public first, then the fullest (the public one has fewer players than Duo); a private session's code is not in it.
    const now = await list();
  assert.deepEqual(now.sessions, [
    { kind: 'public', name: 'Wall', limit: SERVER.players.public, tools: ['can', 'sponge'], players: ['W'], code: wall.body.code },
    { kind: 'private', name: 'Duo', limit: 2, tools: ['can', 'sponge'], players: ['A', 'B'] },
    { kind: 'private', name: 'Friends', limit: SERVER.players.private, tools: [...SLOTS], players: ['F'] },
    { kind: 'private', name: 'Crew', limit: 3, tools: [...SLOTS], players: [] },
  ]);
  assert.ok(now.sessions.slice(1).every((e) => !('code' in e)));

  // By code: any kind, with its code; a code that isn't one, or isn't a session, 404.
  const duo = await get(main.port, LOBBY_CODE + wa.code);
  assert.deepEqual([duo.status, duo.type, duo.cache, JSON.parse(duo.text)], [200, 'application/json', 'no-store', { kind: 'private', name: 'Duo', limit: 2, tools: ['can', 'sponge'], players: ['A', 'B'], code: wa.code }]);
  assert.equal(JSON.parse((await get(main.port, LOBBY_CODE + wall.body.code)).text).code, wall.body.code);
  for (const code of ['ZZZZZ', 'abcde', 'ABCD', 'ABCDEF', 'ABCDI', '', wa.code.toLowerCase()]) {
    const r = await get(main.port, LOBBY_CODE + code, '10.3.0.2');
    assert.deepEqual([code, r.status, r.text], [code, 404, '{}']);
  }

  // Lookups are limited per address, a minute at a time; another address isn't held up by it.
  for (let i = 0; i < SERVER.lookupsPerIp; i++) assert.equal((await get(main.port, LOBBY_CODE + 'ZZZZZ', '10.3.0.3')).status, 404);
  const over = await get(main.port, LOBBY_CODE + wa.code, '10.3.0.3');
  assert.deepEqual([over.status, over.text], [429, '{}']);
  assert.equal((await get(main.port, LOBBY_CODE + wa.code, '10.3.0.4')).status, 200);
  assert.equal((await get(main.port, LOBBY_LIST, '10.3.0.3')).status, 200, 'the list is not limited');

  // A session that ends leaves the list.
  a.send({ type: 'leave' });
  b.send({ type: 'leave' });
  await a.closed;
  await b.closed;
  assert.deepEqual((await list()).sessions.map((e) => e.name), ['Wall', 'Friends', 'Crew']);
  assert.equal((await get(main.port, LOBBY_CODE + wa.code, '10.3.0.5')).status, 404);

  // A HOST with a session it can't take is a bad message.
  for (const session of [undefined, { ...host.session, name: ' ' }, { ...host.session, limit: 1 }, { ...host.session, limit: SERVER.players.private + 1 }, { ...host.session, tools: ['can', 'can'] }, { ...host.session, tools: ['spoon'] }]) {
    const bad = await new Game(main.port).send({ ...host, session } as ToServer);
    assert.equal(await bad.closed, 1008, JSON.stringify(session));
  }

  // Players HOST only where PLAYER_HOST says: the other server turns them away, with the reason's own close code.
  const no = await new Game(refusing.port).send(host);
  assert.equal((await no.next('rejected')).reason, 'no-host');
  assert.equal(await no.closed, 4010);
  assert.equal(closeCode('no-host'), 4010);
  console.log('server list: ok (the list, a lookup by code and its limit, per-session limits, the admin\'s private limit, HOST only with PLAYER_HOST)');
} finally {
  main.stop();
  refusing.stop();
}
