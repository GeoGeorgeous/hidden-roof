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
// address, a hosted session turning the player over its limit away, a public session's seats, places in line and JOINs per address, the admin's private limit, a HOST with
// fields it can't take, HOST refused unless PLAYER_HOST, a closed tab's seat held for less than a lost link's, and the admin's kick (a reconnect with a kicked player's token is told so, a new join comes in). npm run test:server runs it.

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

  // The admin's kick: the player is told and out at once, a dropped one's seat is let go, both may join again, the admin's feed has it.
  const post = async (at: string) => {
    const res = await fetch(`http://localhost:${main.adminPort}${at}`, { method: 'POST', headers: { authorization: 'Bearer test-key' } });
    return { status: res.status, body: await res.json() };
  };
  const players = async () => ((await (await fetch(`http://localhost:${main.adminPort}/sessions`, { headers: { authorization: 'Bearer test-key' } })).json()) as { code: string; players: { id: number; name: string }[] }[]).find((s) => s.code === friends.body.code)!.players;
  const kicked = await (await join(main.port, 'K', friends.body.code)).next('welcome');
  const away = await join(main.port, 'L', friends.body.code);
  const wl = await away.next('welcome');
  away.ws.terminate();
  await away.closed;
  assert.deepEqual((await players()).map((p) => p.name), ['F', 'K', 'L']);
  assert.equal((await post(`/sessions/${friends.body.code}/players/${kicked.you}/kick`)).status, 200);
  assert.deepEqual((await players()).map((p) => p.name), ['F', 'L'], 'out at once');
  assert.equal((await post(`/sessions/${friends.body.code}/players/${wl.you}/kick`)).status, 200);
  assert.deepEqual((await players()).map((p) => p.name), ['F'], 'a dropped player\'s seat is let go');
  // A tab closed (1001) holds its seat for SERVER.closedHold, a lost link (1006) for the rejoin window.
  const held = async (name: string) => ((await (await fetch(`http://localhost:${main.adminPort}/sessions`, { headers: { authorization: 'Bearer test-key' } })).json()) as { code: string; players: { name: string; held: number | null }[] }[]).find((s) => s.code === friends.body.code)!.players.find((p) => p.name === name)!.held!;
  const [tab, lost] = [await join(main.port, 'T', friends.body.code), await join(main.port, 'U', friends.body.code)];
  const ids = (await Promise.all([tab.next('welcome'), lost.next('welcome')])).map((w) => w.you);
  tab.ws.close(1001);
  lost.ws.terminate();
  await Promise.all([tab.closed, lost.closed]);
  // The server sees a terminated link go a moment later.
  for (let i = 0; i < 40 && (await held('U')) === null; i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok((await held('T')) <= SERVER.closedHold && (await held('U')) > SERVER.closedHold, 'a closed tab is held for less');
  for (const id of ids) await post(`/sessions/${friends.body.code}/players/${id}/kick`);
  const again = await join(main.port, 'K', friends.body.code, { token: kicked.token });
  assert.equal(await again.rejected(), 'kicked', 'a reconnect with their token is told they were kicked');
  const k = await join(main.port, 'K', friends.body.code);
  assert.notEqual((await k.next('welcome')).you, kicked.you, 'a new join, without the token, comes in: kick is not a ban');
  const told = await join(main.port, 'M', friends.body.code);
  const wm = await told.next('welcome');
  assert.equal((await post(`/sessions/${friends.body.code}/players/${wm.you}/kick`)).status, 200);
  assert.equal(await told.rejected(), 'kicked');
  assert.equal(await told.closed, closeCode('kicked'));
  assert.equal(closeCode('kicked'), 4011);
  for (const at of [`/sessions/${friends.body.code}/players/999/kick`, `/sessions/${friends.body.code}/players/x/kick`, `/sessions/ZZZZZ/players/${wm.you}/kick`]) assert.equal((await post(at)).status, 404, at);
  const feed = new AbortController();
  const stream = await fetch(`http://localhost:${main.adminPort}/events`, { headers: { authorization: 'Bearer test-key' }, signal: feed.signal });
  const text = new TextDecoder().decode((await stream.body!.getReader().read()).value);
  feed.abort();
  assert.ok(/"type":"left"[^\n]*"player":"M"[^\n]*"why":"kicked by the admin"/.test(text), 'one left event, kicked, with the name');
  assert.ok(!text.includes('"type":"kicked"'), 'no event of its own for the kick');

  // A HOST with a session it can't take is a bad message.
  for (const session of [undefined, { ...host.session, name: ' ' }, { ...host.session, limit: 1 }, { ...host.session, limit: SERVER.players.private + 1 }, { ...host.session, tools: ['can', 'can'] }, { ...host.session, tools: ['spoon'] }]) {
    const bad = await new Game(main.port).send({ ...host, session } as ToServer);
    assert.equal(await bad.closed, 1008, JSON.stringify(session));
  }

  // Players HOST only where PLAYER_HOST says: the other server turns them away, with the reason's own close code.
  const no = await new Game(refusing.port).send(host);
  assert.equal(await no.rejected(), 'no-host');
  assert.equal(await no.closed, 4010);
  assert.equal(closeCode('no-host'), 4010);

  // A public session gives one address SERVER.seatsPerIp seats, and the same many places in its line; a seat it dropped is
  // still taken back by its nickname. Another address is not held up by it.
  const crowd = await admin({ kind: 'public', name: 'Crowd', level: 'demo', detail: 'low' });
  const refused = async (g: Game) => {
    const reason = await g.rejected();
    assert.ok(reason, 'turned away with a rejection code');
    return reason;
  };
  const house = '10.4.0.1';
  const seated = await Promise.all(Array.from({ length: SERVER.seatsPerIp }, (_, i) => join(main.port, `h${i}`, crowd.body.code, {}, house)));
  const welcomed = await Promise.all(seated.map((g) => g.next('welcome')));
  assert.equal(await refused(await join(main.port, 'extra', crowd.body.code, {}, house)), 'seats');
  seated[0].ws.terminate();
  await seated[0].closed;
  assert.equal(await refused(await join(main.port, 'other', crowd.body.code, {}, house)), 'seats', 'a dropped seat still counts');
  assert.equal((await (await join(main.port, 'h0', crowd.body.code, {}, house)).next('welcome')).you, welcomed[0].you, 'its nickname takes it back');
  const rest = [];
  const addresses = SERVER.players.public / SERVER.seatsPerIp;
  for (let n = 2; n <= addresses; n++) for (let i = 0; i < SERVER.seatsPerIp; i++) rest.push(await join(main.port, `n${n}x${i}`, crowd.body.code, {}, `10.4.0.${n}`));
  for (const g of rest) await g.next('welcome');
  assert.equal((await list()).sessions.find((e) => e.name === 'Crowd')!.players.length, SERVER.players.public, 'the session is full');
  // Full: an address waits in line with as many places, and no more; one with all its seats doesn't wait for another.
  const line = [];
  const waiting = `10.4.0.${addresses + 1}`;
  for (let i = 0; i < SERVER.seatsPerIp; i++) line.push(await join(main.port, `w${i}`, crowd.body.code, {}, waiting));
  for (const [i, g] of line.entries()) assert.equal((await g.next('queued')).position, i + 1);
  assert.equal(await refused(await join(main.port, 'w9', crowd.body.code, {}, waiting)), 'seats');
  assert.equal(await refused(await join(main.port, 'h9', crowd.body.code, {}, house)), 'seats');
  rest[0].send({ type: 'leave' });
  await line[0].next('welcome');

  // JOINs to a public session are limited per address a minute, whether they seat or not; the token of a seat is a reconnect, which isn't counted.
  const open = await admin({ kind: 'public', name: 'Open', level: 'demo', detail: 'low' });
  const busy = '10.5.0.1';
  const tries = [];
  for (let i = 0; i < SERVER.joinsPerIp; i++) tries.push(await join(main.port, `r${i}`, open.body.code, {}, busy));
  const opener = await tries[0].next('welcome');
  assert.deepEqual(await Promise.all(tries.slice(SERVER.seatsPerIp).map(refused)), tries.slice(SERVER.seatsPerIp).map(() => 'seats'));
  assert.equal(await refused(await join(main.port, 'late', open.body.code, {}, busy)), 'rate');
  assert.equal((await (await join(main.port, 'r0', open.body.code, { token: opener.token }, busy)).next('welcome')).you, opener.you, 'a reconnect is not held up');
  assert.equal((await (await join(main.port, 'calm', open.body.code, {}, '10.5.0.2')).next('welcome')).name, 'calm', 'another address is not');
  assert.ok(await (await join(main.port, 'p', friends.body.code, {}, busy)).next('welcome'), 'a private session is not limited this way: it has its own few seats');
  assert.equal(closeCode('seats'), 4013);
  assert.equal(closeCode('rate'), 4014);
  console.log('server list: ok (the list, a lookup by code and its limit, per-session limits, the admin\'s private limit, HOST only with PLAYER_HOST, the admin\'s kick, seats and joins per address)');
} finally {
  main.stop();
  refusing.stop();
}
