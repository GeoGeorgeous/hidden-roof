import './headless';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { NET, SERVER } from '../src/config';
import { levelPaintFaces } from '../src/level/prop-pieces';
import { encodeOps, SurfaceIndex } from '../src/op-wire';
import { noClient } from './client-counts';
import { SESSION_NAME_MAX } from '../src/net/protocol';
import { median, noPaint } from './counts';
import { join, start } from './test-kit';
import { dayName } from './days';

// What the admin API holds to (admin/, history.ts, people.ts, main.ts), against the built server: inherited
// keys are no paint detail and no period, ADMIN_ORIGIN as written with a trailing slash or not at all, a body
// counted in bytes (413, and the server answers the next request), a multibyte character split across chunks,
// the session's paint by color and the settings in the answers, a wrong method (405), the events in pages since a time and by type, the median of an even count, a pong nobody asked
// for, a corrupt stats file skipped while the days after it load, and the log's days, a day downloaded whole or one
// session's lines. npm run test:server runs it.

const DAY = 864e5;
const day = (back: number) => new Date((Math.floor(Date.now() / DAY) - back) * DAY).toISOString().slice(0, 10);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-admin-'));
fs.mkdirSync(path.join(dir, 'stats'));
const put = (name: string, text: string) => fs.writeFileSync(path.join(dir, 'stats', name), text);
// Two days back is corrupt, yesterday is good: 3 plays at 12:00 UTC from one address.
put(`${day(2)}.json`, '{not json');
put(`${day(1)}.json`, JSON.stringify({ hours: { 12: { plays: 3, lengths: [0, 0, 0, 0], seconds: 0, withOthers: 0, turnedAway: {}, ...noPaint(), peak: null, client: noClient() } } }));
put(`people-${day(2)}.json`, '[{"h":');
put(`people-${day(1)}.json`, JSON.stringify([{ h: (Math.floor(Date.now() / DAY) - 1) * 24 + 12, d: null, i: 'x', c: 'FR', j: true }]));
put('peak.json', '{not json');
// The traffic reader's last pass: state.json's time.
const passed = new Date('2026-10-26T08:00:00Z');
fs.mkdirSync(path.join(dir, 'traffic'));
fs.writeFileSync(path.join(dir, 'traffic', 'state.json'), '{}');
fs.utimesSync(path.join(dir, 'traffic', 'state.json'), passed, passed);

const faces = levelPaintFaces(JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8')), 48);
const stamp = { kind: 'stamp' as const, key: faces[0].key, rect: 0, u: 0.5, v: 0.5, radius: 0.2, amount: 1, color: [1, 0, 0] as const, softness: 0, square: false };
const main = await start({ ADMIN_KEY: 'test-key', ADMIN_ORIGIN: 'https://admin.example/page', DATA_DIR: dir, HEARTBEAT: '3600' });
const strict = await start({ ADMIN_KEY: 'test-key', ADMIN_ORIGIN: 'not a url' });
// Yesterday's log, with a stack under one of its entries; today's is the server's own.
const logs = path.join(dir, 'logs');
fs.mkdirSync(logs);
fs.writeFileSync(path.join(logs, `${day(1)}.log`), `${day(1)}T10:00:00Z ABCDE "geo" #1 in\n${day(1)}T10:00:01Z ----- memory\n${day(1)}T10:00:02Z ABCDE error\n  at here\n${day(1)}T10:00:03Z FGHJK "x" #1 in\n`);
const logged = await start({ ADMIN_KEY: 'test-key', LOG_DIR: logs });
try {
  const ask = async (s: typeof main, method: string, at: string, body?: unknown, origin?: string) => {
    const res = await fetch(`http://localhost:${s.adminPort}${at}`, { method, headers: { authorization: 'Bearer test-key', ...(origin ? { origin } : {}) }, body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  // The log's days, newest first; a day as it is, or a session's lines with the stack under them; bad days and codes, and days with no file.
  const list = (await ask(logged, 'GET', '/logs')).body;
  assert.deepEqual([list.days.map((d: { day: string }) => d.day), list.keepDays, list.redactDays], [[day(0), day(1)], SERVER.logKeepDays, SERVER.logRedactDays]);
  assert.ok(list.days.every((d: { bytes: number }) => d.bytes > 0));
  const text = async (at: string) => {
    const res = await fetch(`http://localhost:${logged.adminPort}${at}`, { headers: { authorization: 'Bearer test-key' } });
    return { status: res.status, disposition: res.headers.get('content-disposition'), body: await res.text() };
  };
  const whole = await text(`/logs/${day(1)}`);
  assert.deepEqual([whole.status, whole.disposition, whole.body.split('\n').length], [200, `attachment; filename="roof-${day(1)}.log"`, 6]);
  const one = await text(`/logs/${day(1)}?session=ABCDE`);
  assert.deepEqual([one.disposition, one.body.split('\n').map((l) => l.replace(/^\S+ /, ''))], [`attachment; filename="roof-${day(1)}-ABCDE.log"`, ['ABCDE "geo" #1 in', 'ABCDE error', '  at here', '']]);
  assert.deepEqual([(await text('/logs/yesterday')).status, (await text('/logs/2026-13-01')).status, (await text('/logs/2026-02-30')).status, (await text(`/logs/${day(1)}?session=abc`)).status, (await text(`/logs/${day(3)}`)).status], [400, 400, 400, 400, 404]);
  assert.deepEqual((await ask(strict, 'GET', '/logs')).body.days, [], 'no LOG_DIR: no days');

  const make = (body: object, origin?: string) => ask(main, 'POST', '/sessions', { kind: 'private', name: 'T', level: 'demo', detail: 'low', ...body }, origin);

  // A corrupt stats file is skipped and logged; the days after it, the people and the rest of the directory load.
  assert.match(main.out(), new RegExp(`stats ${day(2)}.json skipped`));
  assert.match(main.out(), new RegExp(`stats people-${day(2)}.json skipped`));
  // The hour file is from before the minutes and the bytes were kept: it reads as none of them.
  const week = (await ask(main, 'GET', '/stats/play?period=7d')).body;
  assert.deepEqual([week.plays, week.lengthMinutes, 'lengths' in week, week.before], [3, {}, false, null], 'nothing kept before yesterday: no period before');
  const folks = (await ask(main, 'GET', '/stats/people?period=7d')).body;
  assert.deepEqual([folks.players, folks.inSessions, folks.countries, folks.networks.devicesPerNetwork], [{ device: 0, address: 1 }, { device: 0, address: 1 }, {}, { 1: 0, '2-4': 0, '5+': 0 }], 'a play saved before pages were kept was a JOIN; no device, no country by device, no network of devices');

  // How fresh each figure is: the sources' cadences and when each last came (null: never).
  const fresh = async (s: typeof main) => (await ask(s, 'GET', '/')).body.sources;
  let src = await fresh(main);
  assert.deepEqual(Object.keys(src), ['status', 'beacon', 'history', 'traffic', 'geoip']);
  assert.deepEqual([src.status.every, src.beacon.every, src.history.every, src.traffic.every, src.geoip.every], [SERVER.adminStatus, NET.beaconEvery, SERVER.historyEvery, SERVER.trafficEvery, SERVER.geoipEvery]);
  assert.ok(Math.abs(Date.parse(src.status.at) - Date.now()) < 5000);
  assert.deepEqual([src.beacon.at, src.history.at, src.traffic.at, src.geoip.at], [null, null, passed.toISOString(), null]);
  assert.equal((await fetch(`http://localhost:${main.port}/ws?e`, { method: 'POST', body: '{}' })).status, 204);
  src = await fresh(main);
  assert.ok(Math.abs(Date.parse(src.beacon.at) - Date.now()) < 5000);
  assert.equal((await fresh(strict)).traffic.at, null, 'no DATA_DIR, no traffic');

  // Inherited keys are no detail and no period.
  for (const detail of ['constructor', '__proto__', 'toString', 7]) assert.equal((await make({ detail })).status, 400, String(detail));
  assert.equal((await make({ detail: 'low' })).status, 200);
  for (const period of ['constructor', '__proto__', 'toString']) for (const route of ['play', 'people', 'paint', 'client', 'traffic']) assert.equal((await ask(main, 'GET', `/stats/${route}?period=${period}`)).status, 400, `${route} ${period}`);
  assert.deepEqual([(await ask(main, 'GET', '/stats/nothing')).status, (await ask(main, 'GET', '/stats/traffic/days?n=0')).status, (await ask(main, 'GET', '/stats/traffic/days')).body, (await ask(main, 'GET', '/stats/traffic?period=today')).body.views], [404, 400, { from: dayName(Math.floor(Date.now() / 864e5) - 29), to: dayName(Math.floor(Date.now() / 864e5)), days: [] }, 0]);

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
  for (const query of ['before=x', 'before=1-2-3', 'limit=0', 'limit=51', 'limit=1.5', 'since=x', 'since=2026-10-27', 'since=2026-10-27T12:00:00', 'type=nope', 'type=joined&type=nope']) assert.equal((await ask(main, 'GET', `/events/page?${query}`)).status, 400, query);
  // since: an event id or a time, only events after it; type, repeated: only those types; next is null at the end or at since.
  const ofType = (await ask(main, 'GET', '/events/page?type=session-made')).body as { events: { id: string; type: string; at: string }[]; next: string | null };
  assert.ok(ofType.events.length >= 2 && ofType.events.every((e) => e.type === 'session-made') && ofType.next === null);
  const [newest, older] = ofType.events;
  const after = (await ask(main, 'GET', `/events/page?since=${older.id}`)).body as { events: { id: string }[]; next: string | null };
  assert.ok(after.events.length >= 1 && after.events.every((e) => Number(e.id.split('-')[0]) >= Number(older.id.split('-')[0]) && e.id !== older.id) && after.next === null);
  assert.ok(after.events.some((e) => e.id === newest.id), 'the newer one is after');
  assert.deepEqual((await ask(main, 'GET', `/events/page?since=${newest.id}`)).body.events.filter((e: { type: string }) => e.type === 'session-made'), [], 'nothing after the newest');
  assert.ok((await ask(main, 'GET', `/events/page?since=${new Date(Date.parse(newest.at) - 1).toISOString()}`)).body.events.some((e: { id: string }) => e.id === newest.id), 'after a time');
  assert.deepEqual((await ask(main, 'GET', `/events/page?since=${newest.at}&type=session-made`)).body.events, [], 'and not the event of that time itself');
  const two = (await ask(main, 'GET', `/events/page?since=${older.id}&limit=1`)).body as { events: { id: string }[]; next: string | null };
  assert.deepEqual([two.events.length, two.next === two.events[0].id], [1, after.events.length > 1]);
  const mixed = (await ask(main, 'GET', '/events/page?type=session-made&type=joined&limit=50')).body.events as { type: string }[];
  assert.ok(mixed.every((e) => e.type === 'session-made' || e.type === 'joined') && mixed.some((e) => e.type === 'session-made'));
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
  const wall = ((await ask(main, 'GET', '/sessions')).body as { code: string; stats: { colors: object }; today?: unknown; players: { state: string; since: string; seenDays: null }[]; saves: unknown[] }[]).find((s) => s.code === code)!;
  assert.deepEqual([wall.stats.colors, 'today' in wall, wall.saves], [{ red: 1 }, false, []]);
  assert.deepEqual([wall.players[0].state, wall.players[0].seenDays, wall.players[0].since.endsWith('Z')], ['here', null, true]);
  const root = (await ask(main, 'GET', '/')).body;
  assert.deepEqual([root.api, root.settings.slowPing, root.settings.saveEvery, root.settings.saveAges, root.settings.pageIdle, root.settings.playerIdle, root.limits], [4, SERVER.slowPing, SERVER.keepEvery, SERVER.keepAges.filter(Boolean), NET.beaconIdle, NET.idleAfter, { public: SERVER.players.public, private: { min: SERVER.privateMin, max: SERVER.players.private }, name: SESSION_NAME_MAX }]);
  assert.ok(!('slowPing' in root) && !('saveEvery' in root) && !('saveAges' in root), 'only in settings');
  // The routes of ADMIN_API 3 for the stats are gone; a route with another method is 405, one that is not there 404; the live minutes are a list.
  for (const gone of ['/history', '/history?period=7d', '/traffic', '/traffic?days=3', '/nothing']) assert.equal((await ask(main, 'GET', gone)).status, 404, gone);
  assert.deepEqual([(await ask(main, 'POST', '/')).status, (await ask(main, 'POST', '/machine')).status, (await ask(main, 'POST', '/events')).status, (await ask(main, 'POST', '/live/minutes')).status, (await ask(main, 'GET', '/uploads')).status, (await ask(main, 'GET', `/sessions/${code}/wipe`)).status, (await ask(main, 'POST', `/sessions/${code}/paint`)).status], [405, 405, 405, 405, 405, 405, 405]);
  assert.deepEqual((await ask(main, 'GET', '/live/minutes')).body, []);
  assert.equal((await ask(main, 'GET', '/live/hours')).status, 404);
  assert.deepEqual([median([]), median([7]), median([1, 2, 3]), median([10, 20]), median([10, 20, 30, 50])], [null, 7, 2, 15, 25]);

  // A pong nobody asked for (the heartbeat is an hour away) is no ping.
  await game.send({ type: 'ping', t: 2 });
  game.ws.pong();
  await game.send({ type: 'ping', t: 3 });
  await game.next('pong');
  await game.next('pong');
  assert.equal(((await ask(main, 'GET', '/sessions')).body as { code: string; players: { ping: number | null }[] }[]).find((s) => s.code === code)!.players[0].ping, null);
  console.log('admin API: ok (inherited keys, ADMIN_ORIGIN, bytes in a body, paint by color, the settings, 405 and 404, events since a time and by type, the slow ping, the median, an unasked pong, a corrupt stats file, event ids and pages, the freshness of the sources, the log by day and session)');
} finally {
  await Promise.all([main.stop(), strict.stop(), logged.stop()]);
  fs.rmSync(dir, { recursive: true, force: true });
}
