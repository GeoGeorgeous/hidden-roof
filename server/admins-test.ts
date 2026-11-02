import './headless';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SERVER } from '../src/config';
import { closeCode, LOBBY_CODE, PROTOCOL, type Lobby } from '../src/net/protocol';
import { encodeOps, SurfaceIndex } from '../src/op-wire';
import type { PaintOp } from '../src/paint-ops';
import { Game, join, start } from './test-kit';
import { sessionPaint } from './world';

// Admins in sessions (admins.ts), against the built server: a one-time pass from the admin API (once, for its
// session only), an admin past a full session's limit and outside its players (the listings, the list), unseen
// until seen (then joined and left as a player named Admin), locks (every game told, a locked face's ops dropped,
// in the welcome), a wipe ending admin mode, and an admin keeping a private session open. npm run test:server runs it.

const level = JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8'));
const main = await start({ ADMIN_KEY: 'test-key' });
try {
  const api = async (method: string, at: string, body?: unknown) => {
    const res = await fetch(`http://localhost:${main.adminPort}${at}`, { method, headers: { authorization: 'Bearer test-key' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const pass = async (code: string) => (await api('POST', `/sessions/${code}/admin-pass`)).body as { pass: string; expires: string };
  const watch = (code: string, p: string) => new Game(main.port).send({ type: 'join', protocol: PROTOCOL, name: 'Admin', code, pass: p });
  const quiet = () => new Promise((w) => setTimeout(w, 300));

  // GET / says the route is there (CCTV shows Join as admin by it); a pass lives SERVER.adminPassLife s; none for a session that isn't.
  assert.deepEqual((await api('GET', '/')).body.limits.adminPass, { seconds: SERVER.adminPassLife });
  const duo = (await api('POST', '/sessions', { kind: 'private', name: 'Duo', level: 'demo', detail: 'low', limit: 2 })).body;
  const first = await pass(duo.code);
  assert.match(first.pass, /^[A-Za-z0-9_-]{32}$/);
  assert.ok(Math.abs(Date.parse(first.expires) - Date.now() - SERVER.adminPassLife * 1000) < 5000);
  assert.equal((await api('POST', '/sessions/ZZZZZ/admin-pass')).status, 404);

  // A full session takes an admin, who isn't among its players anywhere.
  const a = await join(main.port, 'A', duo.code);
  const wa = await a.next('welcome');
  const b = await join(main.port, 'B', duo.code);
  await b.next('welcome');
  const admin = await watch(duo.code, first.pass);
  const w = await admin.next('welcome');
  assert.equal(w.admin, true);
  assert.deepEqual(w.players.map((p) => p.name).sort(), ['A', 'B']);
  assert.deepEqual(w.locks, []);
  const listed = (await api('GET', '/sessions')).body.find((s: { code: string }) => s.code === duo.code);
  assert.deepEqual(listed.players.map((p: { name: string }) => p.name).sort(), ['A', 'B']);
  const entry = (await (await fetch(`http://localhost:${main.port}${LOBBY_CODE}${duo.code}`)).json()) as Lobby['sessions'][number];
  assert.deepEqual(entry.players.sort(), ['A', 'B']);
  assert.match(main.out(), /admin #\d+ in from /);

  // A pass works once, for its session only; a player can't go by Admin.
  assert.equal(await (await watch(duo.code, first.pass)).rejected(), 'pass');
  const other = (await api('POST', '/sessions', { kind: 'private', name: 'Other', level: 'demo', detail: 'low' })).body;
  assert.equal(await (await watch(duo.code, (await pass(other.code)).pass)).rejected(), 'pass');
  const named = await join(main.port, 'Admin', duo.code);
  assert.equal(await named.closed, 1008);

  // Unseen: nothing of the admin reaches the players. Seen: they're a player named Admin; unseen again, gone.
  admin.send({ type: 'state', bytes: new Uint8Array(25) });
  await quiet();
  assert.ok(!a.got.some((m) => (m.type === 'joined' || m.type === 'state') && m.id === w.you), 'unseen');
  admin.send({ type: 'seen', on: true });
  const seen = await b.next('joined');
  assert.deepEqual([seen.id, seen.name, seen.role], [w.you, 'Admin', 'watcher']);
  admin.send({ type: 'seen', on: false });
  assert.equal((await a.next('left')).id, w.you);

  // A lock: every game is told; ops on the face are dropped (not relayed), others go on; a welcome brings it.
  const keys = [...sessionPaint(level, 24).paint.surfaces].map((s) => s.key);
  const surfaces = new SurfaceIndex(keys);
  const key = surfaces.keys[0];
  const stamp = (rect: number): PaintOp => ({ kind: 'stamp', key, rect, u: 0.5, v: 0.5, radius: 0.1, amount: 1, color: [1, 0, 0], softness: 0.5, square: false });
  admin.send({ type: 'lock', surface: 0, rect: 0, on: true });
  assert.deepEqual(await b.next('lock'), { type: 'lock', surface: 0, rect: 0, on: true });
  a.send({ type: 'ops', seq: 1, bytes: encodeOps([1], [stamp(0)], surfaces) });
  await quiet();
  assert.ok(!b.got.some((m) => m.type === 'ops'), 'a locked face takes no paint');
  a.send({ type: 'ops', seq: 2, bytes: encodeOps([1], [stamp(1)], surfaces) });
  await b.next('ops');
  const late = await watch(duo.code, (await pass(duo.code)).pass);
  assert.deepEqual((await late.next('welcome')).locks, [[0, 0]]);

  // A wipe ends admin mode (closed: an admin doesn't come back), and the locks with it.
  assert.equal((await api('POST', `/sessions/${duo.code}/wipe`)).status, 200);
  assert.deepEqual([await admin.closed, await late.closed, await a.closed], [closeCode('closed'), closeCode('closed'), 1012]);
  const back = await join(main.port, 'A', duo.code, { token: wa.token });
  assert.deepEqual((await back.next('welcome')).locks, []);

  // An admin keeps a private session open after its last player left; it closes when the admin goes.
  const solo = (await api('POST', '/sessions', { kind: 'private', name: 'Solo', level: 'demo', detail: 'low' })).body;
  const p = await join(main.port, 'P', solo.code);
  await p.next('welcome');
  const keeper = await watch(solo.code, (await pass(solo.code)).pass);
  await keeper.next('welcome');
  p.send({ type: 'leave' });
  await p.closed;
  await quiet();
  const live = async () => ((await api('GET', '/sessions')).body as { code: string }[]).some((s) => s.code === solo.code);
  assert.ok(await live(), 'kept open by its admin');
  keeper.send({ type: 'leave' });
  await keeper.closed;
  await quiet();
  assert.ok(!(await live()), 'closed with its admin gone');
  assert.match(main.out(), /admin #\d+ out: left/);
  console.log('admins: ok (a pass once, for its session; outside the players; unseen, then seen; locks; a wipe ends it; it keeps a session open)');
} finally {
  await main.stop();
}
