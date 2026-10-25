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

const A = '10.1.0.1';
const B = '10.1.0.2';
const C = '10.9.0.3';
const t0 = noon(d0);
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

// A log cut short, and one replaced by a new file (another inode), is read from its start.
fs.writeFileSync(log, line({ ts: t0 + 40, ip: C, uri: '/?ref=tg' }));
await pass(opts);
assert.deepEqual([read(names[0]).views, read(names[0]).sources.tg, read(names[0]).visitors], [7, 1, 4], 'a truncated log');
const inode = state().inode;
fs.renameSync(log, `${log}.1`);
append(line({ ts: t0 + 50, ip: C, uri: '/?ref=tg' }));
await pass(opts);
assert.notEqual(state().inode, inode);
assert.deepEqual([read(names[0]).views, read(names[0]).sources.tg], [8, 2], 'a rotated log');

// The next day, by the line's time: the first day stays as it was, the visitors start again, and a late line of the first day is dropped.
const before = read(names[0]);
const t1 = noon(d1);
append(line({ ts: t1, ip: A }), line({ ts: t1 + 1, ip: A }), line({ ts: t0 + 60, ip: B }), line({ ts: t1 + 2, ip: B, uri: '/assets/index-abc.js', type: 'text/javascript' }));
await pass(opts);
assert.deepEqual(read(names[0]), before);
const second = read(names[1]);
assert.deepEqual([second.views, second.visitors, second.steps], [2, 1, { view: 1, script: 1, beacon: 0, socket: 0 }]);
assert.equal(state().today.name, names[1]);
assert.equal(state().today.seen.view.length, 1);

// A day names at most SERVER.trafficKinds sources, then Other.
append(...Array.from({ length: SERVER.trafficKinds + 10 }, (_, i) => line({ ts: t1 + 100 + i, ip: `10.5.0.${i}`, uri: `/?ref=r${i}` })));
await pass(opts);
const crowd = read(names[1]).sources;
assert.equal(Object.keys(crowd).length, SERVER.trafficKinds + 1);
assert.equal(crowd.Other, 10 + 1, 'the rest');

// No address or browser name in anything written.
for (const name of fs.readdirSync(traffic)) {
  const text = fs.readFileSync(path.join(traffic, name), 'utf8');
  assert.ok(!/10\.\d+\.\d+\.\d+|Firefox|Chrome|Googlebot|curl|Opera/.test(text), `no address or browser in ${name}`);
}

// Without TRAFFIC_HOSTS every host counts.
fs.rmSync(traffic, { recursive: true });
fs.writeFileSync(log, line({ ts: t0, ip: A, host: 'one.example' }) + line({ ts: t0 + 1, ip: B, host: 'Two.example:443' }));
await pass({ ...opts, hosts: [] });
assert.equal(read(names[0]).views, 2);

// GET /traffic: the days with a file, oldest first.
fs.writeFileSync(path.join(traffic, 'not-a-day.json'), '{}');
const server = await start({ ADMIN_KEY: 'test-key', DATA_DIR: dir });
const api = async (at: string, headers: Record<string, string> = { authorization: 'Bearer test-key' }) => {
  const res = await fetch(`http://localhost:${server.adminPort}${at}`, { headers });
  return { status: res.status, body: await res.json() };
};
try {
  fs.writeFileSync(path.join(traffic, `${names[1]}.json`), JSON.stringify(second));
  const all = await api('/traffic?days=3');
  assert.deepEqual(all.body.days.map((d: { day: string }) => d.day), names);
  assert.deepEqual(Object.keys(all.body.days[1]), ['day', 'views', 'visitors', 'bots', 'pages', 'sources', 'campaigns', 'countries', 'steps']);
  assert.deepEqual((await api('/traffic?days=2')).body.days.map((d: { day: string }) => d.day), [names[1]], 'only the last two days');
  assert.deepEqual((await api('/traffic')).body.days.length, 2, '30 days by default');
  assert.deepEqual((await api('/traffic?days=1')).body, { days: [] }, 'a day with no file is left out');
  for (const bad of ['0', '367', 'x', '-1', '1.5', '']) assert.equal((await api(`/traffic?days=${bad}`)).status, 400, `days=${bad}`);
  assert.equal((await api('/traffic', { authorization: 'Bearer no' })).status, 401);
  console.log('GET /traffic', JSON.stringify(all.body.days[0]));
} finally {
  server.stop();
}
const bare = await start({ ADMIN_KEY: 'test-key' });
try {
  const res = await fetch(`http://localhost:${bare.adminPort}/traffic`, { headers: { authorization: 'Bearer test-key' } });
  assert.deepEqual(await res.json(), { days: [] }, 'without DATA_DIR');
} finally {
  bare.stop();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log('traffic: ok (views, pages, sources in their order, bots, visitors, the funnel, resuming, a partial line, truncation and rotation, the day changing, no address or browser kept, GET /traffic)');
