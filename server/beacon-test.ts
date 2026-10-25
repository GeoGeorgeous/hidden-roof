import './headless';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { NET, SERVER } from '../src/config';
import { beacon, site } from './beacon';
import { addClient, countSetting, noClient } from './client-counts';
import { start } from './test-kit';

// The game's beacon (beacon.ts, beacon-body.ts, client-counts.ts), against the built server: what it runs on, load and
// join times, frames, errors, then the game's events (funnel and tutorial steps, counts, seconds, settings); a body that
// isn't one is refused whole; Other past SERVER.beaconKinds names; an hour saved before the events still loads; /history's
// `client`, and /events's `site`: who is on the site now. npm run test:server runs it.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-beacon-'));
// An hour saved with the first beacons (before the events), the hour before this one.
const before = Date.now() - 3600e3;
fs.mkdirSync(path.join(dir, 'stats'));
fs.writeFileSync(
  path.join(dir, 'stats', `${new Date(before).toISOString().slice(0, 10)}.json`),
  JSON.stringify({
    hours: {
      [new Date(before).getUTCHours()]: {
        plays: 0,
        client: { n: 2, nGpu: 1, browsers: { Chrome: 2 }, os: { Windows: 2 }, gpus: { 'GPU old': 1 }, fps: { 60: 2 }, low1: { 40: 2 }, load: { 30: 2 }, join: {}, errors: 1, erred: 1, messages: { 'old error': 1 } },
      },
    },
  }),
);
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
        return (await (await fetch(`http://localhost:${main.adminPort}/history?period=24h`, { headers: { authorization: 'Bearer test-key' } })).json()).client;
      } catch (e) {
        if (i > 100) throw e;
        await new Promise((w) => setTimeout(w, 50));
      }
    }
  };
  /** `site` in the first status of the event stream. */
  const onSite = async () => {
    const res = await fetch(`http://localhost:${main.adminPort}/events`, { headers: { authorization: 'Bearer test-key' } });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let text = '';
    while (!/event: status\ndata: (.*)\n\n/.test(text)) text += (await reader.read()).value ?? '';
    void reader.cancel();
    return JSON.parse(/event: status\ndata: (.*)\n\n/.exec(text)![1]).site;
  };

  // An hour saved before the events: it loads, with the events empty and the errors by message.
  assert.deepEqual((await history()).events, { steps: { play: 0, ready: 0, sprayed: 0, joined: 0 }, tutorial: {}, counts: {}, seconds: { playing: 0, idle: 0, menu: 0 }, settings: {} });
  assert.deepEqual((await history()).errors, { count: 1, plays: 1, byMessage: { 'old error': 1 } });
  assert.deepEqual(await onSite(), { menu: 0, solo: 0, session: 0, hidden: 0 });

  // A beacon of the first version: no events, no beat.
  assert.equal(await send({ first: { gpu: 'NVIDIA GeForce RTX 3060', load: 3.1 } }), 204);
  assert.equal(await send({ fps: { avg: 58.2, low1: 31 }, joins: [0.6], errors: ['WebGL context lost'], erred: true }), 204);
  assert.equal(await send({ fps: { avg: 'fast' } }), 400);
  assert.equal(await send({ errors: ['x'.repeat(1000)] }), 400);
  assert.deepEqual((await history()).events.counts, {});
  assert.deepEqual(await onSite(), { menu: 0, solo: 0, session: 0, hidden: 0 });

  // Beacons with the events.
  assert.equal(await send({ beat: 'menu', first: { gpu: null, load: 1.2, settings: { detail: 'high', music: 'on', volume: '0.5' } }, steps: ['play', 'ready'], tutorial: ['move', 'look'], counts: { jump: 3, 'pickup.can': 1 }, seconds: { playing: 12.3, idle: 4, menu: 1.1 } }), 204);
  assert.equal(await send({ beat: 'menu', first: { gpu: null, load: 1.2, settings: { detail: 'low', music: 'on' } }, fps: { avg: 59.6, low1: 41 }, steps: ['play', 'sprayed'], tutorial: ['move'], counts: { jump: 2, fall: 1 }, seconds: { playing: 30.2 } }), 204);
  assert.equal(await send({ beat: 'solo' }), 204);
  assert.equal(await send({ beat: 'session', steps: ['joined', 'joined'], counts: { 'setting.detail': 1 } }), 204);
  assert.equal(await send({ beat: 'hidden', seconds: {} }), 204);
  const client = await history();
  assert.deepEqual(client, {
    n: 5, nGpu: 2,
    fps: { median: 60, low1: 40, hist: { 58: 1, 60: 3 }, low1Hist: { 31: 1, 40: 2, 41: 1 } },
    load: { median: 3, p95: 3.1, hist: { 1.2: 2, 3: 2, 3.1: 1 } },
    join: { median: 0.6, p95: 0.6, hist: { 0.6: 1 } },
    browsers: { Chrome: 5 }, os: { Windows: 5 }, gpus: { 'GPU old': 1, 'NVIDIA GeForce RTX 3060': 1 },
    errors: { count: 2, plays: 2, byMessage: { 'old error': 1, 'WebGL context lost': 1 } },
    events: {
      steps: { play: 2, ready: 1, sprayed: 1, joined: 1 },
      tutorial: { move: 2, look: 1 },
      counts: { jump: 5, 'pickup.can': 1, fall: 1, 'setting.detail': 1 },
      seconds: { playing: 42.5, idle: 4, menu: 1.1 },
      settings: { detail: { high: 1, low: 1 }, music: { on: 2 }, volume: { '0.5': 1 } },
    },
  });
  console.log('client', JSON.stringify(client));
  const now = await onSite();
  assert.deepEqual(now, { menu: 2, solo: 1, session: 1, hidden: 1 });
  console.log('site', JSON.stringify(now));

  // A body that isn't one is refused whole: nothing of it is counted, not even its beat.
  const many = (value: unknown, n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, value]));
  const wrong: Record<string, unknown>[] = [
    { beat: 'lobby' }, { beat: 1 }, { beat: null },
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
    { seconds: { playing: -1 } }, { seconds: { playing: SERVER.beaconMostSeconds + 1 } }, { seconds: { playing: '3' } }, { seconds: { sleeping: 1 } }, { seconds: [] }, { seconds: null },
  ];
  for (const body of wrong) assert.equal(await send({ beat: 'menu', ...body }), 400, JSON.stringify(body).slice(0, 80));
  assert.deepEqual(await onSite(), now, 'refused beacons are not on the site');
  assert.deepEqual((await history()).events, client.events, 'nor counted');

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

  // Who is on the site: a beat counts for NET.beaconEvery s.
  const realNow = Date.now;
  try {
    const post = (body: unknown, at: number) => {
      Date.now = () => at;
      const req = Object.assign((async function* () { yield JSON.stringify(body); })(), { headers: {} });
      return beacon(req as unknown as http.IncomingMessage, `10.5.0.${++games}`, noClient);
    };
    const t = realNow() + 1e7;
    await post({ beat: 'solo' }, t);
    await post({ beat: 'solo' }, t + 20e3);
    await post({ beat: 'menu' }, t + 50e3);
    Date.now = () => t + 50e3;
    assert.deepEqual(site(), { menu: 1, solo: 2, session: 0, hidden: 0 });
    Date.now = () => t + NET.beaconEvery * 1000 + 1e3;
    assert.deepEqual(site(), { menu: 1, solo: 1, session: 0, hidden: 0 }, 'the first is gone');
    Date.now = () => t + 200e3;
    assert.deepEqual(site(), { menu: 0, solo: 0, session: 0, hidden: 0 });
  } finally {
    Date.now = realNow;
  }
  console.log('beacon: ok (first-version bodies, the events, refused bodies, Other, an old hour, the report, who is on the site)');
} finally {
  main.stop();
  fs.rmSync(dir, { recursive: true, force: true });
}
