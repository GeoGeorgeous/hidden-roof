import './headless';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COLOR_ORDER, SERVER } from '../src/config';
import { statsRoute } from './admin/stats';
import { noClient } from './client-counts';
import type { InventoryData } from '../src/inventory/inventory';
import type { PaintOp } from '../src/paint-ops';
import { countPaint, SessionStats, traffic } from './counts';
import { history } from './history';
import { machine, sampleMachine } from './machine';
import { prefix } from './address';
import { people } from './people';
import { PerMinute } from './per-minute';
import { peopleDays } from './people-days';
import { Missing, Refused } from './refused';
import { dayName, HOUR } from './days';
import { answer, dayRange, daysIn, monthName, monthRange, spans, weekdayOf } from './stats-period';

// The admin API's stats (stats-period.ts, stats-hours.ts, history.ts, people.ts, people-count.ts, machine.ts), in this
// process: a period and the one before it, null when nothing is kept that far back, days cut to the period, plays by
// whole minutes with the open last bin, the week by weekday and hour, new, returning and unknown players by the days the game
// says, the salt at each month's start, each ended day's row kept and the History's days over a range, networks, the days a device
// played, bytes each way, the machine's rates, and a session's paint time and pickups (counts.ts). npm run test:server runs it.

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
// In the day's last hour 'today' is the whole day so far, not nothing.
{
  const late = Date.parse('2026-03-11T23:30:00Z');
  const first = Math.floor(late / HOUR) - 23;
  assert.deepEqual(spans('today', late), [{ first, end: first + 24 }, { first: first - 24, end: first }], 'today in hour 23: 24 hours, against yesterday');
}
// Months and days before 1970 are refused; a month before 1 is none.
assert.throws(() => monthRange(new URLSearchParams('from=1969-12&to=1970-01'), T, 12), Refused);
assert.throws(() => dayRange(new URLSearchParams('from=1969-12-31&to=1970-01-01'), T, 5), Refused);
assert.equal(monthName(-1), '1970-01');
assert.deepEqual(monthRange(new URLSearchParams('to=1970-03'), T, 12), { from: 0, to: 2 }, 'twelve months by default, none before 1970');

// Before is null when it ended before the counts begin; the period starts where they begin if later.
const figures = (f: { from: number; to: number }) => ({ ms: f.to - f.from });
const young = await answer('24h', T, T - 2 * HOUR, figures);
assert.deepEqual([young.before, young.from, young.to, young.ms], [null, new Date(T - 2 * HOUR).toISOString(), new Date(T).toISOString(), 2 * HOUR]);
const old = await answer('24h', T, T - 30 * HOUR, figures);
assert.deepEqual([old.before?.from, old.before?.to, old.before?.ms], [new Date(T - 30 * HOUR).toISOString(), iso(H - 23), 6.5 * HOUR], 'partly kept');

// The files: hours in stats/ and the people, with the salt of an older file (a list of when each began).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-stats-'));
const stats = path.join(dir, 'stats');
fs.mkdirSync(stats);
const hour = (h: Partial<Record<string, unknown>>) => ({ plays: 0, minutes: {}, seconds: 0, withOthers: 0, turnedAway: {}, stamps: { can: 0, marker: 0, roller: 0, sponge: 0 }, colors: {}, peak: null, bytes: { up: 0, down: 0 }, client: noClient(), ...h });
const hours: Record<number, object> = {
  [H - 400]: { plays: 4, seconds: 0, withOthers: 0, turnedAway: {}, stamps: { can: 0, marker: 0, roller: 0, sponge: 0 }, colors: {}, peak: null, client: noClient() },
  [H - 2400]: { plays: 4, seconds: 0, withOthers: 0, turnedAway: {}, stamps: { can: 0, marker: 0, roller: 0, sponge: 0 }, colors: {}, peak: null, client: noClient() },
  [H - 170]: hour({ plays: 1, seconds: 600 }),
  [H - 26]: hour({ plays: 3, seconds: 7200, withOthers: 3600, minutes: { 2: 2, 5: 1 }, turnedAway: { full: 1 }, peak: { players: 3, at: 'x' }, bytes: { up: 1000, down: 500 } }),
  [H - 5]: hour({ plays: 2, seconds: 1800, minutes: { 0: 2 }, stamps: { can: 4, marker: 0, roller: 0, sponge: 1 }, paintSeconds: { can: 30.04, marker: 0, roller: 0, sponge: 3 }, colors: { blue: 3, red: 2 }, peak: { players: 5, at: 'y' }, bytes: { up: 200, down: 100 }, client: { ...noClient(), n: 3 } }),
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
// A joins at H-240 (its first day) and H-1 (ten days later), B at H-120 (its first), H-30 and (a page) at H-2 from i1, D at H-3 (its first day) from i2, someone with no
// device at H-4 from i3; C played before the salt (H-600) and said nothing, F with this one's key but before it began (its first day).
const dd = (h: number) => Math.floor(h / 24);
const D = dd(H);
const plays = [
  { h: H - 600, d: 'old-c', i: 'old-i', c: null, j: true },
  { h: H - 600, d: hF, i: i3, c: null, j: true, f: dd(H - 600), v: null },
  { h: H - 240, d: hA, i: i1, c: 'DE', j: true, f: D - 10, v: null },
  { h: H - 120, d: hB, i: i1, c: null, j: true, f: D - 5, v: null },
  { h: H - 30, d: hB, i: i1, c: null, j: true, f: D - 5, v: D - 5 },
  { h: H - 4, d: null, i: i3, c: 'FR', j: true },
  { h: H - 3, d: hD, i: i2, c: 'FR', j: true, f: D, v: null },
  { h: H - 2, d: hB, i: i1, c: 'DE', p: true, f: D - 5, v: D - 1 },
  { h: H - 1, d: hA, i: i1, c: null, j: true, f: D - 10, v: D - 10 },
];
for (const [day, list] of byDay(plays.map((p) => [p.h, p]))) fs.writeFileSync(path.join(stats, `people-${dayOf(day * 24)}.json`), JSON.stringify(list.map(([, p]) => p)));
fs.writeFileSync(path.join(stats, 'salt.json'), JSON.stringify({ key: KEY, starts: [(H - 700) * HOUR, (H - 250) * HOUR] }));
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

// Paint: stamps and colors in the game's order; the days' stamps.
const paint = await stat('paint');
assert.deepEqual([paint.stamps, Object.keys(paint.colors), paint.days.map((d: { stamps: { can: number } }) => d.stamps.can), 'before' in paint, paint.before.stamps.can], [{ can: 4, marker: 0, roller: 0, sponge: 1 }, COLOR_ORDER.filter((c) => c === 'red' || c === 'blue'), [0, 4], true, 0]);
assert.deepEqual(paint.colors, { red: 2, blue: 3 });
assert.deepEqual([paint.paintSeconds, paint.days.map((d: { paintSeconds: { can: number } }) => d.paintSeconds.can), paint.before.paintSeconds.can], [{ can: 30, marker: 0, roller: 0, sponge: 3 }, [0, 30], 0], 'paint seconds to a tenth; an hour from before them reads as none');
// The beacons: no days.
const client = await stat('client');
assert.deepEqual([client.n, 'days' in client, client.before.n, client.errors], [3, false, 0, { count: 0, plays: 0, byMessage: {} }]);
assert.deepEqual(client.events.pickups, ['marker', 'ladder', 'roller', 'sponge', 'cap.needle', 'cap.skinny', 'cap.soft', 'cap.fat', 'cap.spray', ...COLOR_ORDER.filter((c) => c !== 'black').map((c) => `color.${c}`)], 'every pickup, the starting kit\'s left out');

// A session's paint time: one painter's ops with a tool SERVER.paintGap apart or closer are one run, a longer gap starts
// another, each tool and painter on its own; drips are no one's. Pickups: the names who found each, the starting kit and
// what they carried before left out; it all goes beside a save and comes back, a save from before it reads as none.
const ink = new SessionStats();
const [can, sponge] = [{ kind: 'stamp', color: [1, 0, 0], square: false }, { kind: 'stamp', color: null, square: false }] as unknown as PaintOp[];
const [p1, p2] = [{}, {}];
countPaint([can, can, sponge, can, can], [1, 1.25, 1.3, 1.5, 3], p1, [ink.paint]);
countPaint([can, sponge], [3.2, 1.6], p1, [ink.paint]);
countPaint([can, can], [1.1, 1.4], p2, [ink.paint]);
assert.deepEqual([ink.paint.stamps, ink.report([]).paintSeconds], [{ can: 7, marker: 0, roller: 0, sponge: 2 }, { can: 1, marker: 0, roller: 0, sponge: 0.3 }]);
const kit = { tools: [], colors: ['black'], caps: ['standard'], selected: 0, color: 'black', cap: 'standard' } as unknown as InventoryData;
ink.players(1, 'A');
ink.carries('A', null, { ...kit, tools: ['marker'], colors: ['black', 'red'] });
ink.carries('A', { ...kit, tools: ['marker'], colors: ['black', 'red'] }, { ...kit, tools: ['marker'], colors: ['black', 'red'], caps: ['standard', 'fat'] });
ink.players(2, 'B');
ink.carries('B', null, { ...kit, tools: ['marker'] });
ink.carries('B', null, { ...kit, tools: ['marker'] });
const told = ink.report([]);
assert.deepEqual([told.players, told.pickups], [2, { marker: 2, 'color.red': 1, 'cap.fat': 1 }]);
const back = SessionStats.from(JSON.parse(JSON.stringify(ink.toJSON())))!.report([]);
assert.deepEqual([back.paintSeconds, back.players, back.pickups], [told.paintSeconds, 2, told.pickups]);
const { paintSeconds: _, players: __, pickups: ___, ...older } = ink.toJSON();
const fromOlder = SessionStats.from(JSON.parse(JSON.stringify(older)))!.report([]);
assert.deepEqual([fromOlder.stamps.can, fromOlder.paintSeconds, fromOlder.players, fromOlder.pickups], [7, { can: 0, marker: 0, roller: 0, sponge: 0 }, 0, {}]);

// People: over 24h A (a join), B (a page) and D, from two addresses; B and A are on i1, so it is a shared network of two.
const folks = await stat('people');
assert.deepEqual([folks.players, folks.inSessions, folks.countries, folks.networks], [{ device: 3, address: 3 }, { device: 2, address: 3 }, { DE: 1, FR: 1 }, { shared: 1, devicesOnShared: 2, devicesPerNetwork: { 1: 1, '2-4': 1, '5+': 0 } }], 'the one with no device counts by address and not in networks');
assert.deepEqual([folks.newPlayers, folks.returningPlayers, folks.unknownPlayers], [1, 2, 0], 'A and B first played before the day the period began on, D on it');
assert.deepEqual(folks.days.map((d: { day: string }) => d.day), ['2026-03-10', '2026-03-11']);
assert.deepEqual(folks.days[1], { day: '2026-03-11', players: { device: 3, address: 3 }, inSessions: { device: 2, address: 3 }, newPlayers: 1, returningPlayers: 2, unknownPlayers: 0 });
assert.deepEqual([folks.before.players, folks.before.newPlayers, folks.before.returningPlayers, folks.before.unknownPlayers], [{ device: 1, address: 1 }, 0, 1, 0], 'B at H-30 is the only one before');
const weekFolks = await stat('people', 'period=7d');
assert.deepEqual([weekFolks.newPlayers, weekFolks.returningPlayers, weekFolks.before.newPlayers, weekFolks.before.returningPlayers], [2, 1, 1, 0], 'A first played before the week; B and D in it');
// A month holds plays before the salt began: by the days the devices say, not by matching hashes. One that said nothing is unknown, and never null.
const monthFolks = await stat('people', 'period=30d');
assert.deepEqual([monthFolks.newPlayers, monthFolks.returningPlayers, monthFolks.unknownPlayers, monthFolks.players.device], [4, 0, 1, 5]);
assert.ok(monthFolks.days.every((d: { newPlayers: unknown; returningPlayers: unknown }) => typeof d.newPlayers === 'number' && typeof d.returningPlayers === 'number'), 'no day has a null count');

// The audience: each ended day's row was written at start, once, owner-only; today's is live. The History's days over a range.
const audienceFile = path.join(stats, 'audience-2026.json');
const kept = JSON.parse(fs.readFileSync(audienceFile, 'utf8'));
assert.deepEqual(Object.keys(kept), [D - 25, D - 10, D - 5, D - 1].map((d) => new Date(d * 864e5).toISOString().slice(0, 10)), 'a row for each ended day with plays, oldest first');
assert.equal(fs.statSync(audienceFile).mode & 0o777, 0o600);
const rowOf = (d: number) => kept[new Date(d * 864e5).toISOString().slice(0, 10)];
assert.deepEqual(rowOf(D - 10), { players: { device: 1, address: 1 }, inSessions: { device: 1, address: 1 }, newPlayers: 1, returningPlayers: 0, unknownPlayers: 0, countries: { DE: 1 }, ages: { 0: 1 }, gaps: {}, gapsNone: 1, unknownGaps: {}, unknownGapsNone: 0, unmatched: 0 });
assert.deepEqual([rowOf(D - 1).ages, rowOf(D - 1).gaps, rowOf(D - 1).newPlayers, rowOf(D - 1).returningPlayers], [{ 4: 1 }, { 4: 1 }, 0, 1], 'B, 4 days after its first and its play before');
assert.deepEqual([rowOf(D - 25).unmatched, rowOf(D - 25).ages, rowOf(D - 25).gapsNone, rowOf(D - 25).unknownPlayers], [1, { 0: 1 }, 1, 1], 'C said nothing');
const sequence = async (from: number, to: number) => (await peopleDays({ from: D + from, to: D + to }, T)) as Record<string, any>;
const wide = await sequence(-30, 0);
assert.deepEqual([wide.from, wide.to, wide.players, wide.newPlayers, wide.returningPlayers, wide.unknownPlayers, wide.unmatched], [dayName(D - 30), dayName(D), 5, 4, 0, 1, 1], 'B across 3 days counts once; C counts once, and unmatched');
assert.deepEqual(wide.days.map((d: { day: string }) => d.day), [D - 25, D - 10, D - 5, D - 1, D].map(dayName), 'a day with no players is left out; today is live');
assert.deepEqual(wide.days.at(-1).ages, { 0: 1, 5: 1, 10: 1 }, 'today: D new, B 5 days, A 10');
assert.deepEqual(wide.days.at(-1).gaps, { 1: 1, 10: 1 });
assert.deepEqual(Object.keys(wide.days[0]), ['day', 'players', 'inSessions', 'newPlayers', 'returningPlayers', 'unknownPlayers', 'countries', 'ages', 'gaps', 'gapsNone', 'unknownGaps', 'unknownGapsNone', 'unmatched']);
// A week: A's play before is older than it (counted on the last day), B counts on its first day in it, retention follows the ages.
const week7 = await sequence(-7, 0);
assert.deepEqual([week7.players, week7.newPlayers, week7.returningPlayers, week7.unknownPlayers, week7.unmatched], [3, 2, 1, 0, 0]);
assert.deepEqual(await sequence(-9, -2).then((r) => [r.players, r.newPlayers, r.returningPlayers]), [1, 1, 0], 'only B, on its first day');
assert.deepEqual(await sequence(-6, -6).then((r) => [r.players, r.days]), [0, []], 'a range with nobody');
assert.deepEqual(await sequence(1, 3).then((r) => [r.players, r.days]), [0, []], 'days to come');
const retained = wide.days.find((d: { day: string }) => d.day === dayName(D - 10)).ages['0'] + wide.days.at(-1).ages['10'];
assert.equal(retained, 2, 'A: new on D-10, back 10 days later');
// The day past the audience file: a row not written yet is made from the plays.
fs.rmSync(audienceFile);
assert.equal((await sequence(-30, 0)).players, 5, 'from the plays kept, without the file');
fs.writeFileSync(audienceFile, JSON.stringify(kept));
// The people a device was: the days it joined since this salt began.
assert.deepEqual([people.seenDays(dA), people.seenDays(dB), people.seenDays(dD), people.seenDays(dF), people.seenDays('e'.repeat(32)), people.seenDays(undefined)], [2, 2, 1, 0, 0, null], 'B\'s page is not a join; F played before this salt');
people.played('9'.repeat(32), '10.0.0.9', 'DE', 'join');
people.played('9'.repeat(32), '10.0.0.9', 'DE', 'join');
people.played('8'.repeat(32), '10.0.0.8', 'DE', 'page');
assert.equal(people.seenDays('9'.repeat(32)), 1);
assert.equal(people.seenDays('8'.repeat(32)), 0);
people.played('8'.repeat(32), '10.0.0.8', 'DE', 'join');
assert.equal(people.seenDays('8'.repeat(32)), 1, 'the page that then joins');
// A page that comes after a join in the same hour brings the days the join didn't have.
people.played('7'.repeat(32), '10.0.0.7', 'DE', 'join');
people.played('7'.repeat(32), '10.0.0.7', 'DE', 'page', { first: D - 2, prev: D - 1 });
assert.deepEqual([(await sequence(0, 0)).days[0].ages[2], (await sequence(0, 0)).days[0].gaps[1]], [1, 2]);

// Bytes each way, and the machine's rates and day.
assert.deepEqual(history.bytesToday(), { upBytes: 1200, downBytes: 500 });
Date.now = () => Date.parse('2026-03-11T23:30:00Z');
assert.deepEqual(history.bytesToday(), { upBytes: 1200, downBytes: 500 }, 'the same in the last hour of the day');
Date.now = () => T;
const box = await machine(null);
sampleMachine();
traffic.sent += 4000;
traffic.received += 8000;
Date.now = () => T + 10000;
sampleMachine();
const rates = await machine(null);
traffic.sent += 4000;
assert.equal((await machine(null)).upBits, 3200, 'the sample is the same for every caller, until the next');
assert.deepEqual([box.today, rates.upBits, rates.downBits, rates.today], [{ upBytes: 1200, downBytes: 500 }, 3200, 6400, { upBytes: 1200, downBytes: 500 }]);
Date.now = () => T;

// The salt changes at the month's start (UTC): the last second of March is the same salt, the first of April a new one, its key gone from the disk, its start kept.
Date.now = () => Date.parse('2026-03-31T23:59:59Z');
people.played('9'.repeat(32), '10.0.0.9', 'DE', 'join');
assert.equal(people.seenDays('9'.repeat(32)), 2, 'the same salt');
Date.now = () => Date.parse('2026-04-01T00:00:00Z');
people.played('9'.repeat(32), '10.0.0.9', 'DE', 'join');
assert.equal(people.seenDays('9'.repeat(32)), 1);
assert.equal(people.seenDays(dA), 0, 'a new salt: nobody is matched');
await history.save();
const saltText = fs.readFileSync(path.join(stats, 'salt.json'), 'utf8');
const salt = JSON.parse(saltText);
assert.deepEqual([Object.keys(salt), salt.since, salt.key === KEY, saltText.includes(KEY)], [['key', 'since'], Date.parse('2026-04-01T00:00:00Z'), false, false]);
const march = JSON.parse(fs.readFileSync(audienceFile, 'utf8'));
assert.deepEqual([Object.keys(march).slice(-2), march['2026-03-11'].players.device, march['2026-03-11'].unmatched], [['2026-03-11', '2026-03-31'], 6, 2], 'the ended days after the month began are written by the next save');
Date.now = () => T;

// The routes: a bad period is a 400, an unknown route a 404, the traffic days a number from 1 to 366.
const refused = (at: string, query: string, message: string) => assert.rejects(stat(at, query), (e: Error) => e instanceof Refused && !(e instanceof Missing) && e.message === message, `${at}?${query}`);
for (const period of ['week', 'constructor', '__proto__', '']) for (const at of ['play', 'people', 'paint', 'client', 'traffic']) await refused(at, `period=${period}`, 'period: today, 24h, 7d or 30d');
for (const n of ['0', '367', 'x', '-1', '1.5', '']) await refused('traffic/days', `n=${n}`, 'n: 1 to 366');
for (const at of ['nothing', 'play/more', 'traffic/days/more', 'traffic/x']) await assert.rejects(stat(at), (e: Error) => e instanceof Missing, at);
const noDays = { from: dayName(D - 29), to: dayName(D), days: [] };
assert.deepEqual(await stat('traffic/days'), noDays);
assert.deepEqual(await statsRoute(['traffic', 'days'], new URLSearchParams(), null), noDays, 'without a directory');
const none = await statsRoute(['traffic'], new URLSearchParams('period=today'), null);
assert.deepEqual([(none as any).views, (none as any).steps, (none as any).hours.length, (none as any).before], [0, { view: 0, script: 0, beacon: 0, socket: 0 }, 15, null], 'without a directory: no traffic, an hour of zeros each, nothing before');

// An address is counted by its /64 and a malformed one never throws; one address, its /64, is one for a limit.
assert.deepEqual(['2001:db8:1:2:3:4:5:6', '2001:DB8:1:2::9', '::ffff:10.0.0.1', '10.0.0.1', '1:2:3:4:5:6:7:8:9', '::1::', 'x'.repeat(100), '::', ' fe80::1%eth0 '].map(prefix), ['2001:db8:1:2::/64', '2001:db8:1:2::/64', '10.0.0.1', '10.0.0.1', '1:2:3:4:5:6:7:8:9', '::1::', 'x'.repeat(64), '0:0:0:0::/64', 'fe80:0:0:0::/64']);
{
  const limit = new PerMinute(2, 10);
  assert.deepEqual(['2001:db8::1', '2001:db8::2', '2001:db8::3', '10.0.0.1'].map((ip) => limit.allow(ip)), [true, true, false, true]);
}

// A salt that can't be read is logged and kept aside, and a new one begins; a missing one is just new.
{
  const salty = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-salt-'));
  fs.writeFileSync(path.join(salty, 'salt.json'), '{"key": ');
  await people.keepIn(salty);
  assert.deepEqual([fs.existsSync(path.join(salty, 'salt.json')), fs.readFileSync(path.join(salty, 'salt.json.bad'), 'utf8')], [false, '{"key": ']);
  fs.rmSync(salty, { recursive: true, force: true });
}

Date.now = realNow;
fs.rmSync(dir, { recursive: true, force: true });
console.log('stats: ok (periods and the one before, null before the counts, days cut, minutes with an open last bin, the week by weekday and hour, new, returning and unknown by the days said, the salt by month, the audience rows kept and read over a range, networks, the days played, bytes, the machine, paint time and pickups in a session)');
