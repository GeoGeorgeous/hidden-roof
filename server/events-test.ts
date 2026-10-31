import './headless';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SERVER } from '../src/config';
import { traffic } from './counts';
import { EventLog, later, parseId, sinceId, type AdminEvent } from './event-log';
import { event, eventPage, keepEvents } from './events';
import { closeMinute, lastMinutes, turnedAway } from './minutes';

// The admin's events (events.ts, event-log.ts): ids that compare as numbers, pages from memory and from the files
// (before is exclusive and may name an id no longer kept, next walks every page once), old files deleted, a full
// day's file counting what it has no room for and reporting it as one event of the next day, and a write that
// fails logged once, not thrown; pages after a time or id (`since`) and of some types; the live minutes. npm run test:server runs it.

const DAY = 864e5;
const realNow = Date.now;
const clock = (ms: number) => (Date.now = () => ms);
const session = { code: 'ABCDE', setup: { name: 'Wall' } };
const ids = (events: AdminEvent[]) => events.map((e) => e.id);
// The days of the run: the memory part is long before them, as ids only go forward.
const today = Math.floor(realNow() / DAY) - 1;
const base = (today - 100) * DAY;

// Ids: ms then n, as numbers.
assert.deepEqual([parseId('5-10'), parseId('5-'), parseId('x-1'), parseId('1-2-3')], [[5, 10], null, null, null]);
assert.ok(later('100-10', '100-9') && later('1000-0', '999-9') && !later('5-1', '5-1'));

// Without a directory: pages from the last SERVER.adminEvents events in memory.
clock(base);
for (let i = 0; i < 60; i++) event(i % 2 ? 'joined' : 'left', session, `p${i}`);
let seen: string[] = [];
let page = await eventPage(null, 20);
assert.equal(page.events.length, 20);
assert.equal(page.events[0].player, 'p59');
for (let before: string | null = null; ; ) {
  page = await eventPage(before, 20);
  seen.push(...ids(page.events));
  if (!(before = page.next)) break;
}
// 60 events in one ms: ids `<ms>-0` to `<ms>-59`, the newest first; 50 are kept.
assert.deepEqual(seen, Array.from({ length: SERVER.adminEvents }, (_, i) => `${base}-${59 - i}`));
assert.deepEqual(await eventPage(`${base}-30`, 3).then((p) => [ids(p.events), p.next]), [[`${base}-29`, `${base}-28`, `${base}-27`], `${base}-27`]);
assert.deepEqual(await eventPage(`${base}-12`, 50).then((p) => [p.events.length, p.next]), [2, null], 'ten to 11 are all that is left, and before is exclusive');
assert.deepEqual(await eventPage('1-0', 10), { events: [], next: null }, 'an id older than all of them');
assert.deepEqual(await eventPage(`${base + 99}-0`, 1).then((p) => [ids(p.events), p.next]), [[`${base}-59`], `${base}-59`], 'an id of the future');

// Since an id or a time, and of some types: the same pages, from what is asked for only. Events 10 to 59 are kept, the odd ones `joined`.
const joined = await eventPage(null, 50, { types: ['joined'] });
assert.deepEqual([joined.events.length, joined.events.every((e) => e.type === 'joined'), joined.next], [25, true, null]);
assert.equal((await eventPage(null, 50, { types: ['joined', 'left'] })).events.length, 50);
assert.equal((await eventPage(null, 50, { types: [] })).events.length, 50, 'no type asked: all');
assert.deepEqual(await eventPage(null, 50, { since: `${base}-54` }).then((p) => [ids(p.events), p.next]), [[59, 58, 57, 56, 55].map((n) => `${base}-${n}`), null], 'after the id: not it');
assert.deepEqual(await eventPage(null, 3, { since: `${base}-54` }).then((p) => [ids(p.events), p.next]), [[59, 58, 57].map((n) => `${base}-${n}`), `${base}-57`]);
assert.deepEqual(await eventPage(`${base}-57`, 3, { since: `${base}-54` }).then((p) => [ids(p.events), p.next]), [[`${base}-56`, `${base}-55`], null], 'next is null at since');
assert.deepEqual(await eventPage(null, 50, { since: `${base}-54`, types: ['joined'] }).then((p) => ids(p.events)), [`${base}-59`, `${base}-57`, `${base}-55`]);
assert.equal((await eventPage(null, 50, { since: sinceId(new Date(base - 1).toISOString())! })).events.length, 50, 'after a time');
assert.equal((await eventPage(null, 50, { since: sinceId(new Date(base).toISOString())! })).events.length, 0, 'events of that very ms are not after it');
assert.deepEqual([sinceId('5-10'), sinceId(new Date(base).toISOString()), sinceId('2026-10-27T12:00:00Z'), sinceId('2026-10-27T12:00:00.5Z')], ['5-10', `${base}-999999999`, '1793102400000-999999999', '1793102400500-999999999']);
for (const bad of ['', 'x', '2026-10-27', '2026-10-27T12:00:00', '2026-13-45T00:00:00Z', '1-2-3']) assert.equal(sinceId(bad), null, bad);

// The live minutes (minutes.ts): the average rate of each minute's bytes, the turned away by reason, 60 kept, oldest first.
const [quiet, busy] = [{ menu: 0, solo: 0, session: 0, hidden: 0, by: {} } as never, { menu: 1, solo: 2, session: 3, hidden: 4, by: {} } as never];
assert.deepEqual(lastMinutes(), []);
closeMinute(Date.now(), 0, quiet);
const t0 = Date.now() + 60e3;
turnedAway('full');
turnedAway('full');
turnedAway('seats');
traffic.sent += 75000;
traffic.received += 30000;
closeMinute(t0, 7, busy);
closeMinute(t0 + 60e3, 5, quiet);
const [first, second, third] = lastMinutes();
assert.deepEqual([second.at, second.players, second.pages, second.upBits, second.downBits, second.turnedAway], [new Date(t0).toISOString(), 7, busy, 10000, 4000, { full: 2, seats: 1 }]);
assert.deepEqual([third.players, third.upBits, third.downBits, third.turnedAway], [5, 0, 0, {}], 'each minute counts its own');
assert.deepEqual([first.upBits, first.turnedAway], [0, {}]);
for (let i = 0; i < SERVER.liveMinutes + 5; i++) closeMinute(t0 + (2 + i) * 60e3, 1, quiet);
const kept60 = lastMinutes();
assert.deepEqual([kept60.length, kept60[0].at < kept60[1].at], [SERVER.liveMinutes, true]);

// With a directory. Old files go at start, the newest events are read back for the stream.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-events-'));
const files = path.join(dir, 'events');
fs.mkdirSync(files);
const name = (day: number) => `${new Date(day * DAY).toISOString().slice(0, 10)}.jsonl`;
const old = (day: number, n: number) => JSON.stringify({ id: `${day * DAY + 5}-${n}`, at: '', type: 'left', code: null, name: null, player: null, detail: {} }) + '\n';
fs.writeFileSync(path.join(files, name(today - SERVER.eventDays)), old(today - SERVER.eventDays, 0));
fs.writeFileSync(path.join(files, name(today - SERVER.eventDays + 1)), old(today - SERVER.eventDays + 1, 0) + '{half a line');
fs.writeFileSync(path.join(files, name(today - 2)), old(today - 2, 0) + old(today - 2, 1));
fs.writeFileSync(path.join(files, 'notes.txt'), 'mine');
try {
  clock(today * DAY + 3600e3);
  SERVER.eventDayBytes = 1500;
  await keepEvents(dir);
  assert.deepEqual(fs.readdirSync(files).sort(), [name(today - SERVER.eventDays + 1), name(today - 2), 'notes.txt'], 'the 30th day back goes, a line half written is no matter');

  // A day fills: later events are counted, not written; at day's end the count comes as one event of the next day.
  for (let i = 0; i < 20; i++) event('joined', session, `q${i}`);
  await eventPage(null, 1); // waits for the writes
  const full = fs.statSync(path.join(files, name(today))).size;
  assert.ok(full <= SERVER.eventDayBytes && full > SERVER.eventDayBytes - 400, `a day stops at its limit (${full})`);
  const kept = (await eventPage(null, 50)).events.filter((e) => e.type === 'joined').length;
  assert.ok(kept > 3 && kept < 20);
  clock((today + 1) * DAY + 5);
  event('left', session, 'next day');
  const all = (await eventPage(null, 50)).events;
  assert.equal(all[0].player, 'next day');
  assert.deepEqual([all[1].type, all[1].detail], ['events-dropped', { count: 20 - kept, day: new Date(today * DAY).toISOString().slice(0, 10) }]);
  assert.equal(all[1].code, null);
  assert.ok(later(all[0].id, all[1].id), 'the report comes before the event that ended the day');

  // Every page, newest first, every event once: across days and the old file's, and before an id long gone.
  const walk: string[] = [];
  for (let before: string | null = null, p; ; before = p.next) {
    p = await eventPage(before, 4);
    assert.ok(p.events.length <= 4);
    walk.push(...ids(p.events));
    if (!p.next) break;
  }
  assert.equal(walk.length, kept + 1 + 1 + 3, 'kept, the report, the next day, and the two old files\' events');
  assert.deepEqual(walk, [...walk].sort((a, b) => (later(a, b) ? -1 : 1)));
  assert.equal(new Set(walk).size, walk.length);
  assert.deepEqual(await eventPage(`${(today - 2) * DAY + 5}-1`, 50).then((p) => ids(p.events)), [`${(today - 2) * DAY + 5}-0`, `${(today - SERVER.eventDays + 1) * DAY + 5}-0`]);
  assert.deepEqual((await eventPage(`${(today - 40) * DAY}-0`, 50)).events, [], 'before an id older than any file');
  assert.deepEqual(await eventPage(`${(today - 10) * DAY}-0`, 50).then((p) => ids(p.events)), [`${(today - SERVER.eventDays + 1) * DAY + 5}-0`], 'before an id of a day with no file');

  // Since, across the files: the files of days before it are not read, so an event in one that is out of its day is not found; types, across days.
  const from = `${(today - 2) * DAY + 5}-0`;
  assert.deepEqual(await eventPage(null, 50, { since: from }).then((p) => ids(p.events)), walk.slice(0, walk.length - 2), 'after the id: its own and the older ones are not');
  assert.deepEqual(await eventPage(null, 2, { since: from }).then((p) => [p.events.length, p.next === p.events[1].id]), [2, true]);
  const misplaced = old(today + 5, 7);
  fs.writeFileSync(path.join(files, name(today - 10)), misplaced);
  const late = `${(today + 5) * DAY + 5}-7`;
  assert.ok(await eventPage(null, 50).then((p) => ids(p.events).includes(late)), 'read without since');
  assert.ok(!(await eventPage(null, 50, { since: `${(today - 3) * DAY}-0` }).then((p) => ids(p.events).includes(late))), 'a file of a day before since is not read');
  fs.rmSync(path.join(files, name(today - 10)));
  assert.deepEqual(await eventPage(null, 50, { types: ['events-dropped'] }).then((p) => p.events.map((e) => e.type)), ['events-dropped']);
  assert.equal((await eventPage(null, 50, { types: ['left'] })).events.length, 2 + 1 + 1, 'the old files\' left events and the next day\'s');

  // A write that fails is logged once and never thrown; the next one that works is written.
  const lines: string[] = [];
  const realLog = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.join(' '));
  const gone = new EventLog(path.join(dir, 'gone'), () => {});
  const mk = (n: number): AdminEvent => ({ id: `${Date.now()}-${n}`, at: '', type: 'left', code: null, name: null, player: null, detail: {} });
  for (let i = 0; i < 3; i++) gone.append(mk(i));
  assert.deepEqual(await gone.page(null, 10), { events: [], next: null });
  fs.mkdirSync(path.join(dir, 'gone'));
  gone.append(mk(3));
  assert.deepEqual(await gone.page(null, 10).then((p) => ids(p.events)), [mk(3).id]);
  console.log = realLog;
  assert.equal(lines.filter((l) => l.includes('events not written')).length, 1, lines.join('\n'));
  console.log('events: ok (ids, pages from memory and the files, since and types, old files, a full day, a failed write, the live minutes)');
} finally {
  Date.now = realNow;
  fs.rmSync(dir, { recursive: true, force: true });
}
