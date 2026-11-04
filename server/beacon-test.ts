import './headless';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { NET, SERVER } from '../src/config';
import { PICKUP_CODES } from '../src/inventory/items';
import { beacon, site } from './beacon';
import { addClient, bin, countSetting, noClient, type ClientCounts } from './client-counts';
import { noPaint } from './counts';
import { people } from './people';
import { start } from './test-kit';

// The game's beacon (beacon.ts, beacon-body.ts, client-counts.ts), against the built server: what it runs on, load and
// join times, frames, errors, then the game's events (funnel and tutorial steps, counts, seconds, settings); a body that
// isn't one is refused whole; Other past SERVER.beaconKinds names; an hour saved on disk loads; /stats/client,
// and /events's `pages`: who is on the site now, and what they do. npm run test:server runs it.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-beacon-'));
// An hour saved by an earlier run, the hour before this one: beacons, no events yet.
const before = Date.now() - 3600e3;
/** An hour as history.ts saves it, with `plays` and these beacon counts. */
const savedHour = (plays: number, client: Partial<ClientCounts>) => ({ plays, seconds: 0, withOthers: 0, turnedAway: {}, ...noPaint(), peak: null, client: { ...noClient(), ...client } });
fs.mkdirSync(path.join(dir, 'stats'));
fs.writeFileSync(
  path.join(dir, 'stats', `${new Date(before).toISOString().slice(0, 10)}.json`),
  JSON.stringify({ hours: { [new Date(before).getUTCHours()]: savedHour(0, { n: 2, nGpu: 1, browsers: { Chrome: 2 }, os: { Windows: 2 }, gpus: { 'GPU old': 1 }, fps: { 60: 2 }, low1: { 40: 2 }, load: { 3: 2 }, errors: 1, erred: 1, messages: { 'old error': 1 } }) } }),
);
// An old day (past SERVER.historyDays): it is folded to its total at start.
const old = new Date(Date.now() - (SERVER.historyDays + 10) * 864e5).toISOString().slice(0, 10);
fs.writeFileSync(path.join(dir, 'stats', `${old}.json`), JSON.stringify({ hours: { 3: savedHour(1, { n: 1, browsers: { Chrome: 1 } }) } }));
const main = await start({ ADMIN_KEY: 'test-key', DATA_DIR: dir });
try {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  let games = 0;
  /** A beacon from a new address each time (SERVER.beaconsPerIp a minute from one). */
  const send = (body: unknown, ip = `10.3.0.${++games}`) =>
    fetch(`http://localhost:${main.port}/ws?e`, { method: 'POST', headers: { 'user-agent': ua, 'x-forwarded-for': ip }, body: JSON.stringify(body) }).then((r) => r.status);
  const history = async () => {
    for (let i = 0; ; i++) {
      try {
        const { period, from, to, before, ...figures } = await (await fetch(`http://localhost:${main.adminPort}/stats/client?period=24h`, { headers: { authorization: 'Bearer test-key' } })).json();
        return figures;
      } catch (e) {
        if (i > 100) throw e;
        await new Promise((w) => setTimeout(w, 50));
      }
    }
  };
  /** `pages` in the first status of the event stream, as the site() of the server is. */
  const onSite = async () => {
    const res = await fetch(`http://localhost:${main.adminPort}/events`, { headers: { authorization: 'Bearer test-key' } });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let text = '';
    while (!/event: status\ndata: (.*)\n\n/.test(text)) text += (await reader.read()).value ?? '';
    void reader.cancel();
    return JSON.parse(/event: status\ndata: (.*)\n\n/.exec(text)![1]).pages;
  };

  /** The pages by their beat, without what they do. */
  const flat = ({ by, ...top }: ReturnType<typeof site>) => top;
  const folded = JSON.parse(fs.readFileSync(path.join(dir, 'stats', `${old}.json`), 'utf8')).total;
  assert.deepEqual([folded.plays, folded.client.n, folded.client.browsers, folded.client.events.counts], [1, 1, { Chrome: 1 }, {}], 'an old day folds');

  // The saved hour loads: no events, the errors by message.
  assert.deepEqual((await history()).events, { steps: { play: 0, ready: 0, sprayed: 0, joined: 0 }, tutorial: {}, counts: {}, seconds: { playing: 0, idle: 0, menu: 0 }, settings: {}, pickups: PICKUP_CODES });
  assert.deepEqual((await history()).errors, { count: 1, plays: 1, byMessage: { 'old error': 1 } });
  assert.deepEqual(flat(await onSite()), { menu: 0, solo: 0, session: 0, hidden: 0 });

  // A beacon of the first version: no events, no beat.
  assert.equal(await send({ first: { gpu: 'NVIDIA GeForce RTX 3060', load: 3.1 } }), 204);
  assert.equal(await send({ fps: { avg: 58.2, low1: 31 }, joins: [0.6], errors: ['WebGL context lost'], erred: true }), 204);
  assert.equal(await send({ fps: { avg: 'fast' } }), 400);
  assert.equal(await send({ errors: ['x'.repeat(1000)] }), 400);
  assert.deepEqual((await history()).events.counts, {});
  assert.deepEqual(flat(await onSite()), { menu: 0, solo: 0, session: 0, hidden: 0 });

  // Beacons with the events.
  assert.equal(await send({ beat: 'menu', first: { gpu: null, load: 1.2, settings: { detail: 'high', music: 'on', volume: '0.5' } }, steps: ['play', 'ready'], tutorial: ['move', 'look'], counts: { jump: 3, 'pickup.can': 1 }, seconds: { playing: 12.3, idle: 4, menu: 1.1 } }), 204);
  assert.equal(await send({ beat: 'menu', first: { gpu: null, load: 1.2, settings: { detail: 'low', music: 'on' } }, fps: { avg: 59.6, low1: 41 }, steps: ['play', 'sprayed'], tutorial: ['move'], counts: { jump: 2, fall: 1 }, seconds: { playing: 30.2 } }), 204);
  assert.equal(await send({ beat: 'solo' }), 204);
  assert.equal(await send({ beat: 'session', steps: ['joined', 'joined'], counts: { 'setting.detail': 1 }, net: { seconds: 58.2, ping: { p50: 64, p95: 121, max: 900 }, drops: { 1006: 1 }, back: [2.4], stalls: 2, stallLong: [3.1, 1.6], down: 37, up: 2 } }), 204);
  assert.equal(await send({ beat: 'hidden', seconds: {} }), 204);
  const client = await history();
  assert.deepEqual(client, {
    n: 5, nGpu: 2,
    fps: { 58: 1, 60: 3 },
    low1: { 31: 1, 40: 2, 41: 1 },
    load: { 1.2: 2, 3: 2, 3.1: 1 },
    join: { 0.6: 1 },
    browsers: { Chrome: 5 }, os: { Windows: 5 }, gpus: { 'GPU old': 1, 'NVIDIA GeForce RTX 3060': 1 },
    errors: { count: 2, plays: 2, byMessage: { 'old error': 1, 'WebGL context lost': 1 } },
    events: {
      steps: { play: 2, ready: 1, sprayed: 1, joined: 1 },
      tutorial: { move: 2, look: 1 },
      counts: { jump: 5, 'pickup.can': 1, fall: 1, 'setting.detail': 1 },
      seconds: { playing: 42.5, idle: 4, menu: 1.1 },
      settings: { detail: { high: 1, low: 1 }, music: { on: 2 }, volume: { '0.5': 1 } },
      pickups: PICKUP_CODES,
    },
    net: { minutes: 1, ping50: { 60: 1 }, ping95: { 120: 1 }, pingMax: { 900: 1 }, drops: { 1006: 1 }, back: { 2.4: 1 }, stalls: 2, stallLong: { 3.1: 1, 1.6: 1 }, down: { 37: 1 }, up: { 2: 1 } },
  });
  console.log('client', JSON.stringify(client));
  const now = await onSite();
  assert.deepEqual(flat(now), { menu: 2, solo: 1, session: 1, hidden: 1 });
  // Beacons of this game say nothing of what the page does: an older game's pages, playing unless in the menu or hidden.
  assert.deepEqual(now.by, { playing: { session: 1, alone: 1 }, idle: { session: 0, alone: 0 }, menu: { session: 0, alone: 2 }, hidden: { session: 0, alone: 1 } });
  console.log('site', JSON.stringify(now));

  // A body that isn't one is refused whole: nothing of it is counted, not even its beat.
  const many = (value: unknown, n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, value]));
  const wrong: Record<string, unknown>[] = [
    { beat: 'lobby' }, { beat: 1 }, { beat: null }, { doing: 'sleeping' }, { doing: 1 }, { doing: null },
    { first: { gpu: null, load: 1, settings: [] } },
    { first: { gpu: null, load: 1, settings: null } },
    { first: { gpu: null, load: 1, settings: { Detail: 'high' } } },
    { first: { gpu: null, load: 1, settings: { 'a b': 'high' } } },
    { first: { gpu: null, load: 1, settings: { detail: 5 } } },
    { first: { gpu: null, load: 1, settings: { detail: 'x'.repeat(SERVER.beaconText + 1) } } },
    { first: { gpu: null, load: 1, settings: many('on', SERVER.beaconKinds + 1) } },
    { steps: ['dance'] }, { steps: 'play' }, { steps: Array(NET.beaconList + 1).fill('play') },
    { tutorial: ['Move'] }, { tutorial: [''] }, { tutorial: ['a'.repeat(41)] }, { tutorial: [3] }, { tutorial: 'move' }, { tutorial: Array(NET.beaconList + 1).fill('move') },
    { counts: [] }, { counts: null }, { counts: { jump: 0 } }, { counts: { jump: 1.5 } }, { counts: { jump: SERVER.beaconMostEvents + 1 } }, { counts: { jump: '1' } },
    { counts: { Jump: 1 } }, { counts: { 'a b': 1 } }, { counts: { ['a'.repeat(41)]: 1 } }, { counts: { '': 1 } }, { counts: many(1, SERVER.beaconKinds + 1) },
    { net: { seconds: 1, down: 0 } }, { net: { seconds: 1, down: 0, up: 0, ping: { p50: 1, p95: 2 } } }, { net: { seconds: 1, down: 0, up: 0, ping: { p50: 1, p95: 2, max: SERVER.beaconMostPing + 1 } } },
    { net: { seconds: 1, down: 0, up: 0, drops: { 1006: 0 } } }, { net: { seconds: 1, down: 0, up: 0, back: Array(NET.beaconList + 1).fill(1) } }, { net: { seconds: 1, down: 0, up: 0, stalls: 1.5 } }, { net: { seconds: 1, down: 0, up: 0, stalls: -1 } }, { net: [] },
    { seconds: { playing: -1 } }, { seconds: { playing: SERVER.beaconMostSeconds + 1 } }, { seconds: { playing: '3' } }, { seconds: { sleeping: 1 } }, { seconds: [] }, { seconds: null },
  ];
  for (const body of wrong) assert.equal(await send({ beat: 'menu', ...body }), 400, JSON.stringify(body).slice(0, 80));
  assert.deepEqual(await onSite(), now, 'refused beacons are not on the site');
  assert.equal(await send({ net: { seconds: 0, down: 0, up: 0, stalls: 0 } }), 204, 'a minute with no stalls');
  assert.deepEqual((await history()).events, client.events, 'nor counted');

  // The first message's device id makes a player: once by device and once by address, over the period; a bad one refuses the body.
  const players = async () => {
    const h = await (await fetch(`http://localhost:${main.adminPort}/stats/people?period=24h`, { headers: { authorization: 'Bearer test-key' } })).json();
    return [h.players, h.inSessions];
  };
  const [d1, d2] = ['1'.repeat(32), '2'.repeat(32)];
  const [before1, joined] = await players();
  assert.equal(await send({ first: { gpu: null, load: 1, device: d1 } }, '10.4.0.1'), 204);
  assert.equal(await send({ first: { gpu: null, load: 1, device: d1 } }, '10.4.0.2'), 204);
  assert.equal(await send({ first: { gpu: null, load: 1, device: d1 } }, '10.4.0.1'), 204);
  assert.equal(await send({ first: { gpu: null, load: 1, device: d2 } }, '10.4.0.2'), 204);
  assert.equal(await send({ first: { gpu: null, load: 1 } }, '10.4.0.3'), 204);
  const [reached, inSessions] = await players();
  assert.deepEqual([reached.device - before1.device, reached.address - before1.address], [2, 3], 'two devices, three addresses; the same page twice in an hour is one');
  assert.deepEqual(inSessions, joined, 'a page that reached the level did not join');
  for (const device of ['x', 5, 'A'.repeat(32), '1'.repeat(33)]) assert.equal(await send({ first: { gpu: null, load: 1, device } }), 400, String(device));

  // The days the game keeps on the device (first, and the day before today: each none or a day up to tomorrow) make the day's row; a bad one refuses the body.
  {
    const today = Math.floor(Date.now() / 864e5);
    const [d3, d4, d5, d6] = ['3', '4', '5', '6'].map((c) => c.repeat(32));
    const days = (device: string, days: unknown) => send({ first: { gpu: null, load: 1, device, days } });
    assert.equal(await days(d3, { first: today - 3, prev: today - 1 }), 204);
    assert.equal(await days(d4, { first: today, prev: null }), 204);
    assert.equal(await days(d5, { first: null, prev: today - 2 }), 204);
    assert.equal(await days(d6, { first: today + 1, prev: null }), 204, 'tomorrow, for a clock ahead');
    for (const bad of [5, [], null, {}, { first: 1 }, { prev: 1 }, { first: -1, prev: null }, { first: 1.5, prev: null }, { first: 'x', prev: null }, { first: today + 2, prev: null }, { first: null, prev: today + 2 }]) assert.equal(await days(d3, bad), 400, JSON.stringify(bad));
    const { days: rows } = await (await fetch(`http://localhost:${main.adminPort}/stats/people/days`, { headers: { authorization: 'Bearer test-key' } })).json();
    const row = rows.at(-1);
    assert.deepEqual([row.day, row.ages, row.gaps, row.gapsNone, row.unknownGaps, row.unknownGapsNone, row.unmatched, row.newPlayers, row.returningPlayers, row.unknownPlayers], [new Date(today * 864e5).toISOString().slice(0, 10), { 0: 1, 3: 1 }, { 1: 1 }, 1, { 2: 1 }, 1, 2, 1, 1, 4]);
  }

  // The most is fine: an empty body, the limits.
  assert.equal(await send({}), 204);
  assert.equal(await send({ counts: { 'a-b.c9': SERVER.beaconMostEvents }, seconds: { idle: SERVER.beaconMostSeconds }, tutorial: Array(NET.beaconList).fill('done'), steps: ['play', 'ready', 'sprayed', 'joined'], first: { gpu: null, load: 1, settings: { detail: 'x'.repeat(SERVER.beaconText) } } }), 204);
  assert.equal(await send({ counts: many(1, SERVER.beaconKinds) }), 204);
  // Past SERVER.beaconKinds names a code is Other: five of the many, then these two.
  assert.equal(await send({ counts: { other1: 2, other2: 3 }, tutorial: ['late'] }), 204);
  const after = (await history()).events;
  assert.deepEqual([after.counts.Other, Object.keys(after.counts).length], [10, SERVER.beaconKinds + 1]);
  assert.equal(after.tutorial.done, 1, 'a step once a page load');
  assert.equal(after.seconds.idle, SERVER.beaconMostSeconds + 4);

  // Per address a minute.
  const codes = new Set<number>();
  for (let i = 0; i < SERVER.beaconsPerIp + 2; i++) codes.add(await send({}, '10.4.0.1'));
  assert.deepEqual([...codes], [204, 429]);

  // An IPv6 address is limited by its /64.
  const v6 = new Set<number>();
  for (let i = 0; i < SERVER.beaconsPerIp + 2; i++) v6.add(await send({}, `2001:db8:1:2::${i + 1}`));
  assert.deepEqual([...v6], [204, 429]);

  // Histograms have a bounded number of bins: a top bin takes the rest; KB/s to two significant digits.
  assert.equal(await send({ fps: { avg: 1000, low1: 3 }, joins: [599.9], net: { seconds: 1, ping: { p50: 9000, p95: 9000, max: 9000 }, down: 12345, up: 99999 } }), 204);
  {
    const c = await history();
    assert.deepEqual([c.fps[bin.fps(1000)], c.join[bin.tenth(599.9)], c.net.pingMax[bin.tenMs(9000)], c.net.down['12000'], c.net.up['100000']], [1, 1, 1, 1, 1]);
    assert.deepEqual([bin.fps(1000), bin.tenth(599.9), bin.tenMs(9000), bin.rate(0), bin.rate(37), bin.rate(123), bin.rate(98765)], [String(SERVER.beaconBinFps), String(SERVER.beaconBinSeconds), String(SERVER.beaconBinPing), '0', '37', '120', '99000']);
  }

  // Hours add up with the biggest names kept: a common name that comes after the first SERVER.beaconKinds is not lost to Other.
  const hour = (names: Record<string, number>) => Object.assign(noClient(), { gpus: names, events: { ...noClient().events, counts: names, settings: { zoom: names } } });
  const first = Object.fromEntries(Array.from({ length: SERVER.beaconKinds }, (_, i) => [`small${i}`, 1 + (i % 2)]));
  const sums = noClient();
  addClient(sums, hour(first));
  addClient(sums, hour({ common: 40, small0: 1 }));
  addClient(sums, hour({ rare: 1 }));
  for (const names of [sums.gpus, sums.events.counts, sums.events.settings.zoom]) {
    assert.equal(names.common, 40, 'a big name is named');
    assert.equal(Object.keys(names).length, SERVER.beaconKinds + 1);
    assert.equal(names.Other, 2, 'the two smallest folded');
    assert.equal(names.small1, 2);
    assert.equal(Object.values(names).reduce((a, b) => a + b, 0), 25 + 50 + 41 + 1, 'nothing lost');
  }

  // Past SERVER.beaconKinds settings, and values of one, are Other; the hours add up the same way.
  const c = noClient();
  for (let i = 0; i < SERVER.beaconKinds + 3; i++) (countSetting(c, `s${i}`, 'on'), countSetting(c, 'zoom', `v${i}`));
  assert.equal(Object.keys(c.events.settings).length, SERVER.beaconKinds + 1);
  assert.deepEqual(c.events.settings.Other, { on: 4 }, 'zoom took a place');
  assert.equal(Object.keys(c.events.settings.zoom).length, SERVER.beaconKinds + 1);
  assert.equal(c.events.settings.zoom.Other, 3);
  const total = noClient();
  addClient(total, c);
  addClient(total, c);
  assert.deepEqual([total.events.settings.Other, total.events.settings.zoom.Other, total.events.settings.s0], [{ on: 8 }, 6, { on: 2 }]);

  // New people from pages are limited an hour (SERVER.peoplePages); a JOIN is not, and a page that joins is both.
  {
    const was = SERVER.peoplePages;
    SERVER.peoplePages = 3;
    try {
      const count = () => people.count(0, Infinity);
      const [n0, j0] = [count().players.device, count().inSessions.device];
      for (let i = 0; i < 5; i++) people.played(`${i}`.repeat(32), '10.9.9.9', null, 'page');
      assert.equal(count().players.device - n0, 3);
      people.played('9'.repeat(32), '10.9.9.9', 'DE', 'join');
      people.played('0'.repeat(32), '10.9.9.9', 'FR', 'join');
      const c = count();
      assert.deepEqual([c.players.device - n0, c.inSessions.device - j0], [4, 2]);
      assert.equal(c.countries.FR, 1, 'a page without a country takes the next one');
    } finally {
      SERVER.peoplePages = was;
    }
  }

  // ... and from one address (its /64) at most SERVER.peoplePagesPerIp of them.
  {
    const was = SERVER.peoplePagesPerIp;
    SERVER.peoplePagesPerIp = 2;
    try {
      const n0 = people.count(0, Infinity).players.device;
      for (let i = 0; i < 5; i++) people.played('abcde'[i].repeat(32), `2001:db8:7:7::${i + 1}`, null, 'page');
      assert.equal(people.count(0, Infinity).players.device - n0, 2);
      people.played('f'.repeat(32), '10.9.8.7', null, 'page');
      assert.equal(people.count(0, Infinity).players.device - n0, 3, 'another address still counts');
    } finally {
      SERVER.peoplePagesPerIp = was;
    }
  }

  // Who is on the site: a beat counts for NET.beaconEvery s.
  const realNow = Date.now;
  try {
    const post = (body: unknown, at: number, ip = `10.5.0.${++games}`) => {
      Date.now = () => at;
      const req = Object.assign((async function* () { yield JSON.stringify(body); })(), { headers: {} });
      return beacon(req as unknown as http.IncomingMessage, ip, noClient);
    };
    const t = realNow() + 1e7;
    await post({ beat: 'solo' }, t);
    await post({ beat: 'solo' }, t + 20e3);
    await post({ beat: 'menu' }, t + 50e3);
    Date.now = () => t + 50e3;
    assert.deepEqual(flat(site()), { menu: 1, solo: 2, session: 0, hidden: 0 });
    Date.now = () => t + NET.beaconEvery * 1000 + 1e3;
    assert.deepEqual(flat(site()), { menu: 1, solo: 2, session: 0, hidden: 0 }, 'a late minute beacon still counts');
    Date.now = () => t + SERVER.beaconSiteSeconds * 1000 + 1e3;
    assert.deepEqual(flat(site()), { menu: 1, solo: 1, session: 0, hidden: 0 }, 'the first is gone');
    Date.now = () => t + 200e3;
    assert.deepEqual(flat(site()), { menu: 0, solo: 0, session: 0, hidden: 0 });
    assert.deepEqual(site().by.playing, { session: 0, alone: 0 }, 'and out of what they did');

    // At most SERVER.beaconIps addresses a minute: a new one past that is turned away, one already counted is not.
    const cap = SERVER.beaconIps;
    try {
      SERVER.beaconIps = 5; // three addresses are counted already
      const codes = [];
      for (let i = 0; i < 4; i++) codes.push(await post({}, t, `10.6.0.${i}`));
      codes.push(await post({}, t, '10.6.0.0'));
      assert.deepEqual(codes, [204, 204, 429, 429, 204]);
    } finally {
      SERVER.beaconIps = cap;
    }

    // A page counts once, by its id, whatever its beats: two pages beating every minute are 2 at every moment (the 90 s window
    // used to count a page twice for half of each minute), a page that changes what it does counts once.
    const total = () => Object.values(flat(site())).reduce((a, b) => a + b, 0);
    const u = t + 1e6;
    const [p1, p2] = [randomUUID(), randomUUID()];
    for (let s = 0; s <= 600; s += 5) {
      if (s % 60 === 0) await post({ page: p1, beat: s < 300 ? 'menu' : 'solo' }, u + s * 1e3);
      if (s % 60 === 30) await post({ page: p2, beat: 'session' }, u + s * 1e3);
      Date.now = () => u + s * 1e3;
      if (s >= 30) assert.equal(total(), 2, `2 pages at ${s} s`);
    }
    assert.deepEqual(flat(site()), { menu: 0, solo: 1, session: 1, hidden: 0 }, 'the first went from the menu to solo: counted once');
    // A page that is gone is counted until its window ends, or its goodbye comes.
    const v = u + 1e6;
    await post({ page: p1, beat: 'solo' }, v);
    await post({ page: p2, beat: 'hidden' }, v + 1e3);
    Date.now = () => v + 2e3;
    assert.equal(total(), 2);
    await post({ page: p1, bye: true, counts: { jump: 1 }, beat: 'solo' }, v + 3e3);
    assert.deepEqual(flat(site()), { menu: 0, solo: 0, session: 0, hidden: 1 }, 'a goodbye takes the page off at once, and wins over a beat');
    await post({ page: randomUUID(), bye: true }, v + 4e3);
    assert.equal(total(), 1, 'the goodbye of a page not counted changes nothing');
    await post({ page: p1, beat: 'solo' }, v + 5e3);
    assert.equal(total(), 2, 'a page back from the cache beats again');
    // The old game: no id, each beat is a page of its own.
    await post({ beat: 'menu' }, v + 6e3);
    await post({ beat: 'menu' }, v + 7e3);
    assert.deepEqual(flat(site()), { menu: 2, solo: 1, session: 0, hidden: 1 });
    // What the pages do (`doing`), each in a session or alone; an older game's beat has none: playing, unless it is in the menu or hidden. A hidden page stays where its last beat put it.
    const x = v + 1e6;
    const [a, b, c, d, e] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await post({ page: a, beat: 'solo', doing: 'playing' }, x);
    await post({ page: b, beat: 'session', doing: 'idle' }, x + 1e3);
    await post({ page: c, beat: 'session', doing: 'playing' }, x + 2e3);
    await post({ page: d, beat: 'menu', doing: 'menu' }, x + 3e3);
    await post({ page: e, beat: 'hidden', doing: 'hidden' }, x + 4e3);
    await post({ page: randomUUID(), beat: 'solo' }, x + 5e3);
    await post({ page: randomUUID(), beat: 'menu' }, x + 5e3);
    await post({ beat: 'hidden' }, x + 5e3);
    Date.now = () => x + 6e3;
    assert.deepEqual(site().by, { playing: { session: 1, alone: 2 }, idle: { session: 1, alone: 0 }, menu: { session: 0, alone: 2 }, hidden: { session: 0, alone: 2 } });
    await post({ page: b, beat: 'hidden', doing: 'hidden' }, x + 7e3);
    Date.now = () => x + 8e3;
    assert.deepEqual([flat(site()), site().by], [{ menu: 2, solo: 2, session: 1, hidden: 3 }, { playing: { session: 1, alone: 2 }, idle: { session: 0, alone: 0 }, menu: { session: 0, alone: 2 }, hidden: { session: 1, alone: 2 } }]);
    Date.now = () => x + 200e3;
    assert.deepEqual(site().by, { playing: { session: 0, alone: 0 }, idle: { session: 0, alone: 0 }, menu: { session: 0, alone: 0 }, hidden: { session: 0, alone: 0 } }, 'all gone');
    // A wrong id or goodbye refuses the whole body; the page list stays within SERVER.beaconPages.
    for (const body of [{ page: 'x' }, { page: 5 }, { page: p1.toUpperCase() }, { page: `${p1}0` }, { bye: false }, { bye: 'yes' }]) assert.equal(await post({ beat: 'menu', ...body }, v + 8e3), 400, JSON.stringify(body));
    const most = SERVER.beaconPages;
    try {
      SERVER.beaconPages = 3;
      for (let i = 0; i < 5; i++) await post({ page: randomUUID(), beat: 'hidden' }, v + 10e3 + i);
      Date.now = () => v + 11e3;
      assert.equal(total(), 3, 'at most beaconPages');
    } finally {
      SERVER.beaconPages = most;
    }
  } finally {
    Date.now = realNow;
  }
  console.log('beacon: ok (first-version bodies, the events, refused bodies, Other, a saved hour, the report, who is on the site by page and by what it does, goodbyes and old games)');
} finally {
  await main.stop();
  fs.rmSync(dir, { recursive: true, force: true });
}
