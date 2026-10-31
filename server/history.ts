import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import type { Rejection } from '../src/net/protocol';
import { writeAtomic } from './atomic';
import { addClient, noClient, type ClientCounts } from './client-counts';
import { noPaint, raised, type Paint } from './counts';
import { log } from './log';
import type { Link } from './player';
import { people } from './people';
import { dayName, HOUR, type Span } from './stats-period';

// The admin page's history (GET /stats, server/admin/stats.ts): counts by UTC hour,
// added to on paths that already run. Plays are counted when they start, their length
// when they end; play seconds and the bytes each way are sampled once a minute. With a directory (DATA_DIR)
// each day's hours are written to stats/<day>.json once a minute when they
// changed; past SERVER.historyDays a day keeps only its total, forever. The most
// players ever is in stats/peak.json. Without one, history starts with the server.

export interface Hour extends Paint {
  plays: number;
  /** Plays that ended, by whole minutes; the last bin is SERVER.lengthMinutesMost and up. */
  minutes: Record<string, number>;
  /** Play seconds, and those with someone else in the same session. */
  seconds: number;
  withOthers: number;
  turnedAway: Partial<Record<Rejection, number>>;
  peak: { players: number; at: string } | null;
  /** Bytes sent to the games and received from them. */
  bytes: { up: number; down: number };
  /** The games' beacons (beacon.ts). */
  client: ClientCounts;
}

const blank = (): Hour => ({ plays: 0, minutes: {}, seconds: 0, withOthers: 0, turnedAway: {}, ...noPaint(), peak: null, bytes: { up: 0, down: 0 }, client: noClient() });

/** An hour as a file has it: what an older file lacks is none. */
export function read(file: Hour): Hour {
  const h = { ...blank(), ...file } as Hour & { lengths?: unknown };
  delete h.lengths;
  return h;
}

/** `hours` added up. */
export function sum(hours: Iterable<Hour>) {
  const t = blank();
  const add = <K extends string>(to: Partial<Record<K, number>>, from: Partial<Record<K, number>>) => {
    for (const k in from) to[k] = (to[k] ?? 0) + from[k]!;
  };
  for (const h of hours) {
    t.plays += h.plays;
    add(t.minutes, h.minutes);
    t.seconds += h.seconds;
    t.withOthers += h.withOthers;
    t.bytes.up += h.bytes.up;
    t.bytes.down += h.bytes.down;
    add(t.turnedAway, h.turnedAway);
    add(t.stamps, h.stamps);
    add(t.colors, h.colors);
    if (h.peak && h.peak.players > (t.peak?.players ?? 0)) t.peak = h.peak;
    addClient(t.client, h.client);
  }
  return t;
}

class History {
  /** By hours since 1970: today and the SERVER.historyDays before it (a 30-day window starts in a day's middle). */
  private hours = new Map<number, Hour>();
  /** Days whose hours changed since they were written. */
  private dirty = new Set<number>();
  /** When the counts start: the oldest hour kept, or the server's start. */
  private since = Date.now();
  private dir: string | null = null;
  /** The bytes totals at the last `bytes`. */
  private sent = { up: 0, down: 0 };
  /** The most players at once, ever (with a directory). */
  ever: Hour['peak'] = null;
  private everChanged = false;
  /** When the days last went to disk (ms), or null (no directory, or not yet). */
  savedAt: number | null = null;
  /** The save under way (saveAll never throws). */
  private running: Promise<void> | null = null;

  /** The hour now's counts, to add to. */
  now() {
    const h = Math.floor(Date.now() / HOUR);
    let hour = this.hours.get(h);
    if (!hour) this.hours.set(h, (hour = blank()));
    this.dirty.add(Math.floor(h / 24));
    return hour;
  }

  /** A new player came in on `link` (not one back, nor a new tab of theirs). */
  started(link: Link) {
    this.now().plays++;
    people.played(link.device, link.ip, link.country ?? null, 'join');
  }

  /** A play ended after `seconds`. */
  played(seconds: number) {
    const m = String(Math.min(Math.floor(seconds / 60), SERVER.lengthMinutesMost));
    const minutes = this.now().minutes;
    minutes[m] = (minutes[m] ?? 0) + 1;
  }

  turnedAway(why: Rejection) {
    const t = this.now().turnedAway;
    t[why] = (t[why] ?? 0) + 1;
  }

  /** `n` players on the server now. */
  players(n: number) {
    const hour = this.now();
    hour.peak = raised(hour.peak, n);
    if (n > (this.ever?.players ?? 0)) [this.ever, this.everChanged] = [hour.peak, true];
  }

  /** `dt` s of play: each session's players here now. */
  sample(sessions: number[], dt: number) {
    // No one playing adds nothing: the day isn't written again for it.
    if (!sessions.some((n) => n > 0)) return;
    const hour = this.now();
    for (const n of sessions) {
      hour.seconds += n * dt;
      if (n > 1) hour.withOthers += n * dt;
    }
  }

  /** The bytes sent and received since the last ask (`up`, `down`: totals since the start, counts.ts traffic), added to this hour. An hour with none isn't written again. */
  bytes(up: number, down: number) {
    const [dUp, dDown] = [up - this.sent.up, down - this.sent.down];
    this.sent = { up, down };
    if (!dUp && !dDown) return;
    const bytes = this.now().bytes;
    bytes.up += dUp;
    bytes.down += dDown;
  }

  /** The hours of `s` kept, as [hour since 1970, counts], oldest first. */
  within(s: Span) {
    const kept: [number, Hour][] = [];
    for (let k = s.first; k < s.end; k++) {
      const hour = this.hours.get(k);
      if (hour) kept.push([k, hour]);
    }
    return kept;
  }

  /** The bytes each way since 00:00 UTC. */
  bytesToday() {
    const end = Math.floor(Date.now() / HOUR) + 1;
    const { up, down } = sum(this.within({ first: Math.floor(end / 24) * 24, end }).map(([, h]) => h)).bytes;
    return { upBytes: up, downBytes: down };
  }

  /** When the counts begin (ms): the oldest hour kept, or the server's start. */
  get begin() {
    return this.since;
  }

  /** Keep it in `dir`/stats: the last SERVER.historyDays read back, older days down to their totals. */
  async keepIn(dir: string) {
    this.dir = path.join(dir, 'stats');
    await fs.mkdir(this.dir, { recursive: true });
    this.ever = await fs.readFile(path.join(this.dir, 'peak.json'), 'utf8').then((t) => JSON.parse(t) as Hour['peak']).catch(() => null);
    const today = Math.floor(Date.now() / HOUR / 24);
    for (const name of await fs.readdir(this.dir)) {
      const day = Date.parse(name.slice(0, 10)) / HOUR / 24;
      if (!/^\d{4}-\d\d-\d\d\.json$/.test(name) || !Number.isInteger(day)) continue;
      try {
        const file = JSON.parse(await fs.readFile(path.join(this.dir, name), 'utf8')) as { hours?: Record<string, Hour>; total?: Hour };
        if (!file.hours) continue;
        if (day < today - SERVER.historyDays) await this.write(name, { total: sum(Object.values(file.hours).map(read)) });
        else for (const [k, v] of Object.entries(file.hours)) this.hours.set(day * 24 + Number(k), read(v));
      } catch (e) {
        log('-----', `stats ${name} skipped:`, e);
      }
    }
    this.since = Math.min(this.since, ...[...this.hours.keys()].map((k) => k * HOUR));
    await people.keepIn(this.dir);
  }

  /** The days that changed, and the peak, written (once a minute); hours past SERVER.historyDays forgotten. A save under way is waited for: the shutdown's is the last. */
  async save() {
    while (this.running) await this.running;
    await (this.running = this.saveAll().finally(() => (this.running = null)));
  }

  private async saveAll() {
    const today = Math.floor(Date.now() / HOUR / 24);
    for (const k of this.hours.keys()) if (k < (today - SERVER.historyDays) * 24) this.hours.delete(k);
    if (!this.dir) return this.dirty.clear();
    const days = [...this.dirty];
    this.dirty.clear();
    try {
      for (const day of days) {
        const hours = Object.fromEntries([...this.hours].filter(([k]) => Math.floor(k / 24) === day).map(([k, v]) => [k % 24, v]));
        // A day past SERVER.historyDays (a long-running server's) keeps its total only.
        await this.write(`${dayName(day)}.json`, day < today - SERVER.historyDays ? { total: sum(Object.values(hours)) } : { hours });
      }
      if (this.everChanged) await this.write('peak.json', this.ever);
      await people.save();
      this.everChanged = false;
      this.savedAt = Date.now();
    } catch (e) {
      for (const day of days) this.dirty.add(day);
      log('-----', 'history not saved:', e);
    }
  }

  private write(name: string, data: unknown) {
    return writeAtomic(path.join(this.dir!, name), JSON.stringify(data));
  }
}

export const history = new History();
