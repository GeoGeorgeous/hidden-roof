import './headless';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { statsRoute } from './admin/stats';
import { noClient } from './client-counts';
import { history } from './history';
import { historyDays } from './history-days';
import { Refused } from './refused';
import { HOUR } from './days';

// GET /stats/play/days and /stats/paint/days (history-days.ts): a day from its hours while they are kept, then from the
// total its file keeps, in the order of the range, a day with no counts left out. npm run test:server runs it.

const T = Date.parse('2026-03-11T14:30:00Z');
const realNow = Date.now;
Date.now = () => T;
const day = Math.floor(T / HOUR / 24);
const name = (d: number) => new Date(d * 864e5).toISOString().slice(0, 10);
const hour = (h: object) => ({ plays: 0, minutes: {}, seconds: 0, withOthers: 0, turnedAway: {}, stamps: { can: 0, marker: 0, roller: 0, sponge: 0 }, colors: {}, peak: null, bytes: { up: 0, down: 0 }, client: noClient(), ...h });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-history-days-'));
const stats = path.join(dir, 'stats');
fs.mkdirSync(stats);
const put = (d: number, file: object) => fs.writeFileSync(path.join(stats, `${name(d)}.json`), JSON.stringify(file));
// Yesterday: two hours of play and paint; three days ago: paint only; a day long past: a total.
put(day - 1, { hours: { 9: hour({ plays: 2, seconds: 100.4, withOthers: 50.6, minutes: { 3: 1, 120: 1 }, turnedAway: { full: 1 }, peak: { players: 3, at: 'x' }, stamps: { can: 4, marker: 0, roller: 0, sponge: 1 }, paintSeconds: { can: 12.34, marker: 0, roller: 0, sponge: 2 }, colors: { red: 2, blue: 3 } }), 10: hour({ plays: 1, seconds: 20, peak: { players: 5, at: 'y' }, colors: { red: 1 } }) } });
put(day - 3, { hours: { 4: hour({ stamps: { can: 0, marker: 2, roller: 0, sponge: 0 }, colors: { green: 2 } }) } });
put(day - 5, { hours: { 4: hour({ client: { ...noClient(), n: 2 } }) } });
put(day - 200, { total: hour({ plays: 7, seconds: 700.5, withOthers: 70.4, minutes: { 1: 7 }, peak: { players: 4, at: 'z' }, stamps: { can: 9, marker: 0, roller: 1, sponge: 0 }, colors: { blue: 9 } }) });
put(day - 201, { total: { plays: 1 } });
await history.keepIn(dir);
history.now().plays++;
history.sample([2], 30);

const range = { from: day - 201, to: day };
const play = await historyDays('play', range, dir);
assert.deepEqual([play.from, play.to], [name(day - 201), name(day)]);
assert.deepEqual(
  play.days,
  [
    { day: name(day - 201), plays: 1, playSeconds: 0, withOthers: 0, lengthMinutes: {}, turnedAway: {}, peak: null },
    { day: name(day - 200), plays: 7, playSeconds: 701, withOthers: 70, lengthMinutes: { 1: 7 }, turnedAway: {}, peak: { players: 4, at: 'z' } },
    { day: name(day - 1), plays: 3, playSeconds: 120, withOthers: 51, lengthMinutes: { 3: 1, 120: 1 }, turnedAway: { full: 1 }, peak: { players: 5, at: 'y' } },
    { day: name(day), plays: 1, playSeconds: 60, withOthers: 60, lengthMinutes: {}, turnedAway: {}, peak: null },
  ],
  'from the total of a day long past (an older total reads as none for what it lacks), from the hours of the others; a day with paint only is out, today is live',
);
assert.deepEqual(Object.keys(play.days[2]), ['day', 'plays', 'playSeconds', 'withOthers', 'lengthMinutes', 'turnedAway', 'peak']);

const paint = await historyDays('paint', range, dir);
const none = { can: 0, marker: 0, roller: 0, sponge: 0 };
assert.deepEqual(
  paint.days,
  [
    { day: name(day - 200), stamps: { can: 9, marker: 0, roller: 1, sponge: 0 }, paintSeconds: none, colors: { blue: 9 } },
    { day: name(day - 3), stamps: { can: 0, marker: 2, roller: 0, sponge: 0 }, paintSeconds: none, colors: { green: 2 } },
    { day: name(day - 1), stamps: { can: 4, marker: 0, roller: 0, sponge: 1 }, paintSeconds: { can: 12.3, marker: 0, roller: 0, sponge: 2 }, colors: { red: 3, blue: 3 } },
  ],
  'colors in the game\'s order, paint seconds to a tenth (none in a day from before them), the days with none left out',
);
assert.deepEqual(Object.keys(paint.days[0]), ['day', 'stamps', 'paintSeconds', 'colors']);
assert.deepEqual((await historyDays('paint', { from: day - 1, to: day - 1 }, null)).days.map((d) => (d as { day: string }).day), [name(day - 1)], 'a day kept in memory without a directory');
assert.deepEqual((await historyDays('play', { from: day - 200, to: day - 200 }, null)).days, [], 'without a directory: memory only');

// The routes.
const get = (at: string, query: string) => statsRoute(at.split('/'), new URLSearchParams(query), dir) as Promise<{ from: string; to: string; days: { day: string }[] }>;
const week = await get('play/days', `from=${name(day - 6)}&to=${name(day)}`);
assert.deepEqual([week.from, week.to, week.days.map((d) => d.day)], [name(day - 6), name(day), [name(day - 1), name(day)]]);
assert.equal((await get('paint/days', '')).from, name(day - 29), '30 days by default, to today');
await assert.rejects(get('play/days', `from=${name(day)}&to=${name(day - 1)}`), Refused);

// A day that has aged out of a long-running server's memory still answers, from the hours its file keeps (a restart makes it a total).
Date.now = () => T + 100 * 864e5;
await history.save();
assert.deepEqual(history.within({ first: (day - 1) * 24, end: day * 24 }), [], 'out of memory');
const aged = await historyDays('play', { from: day - 1, to: day - 1 }, dir);
assert.deepEqual(aged.days.map((d) => [(d as { day: string }).day, (d as { plays: number }).plays]), [[name(day - 1), 3]]);

Date.now = realNow;
fs.rmSync(dir, { recursive: true, force: true });
console.log('history days: ok (play and paint from hours and from a total, left out when empty, the routes)');
