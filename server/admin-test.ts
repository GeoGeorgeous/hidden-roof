import './headless';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { SERVER } from '../src/config';
import { levelPaintFaces } from '../src/level/prop-pieces';
import { encodeOps, SurfaceIndex } from '../src/op-wire';
import { median } from './counts';
import { join, start } from './test-kit';

// What the admin API holds to (admin-api.ts, history.ts, people.ts, main.ts), against the built server: inherited
// keys are no paint detail and no period, ADMIN_ORIGIN as written with a trailing slash or not at all, a body
// counted in bytes (413, and the server answers the next request), a multibyte character split across chunks,
// today's paint by color and the slow ping in the answers, the median of an even count, a pong nobody asked
// for, and a corrupt stats file skipped while the days after it load. npm run test:server runs it.

const DAY = 864e5;
const day = (back: number) => new Date((Math.floor(Date.now() / DAY) - back) * DAY).toISOString().slice(0, 10);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-admin-'));
fs.mkdirSync(path.join(dir, 'stats'));
const put = (name: string, text: string) => fs.writeFileSync(path.join(dir, 'stats', name), text);
// Two days back is corrupt, yesterday is good: 3 plays at 12:00 UTC from one address.
put(`${day(2)}.json`, '{not json');
put(`${day(1)}.json`, JSON.stringify({ hours: { 12: { plays: 3 } } }));
put(`people-${day(2)}.json`, '[{"h":');
put(`people-${day(1)}.json`, JSON.stringify([{ h: (Math.floor(Date.now() / DAY) - 1) * 24 + 12, d: null, i: 'x', c: 'FR' }]));
put('peak.json', '{not json');

const faces = levelPaintFaces(JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8')), 48);
const stamp = { kind: 'stamp' as const, key: faces[0].key, rect: 0, u: 0.5, v: 0.5, radius: 0.2, amount: 1, color: [1, 0, 0] as const, softness: 0, square: false };
const main = await start({ ADMIN_KEY: 'test-key', ADMIN_ORIGIN: 'https://admin.example/page', DATA_DIR: dir, HEARTBEAT: '3600' });
const strict = await start({ ADMIN_KEY: 'test-key', ADMIN_ORIGIN: 'not a url' });
try {
  const ask = async (s: typeof main, method: string, at: string, body?: unknown, origin?: string) => {
    const res = await fetch(`http://localhost:${s.adminPort}${at}`, { method, headers: { authorization: 'Bearer test-key', ...(origin ? { origin } : {}) }, body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const make = (body: object, origin?: string) => ask(main, 'POST', '/sessions', { kind: 'private', name: 'T', level: 'demo', detail: 'low', ...body }, origin);

  // A corrupt stats file is skipped and logged; the days after it, the people and the rest of the directory load.
  assert.match(main.out(), new RegExp(`stats ${day(2)}.json skipped`));
  assert.match(main.out(), new RegExp(`stats people-${day(2)}.json skipped`));
  const week = (await ask(main, 'GET', '/history?period=7d')).body;
  assert.deepEqual([week.plays, week.people.byIp, week.countries], [3, 1, { FR: 1 }]);

  // Inherited keys are no detail and no period.
  for (const detail of ['constructor', '__proto__', 'toString', 7]) assert.equal((await make({ detail })).status, 400, String(detail));
  assert.equal((await make({ detail: 'low' })).status, 200);
  for (const period of ['constructor', '__proto__', 'toString']) assert.equal((await ask(main, 'GET', `/history?period=${period}`)).status, 400, period);

  // ADMIN_ORIGIN's origin is what counts: its trailing slash and path don't matter. Unset or not a URL: any Origin is refused, none is fine.
  assert.equal((await make({}, 'https://admin.example')).status, 200);
  assert.equal((await make({}, 'https://admin.example/page')).status, 403);
  assert.equal((await make({}, 'https://elsewhere')).status, 403);
  assert.equal((await ask(strict, 'GET', '/', undefined, 'https://admin.example')).status, 403);
  assert.equal((await ask(strict, 'GET', '/', undefined, 'null')).status, 403);
  assert.equal((await ask(strict, 'GET', '/')).status, 200);

  // A body is counted in bytes: 413 past SERVER.adminBody, whatever the characters, and the server answers the next request.
  const pad = (n: number, c: string) => JSON.stringify({ kind: 'private', name: 'T', level: 'demo', detail: 'low', pad: c.repeat(n) });
  assert.ok(pad(SERVER.adminBody / 2 + 10, 'é').length < SERVER.adminBody, 'fewer characters than the limit');
  for (const text of [pad(SERVER.adminBody + 10, 'x'), pad(SERVER.adminBody / 2 + 10, 'é'), pad(10 * SERVER.adminBody, 'x')]) {
    assert.deepEqual(await ask(main, 'POST', '/sessions', text), { status: 413, body: { error: 'too big' } });
    assert.equal((await ask(main, 'GET', '/')).status, 200, 'still answering');
  }
  assert.equal((await ask(main, 'POST', '/sessions', '{not json')).status, 400);
  // A character split across two chunks survives.
  const split = Buffer.from(JSON.stringify({ kind: 'private', name: 'Café', level: 'demo', detail: 'low' }));
  const cut = split.indexOf(0xc3) + 1;
  const made = await new Promise<{ name: string }>((done, fail) => {
    const req = http.request({ port: main.adminPort, method: 'POST', path: '/sessions', headers: { authorization: 'Bearer test-key' } }, (res) => {
      let text = '';
      res.on('data', (d: Buffer) => (text += d));
      res.on('end', () => done(JSON.parse(text)));
    });
    req.on('error', fail);
    req.write(split.subarray(0, cut));
    setTimeout(() => req.end(split.subarray(cut)), 100);
  });
  assert.equal(made.name, 'Café');

  // Events have ids, on disk (DATA_DIR/events) and in pages: the stream's too.
  const paged = (await ask(main, 'GET', '/events/page?limit=2')).body as { events: { id: string; type: string }[]; next: string | null };
  assert.equal(paged.events.length, 2);
  assert.equal(paged.next, paged.events[1].id, 'more before them');
  assert.ok(paged.events.every((e) => /^\d+-\d+$/.test(e.id)) && paged.events[0].type === 'session-made');
  assert.equal((await ask(main, 'GET', `/events/page?before=${paged.next}&limit=3`)).body.events.length, 1);
  assert.deepEqual((await ask(main, 'GET', '/events/page?before=1-0')).body, { events: [], next: null });
  for (const query of ['before=x', 'before=1-2-3', 'limit=0', 'limit=51', 'limit=1.5']) assert.equal((await ask(main, 'GET', `/events/page?${query}`)).status, 400, query);
  assert.ok(fs.readFileSync(path.join(dir, 'events', `${new Date().toISOString().slice(0, 10)}.jsonl`), 'utf8').includes(paged.events[0].id));
  const live = await fetch(`http://localhost:${main.adminPort}/events`, { headers: { authorization: 'Bearer test-key' } });
  const reader = live.body!.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  void reader.cancel();
  assert.ok(JSON.parse(/event: recent\ndata: (.*)\n/.exec(first)![1])[0].id.match(/^\d+-\d+$/));

  // Today's paint by color, and the slow ping a page measures against.
  const code = (await make({ kind: 'public', name: 'Wall' })).body.code as string;
  const game = await join(main.port, 'A', code);
  await game.next('welcome');
  await game.send({ type: 'ops', seq: 1, bytes: encodeOps([1], [stamp], new SurfaceIndex(faces.map((f) => f.key))) });
  await game.send({ type: 'ping', t: 1 });
  await game.next('pong');
  const wall = ((await ask(main, 'GET', '/sessions')).body as { code: string; today: { colors: object; topColor: string } }[]).find((s) => s.code === code)!;
  assert.deepEqual([wall.today.colors, wall.today.topColor], [{ red: 1 }, 'red']);
  assert.equal((await ask(main, 'GET', '/')).body.slowPing, SERVER.slowPing);
  assert.deepEqual([median([]), median([7]), median([1, 2, 3]), median([10, 20]), median([10, 20, 30, 50])], [null, 7, 2, 15, 25]);

  // A pong nobody asked for (the heartbeat is an hour away) is no ping.
  await game.send({ type: 'ping', t: 2 });
  game.ws.pong();
  await game.send({ type: 'ping', t: 3 });
  await game.next('pong');
  await game.next('pong');
  assert.equal(((await ask(main, 'GET', '/sessions')).body as { code: string; players: { ping: number | null }[] }[]).find((s) => s.code === code)!.players[0].ping, null);
  console.log('admin API: ok (inherited keys, ADMIN_ORIGIN, bytes in a body, paint by color, the slow ping, the median, an unasked pong, a corrupt stats file, event ids and pages)');
} finally {
  await Promise.all([main.stop(), strict.stop()]);
  fs.rmSync(dir, { recursive: true, force: true });
}
