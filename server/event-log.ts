import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import { dayAt, dayName, dayOfFile } from './days';
import { log } from './log';

// The admin's events on disk (DATA_DIR/events/<YYYY-MM-DD>.jsonl, a JSON line each, the UTC day of its id), read back in
// pages (GET /events/page, admin/live.ts). Files older than SERVER.eventDays go; a day's file stops at
// SERVER.eventDayBytes, past it events are counted, not written, and the count is reported when the day ends
// (events.ts writes it as one event of the next day). A write that fails is logged once and never thrown.

export const EVENT_TYPES = ['joined', 'left', 'dropped', 'turned-away', 'session-made', 'session-closed', 'wiped', 'wiped-at-start', 'save-failed', 'restored', 'events-dropped'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface AdminEvent {
  /** `<ms>-<n>`: the time and a counter within that ms. Compare with `later`, as numbers. */
  id: string;
  at: string;
  type: EventType;
  /** The session's code and name, if it's about one. */
  code: string | null;
  name: string | null;
  player: string | null;
  detail: Record<string, unknown>;
}

const ID = /^(\d{1,15})-(\d{1,9})$/;
/** The UTC day of `ms` as YYYY-MM-DD. */
const dayOfMs = (ms: number) => dayName(dayAt(ms));

/** An id as [ms, n], or null if it isn't one. */
export function parseId(id: string) {
  const m = ID.exec(id);
  return m ? ([+m[1], +m[2]] as const) : null;
}

/** Whether id `a` comes after id `b` (both valid): by ms, then n. */
export function later(a: string, b: string) {
  const [x, y] = [parseId(a)!, parseId(b)!];
  return x[0] !== y[0] ? x[0] > y[0] : x[1] > y[1];
}

/** `s` (an event id, or a UTC time as ISO 8601) as an id: the events after the time are the ones after this id. Null if it is neither. */
export function sinceId(s: string) {
  if (parseId(s)) return s;
  const ms = /^\d{4}-\d\d-\d\dT.*Z$/.test(s) ? Date.parse(s) : NaN;
  return ms >= 0 && ms < 1e15 ? `${ms}-999999999` : null;
}

/** Besides `before`, which events a page is of: those after the id `since`, and of `types` (none: all). */
export interface Only {
  since?: string | null;
  types?: readonly EventType[];
}

/** Whether `e` is one of those asked for: before the id `before`, and `only`. */
export const wanted = (e: AdminEvent, before: string | null, { since, types }: Only = {}) => (!before || later(before, e.id)) && (!since || later(e.id, since)) && (!types?.length || types.includes(e.type));

/** A page of `events` (newest first, as many as asked for and perhaps one more): the first `limit`, and `next`, the id to ask `before` for the page after, or null. */
export function pageOf(events: AdminEvent[], limit: number) {
  return { events: events.slice(0, limit), next: events.length > limit ? events[limit - 1].id : null };
}

const newestFirst = (a: AdminEvent, b: AdminEvent) => (a.id === b.id ? 0 : later(a.id, b.id) ? -1 : 1);

export class EventLog {
  /** The UTC day being written (YYYY-MM-DD), the bytes written to its file, and the events past the limit since. */
  private day = dayOfMs(Date.now());
  private bytes = 0;
  private dropped = 0;
  /** Appends in the order they came; a failed one is logged once until one works. */
  private tail: Promise<void> = Promise.resolve();
  private failed = false;
  /** The day files read for a page, by name, as they were (their inode, time and size). */
  private parsed = new Map<string, { sig: string; events: AdminEvent[] }>();

  /** `report(count, day)`: events a day's file had no room for, once that day is over. */
  constructor(private dir: string, private report: (count: number, day: string) => void) {}

  /** Makes the directory, forgets old files, and counts today's. */
  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    await this.prune();
    this.bytes = await fs.stat(path.join(this.dir, `${this.day}.jsonl`)).then((s) => s.size, () => 0);
  }

  /** Files older than SERVER.eventDays deleted (a file is its day: 30 days, today's included). */
  async prune() {
    const keep = dayAt(Date.now()) - SERVER.eventDays;
    for (const name of await fs.readdir(this.dir)) {
      const day = dayOfFile(name, '', '.jsonl');
      if (day !== null && day <= keep) await fs.rm(path.join(this.dir, name), { force: true }).catch((e) => log('-----', `events ${name} not deleted:`, e));
    }
  }

  /** A new UTC day starts at `now`: the last day's dropped events are reported (as an event of the new day). */
  roll(now: number) {
    const day = dayOfMs(now);
    if (day === this.day) return;
    const [old, count] = [this.day, this.dropped];
    [this.day, this.bytes, this.dropped] = [day, 0, 0];
    if (count) this.report(count, old);
  }

  /** `e` appended to today's file, or only counted when the file is full. */
  append(e: AdminEvent) {
    const line = JSON.stringify(e) + '\n';
    const size = Buffer.byteLength(line);
    if (this.bytes + size > SERVER.eventDayBytes) return void this.dropped++;
    this.bytes += size;
    const file = path.join(this.dir, `${this.day}.jsonl`);
    this.tail = this.tail
      .then(() => fs.appendFile(file, line, { mode: 0o600 }))
      .then(
        () => void (this.failed = false),
        (err) => {
          if (!this.failed) log('-----', 'events not written:', err);
          this.failed = true;
        },
      );
  }

  /** The events of a day's file, newest first, valid ones only (a line half written, or not ours, is left out). A file as it was when last read is not read again: the last SERVER.eventCacheDays days' are kept. */
  private async events(name: string) {
    const file = path.join(this.dir, name);
    const st = await fs.stat(file).catch(() => null);
    if (!st) return [];
    const sig = `${st.ino} ${st.mtimeMs} ${st.size}`;
    const had = this.parsed.get(name);
    if (had?.sig === sig) return had.events;
    const events: AdminEvent[] = [];
    for (const line of (await fs.readFile(file, 'utf8').catch(() => '')).split('\n')) {
      try {
        const e = JSON.parse(line) as AdminEvent;
        if (typeof e.id === 'string' && parseId(e.id)) events.push(e);
      } catch {
        // a line half written, or not ours
      }
    }
    events.sort(newestFirst);
    this.parsed.delete(name);
    this.parsed.set(name, { sig, events });
    while (this.parsed.size > SERVER.eventCacheDays) this.parsed.delete(this.parsed.keys().next().value!);
    return events;
  }

  /** The events before id `before` (none: from the newest), and `only` those asked for, newest first. `before` may be an id no longer on disk; files of days before `since`'s aren't read. */
  async page(before: string | null, limit: number, only: Only = {}) {
    await this.tail;
    const upto = before ? dayOfMs(parseId(before)![0]) : '9999-12-31';
    const from = only.since ? dayOfMs(parseId(only.since)![0]) : '';
    const files = await fs.readdir(this.dir).then((names) => names.filter((n) => dayOfFile(n, '', '.jsonl') !== null && n.slice(0, 10) <= upto && n.slice(0, 10) >= from).sort().reverse(), () => []);
    const out: AdminEvent[] = [];
    for (const name of files) {
      for (const e of await this.events(name)) if (wanted(e, before, only)) out.push(e);
      if (out.length > limit) break;
    }
    return pageOf(out, limit);
  }
}
