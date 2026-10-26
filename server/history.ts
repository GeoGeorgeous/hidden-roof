import fs from 'node:fs/promises';
import path from 'node:path';
import { COLOR_ORDER, SERVER } from '../src/config';
import type { Rejection } from '../src/net/protocol';
import { addClient, clientReport, noClient, type ClientCounts } from './client-counts';
import { noPaint, type Paint } from './counts';
import { log } from './log';
import type { Link } from './player';
import { people } from './people';

// The admin page's history (GET /history): counts by UTC hour, added to on
// paths that already run. Plays are counted when they start, their length when
// they end; play seconds are sampled once a minute. With a directory (DATA_DIR)
// each day's hours are written to stats/<day>.json once a minute when they
// changed; past SERVER.historyDays a day keeps only its total, forever. The most
// players ever is in stats/peak.json. Without one, history starts with the server.

interface Hour extends Paint {
  plays: number;
  /** Plays that ended, by length (SERVER.playLengths). */
  lengths: number[];
  /** Play seconds, and those with someone else in the same session. */
  seconds: number;
  withOthers: number;
  turnedAway: Partial<Record<Rejection, number>>;
  peak: { players: number; at: string } | null;
  /** The games' beacons (beacon.ts). */
  client: ClientCounts;
}

type Period = 'today' | '24h' | '7d' | '30d';
const HOURS: Record<Exclude<Period, 'today'>, number> = { '24h': 24, '7d': 7 * 24, '30d': 30 * 24 };
export const isPeriod = (p: string): p is Period => p === 'today' || Object.hasOwn(HOURS, p);

const HOUR = 3600e3;
const iso = (ms: number) => new Date(ms).toISOString();
const dayName = (day: number) => iso(day * 24 * HOUR).slice(0, 10);
const blank = (): Hour => ({ plays: 0, lengths: [0, 0, 0, 0], seconds: 0, withOthers: 0, turnedAway: {}, ...noPaint(), peak: null, client: noClient() });

/** An hour as saved: one written before a field was added gets it empty (the beacons' too). */
const loaded = (h: Hour): Hour => ({ ...blank(), ...h, client: { ...noClient(), ...h.client, events: { ...noClient().events, ...h.client?.events } } });

/** `hours` added up. */
function sum(hours: Iterable<Hour>) {
  const t = blank();
  const add = <K extends string>(to: Partial<Record<K, number>>, from: Partial<Record<K, number>>) => {
    for (const k in from) to[k] = (to[k] ?? 0) + from[k]!;
  };
  for (const h of hours) {
    t.plays += h.plays;
    h.lengths.forEach((n, i) => (t.lengths[i] += n));
    t.seconds += h.seconds;
    t.withOthers += h.withOthers;
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
  /** The most players at once, ever (with a directory). */
  ever: Hour['peak'] = null;
  private everChanged = false;
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
    people.played(link.device, link.ip, link.country ?? null);
  }

  /** A play ended after `seconds`. */
  played(seconds: number) {
    const i = SERVER.playLengths.findIndex((s) => seconds < s);
    this.now().lengths[i < 0 ? SERVER.playLengths.length : i]++;
  }

  turnedAway(why: Rejection) {
    const t = this.now().turnedAway;
    t[why] = (t[why] ?? 0) + 1;
  }

  /** `n` players on the server now. */
  players(n: number) {
    const hour = this.now();
    const at = iso(Date.now());
    if (n > (hour.peak?.players ?? 0)) hour.peak = { players: n, at };
    if (n > (this.ever?.players ?? 0)) [this.ever, this.everChanged] = [{ players: n, at }, true];
  }

  /** `dt` s of play: each session's players here now. */
  sample(sessions: number[], dt: number) {
    const hour = this.now();
    for (const n of sessions) {
      hour.seconds += n * dt;
      if (n > 1) hour.withOthers += n * dt;
    }
  }

  /** The counts in `period`, up to now. `from`: its start, or when the counts start if that's later. */
  report(period: Period) {
    const now = Date.now();
    const h = Math.floor(now / HOUR);
    const first = period === 'today' ? Math.floor(h / 24) * 24 : h - HOURS[period] + 1;
    const kept = [...this.hours].filter(([k]) => k >= first);
    const t = sum(kept.map(([, v]) => v));
    const joinsPerHour = Array<number>(24).fill(0);
    for (const [k, v] of kept) joinsPerHour[k % 24] += v.plays;
    const [under2m, m2to10, m10to30, over30m] = t.lengths;
    const colors = Object.fromEntries(COLOR_ORDER.flatMap((c) => (t.colors[c] ? [[c, t.colors[c]]] : [])));
    return {
      period, from: iso(Math.max(first * HOUR, this.since)), to: iso(now),
      plays: t.plays, playLength: { under2m, m2to10, m10to30, over30m }, playSeconds: Math.round(t.seconds), withOthers: Math.round(t.withOthers),
      joinsPerHour, turnedAway: t.turnedAway, stamps: t.stamps, colors, peak: t.peak, ...people.count(first), client: clientReport(t.client),
    };
  }

  /** Keep it in `dir`/stats: the last SERVER.historyDays read back, older days down to their totals. */
  async keepIn(dir: string) {
    this.dir = path.join(dir, 'stats');
    await fs.mkdir(this.dir, { recursive: true });
    this.ever = await fs.readFile(path.join(this.dir, 'peak.json'), 'utf8').then((t) => JSON.parse(t) as Hour['peak']).catch(() => null);
    const today = Math.floor(Date.now() / HOUR / 24);
    for (const name of await fs.readdir(this.dir)) {
      const day = Date.parse(name.slice(0, 10)) / HOUR / 24;
      if (!name.endsWith('.json') || !Number.isInteger(day)) continue;
      try {
        const file = JSON.parse(await fs.readFile(path.join(this.dir, name), 'utf8')) as { hours?: Record<string, Hour>; total?: Hour };
        if (!file.hours) continue;
        if (day < today - SERVER.historyDays) await this.write(name, { total: sum(Object.values(file.hours).map(loaded)) });
        else for (const [k, v] of Object.entries(file.hours)) this.hours.set(day * 24 + Number(k), loaded(v));
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
    } catch (e) {
      for (const day of days) this.dirty.add(day);
      log('-----', 'history not saved:', e);
    }
  }

  private async write(name: string, data: unknown) {
    const file = path.join(this.dir!, name);
    await fs.writeFile(`${file}.tmp`, JSON.stringify(data));
    await fs.rename(`${file}.tmp`, file);
  }
}

export const history = new History();
