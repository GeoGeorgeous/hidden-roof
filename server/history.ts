import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import type { Rejection } from '../src/net/protocol';
import { writeAtomic } from './atomic';
import { addClient, noClient, type ClientCounts } from './client-counts';
import { noPaint, raised, type Paint } from './counts';
import { dayName, dayOfFile, hourAt, HOUR, today, todaySpan } from './days';
import { readJson } from './json-file';
import { log } from './log';
import type { Link } from './player';
import { people } from './people';
import type { Span } from './stats-period';
import { addMaps, bump, filled } from './tally';

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

/** An hour as a file has it: what an older file lacks, at any depth, is none. */
export function read(file: Hour): Hour {
  return filled(blank(), file) as Hour;
}

/** `hours` added up. */
export function sum(hours: Iterable<Hour>) {
  const t = blank();
  for (const h of hours) {
    t.plays += h.plays;
    addMaps(t.minutes, h.minutes);
    t.seconds += h.seconds;
    t.withOthers += h.withOthers;
    t.bytes.up += h.bytes.up;
    t.bytes.down += h.bytes.down;
    addMaps(t.turnedAway, h.turnedAway);
    addMaps(t.stamps, h.stamps);
    addMaps(t.paintSeconds, h.paintSeconds);
    addMaps(t.colors, h.colors);
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
  /** Days before today added up (total), each made when first asked: their hours no longer change. */
  private days = new Map<number, Hour>();
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
    const h = hourAt(Date.now());
    let hour = this.hours.get(h);
    if (!hour) this.hours.set(h, (hour = blank()));
    this.dirty.add(Math.floor(h / 24));
    this.days.delete(Math.floor(h / 24));
    return hour;
  }

  /** A new player came in on `link` (not one back, nor a new tab of theirs). */
  started(link: Link) {
    this.now().plays++;
    people.played(link.device, link.ip, link.country ?? null, 'join');
  }

  /** A play ended after `seconds`. */
  played(seconds: number) {
    bump(this.now().minutes, String(Math.min(Math.floor(seconds / 60), SERVER.lengthMinutesMost)));
  }

  turnedAway(why: Rejection) {
    bump(this.now().turnedAway, why);
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

  /** The counts of `s` added up: each whole day of it before today from that day's total, so a long span sums days, not hours. */
  total(s: Span) {
    const [parts, closed] = [[] as Hour[], today()];
    for (let k = s.first; k < s.end; ) {
      const day = Math.floor(k / 24);
      if (k === day * 24 && k + 24 <= s.end && day < closed) {
        let t = this.days.get(day);
        if (!t) this.days.set(day, (t = sum(this.within({ first: k, end: k + 24 }).map(([, h]) => h))));
        parts.push(t);
        k += 24;
      } else {
        const hour = this.hours.get(k++);
        if (hour) parts.push(hour);
      }
    }
    return sum(parts);
  }

  /** The bytes each way since 00:00 UTC. */
  bytesToday() {
    const { up, down } = this.total(todaySpan(Date.now())).bytes;
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
    this.ever = await readJson<Hour['peak']>(path.join(this.dir, 'peak.json')).catch(() => null);
    const now = today();
    for (const name of await fs.readdir(this.dir)) {
      const day = dayOfFile(name, '', '.json');
      if (day === null) continue;
      try {
        const file = await readJson<{ hours?: Record<string, Hour>; total?: Hour }>(path.join(this.dir, name));
        if (!file?.hours) continue;
        if (day < now - SERVER.historyDays) await this.write(name, { total: sum(Object.values(file.hours).map(read)) });
        else for (const [k, v] of Object.entries(file.hours)) this.hours.set(day * 24 + Number(k), read(v));
      } catch (e) {
        log('-----', `stats ${name} skipped:`, e);
      }
    }
    this.since = Math.min(this.since, ...[...this.hours.keys()].map((k) => k * HOUR));
    this.days.clear();
    await people.keepIn(this.dir);
  }

  /** The days that changed, and the peak, written (once a minute); hours past SERVER.historyDays forgotten. A save under way is waited for: the shutdown's is the last. */
  async save() {
    while (this.running) await this.running;
    await (this.running = this.saveAll().finally(() => (this.running = null)));
  }

  private async saveAll() {
    for (const k of this.hours.keys()) if (k < (today() - SERVER.historyDays) * 24) this.hours.delete(k);
    for (const d of this.days.keys()) if (d < today() - SERVER.historyDays) this.days.delete(d);
    if (!this.dir) return this.dirty.clear();
    const days = [...this.dirty];
    this.dirty.clear();
    try {
      for (const day of days) {
        const hours = Object.fromEntries([...this.hours].filter(([k]) => Math.floor(k / 24) === day).map(([k, v]) => [k % 24, v]));
        await this.write(`${dayName(day)}.json`, { hours });
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
