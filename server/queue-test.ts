import './headless';
import assert from 'node:assert/strict';
import { SERVER } from '../src/config';
import { closeCode, decode, type ToClient } from '../src/net/protocol';
import type { Link } from './player';
import { Queue, type Place } from './queue';
import { Game, join, start } from './test-kit';

// The line for a full session (queue.ts), against the built server: private sessions for two, made through the admin
// API. The 3rd and 4th joiners get positions 1 and 2; a place that frees goes to the first, and the next is told its
// new position; leaving the line; a waiting link that drops keeps its place for REJOIN_WINDOW, is skipped while
// another is admitted, comes back with its token, and goes after the window; the line's limit; a session that
// ends tells everyone waiting; a LEAVE that comes while the seat is being made (a JOIN's, or a place's turn in the
// line) leaves at once and holds no seat; a place the server has no memory to seat keeps its order. npm run test:server runs it.

const WINDOW = 2;
const main = await start({ ADMIN_KEY: 'test-key', REJOIN_WINDOW: String(WINDOW) });
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
try {
  const admin = async (path: string, body?: unknown) => {
    const res = await fetch(`http://localhost:${main.adminPort}${path}`, { method: body === undefined && path === '/sessions' ? 'GET' : 'POST', headers: { authorization: 'Bearer test-key' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return res.json();
  };
  /** A session for two, and two players in it. */
  const full = async (name: string) => {
    const { code } = await admin('/sessions', { kind: 'private', name, level: 'demo', detail: 'low', limit: 2, stay: true });
    const players = [await join(main.port, 'A', code), await join(main.port, 'B', code)];
    for (const p of players) await p.next('welcome');
    return { code, a: players[0], b: players[1] };
  };
  const players = async (code: string) => (await admin('/sessions')).find((s: { code: string }) => s.code === code).players.length as number;
  const waiting = async (code: string) => (await admin('/sessions')).find((s: { code: string }) => s.code === code).queue as number;
  /** Nothing new about the line reached `g` in `ms`. */
  const quiet = async (g: Game, ms = 400) => {
    await pause(ms);
    assert.deepEqual(g.got.filter((m) => m.type === 'queued'), []);
  };

  // The 3rd and 4th are queued, 1 and 2, with a token each; a waiting link may ping (and is answered), anything else it sends is ignored.
  const s1 = await full('One');
  const c = await join(main.port, 'C', s1.code);
  const d = await join(main.port, 'D', s1.code);
  const qc = await c.next('queued');
  const qd = await d.next('queued');
  assert.deepEqual([qc.position, qd.position], [1, 2]);
  assert.ok(qc.token && qd.token && qc.token !== qd.token);
  assert.equal(await waiting(s1.code), 2);
  await c.send({ type: 'status', status: 'menu' });
  await c.send({ type: 'ping', t: 7 });
  const pong = await c.next('pong');
  assert.deepEqual([pong.t, pong.acked], [7, 0]);
  assert.equal(c.ws.readyState, c.ws.OPEN);

  // A player leaves: the first waiting comes in with its welcome, and the next moves up.
  await s1.a.send({ type: 'leave' });
  await s1.a.closed;
  assert.equal((await c.next('welcome')).name, 'C');
  assert.equal((await d.next('queued')).position, 1);
  assert.equal(await waiting(s1.code), 1);
  // It is a player now: the others hear of it, and its messages are a player's.
  assert.equal((await s1.b.next('joined')).name, 'C');
  await c.send({ type: 'ping', t: 8 });
  assert.equal((await c.next('pong')).t, 8);

  // Leaving the line: the link closes normally and those behind move up.
  const e = await join(main.port, 'E', s1.code);
  const f = await join(main.port, 'F', s1.code);
  assert.equal((await e.next('queued')).position, 2);
  assert.equal((await f.next('queued')).position, 3);
  await d.send({ type: 'leave' });
  assert.equal(await d.closed, 1000);
  assert.equal((await e.next('queued')).position, 1);
  assert.equal((await f.next('queued')).position, 2);

  // The admin closes the session: everyone waiting is told.
  await admin(`/sessions/${s1.code}/close`, {});
  for (const g of [e, f]) {
    assert.equal((await g.next('rejected')).reason, 'closed');
    assert.equal(await g.closed, closeCode('closed'));
  }

  // A waiting link that drops keeps its place: those behind keep theirs, and it comes back by its token to the same place.
  const s2 = await full('Two');
  const c2 = await join(main.port, 'C', s2.code);
  const d2 = await join(main.port, 'D', s2.code);
  const tc = (await c2.next('queued')).token;
  assert.equal((await d2.next('queued')).position, 2);
  c2.ws.terminate();
  await c2.closed;
  await quiet(d2);
  const c2b = await join(main.port, 'C', s2.code, { queue: tc });
  const back = await c2b.next('queued');
  assert.deepEqual([back.position, back.token], [1, tc]);
  await quiet(d2);

  // Held again, it does not block the line: a place frees and the next in line with an open link is admitted.
  c2b.ws.terminate();
  await c2b.closed;
  await s2.a.send({ type: 'leave' });
  assert.equal((await d2.next('welcome')).name, 'D');
  const c2c = await join(main.port, 'C', s2.code, { queue: tc });
  assert.deepEqual([(await c2c.next('queued')).position, await waiting(s2.code)], [1, 1]);

  // After the window a held place goes: the token is no use (a normal JOIN, at the back), and those behind move up.
  c2c.ws.terminate();
  await c2c.closed;
  const e2 = await join(main.port, 'E', s2.code);
  assert.equal((await e2.next('queued')).position, 2);
  await pause(WINDOW * 1000 + 700);
  assert.equal((await e2.next('queued')).position, 1);
  const late = await join(main.port, 'C', s2.code, { queue: tc });
  const q = await late.next('queued');
  assert.deepEqual([q.position, q.token === tc], [2, false]);
  assert.equal(await waiting(s2.code), 2);

  // The line has a limit: past SERVER.queueMax the join is turned away as full.
  const s3 = await full('Three');
  const line: Game[] = [];
  for (let i = 0; i < SERVER.queueMax; i++) {
    line.push(await join(main.port, 'W', s3.code));
    assert.equal((await line[i].next('queued')).position, i + 1);
  }
  const over = await join(main.port, 'W', s3.code);
  assert.equal((await over.next('rejected')).reason, 'full');
  assert.equal(await over.closed, closeCode('full'));
  assert.equal(await waiting(s3.code), SERVER.queueMax);

  // With a dropped player holding one place, the other that frees goes to the line's first.
  s3.b.ws.terminate();
  await s3.b.closed;
  await s3.a.send({ type: 'leave' });
  assert.equal((await line[0].next('welcome')).name, 'W');
  assert.equal((await line[1].next('queued')).position, 1);

  // A LEAVE sent right behind a JOIN, or behind the place's turn, arrives while the seat is being made: the link
  // closes as a leave, and no seat is held for it (it would block the line for REJOIN_WINDOW).
  const { code: c4 } = await admin('/sessions', { kind: 'private', name: 'Four', level: 'demo', detail: 'low', limit: 2, stay: true });
  const quick = await join(main.port, 'Q', c4);
  await quick.send({ type: 'leave' });
  assert.equal(await quick.closed, 1000);
  await pause(300);
  assert.equal(await players(c4), 0);
  const s4 = { code: c4, a: await join(main.port, 'A', c4), b: await join(main.port, 'B', c4) };
  for (const p of [s4.a, s4.b]) await p.next('welcome');
  const lining = await join(main.port, 'L', s4.code);
  assert.equal((await lining.next('queued')).position, 1);
  await s4.a.send({ type: 'leave' });
  await lining.send({ type: 'leave' });
  assert.equal(await lining.closed, 1000);
  await pause(300);
  assert.deepEqual([await players(s4.code), await waiting(s4.code)], [1, 0]);

  // The line keeps its order when the server has no memory for the places it admits: each is put back where it was.
  const sent = (l: { frames: ToClient[] }) => l.frames.filter((m) => m.type === 'queued').map((m) => (m as Extract<ToClient, { type: 'queued' }>).position);
  const link = (ip: string) => {
    const l = { frames: [] as ToClient[], isOpen: true, ip, since: 0, send: (f: Uint8Array) => l.frames.push(decode(f) as ToClient), close: () => (l.isOpen = false), get open() { return l.isOpen; } };
    return l;
  };
  let room = false;
  const waits = new Queue('TESTS', () => room);
  const busy = async () => true;
  const marks = ['a', 'b', 'c'].map((n) => ({ link: link(n), place: null as Place | null }));
  for (const m of marks) m.place = waits.add(m.link as unknown as Link, 'x', async () => (m.link.isOpen = false, true));
  waits.update();
  assert.deepEqual(marks.map((m) => sent(m.link)), [[1], [2], [3]]);
  room = true;
  waits.update();
  await pause(50);
  assert.equal(waits.length, 3);
  room = false;
  for (const m of [marks[2], marks[0], marks[1]]) {
    m.link = link(m.link.ip);
    waits.resume(m.place!.token, m.link as unknown as Link, 'x', busy);
    waits.update();
  }
  assert.deepEqual(marks.map((m) => sent(m.link)), [[1], [2], [3]]);
  console.log('queue: ok (positions, a free place goes to the first, leaving, held places and their token, the limit, an ended session, a leave while seating, the order when busy)');
} finally {
  main.stop();
}
