import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SERVER } from '../src/config';
import { pass } from './traffic-log';
import { start } from './test-kit';

// The traffic reader (traffic.ts, traffic-log.ts, traffic-count.ts) on a sample of Caddy's access log, and the admin
// API's GET /traffic over what it wrote: views, pages and sources in their order, bots, distinct visitors, the funnel,
// resuming from where it was, a rotated log, a line still being written, the day changing, no address or browser name
// in a file, and the days the API answers. npm run test:server runs it.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-traffic-'));
const log = path.join(dir, 'access.log');
const traffic = path.join(dir, 'traffic');
const opts = { log, dir: traffic, hosts: ['hidden.roof'], country: (ip: string) => (ip.startsWith('10.1.') ? 'DE' : null) };

// Two days ago and yesterday, so the API's days count them.
const midnight = Math.floor(Date.now() / 864e5) * 864e5;
const [d0, d1] = [midnight - 2 * 864e5, midnight - 864e5];
const names = [d0, d1].map((t) => new Date(t).toISOString().slice(0, 10));
const noon = (day: number, s = 0) => (day + 12 * 3600e3) / 1000 + s;

interface Req { ts: number; ip: string; method?: string; host?: string; uri?: string; ua?: string; ref?: string; status?: number; type?: string | null }
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/200.0';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0) Chrome/200.0';
/** A request as a line of Caddy's JSON access log. */
const line = ({ ts, ip, method = 'GET', host = 'hidden.roof', uri = '/', ua = FIREFOX, ref, status = 200, type = 'text/html; charset=utf-8' }: Req) =>
  JSON.stringify({
    level: 'info', ts, logger: 'http.log.access.log0', msg: 'handled request',
    request: { remote_ip: ip, client_ip: ip, proto: 'HTTP/2.0', method, host, uri, headers: { 'User-Agent': [ua], ...(ref ? { Referer: [ref] } : {}) } },
    status, resp_headers: type ? { 'Content-Type': [type] } : {},
  }) + '\n';
const append = (...lines: string[]) => fs.appendFileSync(log, lines.join(''));
const read = (day: string) => JSON.parse(fs.readFileSync(path.join(traffic, `${day}.json`), 'utf8'));
const state = () => JSON.parse(fs.readFileSync(path.join(traffic, 'state.json'), 'utf8'));

// The days being counted are past ones, so the reader's clock is set to just after the lines it reads.
const realNow = Date.now;
const clock = (s: number) => (Date.now = () => s * 1000);

const A = '10.1.0.1';
const B = '10.1.0.2';
const C = '10.9.0.3';
const t0 = noon(d0);
clock(t0 + 100);
append(
  // A: ?ref= beats utm_source and the referrer; the whole funnel.
  line({ ts: t0, ip: A, uri: '/?ref=Discord&utm_source=x', ref: 'https://www.reddit.com/r/y' }),
  line({ ts: t0 + 1, ip: A, uri: '/assets/index-abc.js', type: 'text/javascript' }),
  line({ ts: t0 + 2, ip: A, method: 'POST', uri: '/ws?e', status: 204, type: null }),
  line({ ts: t0 + 3, ip: A, uri: '/ws', status: 101, type: null }),
  // B: the referrer's host, www. stripped; then our own site as the referrer is direct.
  line({ ts: t0 + 4, ip: B, ua: CHROME, ref: 'https://www.google.com/search?q=roof' }),
  line({ ts: t0 + 5, ip: B, ua: CHROME, ref: 'https://hidden.roof/' }),
  // C: utm_source beats the referrer, with a campaign.
  line({ ts: t0 + 6, ip: C, uri: '/?utm_source=Newsletter&utm_campaign=Spring', ref: 'https://www.google.com/' }),
  // Bots: only counted; a bot's script is not.
  line({ ts: t0 + 7, ip: '10.3.0.1', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }),
  line({ ts: t0 + 8, ip: '10.3.0.2', ua: 'curl/8.0', uri: '/assets/index-abc.js', type: 'text/javascript' }),
  // Not counted: another host, a missing page, an image, junk. A script revalidated (304) by someone with no view counts as a script step.
  line({ ts: t0 + 9, ip: A, host: 'other.example' }),
  line({ ts: t0 + 10, ip: A, status: 404 }),
  line({ ts: t0 + 11, ip: A, uri: '/favicon.ico', type: 'image/x-icon' }),
  line({ ts: t0 + 12, ip: '10.4.0.1', ua: 'Opera/9', uri: '/assets/index-abc.js', status: 304, type: null }),
  // A beacon that was refused (429) is not a beacon step.
  line({ ts: t0 + 13, ip: '10.4.0.2', ua: 'Opera/9', method: 'POST', uri: '/ws?e', status: 429, type: null }),
  'not json\n',
  JSON.stringify({ ts: t0, request: { client_ip: A } }) + '\n',
);
await pass(opts);
const first = read(names[0]);
assert.deepEqual([first.views, first.visitors, first.bots, first.pages, first.campaigns, first.countries, first.steps], [4, 3, 1, { '/': 4 }, { spring: 1 }, { DE: 3 }, { view: 3, script: 2, beacon: 1, socket: 1 }]);
assert.deepEqual(first.sources, { discord: 1, 'google.com': 1, direct: 1, newsletter: 1 });
assert.equal(fs.statSync(path.join(traffic, 'state.json')).mode & 0o777, 0o600, 'state for its owner only');

// A second pass reads nothing again; new lines count from where it was (A again: a view, not a visitor).
await pass(opts);
assert.deepEqual(read(names[0]), first, 'nothing counted twice');
append(line({ ts: t0 + 20, ip: A, uri: '/privacy' }));
await pass(opts);
const more = read(names[0]);
assert.deepEqual([more.views, more.visitors, more.pages], [5, 3, { '/': 4, '/privacy': 1 }]);

// A line still being written waits for the rest of it.
const whole = line({ ts: t0 + 30, ip: '10.1.0.4', uri: '/?ref=ig' });
append(whole.slice(0, 60));
await pass(opts);
assert.equal(read(names[0]).views, 5);
append(whole.slice(60));
await pass(opts);
assert.deepEqual([read(names[0]).views, read(names[0]).sources.ig, read(names[0]).visitors], [6, 1, 4]);

// A log cut short is read from its start; one rolled (renamed, a new file in its place) too, after the old file's rest.
fs.writeFileSync(log, line({ ts: t0 + 40, ip: C, uri: '/?ref=tg' }));
await pass(opts);
assert.deepEqual([read(names[0]).views, read(names[0]).sources.tg, read(names[0]).visitors], [7, 1, 4], 'a truncated log');
const inode = state().inode;
append(line({ ts: t0 + 45, ip: C, uri: '/?ref=tg' }));
fs.renameSync(log, `${log}.1`);
append(line({ ts: t0 + 50, ip: C, uri: '/?ref=tg' }));
await pass(opts);
assert.notEqual(state().inode, inode);
assert.deepEqual([read(names[0]).views, read(names[0]).sources.tg], [9, 3], 'a rolled log, with the rest of the old file');

// The next day, by the line's time: the first day stays as it was, the visitors start again, and a late line of the first day is dropped.
const before = read(names[0]);
const t1 = noon(d1);
append(line({ ts: t1, ip: A }), line({ ts: t1 + 1, ip: A }), line({ ts: t0 + 60, ip: B }), line({ ts: t1 + 2, ip: B, uri: '/assets/index-abc.js', type: 'text/javascript' }));
await pass(opts);
assert.deepEqual(read(names[0]), before);
const second = read(names[1]);
assert.deepEqual([second.views, second.visitors, second.steps], [2, 1, { view: 1, script: 1, beacon: 0, socket: 0 }]);
assert.equal(state().today, names[1]);
// The hours of a day: counts by hour, and each visitor as a hash with the steps they got to; the same visitor has the same hash on another day (the salt lasts SERVER.saltDays), not their address.
const hours = JSON.parse(fs.readFileSync(path.join(traffic, `hours-${names[0]}.json`), 'utf8'));
const hours1 = JSON.parse(fs.readFileSync(path.join(traffic, `hours-${names[1]}.json`), 'utf8'));
assert.deepEqual(Object.keys(hours), ['12']);
assert.deepEqual([hours[12].views, hours[12].bots, Object.keys(hours[12].seen).length], [before.views, before.bots, before.steps.view + 1], 'the views of the day; the visitor of a script alone is in too');
assert.deepEqual([hours1[12].views, Object.keys(hours1[12].seen).length], [2, 2], 'a visitor and the script of another');
assert.ok(Object.keys(hours[12].seen).some((id) => id in hours1[12].seen), 'one salt for both days');
assert.equal(fs.statSync(path.join(traffic, `hours-${names[0]}.json`)).mode & 0o777, 0o600, 'hours for their owner only');

// A day names at most SERVER.trafficKinds sources, then Other.
append(...Array.from({ length: SERVER.trafficKinds + 10 }, (_, i) => line({ ts: t1 + 100 + i, ip: `10.5.0.${i}`, uri: `/?ref=r${i}` })));
await pass(opts);
const crowd = read(names[1]).sources;
assert.equal(Object.keys(crowd).length, SERVER.trafficKinds + 1);
assert.equal(crowd.Other, 10 + 1, 'the rest');

// The day over (the clock is past it): the first pass after midnight drops its visitors from the state, and the file stays.
assert.equal(state().today, names[1]);
const ended = read(names[1]);
clock(Date.now() / 1000 + 864e3);
await pass(opts);
assert.equal(state().today, null, 'the day is over');
assert.deepEqual(read(names[1]), ended);
// A late line of that day starts it again from nothing: the file keeps what it had, being the bigger.
append(line({ ts: t1 + 300, ip: '10.6.0.1' }));
await pass(opts);
assert.deepEqual(read(names[1]), ended, 'a smaller recount does not replace the day');
clock(t1 + 1000);

// No address or browser name in anything written.
for (const name of fs.readdirSync(traffic)) {
  const text = fs.readFileSync(path.join(traffic, name), 'utf8');
  assert.ok(!/10\.\d+\.\d+\.\d+|Firefox|Chrome|Googlebot|curl|Opera/.test(text), `no address or browser in ${name}`);
}

// State lost: the log is read again from its start, and a day that has a file keeps the fuller of that and the recount.
const full = read(names[0]);
fs.rmSync(path.join(traffic, 'state.json'));
fs.writeFileSync(log, line({ ts: t0, ip: A }));
clock(t0 + 100);
await pass(opts);
assert.deepEqual(read(names[0]), full, 'a day with a file is not cut down to a recount');
fs.rmSync(path.join(traffic, 'state.json'));
fs.writeFileSync(log, Array.from({ length: full.views + 1 }, (_, i) => line({ ts: t0 + i, ip: `10.7.0.${i}` })).join(''));
await pass(opts);
assert.equal(read(names[0]).views, full.views + 1, 'a recount that is fuller replaces it');
clock(Date.now() / 1000 + 864e3);

// Past SERVER.trafficHourSeen visitors in an hour the rest are not remembered, but their views count.
fs.rmSync(traffic, { recursive: true });
fs.writeFileSync(log, Array.from({ length: 6 }, (_, i) => line({ ts: t0 + i, ip: `10.7.1.${i}` })).join(''));
clock(t0 + 100);
SERVER.trafficHourSeen = 3;
await pass(opts);
SERVER.trafficHourSeen = 10000;
assert.deepEqual([read(names[0]).views, read(names[0]).visitors, Object.keys(read(names[0]).steps).length], [6, 3, 4]);

// A state and a day written before the hours were kept (the day's hashes in `today`, no salt) still load: the day goes on from its file.
fs.rmSync(traffic, { recursive: true });
fs.mkdirSync(traffic);
fs.writeFileSync(log, line({ ts: t0, ip: A }));
fs.writeFileSync(path.join(traffic, `${names[0]}.json`), JSON.stringify({ views: 5, visitors: 4, bots: 0, pages: { '/': 5 }, sources: { direct: 5 }, campaigns: {}, countries: {}, steps: { view: 4, script: 2, beacon: 0, socket: 0 } }));
fs.writeFileSync(path.join(traffic, 'state.json'), JSON.stringify({ inode: fs.statSync(log).ino, offset: fs.statSync(log).size, today: { name: names[0], salt: 'old', seen: { view: ['a', 'b', 'c', 'd'], script: ['a', 'b'], beacon: [], socket: [] } } }));
append(line({ ts: t0 + 5, ip: B }));
await pass(opts);
const carried = read(names[0]);
assert.deepEqual([carried.views, carried.visitors, carried.steps.script, state().today, typeof state().salt.key], [6, 4, 2, names[0], 'string'], 'the day goes on from its file');
// The salt is replaced once it is SERVER.saltDays old.
const salt = state().salt;
clock(t0 + 100 + SERVER.saltDays * 864e2 + 10);
fs.writeFileSync(path.join(traffic, 'state.json'), JSON.stringify({ ...state(), salt: { ...salt, since: Date.now() - SERVER.saltDays * 864e5 - 1000 } }));
await pass(opts);
assert.notEqual(state().salt.key, salt.key);
clock(t0 + 100);

// Hours files past SERVER.historyDays are deleted by a pass.
const oldDay = new Date(Date.now() - (SERVER.historyDays + 2) * 864e5).toISOString().slice(0, 10);
fs.writeFileSync(path.join(traffic, `hours-${oldDay}.json`), '{}');
await pass(opts);
assert.ok(!fs.existsSync(path.join(traffic, `hours-${oldDay}.json`)), 'old hours deleted');

// Without TRAFFIC_HOSTS every host counts.
fs.rmSync(traffic, { recursive: true });
fs.writeFileSync(log, line({ ts: t0, ip: A, host: 'one.example' }) + line({ ts: t0 + 1, ip: B, host: 'Two.example:443' }));
clock(t0 + 100);
await pass({ ...opts, hosts: [] });
assert.equal(read(names[0]).views, 2);

// A returning visitor's page is a 304 with no type: a view for a page path, not for a file or an asset. An IPv6 visitor is its /64.
append(
  line({ ts: t0 + 10, ip: '10.8.0.1', status: 304, type: null }),
  line({ ts: t0 + 11, ip: '10.8.0.1', uri: '/privacy.html', status: 304, type: null }),
  line({ ts: t0 + 12, ip: '10.8.0.1', uri: '/favicon.ico', status: 304, type: null }),
  line({ ts: t0 + 13, ip: '10.8.0.1', uri: '/assets/index-abc.css', status: 304, type: null }),
  line({ ts: t0 + 14, ip: '10.8.0.1', method: 'POST', status: 304, type: null }),
  line({ ts: t0 + 15, ip: '2001:db8:1:2:aaaa::1' }),
  line({ ts: t0 + 16, ip: '2001:db8:1:2:bbbb::2' }),
  line({ ts: t0 + 17, ip: '2001:db8:1:3::1' }),
);
await pass({ ...opts, hosts: [] });
const back = read(names[0]);
assert.deepEqual([back.views, back.pages, back.visitors], [7, { '/': 6, '/privacy.html': 1 }, 5], 'a 304 for a page is a view; two addresses of a /64 are one visitor');
Date.now = realNow;

// GET /traffic: the days with a file, oldest first.
fs.writeFileSync(path.join(traffic, 'not-a-day.json'), '{}');
const server = await start({ ADMIN_KEY: 'test-key', DATA_DIR: dir });
const api = async (at: string, headers: Record<string, string> = { authorization: 'Bearer test-key' }) => {
  const res = await fetch(`http://localhost:${server.adminPort}${at}`, { headers });
  return { status: res.status, body: await res.json() };
};
try {
  fs.writeFileSync(path.join(traffic, `${names[1]}.json`), JSON.stringify(second));
  fs.writeFileSync(path.join(traffic, `${new Date().toISOString().slice(0, 10)}.json`), '{"views":');
  const all = await api('/traffic?days=3');
  assert.deepEqual(all.body.days.map((d: { day: string }) => d.day), names);
  assert.deepEqual(Object.keys(all.body.days[1]), ['day', 'views', 'visitors', 'bots', 'pages', 'sources', 'campaigns', 'countries', 'steps']);
  assert.deepEqual((await api('/traffic?days=2')).body.days.map((d: { day: string }) => d.day), [names[1]], 'only the last two days');
  assert.deepEqual((await api('/traffic')).body.days.length, 2, '30 days by default');
  assert.deepEqual((await api('/traffic?days=1')).body, { days: [] }, 'a day whose file does not read is left out');
  for (const bad of ['0', '367', 'x', '-1', '1.5', '']) assert.equal((await api(`/traffic?days=${bad}`)).status, 400, `days=${bad}`);
  assert.equal((await api('/traffic', { authorization: 'Bearer no' })).status, 401);

  // ?period=: the hours of the last 24 h, 7 or 30 days (or today's), each visitor once over it, at the steps they reached.
  for (const name of fs.readdirSync(traffic)) if (name.startsWith('hours-')) fs.rmSync(path.join(traffic, name));
  const [nowHour, nowDay] = [new Date().getUTCHours(), new Date().toISOString().slice(0, 10)];
  const put = (day: string, h: Record<number, object>) => fs.writeFileSync(path.join(traffic, `hours-${day}.json`), JSON.stringify(h));
  const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  // Visitors a to d; a is 1 (a view), b 3 (view, script), c 15 (all four), d 1.
  put(nowDay, { [nowHour]: { views: 5, bots: 1, seen: { a: 1, b: 3 } } });
  put(ago(3), { 12: { views: 2, bots: 0, seen: { a: 1, c: 15 } } });
  put(ago(6), { 12: { views: 1, bots: 2, seen: { c: 1, d: 1 } } });
  put(ago(40), { 12: { views: 100, bots: 100, seen: { z: 1 } } });
  const hour = (n: number) => new Date(Math.floor(Date.now() / 36e5) * 36e5 - n * 36e5).toISOString();
  const today = (await api('/traffic?period=today')).body;
  assert.deepEqual(today, { period: 'today', from: today.from, to: today.to, views: 5, bots: 1, visitors: 2, steps: { view: 2, script: 1, beacon: 0, socket: 0 } });
  const week = (await api('/traffic?period=7d')).body;
  assert.deepEqual([week.views, week.bots, week.visitors, week.steps], [8, 3, 4, { view: 4, script: 2, beacon: 1, socket: 1 }], 'a once over the week, c at every step');
  assert.equal(week.from, hour(7 * 24 - 1), 'the week starts 168 hours back, this one included');
  assert.ok(Math.abs(Date.parse(week.to) - Date.now()) < 5000);
  const month = (await api('/traffic?period=30d')).body;
  assert.deepEqual([month.views, month.visitors, month.from], [8, 4, hour(30 * 24 - 1)], 'the file of 40 days ago is out of the period');
  assert.equal((await api('/traffic?period=24h')).body.views >= 5, true);
  // The hours begin after the period does: from is when they begin.
  fs.rmSync(path.join(traffic, `hours-${ago(40)}.json`));
  fs.rmSync(path.join(traffic, `hours-${ago(6)}.json`));
  assert.equal(Date.parse((await api('/traffic?period=30d')).body.from), Date.parse(`${ago(3)}T12:00:00Z`), 'the first hour with traffic of the oldest day');
  assert.equal((await api('/traffic?period=week')).status, 400);
  assert.deepEqual(Object.keys((await api('/traffic?days=1')).body), ['days'], '?days is as it was');
  console.log('GET /traffic', JSON.stringify(all.body.days[0]));
} finally {
  server.stop();
}
const bare = await start({ ADMIN_KEY: 'test-key' });
try {
  const res = await fetch(`http://localhost:${bare.adminPort}/traffic`, { headers: { authorization: 'Bearer test-key' } });
  assert.deepEqual(await res.json(), { days: [] }, 'without DATA_DIR');
  const none = await (await fetch(`http://localhost:${bare.adminPort}/traffic?period=7d`, { headers: { authorization: 'Bearer test-key' } })).json();
  assert.deepEqual([none.views, none.bots, none.visitors, none.steps], [0, 0, 0, { view: 0, script: 0, beacon: 0, socket: 0 }]);
} finally {
  bare.stop();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log('traffic: ok (views, pages, sources in their order, bots, visitors, the funnel, resuming, a partial line, truncation and rotation, the day changing and ending, a lost state, 304 pages, IPv6, no address or browser kept, the hours and periods, an old state, GET /traffic)');
