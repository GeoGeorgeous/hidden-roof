import './headless';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COLOR_ORDER, SERVER } from '../src/config';
import { statsRoute } from './admin/stats';
import { noClient } from './client-counts';
import { traffic } from './counts';
import { history } from './history';
import { machine } from './machine';
import { people } from './people';
import { Missing, Refused } from './refused';
import { answer, daysIn, spans, weekdayOf, HOUR } from './stats-period';

// The admin API's stats (stats-period.ts, stats-hours.ts, history.ts, people.ts, people-count.ts, machine.ts), in this
// process: a period and the one before it, null when nothing is kept that far back, days cut to the period, plays by
// whole minutes with the open last bin, the week by weekday and hour, new and returning players and their null across
// a salt change, networks, the days a device played, bytes each way, and the machine's rates. npm run test:server runs it.

const T = Date.parse('2026-03-11T14:30:00Z'); // a Wednesday
const H = Math.floor(T / HOUR);
const realNow = Date.now;
Date.now = () => T;
const iso = (hour: number) => new Date(hour * HOUR).toISOString();
const dayOf = (hour: number) => iso(hour).slice(0, 10);

// The periods and their hours.
assert.deepEqual(spans('today', T), [{ first: H - 14, end: H + 1 }, { first: H - 38, end: H - 23 }], 'today against yesterday through the same hour');
assert.deepEqual(spans('24h', T), [{ first: H - 23, end: H + 1 }, { first: H - 47, end: H - 23 }]);
assert.deepEqual(spans('7d', T)[1], { first: H - 335, end: H - 167 });
assert.deepEqual(daysIn({ first: H - 23, end: H + 1 }).map((d) => [d.day, d.first, d.end]), [['2026-03-10', H - 23, H - 14], ['2026-03-11', H - 14, H + 1]], 'the days cut to the period');
assert.deepEqual([weekdayOf(H), weekdayOf(H - 24 * 3), weekdayOf(0)], [2, 6, 3], 'Monday first: Wednesday, Sunday, 1 January 1970 a Thursday');
// Before is null when it ended before the counts begin; the period starts where they begin if later.
const figures = (f: { from: number; to: number }) => ({ ms: f.to - f.from });
const young = await answer('24h', T, T - 2 * HOUR, figures);
assert.deepEqual([young.before, young.from, young.to, young.ms], [null, new Date(T - 2 * HOUR).toISOString(), new Date(T).toISOString(), 2 * HOUR]);
const old = await answer('24h', T, T - 30 * HOUR, figures);
assert.deepEqual([old.before?.from, old.before?.to, old.before?.ms], [new Date(T - 30 * HOUR).toISOString(), iso(H - 23), 6.5 * HOUR], 'partly kept');

// The files: hours in stats/ and the people, with the salt of an older file (no starts).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-stats-'));
const stats = path.join(dir, 'stats');
fs.mkdirSync(stats);
const hour = (h: Partial<Record<string, unknown>>) => ({ plays: 0, minutes: {}, seconds: 0, withOthers: 0, turnedAway: {}, stamps: { can: 0, marker: 0, roller: 0, sponge: 0 }, colors: {}, peak: null, bytes: { up: 0, down: 0 }, client: noClient(), ...h });
const hours: Record<number, object> = {
  [H - 400]: { plays: 4, seconds: 0, withOthers: 0, turnedAway: {}, stamps: { can: 0, marker: 0, roller: 0, sponge: 0 }, colors: {}, peak: null, client: noClient(), lengths: [1, 0, 0, 0] },
  [H - 2400]: { plays: 4, seconds: 0, withOthers: 0, turnedAway: {}, stamps: { can: 0, marker: 0, roller: 0, sponge: 0 }, colors: {}, peak: null, client: noClient(), lengths: [1, 0, 0, 0] },
  [H - 170]: hour({ plays: 1, seconds: 600 }),
  [H - 26]: hour({ plays: 3, seconds: 7200, withOthers: 3600, minutes: { 2: 2, 5: 1 }, turnedAway: { full: 1 }, peak: { players: 3, at: 'x' }, bytes: { up: 1000, down: 500 } }),
  [H - 5]: hour({ plays: 2, seconds: 1800, minutes: { 0: 2 }, stamps: { can: 4, marker: 0, roller: 0, sponge: 1 }, colors: { blue: 3, red: 2 }, peak: { players: 5, at: 'y' }, bytes: { up: 200, down: 100 }, client: { ...noClient(), n: 3 } }),
};
const byDay = (items: [number, object][]) => {
  const days = new Map<number, [number, object][]>();
  for (const item of items) days.set(Math.floor(item[0] / 24), [...(days.get(Math.floor(item[0] / 24)) ?? []), item]);
  return days;
};
for (const [day, list] of byDay(Object.entries(hours).map(([k, v]) => [+k, v]))) fs.writeFileSync(path.join(stats, `${dayOf(day * 24)}.json`), JSON.stringify({ hours: Object.fromEntries(list.map(([k, v]) => [k % 24, v])) }));
const KEY = 'old-salt-key';
const hash = (key: string, s: string) => createHash('sha256').update(key).update(s).digest('base64url').slice(0, 16);
const [dA, dB, dD, dF] = ['a', 'b', 'd', 'f'].map((c) => c.repeat(32));
const [hA, hB, hD, hF] = [dA, dB, dD, dF].map((d) => hash(KEY, `d${d}`));
const [i1, i2, i3] = ['1', '2', '3'].map((a) => hash(KEY, `i10.0.0.${a}`));
// A joins at H-240 and H-1 from i1, B at H-30 and (a page) at H-2 from i1, D at H-3 from i2, someone with no device at H-4 from i3; C played under the salt before (H-600), F with this one's key but before it began.
const plays = [
  { h: H - 600, d: 'old-c', i: 'old-i', c: null, j: true },
  { h: H - 600, d: hF, i: i3, c: null, j: true },
  { h: H - 240, d: hA, i: i1, c: 'DE', j: true },
  { h: H - 30, d: hB, i: i1, c: null, j: true },
  { h: H - 4, d: null, i: i3, c: 'FR', j: true },
  { h: H - 3, d: hD, i: i2, c: 'FR', j: true },
  { h: H - 2, d: hB, i: i1, c: 'DE', p: true },
  { h: H - 1, d: hA, i: i1, c: null, j: true },
];
for (const [day, list] of byDay(plays.map((p) => [p.h, p]))) fs.writeFileSync(path.join(stats, `people-${dayOf(day * 24)}.json`), JSON.stringify(list.map(([, p]) => p)));
fs.writeFileSync(path.join(stats, 'salt.json'), JSON.stringify({ key: KEY, since: (H - 480) * HOUR }));
await history.keepIn(dir);
// A day past SERVER.historyDays is down to its total, an older file's too.
assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(stats, `${dayOf(H - 2400)}.json`), 'utf8'))), ['total']);
assert.equal(JSON.parse(fs.readFileSync(path.join(stats, `${dayOf(H - 2400)}.json`), 'utf8')).total.plays, 4);

const stat = (at: string, query = '') => statsRoute(at.split('/'), new URLSearchParams(query), dir) as Promise<Record<string, any>>;

// The history in this hour: plays by whole minutes with the last bin open, play seconds, bytes (an hour with none isn't made).
history.bytes(0, 0);
assert.equal(history.within({ first: H, end: H + 1 }).length, 0, 'no bytes, no hour');
for (const s of [59, 61, 130 * 60, 500 * 60]) history.played(s);
history.now().plays++;
history.sample([2, 1], 60);
history.sample([0], 60);
history.bytes(1000, 400);
history.bytes(1000, 400);

// /stats/play over 24h: this hour and the one 5 hours ago; before has the hour 26 ago.
const day = await stat('play');
assert.deepEqual([day.period, day.from, day.to], ['24h', iso(H - 23), '2026-03-11T14:30:00.000Z']);
assert.deepEqual([day.plays, day.lengthMinutes, day.playSeconds, day.withOthers], [3, { 0: 3, 1: 1, [SERVER.lengthMinutesMost]: 2 }, 1980, 120], 'the last bin counts 120 minutes and up');
assert.deepEqual([day.joinsByWeekHour[2][9], day.joinsByWeekHour[2][14], day.joinsByWeekHour.flat().reduce((a: number, b: number) => a + b, 0)], [2, 1, 3]);
assert.deepEqual([day.onlineByWeekHour[2][9], day.onlineByWeekHour[2][14], day.onlineByWeekHour[1][12], day.onlineByWeekHour.length, day.onlineByWeekHour[0].length], [0.5, 0.1, 0, 7, 24], 'play seconds over the seconds the slot has in the period (the current hour is half over)');
assert.deepEqual([day.weekdays, day.turnedAway, day.peak.players], [[0, 1, 1, 0, 0, 0, 0], {}, 5]);
assert.deepEqual(day.days, [{ day: '2026-03-10', plays: 0, playSeconds: 0 }, { day: '2026-03-11', plays: 3, playSeconds: 1980 }], 'the first day is cut to the period: the play at 12:00 is before it');
assert.deepEqual(Object.keys(day), ['period', 'from', 'to', 'plays', 'lengthMinutes', 'playSeconds', 'withOthers', 'joinsByWeekHour', 'onlineByWeekHour', 'weekdays', 'turnedAway', 'peak', 'days', 'before']);
assert.deepEqual([day.before.from, day.before.to, day.before.plays, day.before.lengthMinutes, day.before.playSeconds, day.before.turnedAway, day.before.peak.players], [iso(H - 47), iso(H - 23), 3, { 2: 2, 5: 1 }, 7200, { full: 1 }, 3]);
assert.ok(!['days', 'before'].some((k) => k in day.before), 'before has the figures only');
// Today, a week and a month: the older hours come in, the day figures follow, and before is null when nothing is kept that far back.
const today = await stat('play', 'period=today');
assert.deepEqual([today.from, today.plays, today.days.map((d: { day: string }) => d.day), today.before.from, today.before.to, today.before.plays], [iso(H - 14), 3, ['2026-03-11'], iso(H - 38), iso(H - 23), 3], 'yesterday through the same hour');
const week = await stat('play', 'period=7d');
assert.deepEqual([week.plays, week.days.map((d: { plays: number }) => d.plays), week.before.plays, week.weekdays], [6, [0, 0, 0, 0, 0, 0, 3, 3], 1, [1, 1, 2, 1, 1, 1, 1]], 'eight days touched, Wednesday twice');
const month = await stat('play', 'period=30d');
assert.deepEqual([month.from, month.plays, month.before], [iso(H - 400), 11, null], 'the counts begin at the oldest hour, 400 hours back: nothing before the month is kept');
assert.deepEqual(month.lengthMinutes, { 0: 3, 1: 1, 2: 2, 5: 1, [SERVER.lengthMinutesMost]: 2 }, 'an hour file from before the minutes reads as none');
assert.equal(JSON.stringify(month).includes('lengths'), false);

// Paint: stamps and colors in the game's order; the days' stamps.
const paint = await stat('paint');
assert.deepEqual([paint.stamps, Object.keys(paint.colors), paint.days.map((d: { stamps: { can: number } }) => d.stamps.can), 'before' in paint, paint.before.stamps.can], [{ can: 4, marker: 0, roller: 0, sponge: 1 }, COLOR_ORDER.filter((c) => c === 'red' || c === 'blue'), [0, 4], true, 0]);
assert.deepEqual(paint.colors, { red: 2, blue: 3 });
// The beacons: no days.
const client = await stat('client');
assert.deepEqual([client.n, 'days' in client, client.before.n, client.errors], [3, false, 0, { count: 0, plays: 0, byMessage: {} }]);

// People: over 24h A (a join), B (a page) and D, from two addresses; B and A are on i1, so it is a shared network of two.
const folks = await stat('people');
assert.deepEqual([folks.players, folks.inSessions, folks.countries, folks.networks], [{ device: 3, address: 3 }, { device: 2, address: 3 }, { DE: 1, FR: 1 }, { shared: 1, devicesOnShared: 2, devicesPerNetwork: { 1: 1, '2-4': 1, '5+': 0 } }], 'the one with no device counts by address and not in networks');
assert.deepEqual([folks.newPlayers, folks.returningPlayers], [1, 2], 'A and B were seen since the salt began, D was not');
assert.deepEqual(folks.days.map((d: { day: string }) => d.day), ['2026-03-10', '2026-03-11']);
assert.deepEqual(folks.days[1], { day: '2026-03-11', players: { device: 3, address: 3 }, inSessions: { device: 2, address: 3 }, newPlayers: 1, returningPlayers: 2 });
assert.deepEqual([folks.before.players, folks.before.newPlayers, folks.before.returningPlayers], [{ device: 1, address: 1 }, 1, 0], 'B at H-30 is the only one before; the salt began before it, with A seen');
const weekFolks = await stat('people', 'period=7d');
assert.deepEqual([weekFolks.newPlayers, weekFolks.returningPlayers, weekFolks.before.newPlayers, weekFolks.before.returningPlayers], [2, 1, 1, 0], 'A was seen before the week; B and D were not');
// A month holds the day the salt changed (and plays before it): not to be matched across it.
const monthFolks = await stat('people', 'period=30d');
assert.deepEqual([monthFolks.newPlayers, monthFolks.returningPlayers, monthFolks.players.device], [null, null, 5], 'across the salt change: counted twice, not matched');
assert.deepEqual(monthFolks.days.filter((d: { newPlayers: number | null }) => d.newPlayers === null).map((d: { day: string }) => d.day), [dayOf(H - 480)], 'only the day it began in');
// The people a device was: the days it joined since this salt began.
assert.deepEqual([people.seenDays(dA), people.seenDays(dB), people.seenDays(dD), people.seenDays(dF), people.seenDays('e'.repeat(32)), people.seenDays(undefined)], [2, 1, 1, 0, 0, null], 'B\'s page is not a join; F played before this salt');
people.played('9'.repeat(32), '10.0.0.9', 'DE', 'join');
people.played('9'.repeat(32), '10.0.0.9', 'DE', 'join');
people.played('8'.repeat(32), '10.0.0.8', 'DE', 'page');
assert.equal(people.seenDays('9'.repeat(32)), 1);
assert.equal(people.seenDays('8'.repeat(32)), 0);
people.played('8'.repeat(32), '10.0.0.8', 'DE', 'join');
assert.equal(people.seenDays('8'.repeat(32)), 1, 'the page that then joins');

// Bytes each way, and the machine's rates and day.
assert.deepEqual(history.bytesToday(), { upBytes: 1200, downBytes: 500 });
const box = await machine(null);
traffic.sent += 4000;
traffic.received += 8000;
Date.now = () => T + 10000;
const rates = await machine(null);
assert.deepEqual([box.today, rates.upBits, rates.downBits, rates.today], [{ upBytes: 1200, downBytes: 500 }, 3200, 6400, { upBytes: 1200, downBytes: 500 }]);
Date.now = () => T;

// A salt past its days is replaced by the next play: its key is gone from the disk, the times it began stay, and the days played start again.
Date.now = () => T + 11 * 864e5;
people.played('9'.repeat(32), '10.0.0.9', 'DE', 'join');
assert.equal(people.seenDays('9'.repeat(32)), 1);
assert.equal(people.seenDays(dA), 0, 'a new salt: nobody is matched');
await history.save();
const salt = JSON.parse(fs.readFileSync(path.join(stats, 'salt.json'), 'utf8'));
assert.deepEqual([Object.keys(salt), salt.starts.length, salt.starts[0], salt.key === KEY, fs.readFileSync(path.join(stats, 'salt.json'), 'utf8').includes(KEY)], [['key', 'starts'], 2, (H - 480) * HOUR, false, false]);
Date.now = () => T;

// The routes: a bad period is a 400, an unknown route a 404, the traffic days a number from 1 to 366.
const refused = (at: string, query: string, message: string) => assert.rejects(stat(at, query), (e: Error) => e instanceof Refused && !(e instanceof Missing) && e.message === message, `${at}?${query}`);
for (const period of ['week', 'constructor', '__proto__', '']) for (const at of ['play', 'people', 'paint', 'client', 'traffic']) await refused(at, `period=${period}`, 'period: today, 24h, 7d or 30d');
for (const n of ['0', '367', 'x', '-1', '1.5', '']) await refused('traffic/days', `n=${n}`, 'n: 1 to 366');
for (const at of ['nothing', 'play/more', 'traffic/days/more', 'traffic/x']) await assert.rejects(stat(at), (e: Error) => e instanceof Missing, at);
assert.deepEqual(await stat('traffic/days'), { days: [] });
assert.deepEqual(await statsRoute(['traffic', 'days'], new URLSearchParams(), null), { days: [] }, 'without a directory');
const none = await statsRoute(['traffic'], new URLSearchParams('period=today'), null);
assert.deepEqual([(none as any).views, (none as any).steps, (none as any).hours.length, (none as any).before], [0, { view: 0, script: 0, beacon: 0, socket: 0 }, 15, null], 'without a directory: no traffic, an hour of zeros each, nothing before');

Date.now = realNow;
fs.rmSync(dir, { recursive: true, force: true });
console.log('stats: ok (periods and the one before, null before the counts, days cut, minutes with an open last bin, the week by weekday and hour, new and returning and the salt change, networks, the days played, bytes, the machine)');
